package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"crautosdb/alerts"
	"crautosdb/db"
)

func newAlertTestServer(t *testing.T) (*Server, *db.DB) {
	t.Helper()
	database, err := db.Init(":memory:")
	if err != nil {
		t.Fatalf("db.Init(:memory:): %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return &Server{DB: database}, database
}

func TestAlertHandlers(t *testing.T) {
	t.Setenv("TELEGRAM_WEBHOOK_SECRET", "")

	srv, database := newAlertTestServer(t)

	// POST /api/alerts
	body := `{"channel":"telegram","query":"brand=Toyota","label":"Toyotas"}`
	rec := httptest.NewRecorder()
	srv.HandleAlerts(rec, httptest.NewRequest(http.MethodPost, "/api/alerts", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/alerts status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ConnectToken     string `json:"connectToken"`
		UnsubscribeToken string `json:"unsubscribeToken"`
		TelegramURL      string `json:"telegramUrl"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ConnectToken == "" || created.UnsubscribeToken == "" {
		t.Fatalf("missing tokens: %+v", created)
	}
	if !strings.Contains(created.TelegramURL, "?start="+created.ConnectToken) {
		t.Fatalf("unexpected telegramUrl = %q", created.TelegramURL)
	}

	// GET /api/alerts/status (inactive before connecting)
	rec = httptest.NewRecorder()
	srv.HandleAlertStatus(rec, httptest.NewRequest(http.MethodGet, "/api/alerts/status?token="+created.ConnectToken, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d, body = %s", rec.Code, rec.Body.String())
	}
	var status struct {
		Active bool `json:"active"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &status)
	if status.Active {
		t.Fatalf("expected subscription to be inactive")
	}

	// Activate and confirm active status.
	if _, err := database.ActivateTelegramAlert(created.ConnectToken, "12345"); err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}
	rec = httptest.NewRecorder()
	srv.HandleAlertStatus(rec, httptest.NewRequest(http.MethodGet, "/api/alerts/status?token="+created.ConnectToken, nil))
	_ = json.Unmarshal(rec.Body.Bytes(), &status)
	if !status.Active {
		t.Fatalf("expected subscription to be active")
	}

	// Unknown token -> 404.
	rec = httptest.NewRecorder()
	srv.HandleAlertStatus(rec, httptest.NewRequest(http.MethodGet, "/api/alerts/status?token=does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown token status = %d", rec.Code)
	}

	// GET /api/alerts/unsubscribe
	rec = httptest.NewRecorder()
	srv.HandleAlertUnsubscribe(rec, httptest.NewRequest(http.MethodGet, "/api/alerts/unsubscribe?token="+created.UnsubscribeToken, nil))
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("unsubscribe Content-Type = %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "Alertas desactivadas") {
		t.Fatalf("unexpected unsubscribe body: %s", rec.Body.String())
	}

	// POST /api/alerts/telegram/webhook without secret -> 200.
	rec = httptest.NewRecorder()
	srv.HandleTelegramWebhook(rec, httptest.NewRequest(http.MethodPost, "/api/alerts/telegram/webhook", strings.NewReader(`{"update_id":1}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("webhook status = %d", rec.Code)
	}

	// Webhook secret enforcement.
	t.Setenv("TELEGRAM_WEBHOOK_SECRET", "s3cret")
	rec = httptest.NewRecorder()
	srv.HandleTelegramWebhook(rec, httptest.NewRequest(http.MethodPost, "/api/alerts/telegram/webhook", strings.NewReader(`{"update_id":2}`)))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("webhook without secret status = %d", rec.Code)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/alerts/telegram/webhook", strings.NewReader(`{"update_id":3}`))
	req.Header.Set("X-Telegram-Bot-Api-Secret-Token", "s3cret")
	rec = httptest.NewRecorder()
	srv.HandleTelegramWebhook(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("webhook with secret status = %d", rec.Code)
	}
}

func TestRunAlertsDigest(t *testing.T) {
	// Reset the package-level market cache so this test uses its own database.
	marketCache.Lock()
	marketCache.stats = nil
	marketCache.loadedAt = time.Time{}
	marketCache.Unlock()

	srv, database := newAlertTestServer(t)

	// A car scraped in the future ensures it is newer than the subscription's last notification
	// (ActivateTelegramAlert stamps last_notified_at when connecting).
	scrapedAt := time.Now().Add(time.Hour).UTC()
	if err := database.UpsertCar(db.Car{
		URL:         "https://crautos.com/car/1",
		Title:       "Toyota Corolla 2020",
		Brand:       "Toyota",
		Model:       "Corolla",
		Year:        2020,
		Price:       15000,
		PriceText:   "$15,000",
		Kilometraje: 50000,
	}); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}
	if _, err := database.Exec(`UPDATE cars SET scraped_at = ?, last_seen_at = ? WHERE url = ?`, scrapedAt, scrapedAt, "https://crautos.com/car/1"); err != nil {
		t.Fatalf("update scraped_at: %v", err)
	}

	sub, err := database.CreateAlertSubscription("telegram", "brand=Toyota", "Toyotas")
	if err != nil {
		t.Fatalf("CreateAlertSubscription: %v", err)
	}
	if _, err := database.ActivateTelegramAlert(sub.ConnectToken, "999"); err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}

	var sent int
	var text string
	tg := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/sendMessage") {
			b, _ := io.ReadAll(r.Body)
			var payload struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(b, &payload)
			text = payload.Text
			sent++
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer tg.Close()

	client := alerts.NewTelegramClient("test-token")
	client.BaseURL = tg.URL

	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest: %v", err)
	}
	if sent != 1 {
		t.Fatalf("expected 1 telegram message, got %d", sent)
	}
	if !strings.Contains(text, "https://example.com/?car=") {
		t.Fatalf("message missing car link: %q", text)
	}
	if !strings.Contains(text, "corolla") && !strings.Contains(text, "Corolla") {
		t.Fatalf("message missing car title: %q", text)
	}

	list, err := database.ListAlertsByTarget("telegram", "999")
	if err != nil {
		t.Fatalf("ListAlertsByTarget: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 active alert, got %d", len(list))
	}
	if list[0].LastNotifiedAt.IsZero() {
		t.Fatalf("last_notified_at was not updated")
	}
}

// resetAlertMarketCache drops the package-level market index cache so each test
// rebuilds it from its own isolated database.
func resetAlertMarketCache() {
	marketCache.Lock()
	marketCache.stats = nil
	marketCache.loadedAt = time.Time{}
	marketCache.Unlock()
}

// newTelegramMock spins up a fake Telegram Bot API server capturing the last
// sendMessage payload and the total number of messages sent.
func newTelegramMock(t *testing.T) (baseURL string, sent func() int, lastText func() string) {
	t.Helper()
	var n int
	var text string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/sendMessage") {
			b, _ := io.ReadAll(r.Body)
			var payload struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(b, &payload)
			text = payload.Text
			n++
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)
	return srv.URL, func() int { return n }, func() string { return text }
}

func TestParseAlertCarURLs(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", nil},
		{"single-car", "car=https://crautos.com/car/1", []string{"https://crautos.com/car/1"}},
		{"repeated-car", "car=https://crautos.com/car/1&car=https://crautos.com/car/2", []string{"https://crautos.com/car/1", "https://crautos.com/car/2"}},
		{"carUrl", "carUrl=https://crautos.com/car/9", []string{"https://crautos.com/car/9"}},
		{"urls-comma", "urls=https://crautos.com/car/3,https://crautos.com/car/4", []string{"https://crautos.com/car/3", "https://crautos.com/car/4"}},
		{"dedupe-order", "car=https://crautos.com/car/1&car=https://crautos.com/car/1&carUrl=https://crautos.com/car/1&car=https://crautos.com/car/2", []string{"https://crautos.com/car/1", "https://crautos.com/car/2"}},
		{"filters", "brand=Toyota&minYear=2020", nil},
		{"leading-question", "?car=https://crautos.com/car/5", []string{"https://crautos.com/car/5"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := db.ParseAlertCarURLs(tc.in)
			if len(got) != len(tc.want) {
				t.Fatalf("ParseAlertCarURLs(%q) = %v, want %v", tc.in, got, tc.want)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Fatalf("ParseAlertCarURLs(%q)[%d] = %q, want %q", tc.in, i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestRunAlertsDigest_CarPriceDrop(t *testing.T) {
	resetAlertMarketCache()

	srv, database := newAlertTestServer(t)

	before := time.Now().Add(-2 * time.Hour).UTC()
	since := time.Now().Add(-1 * time.Hour).UTC()
	after := time.Now().Add(-10 * time.Minute).UTC()

	car1URL := "https://crautos.com/car/rav4-1"
	cars := []db.Car{
		{URL: car1URL, Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 24000, Kilometraje: 55000, ScrapedAt: before, LastSeenAt: after},
		{URL: "https://crautos.com/car/rav4-2", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 25000, Kilometraje: 50000, ScrapedAt: before, LastSeenAt: after},
		{URL: "https://crautos.com/car/rav4-3", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 26000, Kilometraje: 58000, ScrapedAt: before, LastSeenAt: after},
		{URL: "https://crautos.com/car/rav4-4", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 27000, Kilometraje: 60000, ScrapedAt: before, LastSeenAt: after},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	if _, err := database.Exec("DELETE FROM price_history WHERE url = ?", car1URL); err != nil {
		t.Fatalf("delete price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", car1URL, 26000, before); err != nil {
		t.Fatalf("insert prev price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", car1URL, 24000, after); err != nil {
		t.Fatalf("insert curr price_history: %v", err)
	}

	sub, err := database.CreateAlertSubscription("telegram", "car="+url.QueryEscape(car1URL), "Toyota RAV4 2020")
	if err != nil {
		t.Fatalf("CreateAlertSubscription: %v", err)
	}
	if _, err := database.ActivateTelegramAlert(sub.ConnectToken, "111"); err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}
	if err := database.UpdateAlertNotifiedAt(sub.ID, since); err != nil {
		t.Fatalf("UpdateAlertNotifiedAt: %v", err)
	}

	baseURL, sent, lastText := newTelegramMock(t)
	client := alerts.NewTelegramClient("test-token")
	client.BaseURL = baseURL

	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest: %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected 1 telegram message, got %d", got)
	}
	text := lastText()
	for _, want := range []string{"$26,000", "$24,000", "-$2,000", "-7.7%", "https://example.com/?car=", "/api/alerts/unsubscribe?token="} {
		if !strings.Contains(text, want) {
			t.Fatalf("message missing %q: %q", want, text)
		}
	}

	// A second immediate run must not re-notify the same drop.
	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest (2nd): %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected no duplicate notification, got %d messages", got)
	}

	list, err := database.ListAlertsByTarget("telegram", "111")
	if err != nil {
		t.Fatalf("ListAlertsByTarget: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected alert to stay active, got %d", len(list))
	}
}

func TestRunAlertsDigest_CarSoldDeactivatesAlert(t *testing.T) {
	resetAlertMarketCache()

	srv, database := newAlertTestServer(t)

	before := time.Now().Add(-2 * time.Hour).UTC()
	since := time.Now().Add(-1 * time.Hour).UTC()
	after := time.Now().Add(-10 * time.Minute).UTC()

	carURL := "https://crautos.com/car/sold-1"
	if err := database.UpsertCar(db.Car{
		URL:         carURL,
		Title:       "Toyota Corolla 2020",
		Brand:       "Toyota",
		Model:       "Corolla",
		Year:        2020,
		Price:       15000,
		Kilometraje: 40000,
		ScrapedAt:   before,
		LastSeenAt:  before,
	}); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}

	sub, err := database.CreateAlertSubscription("telegram", "car="+url.QueryEscape(carURL), "Mi Corolla")
	if err != nil {
		t.Fatalf("CreateAlertSubscription: %v", err)
	}
	if _, err := database.ActivateTelegramAlert(sub.ConnectToken, "222"); err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}
	if err := database.UpdateAlertNotifiedAt(sub.ID, since); err != nil {
		t.Fatalf("UpdateAlertNotifiedAt: %v", err)
	}

	if err := database.MarkSold([]string{carURL}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}
	if _, err := database.Exec("UPDATE cars SET sold_at = ? WHERE url = ?", after, carURL); err != nil {
		t.Fatalf("update sold_at: %v", err)
	}

	baseURL, sent, lastText := newTelegramMock(t)
	client := alerts.NewTelegramClient("test-token")
	client.BaseURL = baseURL

	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest: %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected 1 telegram message, got %d", got)
	}
	text := lastText()
	for _, want := range []string{"Vendido", "https://example.com/?car=", "/api/alerts/unsubscribe?token="} {
		if !strings.Contains(text, want) {
			t.Fatalf("message missing %q: %q", want, text)
		}
	}

	list, err := database.ListAlertsByTarget("telegram", "222")
	if err != nil {
		t.Fatalf("ListAlertsByTarget: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected the single-car alert to be deactivated, got %d active", len(list))
	}

	// No active alert left, so a second run sends nothing more.
	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest (2nd): %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected no further messages, got %d", got)
	}
}

func TestRunAlertsDigest_FavoritesListMultipleCars(t *testing.T) {
	resetAlertMarketCache()

	srv, database := newAlertTestServer(t)

	before := time.Now().Add(-2 * time.Hour).UTC()
	since := time.Now().Add(-1 * time.Hour).UTC()
	after := time.Now().Add(-10 * time.Minute).UTC()

	car1URL := "https://crautos.com/car/fav-rav4"
	car2URL := "https://crautos.com/car/fav-crv"
	cars := []db.Car{
		// Watched favorite with a clean price drop; also a comparable for the market index.
		{URL: car1URL, Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 24000, Kilometraje: 55000, ScrapedAt: before, LastSeenAt: after},
		// Watched favorite whose price did not move; should not appear in the message.
		{URL: car2URL, Title: "Honda CR-V 2019", Brand: "Honda", Model: "CR-V", Year: 2019, Price: 20000, Kilometraje: 70000, ScrapedAt: before, LastSeenAt: after},
		// Extra comparables so the RAV4 group has >= 4 members.
		{URL: "https://crautos.com/car/fav-c3", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 25000, Kilometraje: 50000, ScrapedAt: before, LastSeenAt: after},
		{URL: "https://crautos.com/car/fav-c4", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 26000, Kilometraje: 58000, ScrapedAt: before, LastSeenAt: after},
		{URL: "https://crautos.com/car/fav-c5", Title: "Toyota RAV4 2020", Brand: "Toyota", Model: "RAV4", Year: 2020, Price: 27000, Kilometraje: 60000, ScrapedAt: before, LastSeenAt: after},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	if _, err := database.Exec("DELETE FROM price_history WHERE url = ?", car1URL); err != nil {
		t.Fatalf("delete price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", car1URL, 26000, before); err != nil {
		t.Fatalf("insert prev price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", car1URL, 24000, after); err != nil {
		t.Fatalf("insert curr price_history: %v", err)
	}

	query := "car=" + url.QueryEscape(car1URL) + "&car=" + url.QueryEscape(car2URL)
	sub, err := database.CreateAlertSubscription("telegram", query, "Mis Favoritos (2 autos)")
	if err != nil {
		t.Fatalf("CreateAlertSubscription: %v", err)
	}
	if _, err := database.ActivateTelegramAlert(sub.ConnectToken, "333"); err != nil {
		t.Fatalf("ActivateTelegramAlert: %v", err)
	}
	if err := database.UpdateAlertNotifiedAt(sub.ID, since); err != nil {
		t.Fatalf("UpdateAlertNotifiedAt: %v", err)
	}

	baseURL, sent, lastText := newTelegramMock(t)
	client := alerts.NewTelegramClient("test-token")
	client.BaseURL = baseURL

	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest: %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected 1 telegram message, got %d", got)
	}
	text := lastText()
	for _, want := range []string{"$26,000", "$24,000", "-$2,000", "/?tab=favorites"} {
		if !strings.Contains(text, want) {
			t.Fatalf("message missing %q: %q", want, text)
		}
	}
	if strings.Contains(text, car2URL) || strings.Contains(text, "Honda") || strings.Contains(text, "CR-V") {
		t.Fatalf("message should not mention the unchanged car 2: %q", text)
	}

	list, err := database.ListAlertsByTarget("telegram", "333")
	if err != nil {
		t.Fatalf("ListAlertsByTarget: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected favorites alert to stay active, got %d", len(list))
	}

	if err := srv.RunAlertsDigest(context.Background(), client, "https://example.com"); err != nil {
		t.Fatalf("RunAlertsDigest (2nd): %v", err)
	}
	if got := sent(); got != 1 {
		t.Fatalf("expected no new messages on second run, got %d", got)
	}
}
