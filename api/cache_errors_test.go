package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

func TestStaticAndStatsEndpointsCacheAndVisitIncrement(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "cache_test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	first := db.Car{
		URL: "https://crautos.com/c=cache-1", Brand: "Toyota", Model: "Hilux", Year: 2018,
		Price: 20000, Kilometraje: 80000, Provincia: "San José", SellerName: "AutoTest",
		Title: "Toyota Hilux 2018", ScrapedAt: baseTime, LastSeenAt: baseTime,
	}
	if err := database.UpsertCarBatch([]db.Car{first}); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}

	srv := &Server{DB: database, CacheTTL: 80 * time.Millisecond}

	getJSON := func(path string, out interface{}) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		switch path {
		case "/api/brands":
			srv.HandleBrands(rec, req)
		case "/api/provinces":
			srv.HandleProvinces(rec, req)
		case "/api/sellers/top":
			srv.HandleTopSellers(rec, req)
		case "/api/stats":
			srv.HandleStats(rec, req)
		case "/api/stats/detailed":
			srv.HandleDetailedStats(rec, req)
		default:
			t.Fatalf("unexpected path %q", path)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200 (body: %s)", path, rec.Code, rec.Body.String())
		}
		if out != nil {
			if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
				t.Fatalf("unmarshal %s: %v", path, err)
			}
		}
		return rec
	}

	// Initial values.
	var brands []string
	getJSON("/api/brands", &brands)
	if len(brands) != 1 || brands[0] != "Toyota" {
		t.Fatalf("initial brands = %v, want [Toyota]", brands)
	}

	var provinces []string
	getJSON("/api/provinces", &provinces)
	if len(provinces) != 1 || provinces[0] != "San José" {
		t.Fatalf("initial provinces = %v, want [San José]", provinces)
	}

	var sellers []string
	getJSON("/api/sellers/top", &sellers)
	if len(sellers) != 1 || sellers[0] != "AutoTest" {
		t.Fatalf("initial sellers = %v, want [AutoTest]", sellers)
	}

	var stats map[string]int
	getJSON("/api/stats", &stats)
	if stats["total"] != 1 || stats["active"] != 1 || stats["visits"] != 0 {
		t.Fatalf("initial stats = %v, want total=1 active=1 visits=0", stats)
	}

	var detailed db.DetailedStats
	getJSON("/api/stats/detailed", &detailed)
	if len(detailed.BrandStats) != 1 || detailed.BrandStats[0].Brand != "Toyota" || detailed.BrandStats[0].Total != 1 {
		t.Fatalf("initial detailed BrandStats = %+v, want one Toyota with total 1", detailed.BrandStats)
	}

	// Insert a second car directly; cached endpoints must not see it yet.
	second := db.Car{
		URL: "https://crautos.com/c=cache-2", Brand: "Honda", Model: "CR-V", Year: 2019,
		Price: 22000, Kilometraje: 70000, Provincia: "Alajuela", SellerName: "AutoTwo",
		Title: "Honda CR-V 2019", ScrapedAt: baseTime, LastSeenAt: baseTime,
	}
	if err := database.UpsertCarBatch([]db.Car{second}); err != nil {
		t.Fatalf("UpsertCarBatch second: %v", err)
	}

	brands = nil
	getJSON("/api/brands", &brands)
	if len(brands) != 1 || brands[0] != "Toyota" {
		t.Fatalf("cached brands = %v, want [Toyota]", brands)
	}

	provinces = nil
	getJSON("/api/provinces", &provinces)
	if len(provinces) != 1 || provinces[0] != "San José" {
		t.Fatalf("cached provinces = %v, want [San José]", provinces)
	}

	sellers = nil
	getJSON("/api/sellers/top", &sellers)
	if len(sellers) != 1 || sellers[0] != "AutoTest" {
		t.Fatalf("cached sellers = %v, want [AutoTest]", sellers)
	}

	stats = nil
	getJSON("/api/stats", &stats)
	if stats["total"] != 1 {
		t.Fatalf("cached stats total = %d, want 1", stats["total"])
	}

	detailed = db.DetailedStats{}
	getJSON("/api/stats/detailed", &detailed)
	if len(detailed.BrandStats) != 1 || detailed.BrandStats[0].Brand != "Toyota" {
		t.Fatalf("cached detailed BrandStats = %+v, want only Toyota", detailed.BrandStats)
	}

	// Recording a visit must be reflected immediately without invalidating cached counts.
	req := httptest.NewRequest(http.MethodPost, "/api/visit", strings.NewReader(`{"path":"/"}`))
	rec := httptest.NewRecorder()
	srv.HandleRecordVisit(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandleRecordVisit status = %d, want 200", rec.Code)
	}

	stats = nil
	getJSON("/api/stats", &stats)
	if stats["visits"] != 1 || stats["total"] != 1 {
		t.Fatalf("stats after visit = %v, want visits=1 total=1", stats)
	}

	// After the TTL, everything refreshes.
	time.Sleep(100 * time.Millisecond)

	brands = nil
	getJSON("/api/brands", &brands)
	if !containsString(brands, "Honda") || !containsString(brands, "Toyota") {
		t.Fatalf("refreshed brands = %v, want Toyota and Honda", brands)
	}

	provinces = nil
	getJSON("/api/provinces", &provinces)
	if !containsString(provinces, "Alajuela") || !containsString(provinces, "San José") {
		t.Fatalf("refreshed provinces = %v, want San José and Alajuela", provinces)
	}

	sellers = nil
	getJSON("/api/sellers/top", &sellers)
	if !containsString(sellers, "AutoTwo") || !containsString(sellers, "AutoTest") {
		t.Fatalf("refreshed sellers = %v, want AutoTest and AutoTwo", sellers)
	}

	stats = nil
	getJSON("/api/stats", &stats)
	if stats["total"] != 2 || stats["active"] != 2 {
		t.Fatalf("refreshed stats = %v, want total=2 active=2", stats)
	}

	detailed = db.DetailedStats{}
	getJSON("/api/stats/detailed", &detailed)
	totalCars := 0
	for _, bs := range detailed.BrandStats {
		totalCars += bs.Total
	}
	if totalCars != 2 {
		t.Fatalf("refreshed detailed BrandStats = %+v, want 2 cars total", detailed.BrandStats)
	}
}

func containsString(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

func TestStandardizedJSONErrorsDoNotLeakSQL(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "errors_test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}

	srv := &Server{DB: database}

	assertError := func(name string, rec *httptest.ResponseRecorder, wantCode int) {
		t.Helper()
		if rec.Code != wantCode {
			t.Fatalf("%s status = %d, want %d (body: %s)", name, rec.Code, wantCode, rec.Body.String())
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("%s Content-Type = %q, want application/json", name, ct)
		}
		var resp ErrorResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("%s unmarshal ErrorResponse: %v (body: %s)", name, err, rec.Body.String())
		}
		if resp.Code != rec.Code {
			t.Errorf("%s resp.Code = %d, want %d", name, resp.Code, rec.Code)
		}
		if resp.Error == "" {
			t.Errorf("%s resp.Error is empty", name)
		}
		body := rec.Body.String()
		if strings.Contains(body, "closed") || strings.Contains(body, "sql:") {
			t.Errorf("%s leaked internal SQL error: %s", name, body)
		}
	}

	// 400: invalid JSON body.
	req := httptest.NewRequest(http.MethodPost, "/api/cars/by-urls", strings.NewReader("{bad"))
	rec := httptest.NewRecorder()
	srv.HandleCarsByURLs(rec, req)
	assertError("HandleCarsByURLs invalid JSON", rec, http.StatusBadRequest)

	// 400: missing url parameter.
	req = httptest.NewRequest(http.MethodGet, "/api/cars/price-history", nil)
	rec = httptest.NewRecorder()
	srv.HandlePriceHistory(rec, req)
	assertError("HandlePriceHistory missing url", rec, http.StatusBadRequest)

	// 405: wrong method.
	req = httptest.NewRequest(http.MethodGet, "/api/visit", nil)
	rec = httptest.NewRecorder()
	srv.HandleRecordVisit(rec, req)
	assertError("HandleRecordVisit GET", rec, http.StatusMethodNotAllowed)

	// Close the DB so every query fails.
	if err := database.Close(); err != nil {
		t.Fatalf("database.Close: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/cars", nil)
	rec = httptest.NewRecorder()
	srv.HandleCars(rec, req)
	assertError("HandleCars closed DB", rec, http.StatusInternalServerError)

	req = httptest.NewRequest(http.MethodGet, "/api/brands", nil)
	rec = httptest.NewRecorder()
	srv.HandleBrands(rec, req)
	assertError("HandleBrands closed DB", rec, http.StatusInternalServerError)

	req = httptest.NewRequest(http.MethodGet, "/api/stats", nil)
	rec = httptest.NewRecorder()
	srv.HandleStats(rec, req)
	assertError("HandleStats closed DB", rec, http.StatusInternalServerError)

	req = httptest.NewRequest(http.MethodGet, "/api/stats/detailed", nil)
	rec = httptest.NewRecorder()
	srv.HandleDetailedStats(rec, req)
	assertError("HandleDetailedStats closed DB", rec, http.StatusInternalServerError)

	req = httptest.NewRequest(http.MethodGet, "/api/sellers/top", nil)
	rec = httptest.NewRecorder()
	srv.HandleTopSellers(rec, req)
	assertError("HandleTopSellers closed DB", rec, http.StatusInternalServerError)

	req = httptest.NewRequest(http.MethodGet, "/api/bargains", nil)
	rec = httptest.NewRecorder()
	srv.HandleBargains(rec, req)
	assertError("HandleBargains closed DB", rec, http.StatusInternalServerError)
}
