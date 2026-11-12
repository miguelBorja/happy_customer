package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"crautosdb/db"
)

func TestPriceHistoryAPIAndEnrichment(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	resetMarketCache := func() {
		marketCache.Lock()
		marketCache.stats = nil
		marketCache.loadedAt = time.Time{}
		marketCache.Unlock()
	}
	resetMarketCache()
	t.Cleanup(resetMarketCache)

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	updatedURL := "https://crautos.com/c=101"
	unchangedURL := "https://crautos.com/c=102"

	cars := []db.Car{
		{URL: updatedURL, Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 20000, Kilometraje: 80000, Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-1001", Title: "Toyota Hilux 2018", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: unchangedURL, Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 20500, Kilometraje: 82000, Placa: "Termina en 2", ColorExterior: "GRIS", SellerPhone: "8888-1002", Title: "Toyota Hilux 2018", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=103", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 21000, Kilometraje: 75000, Placa: "Termina en 3", ColorExterior: "NEGRO", SellerPhone: "8888-1003", Title: "Toyota Hilux 2018", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=104", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 19800, Kilometraje: 90000, Placa: "Termina en 4", ColorExterior: "AZUL", SellerPhone: "8888-1004", Title: "Toyota Hilux 2018", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}

	// Price drop on c=101.
	updated := cars[0]
	updated.Price = 18500
	updated.LastSeenAt = baseTime.Add(time.Hour)
	if err := database.UpsertCar(updated); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}
	resetMarketCache()

	srv := &Server{DB: database}

	// 1. /api/cars enriches c=101 with PricePrevious/Initial/ChangedAt/Changes, leaves c=102 empty.
	req := httptest.NewRequest(http.MethodGet, "/api/cars?isSold=false", nil)
	rec := httptest.NewRecorder()
	srv.HandleCars(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandleCars status = %d, want 200", rec.Code)
	}
	var list []CarWithMarket
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal HandleCars: %v", err)
	}
	byURL := make(map[string]CarWithMarket, len(list))
	for _, c := range list {
		byURL[c.URL] = c
	}
	gotUpdated, ok := byURL[updatedURL]
	if !ok {
		t.Fatalf("updated car %q not returned by HandleCars", updatedURL)
	}
	if gotUpdated.PricePrevious != 20000 || gotUpdated.PriceInitial != 20000 || gotUpdated.PriceChanges != 1 || gotUpdated.PriceChangedAt == nil {
		t.Errorf("updated car enrichment = %+v, want PricePrevious=20000 PriceInitial=20000 PriceChanges=1 PriceChangedAt!=nil", gotUpdated)
	}
	if gotUnchanged := byURL[unchangedURL]; gotUnchanged.PricePrevious != 0 || gotUnchanged.PriceChangedAt != nil {
		t.Errorf("unchanged car unexpectedly enriched: %+v", gotUnchanged)
	}

	// 2. GET /api/cars/price-history?url=... returns [20000, 18500].
	req = httptest.NewRequest(http.MethodGet, "/api/cars/price-history?url="+url.QueryEscape(updatedURL), nil)
	rec = httptest.NewRecorder()
	srv.HandlePriceHistory(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandlePriceHistory status = %d, want 200", rec.Code)
	}
	var points []db.PricePoint
	if err := json.Unmarshal(rec.Body.Bytes(), &points); err != nil {
		t.Fatalf("unmarshal price history: %v", err)
	}
	if len(points) != 2 || points[0].Price != 20000 || points[1].Price != 18500 {
		t.Fatalf("price history = %+v, want [20000 18500]", points)
	}

	// 3. Missing url returns 400.
	req = httptest.NewRequest(http.MethodGet, "/api/cars/price-history", nil)
	rec = httptest.NewRecorder()
	srv.HandlePriceHistory(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing url status = %d, want 400", rec.Code)
	}

	// 4. Non-GET returns 405.
	req = httptest.NewRequest(http.MethodPost, "/api/cars/price-history?url="+url.QueryEscape(updatedURL), nil)
	rec = httptest.NewRecorder()
	srv.HandlePriceHistory(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST status = %d, want 405", rec.Code)
	}
}
