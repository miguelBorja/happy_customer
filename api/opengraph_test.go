package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

const testBaseHTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Todos los autos usados de Crautos en un solo lugar." />
    <meta property="og:title" content="Happy Customer" />
    <meta property="og:description" content="Todos los autos usados de Crautos en un solo lugar." />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/favicon.png" />
    <title>Happy Customer</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

func resetMarketStatsCache() {
	marketCache.Lock()
	marketCache.stats = nil
	marketCache.loadedAt = time.Time{}
	marketCache.Unlock()
}

func TestRenderIndexHTMLPlainRoot(t *testing.T) {
	// A nil Server must still return baseHTML unchanged for "/" (no DB access).
	var s *Server
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := s.RenderIndexHTML(req, testBaseHTML); got != testBaseHTML {
		t.Errorf("nil server: plain / should return baseHTML unchanged")
	}

	var srv = &Server{DB: nil}
	if got := srv.RenderIndexHTML(req, testBaseHTML); got != testBaseHTML {
		t.Errorf("empty server: plain / should return baseHTML unchanged")
	}
}

func TestRenderIndexHTMLActiveCar(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	prev := baseTime.Add(-24 * time.Hour)
	newest := baseTime.Add(-1 * time.Hour)

	targetURL := "https://crautos.com/clasificados/usados/xyz?c=9876543"
	target := db.Car{
		URL: targetURL, Title: "Toyota Corolla 2020",
		Brand: "Toyota", Model: "Corolla", Year: 2020,
		Price: 18500, PriceText: "$18,500", Kilometraje: 30000,
		Transmision: "Automática", Combustible: "Gasolina", Estilo: "Sedán", Provincia: "San José",
		Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-0001",
		ScrapedAt: baseTime, LastSeenAt: baseTime,
	}
	if err := database.UpsertCar(target); err != nil {
		t.Fatalf("UpsertCar target: %v", err)
	}
	// Comparables that push the median well above the target price.
	for i := 0; i < 5; i++ {
		c := db.Car{
			URL:   fmt.Sprintf("https://crautos.com/comparable-%d?c=200000%d", i, i),
			Title: "Toyota Corolla 2020", Brand: "Toyota", Model: "Corolla", Year: 2020,
			Price: 25000, Kilometraje: 30000,
			Placa: fmt.Sprintf("Termina en %d", i+2), ColorExterior: "GRIS",
			SellerPhone: fmt.Sprintf("8888-%04d", i+2),
			ScrapedAt:   baseTime, LastSeenAt: baseTime,
		}
		if err := database.UpsertCar(c); err != nil {
			t.Fatalf("UpsertCar comparable %d: %v", i, err)
		}
	}
	// Price drop: 20000 -> 18500.
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", targetURL, 20000, prev); err != nil {
		t.Fatalf("insert price_history prev: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", targetURL, 18500, newest); err != nil {
		t.Fatalf("insert price_history current: %v", err)
	}

	srv := &Server{DB: database}
	req := httptest.NewRequest(http.MethodGet, "/?car="+url.QueryEscape(targetURL), nil)
	got := srv.RenderIndexHTML(req, testBaseHTML)

	if !strings.Contains(got, `content="https://crautos.com/clasificados/usados/9876543-1.jpg"`) {
		t.Errorf("og:image not set to crautos thumbnail:\n%s", got)
	}
	if !strings.Contains(got, `twitter:card" content="summary_large_image"`) {
		t.Errorf("twitter:card not summary_large_image:\n%s", got)
	}
	if !strings.Contains(got, "$18,500") {
		t.Errorf("title missing formatted price:\n%s", got)
	}
	if !strings.Contains(got, "Gran precio") {
		t.Errorf("description missing 'Gran precio':\n%s", got)
	}
	if !strings.Contains(got, "Bajó $1,500") {
		t.Errorf("description missing 'Bajó $1,500':\n%s", got)
	}
}

func TestRenderIndexHTMLSoldCar(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	soldURL := "https://crautos.com/clasificados/usados/sold?c=1112223"
	car := db.Car{
		URL: soldURL, Title: "Toyota Corolla 2018",
		Brand: "Toyota", Model: "Corolla", Year: 2018,
		Price: 15000, Kilometraje: 40000,
		Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-1001",
		ScrapedAt: baseTime, LastSeenAt: baseTime,
	}
	if err := database.UpsertCar(car); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}
	if err := database.MarkSold([]string{soldURL}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}

	srv := &Server{DB: database}
	req := httptest.NewRequest(http.MethodGet, "/?car="+url.QueryEscape(soldURL), nil)
	got := srv.RenderIndexHTML(req, testBaseHTML)

	if !strings.Contains(got, `og:image" content="/favicon.png"`) {
		t.Errorf("sold car should fall back to /favicon.png:\n%s", got)
	}
	if !strings.Contains(got, `twitter:card" content="summary"`) {
		t.Errorf("sold car twitter:card should be summary:\n%s", got)
	}
	if !strings.Contains(got, "(Vendido)") {
		t.Errorf("sold car title missing (Vendido):\n%s", got)
	}
}

func TestRenderIndexHTMLEscaping(t *testing.T) {
	payload := `<script>alert(1)</script>"onload="evil()"`

	// XSS in a car model/title must be escaped.
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	xssURL := "https://crautos.com/xss?c=5555"
	car := db.Car{
		URL: xssURL, Title: payload,
		Brand: "Toyota", Model: payload, Year: 0, Price: 10000,
		Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-2001",
		ScrapedAt: baseTime, LastSeenAt: baseTime,
	}
	if err := database.UpsertCar(car); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}

	srv := &Server{DB: database}
	got := srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?car="+url.QueryEscape(xssURL), nil), testBaseHTML)
	if strings.Contains(got, "<script>") {
		t.Errorf("car title/model XSS was not escaped:\n%s", got)
	}

	// XSS in a filter query parameter must be escaped (no DB access required).
	got = srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?brands="+url.QueryEscape(payload), nil), testBaseHTML)
	if strings.Contains(got, "<script>") {
		t.Errorf("brands query XSS was not escaped:\n%s", got)
	}
	got = srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?title="+url.QueryEscape(payload), nil), testBaseHTML)
	if strings.Contains(got, "<script>") {
		t.Errorf("title query XSS was not escaped:\n%s", got)
	}
}

func TestRenderIndexHTMLBargainsAndFilters(t *testing.T) {
	srv := &Server{DB: nil}

	got := srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?tab=bargains", nil), testBaseHTML)
	if !strings.Contains(got, "Gangas del mercado | Happy Customer") {
		t.Errorf("bargains title missing:\n%s", got)
	}
	if !strings.Contains(got, `og:image" content="/favicon.png"`) {
		t.Errorf("bargains og:image not /favicon.png:\n%s", got)
	}
	if !strings.Contains(got, `twitter:card" content="summary"`) {
		t.Errorf("bargains twitter:card not summary:\n%s", got)
	}

	got = srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?brands=Toyota&models=Corolla&priceDrop=true&priceMax=20000", nil), testBaseHTML)
	if !strings.Contains(got, "Toyota") || !strings.Contains(got, "Corolla") {
		t.Errorf("filter summary missing brands/models:\n%s", got)
	}
	if !strings.Contains(got, "bajaron de precio") {
		t.Errorf("filter summary missing priceDrop phrase:\n%s", got)
	}
	if !strings.Contains(got, `og:image" content="/favicon.png"`) {
		t.Errorf("filter og:image not /favicon.png:\n%s", got)
	}
	if !strings.Contains(got, `twitter:card" content="summary"`) {
		t.Errorf("filter twitter:card not summary:\n%s", got)
	}
}

func TestServeIndexHTML(t *testing.T) {
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	if err := os.WriteFile(indexPath, []byte(testBaseHTML), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	srv := &Server{DB: nil}
	req := httptest.NewRequest(http.MethodGet, "/?tab=bargains", nil)
	rec := httptest.NewRecorder()
	srv.ServeIndexHTML(rec, req, indexPath)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store, no-cache, must-revalidate, max-age=0" {
		t.Errorf("Cache-Control = %q", cc)
	}
	if !strings.Contains(rec.Body.String(), "Gangas del mercado | Happy Customer") {
		t.Errorf("rendered meta tags missing:\n%s", rec.Body.String())
	}

	// Missing file -> 404.
	rec = httptest.NewRecorder()
	srv.ServeIndexHTML(rec, req, filepath.Join(dir, "missing.html"))
	if rec.Code != http.StatusNotFound {
		t.Errorf("missing file status = %d, want 404", rec.Code)
	}
}

func TestRenderIndexHTMLCompareAndValuate(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	baseTime := time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC)
	u1 := "https://crautos.com/clasificados/usados/a?c=111111"
	u2 := "https://crautos.com/clasificados/usados/b?c=222222"
	cars := []db.Car{
		{URL: u1, Title: "Toyota RAV4 2021", Brand: "Toyota", Model: "RAV4", Year: 2021, Price: 28000, Kilometraje: 45000, Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-0001", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: u2, Title: "Honda CR-V 2020", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 25000, Kilometraje: 60000, Placa: "Termina en 2", ColorExterior: "GRIS", SellerPhone: "8888-0002", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}

	srv := &Server{DB: database}
	reqCompare := httptest.NewRequest(http.MethodGet, "/?compare="+url.QueryEscape(u1+","+u2), nil)
	gotCompare := srv.RenderIndexHTML(reqCompare, testBaseHTML)
	if !strings.Contains(gotCompare, "Comparativa: Toyota RAV4 2021 vs Honda CR-V 2020 | Happy Customer") {
		t.Errorf("compare title missing:\n%s", gotCompare)
	}
	if !strings.Contains(gotCompare, `content="https://crautos.com/clasificados/usados/111111-1.jpg"`) {
		t.Errorf("compare og:image missing first active car photo:\n%s", gotCompare)
	}
	if !strings.Contains(gotCompare, `twitter:card" content="summary_large_image"`) {
		t.Errorf("compare twitter:card not summary_large_image:\n%s", gotCompare)
	}

	reqValuate := httptest.NewRequest(http.MethodGet, "/?tab=valuate&brand=Toyota&model=Hilux&year=2020", nil)
	gotValuate := srv.RenderIndexHTML(reqValuate, testBaseHTML)
	if !strings.Contains(gotValuate, "¿Cuánto vale un Toyota Hilux 2020 en Costa Rica? | Happy Customer") {
		t.Errorf("valuate title missing:\n%s", gotValuate)
	}

	payload := `<script>alert(1)</script>`
	gotXSS := srv.RenderIndexHTML(httptest.NewRequest(http.MethodGet, "/?tab=valuate&brand="+url.QueryEscape(payload)+"&model=X", nil), testBaseHTML)
	if strings.Contains(gotXSS, "<script>") {
		t.Errorf("valuate XSS not escaped:\n%s", gotXSS)
	}
}
