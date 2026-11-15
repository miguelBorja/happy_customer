package thumbs

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

func makeValidJPEG(size int) []byte {
	if size < 4 {
		size = 4
	}
	b := bytes.Repeat([]byte{0x42}, size)
	b[0] = 0xFF
	b[1] = 0xD8
	b[2] = 0xFF
	b[3] = 0xE0
	return b
}

func TestCarIDAndKey(t *testing.T) {
	cases := []struct {
		url     string
		wantID  string
		wantKey string
	}{
		{"https://crautos.com/autosusados/cardetail.cfm?c=9876543", "9876543", "thumbs/9876543.jpg"},
		{"https://crautos.com/autosusados/cardetail.cfm?foo=bar&c=123456&utm=1", "123456", "thumbs/123456.jpg"},
		{"https://crautos.com/autosusados/cardetail.cfm?id=999", "", "thumbs/.jpg"},
		{"", "", "thumbs/.jpg"},
	}
	for _, tc := range cases {
		if got := CarID(tc.url); got != tc.wantID {
			t.Errorf("CarID(%q) = %q, want %q", tc.url, got, tc.wantID)
		}
		if tc.wantID != "" && Key(tc.wantID) != tc.wantKey {
			t.Errorf("Key(%q) = %q, want %q", tc.wantID, Key(tc.wantID), tc.wantKey)
		}
	}
}

func TestFetchFromBase(t *testing.T) {
	validJPEG := makeValidJPEG(1024)
	truncatedJPEG := makeValidJPEG(100)
	oversizedJPEG := makeValidJPEG(5 << 20) // 5 MB

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/100-t.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(validJPEG)
		case "/101-t.jpg":
			// Crautos returns 200 text/html for missing photos.
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html><body>No photo</body></html>"))
		case "/102-t.jpg":
			w.WriteHeader(http.StatusInternalServerError)
		case "/103-t.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(truncatedJPEG)
		case "/104-t.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(oversizedJPEG)
		case "/105-t.jpg":
			w.WriteHeader(http.StatusTooManyRequests)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	ctx := context.Background()
	client := srv.Client()

	got, err := FetchFromBase(ctx, client, srv.URL, "100")
	if err != nil {
		t.Fatalf("Fetch valid JPEG unexpected error: %v", err)
	}
	if !bytes.Equal(got, validJPEG) {
		t.Errorf("Fetch valid JPEG byte mismatch: len=%d want=%d", len(got), len(validJPEG))
	}

	if _, err := FetchFromBase(ctx, client, srv.URL, "101"); !errors.Is(err, ErrNoThumb) {
		t.Errorf("Fetch 200 text/html err = %v, want ErrNoThumb", err)
	}

	if _, err := FetchFromBase(ctx, client, srv.URL, "102"); err == nil || errors.Is(err, ErrNoThumb) || errors.Is(err, ErrBlocked) {
		t.Errorf("Fetch 500 err = %v, want transient non-ErrNoThumb error", err)
	}

	if _, err := FetchFromBase(ctx, client, srv.URL, "103"); !errors.Is(err, ErrNoThumb) {
		t.Errorf("Fetch truncated JPEG err = %v, want ErrNoThumb", err)
	}

	if _, err := FetchFromBase(ctx, client, srv.URL, "104"); !errors.Is(err, ErrNoThumb) {
		t.Errorf("Fetch 5MB oversized JPEG err = %v, want ErrNoThumb", err)
	}

	if _, err := FetchFromBase(ctx, client, srv.URL, "105"); !errors.Is(err, ErrBlocked) {
		t.Errorf("Fetch 429 err = %v, want ErrBlocked", err)
	}
}

func TestRunnerEndToEndAndIdempotency(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "runner.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	now := time.Date(2026, 11, 14, 15, 0, 0, 0, time.UTC)
	uGood1 := "https://crautos.com/autosusados/cardetail.cfm?c=3001"
	uGood2 := "https://crautos.com/autosusados/cardetail.cfm?c=3002"
	uHTML := "https://crautos.com/autosusados/cardetail.cfm?c=3003"
	uErr := "https://crautos.com/autosusados/cardetail.cfm?c=3004"

	for i, u := range []string{uGood1, uGood2, uHTML, uErr} {
		err := database.UpsertCar(db.Car{
			URL: u, Title: "Toyota Corolla 2020", Brand: "Toyota", Model: "Corolla", Year: 2020, Price: 17000,
			ScrapedAt: now.Add(-time.Duration(i) * time.Minute), LastSeenAt: now,
		})
		if err != nil {
			t.Fatalf("UpsertCar(%s): %v", u, err)
		}
	}

	validJPEG := makeValidJPEG(2048)
	var hitsGood1 int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/3001-t.jpg"):
			hitsGood1++
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(validJPEG)
		case strings.HasSuffix(r.URL.Path, "/3002-t.jpg"):
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(validJPEG)
		case strings.HasSuffix(r.URL.Path, "/3003-t.jpg"):
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("not found html"))
		case strings.HasSuffix(r.URL.Path, "/3004-t.jpg"):
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	defer srv.Close()

	store := NewMemStore()
	runner := &Runner{
		DB:      database,
		Store:   store,
		Client:  srv.Client(),
		BaseURL: srv.URL,
		Workers: 2,
		Delay:   -1,
	}

	sum, err := runner.Run(context.Background(), 10)
	if err != nil {
		t.Fatalf("Runner.Run: %v", err)
	}
	if sum.Stored != 2 || sum.Missing != 1 || sum.Failed != 1 {
		t.Fatalf("Runner.Run summary = %+v, want Stored=2 Missing=1 Failed=1", sum)
	}
	if store.Len() != 2 {
		t.Errorf("MemStore.Len() = %d, want 2", store.Len())
	}
	if got, ok := store.Get("thumbs/3001.jpg"); !ok || !bytes.Equal(got, validJPEG) {
		t.Errorf("thumbs/3001.jpg not stored correctly")
	}

	// Verify DB thumb_status & thumb_attempts values.
	cars, err := database.GetCarsByURLs([]string{uGood1, uGood2, uHTML, uErr})
	if err != nil {
		t.Fatalf("GetCarsByURLs: %v", err)
	}
	statusMap := map[string]int{}
	for _, c := range cars {
		statusMap[c.URL] = c.ThumbStatus
	}
	if statusMap[uGood1] != db.ThumbStored || statusMap[uHTML] != db.ThumbMissing || statusMap[uErr] != db.ThumbFailed {
		t.Errorf("unexpected DB statuses: %+v", statusMap)
	}

	var attempts int
	if err := database.QueryRow(`SELECT thumb_attempts FROM cars WHERE url = ?`, uErr).Scan(&attempts); err != nil {
		t.Fatalf("select thumb_attempts: %v", err)
	}
	if attempts != 1 {
		t.Errorf("uErr thumb_attempts = %d, want 1", attempts)
	}

	// Second Run immediately after must not re-fetch stored, missing, or recently-failed entries.
	sum2, err := runner.Run(context.Background(), 10)
	if err != nil {
		t.Fatalf("second Runner.Run: %v", err)
	}
	if sum2.Stored != 0 || sum2.Missing != 0 || sum2.Failed != 0 || hitsGood1 != 1 {
		t.Errorf("second Runner.Run reprocessed entries: sum2=%+v hitsGood1=%d", sum2, hitsGood1)
	}
}

func TestRunnerLimitCancelAndBlockedAbort(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "limit.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	now := time.Now()
	for i := 1; i <= 5; i++ {
		u := "https://crautos.com/autosusados/cardetail.cfm?c=400" + string(rune('0'+i))
		if err := database.UpsertCar(db.Car{
			URL: u, Title: "Suzuki Vitara 2021", Brand: "Suzuki", Model: "Vitara", Year: 2021, Price: 20000,
			ScrapedAt: now, LastSeenAt: now,
		}); err != nil {
			t.Fatalf("UpsertCar: %v", err)
		}
	}

	validJPEG := makeValidJPEG(1024)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "4005-t.jpg") {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(validJPEG)
	}))
	defer srv.Close()

	store := NewMemStore()
	runner := &Runner{
		DB:      database,
		Store:   store,
		Client:  srv.Client(),
		BaseURL: srv.URL,
		Workers: 1,
		Delay:   -1,
	}

	// Limit = 2 only processes 2 rows.
	sum, err := runner.Run(context.Background(), 2)
	if err != nil {
		t.Fatalf("Runner.Run(limit=2): %v", err)
	}
	if sum.Stored+sum.Failed != 2 {
		t.Errorf("Runner.Run(limit=2) processed %+v, want 2 total", sum)
	}

	// Pre-canceled context exits immediately without failing rows.
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	sumCancel, err := runner.Run(canceledCtx, 5)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("canceled Runner.Run err = %v, want context.Canceled", err)
	}
	if sumCancel.Failed != 0 || sumCancel.Stored != 0 {
		t.Errorf("canceled Runner.Run modified unexpected entries: %+v", sumCancel)
	}

	// Circuit breaker aborts on repeated 429s.
	blockSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer blockSrv.Close()
	blockRunner := &Runner{
		DB:         database,
		Store:      NewMemStore(),
		Client:     blockSrv.Client(),
		BaseURL:    blockSrv.URL,
		Workers:    1,
		Delay:      -1,
		MaxBlocked: 2,
	}
	_, err = blockRunner.RunBackfill(context.Background(), 5)
	if !errors.Is(err, ErrBlocked) {
		t.Errorf("blocked RunBackfill err = %v, want ErrBlocked", err)
	}

	// Circuit breaker aborts on repeated Store.Put errors (e.g. missing bucket / IAM).
	storeDB, err := db.Init(filepath.Join(t.TempDir(), "store-err.db"))
	if err != nil {
		t.Fatalf("db.Init store-err: %v", err)
	}
	defer storeDB.Close()
	for i := 1; i <= 4; i++ {
		u := "https://crautos.com/autosusados/cardetail.cfm?c=401" + string(rune('0'+i))
		if err := storeDB.UpsertCar(db.Car{
			URL: u, Title: "Toyota Yaris 2020", Brand: "Toyota", Model: "Yaris", Year: 2020, Price: 16000,
			ScrapedAt: now, LastSeenAt: now,
		}); err != nil {
			t.Fatalf("UpsertCar store-err: %v", err)
		}
	}
	storeRunner := &Runner{
		DB:         storeDB,
		Store:      &MemStore{PutErr: errors.New("bucket does not exist")},
		Client:     srv.Client(),
		BaseURL:    srv.URL,
		Workers:    1,
		Delay:      -1,
		MaxBlocked: 2,
	}
	sumStore, err := storeRunner.Run(context.Background(), 4)
	if !errors.Is(err, ErrStoreUnavailable) {
		t.Errorf("store-err Runner.Run err = %v, want ErrStoreUnavailable", err)
	}
	if sumStore.Failed != 2 || sumStore.Skipped != 2 || sumStore.Stored != 0 {
		t.Errorf("store-err summary = %+v, want Failed=2 Skipped=2 Stored=0", sumStore)
	}
}
