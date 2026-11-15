package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

func TestCarThumbURLAndSoldOpenGraph(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "api_thumbs.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	now := time.Date(2026, 11, 14, 14, 0, 0, 0, time.UTC)
	uStored := "https://crautos.com/autosusados/cardetail.cfm?c=7001"
	uPending := "https://crautos.com/autosusados/cardetail.cfm?c=7002"
	uSoldStored := "https://crautos.com/autosusados/cardetail.cfm?c=7003"

	for _, c := range []db.Car{
		{URL: uStored, Title: "Toyota Yaris 2020", Brand: "Toyota", Model: "Yaris", Year: 2020, Price: 15000, ScrapedAt: now, LastSeenAt: now},
		{URL: uPending, Title: "Toyota Yaris 2020", Brand: "Toyota", Model: "Yaris", Year: 2020, Price: 15500, ScrapedAt: now, LastSeenAt: now},
		{URL: uSoldStored, Title: "Honda CR-V 2019", Brand: "Honda", Model: "CR-V", Year: 2019, Price: 23000, ScrapedAt: now, LastSeenAt: now},
	} {
		if err := database.UpsertCar(c); err != nil {
			t.Fatalf("UpsertCar(%s): %v", c.URL, err)
		}
	}
	if err := database.SetThumbStatus(uStored, db.ThumbStored); err != nil {
		t.Fatalf("SetThumbStatus stored: %v", err)
	}
	if err := database.SetThumbStatus(uSoldStored, db.ThumbStored); err != nil {
		t.Fatalf("SetThumbStatus sold stored: %v", err)
	}
	if err := database.MarkSold([]string{uSoldStored}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}

	srv := &Server{DB: database}

	// 1. When THUMBS_PUBLIC_BASE is unset, ThumbURL must be omitted even when thumb_status == 1.
	t.Setenv("THUMBS_PUBLIC_BASE", "")
	rr := httptest.NewRecorder()
	srv.HandleCars(rr, httptest.NewRequest(http.MethodGet, "/api/cars?isSold=false", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/cars status = %d", rr.Code)
	}
	if strings.Contains(rr.Body.String(), `"ThumbURL"`) {
		t.Errorf("ThumbURL should be omitted when THUMBS_PUBLIC_BASE is empty: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"ThumbStatus"`) {
		t.Errorf("ThumbStatus should never be serialized in JSON: %s", rr.Body.String())
	}

	// 2. When THUMBS_PUBLIC_BASE is set, ThumbURL appears ONLY for ThumbStored cars.
	t.Setenv("THUMBS_PUBLIC_BASE", "https://storage.googleapis.com/happy-customer-cars-thumbs/thumbs/")
	rr = httptest.NewRecorder()
	srv.HandleCars(rr, httptest.NewRequest(http.MethodGet, "/api/cars?isSold=false", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/cars status = %d", rr.Code)
	}
	var cars []CarWithMarket
	if err := json.Unmarshal(rr.Body.Bytes(), &cars); err != nil {
		t.Fatalf("decode /api/cars: %v", err)
	}
	byURL := map[string]CarWithMarket{}
	for _, c := range cars {
		byURL[c.URL] = c
	}
	if got := byURL[uStored].ThumbURL; got != "https://storage.googleapis.com/happy-customer-cars-thumbs/thumbs/7001.jpg" {
		t.Errorf("uStored ThumbURL = %q, want trimmed GCS URL", got)
	}
	if got := byURL[uPending].ThumbURL; got != "" {
		t.Errorf("uPending ThumbURL = %q, want empty", got)
	}

	// 3. /api/cars/favorites also passes through withMarket and exposes ThumbURL for sold stored cars.
	favBody, _ := json.Marshal(map[string][]string{"urls": {uSoldStored}})
	favReq := httptest.NewRequest(http.MethodPost, "/api/cars/favorites", bytes.NewReader(favBody))
	favRR := httptest.NewRecorder()
	srv.HandleCarsByURLs(favRR, favReq)
	if favRR.Code != http.StatusOK {
		t.Fatalf("POST /api/cars/favorites status = %d", favRR.Code)
	}
	var favCars []CarWithMarket
	if err := json.Unmarshal(favRR.Body.Bytes(), &favCars); err != nil {
		t.Fatalf("decode /api/cars/favorites: %v", err)
	}
	if len(favCars) != 1 || favCars[0].ThumbURL != "https://storage.googleapis.com/happy-customer-cars-thumbs/thumbs/7003.jpg" {
		t.Errorf("favorites sold stored car = %+v", favCars)
	}

	// 4. OpenGraph for sold car uses stored ThumbURL when THUMBS_PUBLIC_BASE is set.
	ogHTML := srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?car="+url.QueryEscape(uSoldStored), nil), testBaseHTML)
	if !strings.Contains(ogHTML, `og:image" content="https://storage.googleapis.com/happy-customer-cars-thumbs/thumbs/7003.jpg"`) {
		t.Errorf("sold car OpenGraph should use stored ThumbURL:\n%s", ogHTML)
	}
}
