package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"crautosdb/db"
)

func TestHandleValuate(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	baseTime := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)

	// Exact group with 5 cars for Toyota RAV4 2020 (prices 22k..26k, median 24k).
	prices2020 := []int{22000, 23000, 24000, 25000, 26000}
	for i, p := range prices2020 {
		c := db.Car{
			URL:           fmt.Sprintf("https://crautos.com/rav4-2020-%d?c=%d", i, 1000+i),
			Title:         "Toyota RAV4 2020",
			Brand:         "Toyota",
			Model:         "RAV4",
			Year:          2020,
			Price:         p,
			Kilometraje:   60000 + i*10000,
			Placa:         fmt.Sprintf("Termina en %d", i+1),
			ColorExterior: "BLANCO",
			SellerPhone:   fmt.Sprintf("8888-100%d", i),
			ScrapedAt:     baseTime.Add(-time.Duration(i*24) * time.Hour),
			LastSeenAt:    baseTime,
		}
		if err := database.UpsertCar(c); err != nil {
			t.Fatalf("UpsertCar 2020 %d: %v", i, err)
		}
	}

	// Sparse year 2017 (1 car) + adjacent 2016 (3 cars) for year ± 1 fallback test.
	sparseCars := []db.Car{
		{URL: "https://crautos.com/tucson-2017-0", Title: "Hyundai Tucson 2017", Brand: "Hyundai", Model: "Tucson", Year: 2017, Price: 16500, Kilometraje: 90000, Placa: "Termina en 1", ColorExterior: "GRIS", SellerPhone: "8777-0001", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/tucson-2016-0", Title: "Hyundai Tucson 2016", Brand: "Hyundai", Model: "Tucson", Year: 2016, Price: 14000, Kilometraje: 100000, Placa: "Termina en 2", ColorExterior: "AZUL", SellerPhone: "8777-0002", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/tucson-2016-1", Title: "Hyundai Tucson 2016", Brand: "Hyundai", Model: "Tucson", Year: 2016, Price: 15000, Kilometraje: 105000, Placa: "Termina en 3", ColorExterior: "NEGRO", SellerPhone: "8777-0003", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/tucson-2016-2", Title: "Hyundai Tucson 2016", Brand: "Hyundai", Model: "Tucson", Year: 2016, Price: 16000, Kilometraje: 110000, Placa: "Termina en 4", ColorExterior: "BLANCO", SellerPhone: "8777-0004", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(sparseCars); err != nil {
		t.Fatalf("UpsertCarBatch sparse: %v", err)
	}

	srv := &Server{DB: database}

	// 1. Exact group valuation.
	req := httptest.NewRequest(http.MethodGet, "/api/valuate?brand=Toyota&model=RAV4&year=2020&km=80000", nil)
	rec := httptest.NewRecorder()
	srv.HandleValuate(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("exact status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var exact ValuationResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &exact); err != nil {
		t.Fatalf("unmarshal exact: %v", err)
	}
	if exact.Confidence != "medium" || exact.SampleCount != 5 || exact.YearWindow != 0 {
		t.Errorf("exact metadata = %+v, want confidence=medium sampleCount=5 yearWindow=0", exact)
	}
	if exact.QuickSalePrice <= 0 || exact.QuickSalePrice >= exact.FairPrice || exact.OptimisticPrice <= exact.FairPrice {
		t.Errorf("exact bands invalid: quick=%d fair=%d opt=%d", exact.QuickSalePrice, exact.FairPrice, exact.OptimisticPrice)
	}
	if len(exact.Comparables) != 5 || exact.ActiveCount != 5 {
		t.Errorf("exact comparables=%d activeCount=%d, want 5", len(exact.Comparables), exact.ActiveCount)
	}

	// 2. Fallback year ± 1.
	reqFb := httptest.NewRequest(http.MethodGet, "/api/valuate?brand=Hyundai&model=Tucson&year=2017&km=95000", nil)
	recFb := httptest.NewRecorder()
	srv.HandleValuate(recFb, reqFb)
	if recFb.Code != http.StatusOK {
		t.Fatalf("fallback status = %d", recFb.Code)
	}
	var fb ValuationResponse
	if err := json.Unmarshal(recFb.Body.Bytes(), &fb); err != nil {
		t.Fatalf("unmarshal fallback: %v", err)
	}
	if fb.YearWindow != 1 || fb.Confidence != "low" || fb.SampleCount != 4 || fb.FairPrice <= 0 {
		t.Errorf("fallback = %+v, want yearWindow=1 confidence=low sampleCount=4 fair>0", fb)
	}

	// 3. No samples -> 200 with confidence=none.
	reqNone := httptest.NewRequest(http.MethodGet, "/api/valuate?brand=Ferrari&model=Enzo&year=2020", nil)
	recNone := httptest.NewRecorder()
	srv.HandleValuate(recNone, reqNone)
	if recNone.Code != http.StatusOK {
		t.Fatalf("none status = %d", recNone.Code)
	}
	var noneResp ValuationResponse
	if err := json.Unmarshal(recNone.Body.Bytes(), &noneResp); err != nil {
		t.Fatalf("unmarshal none: %v", err)
	}
	if noneResp.Confidence != "none" || noneResp.SampleCount != 0 {
		t.Errorf("noneResp = %+v, want confidence=none sampleCount=0", noneResp)
	}

	// 4. Missing/invalid params -> 400.
	reqBad := httptest.NewRequest(http.MethodGet, "/api/valuate?brand=Toyota&year=2020", nil)
	recBad := httptest.NewRecorder()
	srv.HandleValuate(recBad, reqBad)
	if recBad.Code != http.StatusBadRequest {
		t.Errorf("bad request status = %d, want 400", recBad.Code)
	}
}
