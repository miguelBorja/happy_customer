package api

import (
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

var jsonLDScriptRe = regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`)

func seedSEOTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Init(filepath.Join(t.TempDir(), "seo_test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close()
		resetMarketStatsCache()
	})
	resetMarketStatsCache()

	t1 := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 11, 14, 15, 0, 0, 0, time.UTC)

	cars := []db.Car{
		{URL: "https://crautos.com/seo?c=1001", Title: "Toyota RAV4 2022", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 28000, Kilometraje: 45000, Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-0001", ScrapedAt: t2, LastSeenAt: t2},
		{URL: "https://crautos.com/seo?c=1002", Title: "Toyota RAV4 2022", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 32000, Kilometraje: 30000, Placa: "Termina en 2", ColorExterior: "GRIS", SellerPhone: "8888-0002", ScrapedAt: t2, LastSeenAt: t2},
		{URL: "https://crautos.com/seo?c=1003", Title: "Toyota RAV4 2021", Brand: "Toyota", Model: "RAV4", Year: 2021, Price: 26000, Kilometraje: 55000, Placa: "Termina en 3", ColorExterior: "NEGRO", SellerPhone: "8888-0003", ScrapedAt: t1, LastSeenAt: t1},
		{URL: "https://crautos.com/seo?c=1004", Title: "Toyota RAV4 2022", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 3000, Kilometraje: 40000, Placa: "Termina en 4", ColorExterior: "AZUL", SellerPhone: "8888-0004", ScrapedAt: t1, LastSeenAt: t1}, // typo excluded
		{URL: "https://crautos.com/seo?c=1005", Title: "Land Rover Range Rover 2020", Brand: "Land Rover", Model: "Range Rover", Year: 2020, Price: 55000, Kilometraje: 50000, Placa: "Termina en 5", ColorExterior: "NEGRO", SellerPhone: "8888-0005", ScrapedAt: t1, LastSeenAt: t1},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	return database
}

func extractJSONLDMap(t *testing.T, htmlDoc string) map[string]any {
	t.Helper()
	m := jsonLDScriptRe.FindStringSubmatch(htmlDoc)
	if len(m) < 2 {
		t.Fatalf("missing <script type=\"application/ld+json\"> in:\n%s", htmlDoc)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(m[1]), &out); err != nil {
		t.Fatalf("invalid JSON-LD: %v\npayload: %s", err, m[1])
	}
	return out
}

func TestHandleRobotsTxt(t *testing.T) {
	srv := &Server{}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/robots.txt", nil)
	req.Host = "crautos.example.com"
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	srv.HandleRobotsTxt(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Allow: /") {
		t.Errorf("robots.txt missing Allow: /\n%s", body)
	}
	if strings.Contains(body, "Disallow: /api") {
		t.Errorf("robots.txt must not disallow /api/\n%s", body)
	}
	if !strings.Contains(body, "Sitemap: https://crautos.example.com/sitemap.xml") {
		t.Errorf("robots.txt missing https sitemap URL:\n%s", body)
	}

	// PUBLIC_BASE_URL overrides Host header.
	t.Setenv("PUBLIC_BASE_URL", "https://autoscr.com/")
	rec2 := httptest.NewRecorder()
	srv.HandleRobotsTxt(rec2, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	if !strings.Contains(rec2.Body.String(), "Sitemap: https://autoscr.com/sitemap.xml") {
		t.Errorf("PUBLIC_BASE_URL override failed:\n%s", rec2.Body.String())
	}

	// POST rejected with 405.
	recMethod := httptest.NewRecorder()
	srv.HandleRobotsTxt(recMethod, httptest.NewRequest(http.MethodPost, "/robots.txt", nil))
	if recMethod.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST status = %d, want 405", recMethod.Code)
	}
}

func TestHandleSitemap(t *testing.T) {
	database := seedSEOTestDB(t)
	srv := &Server{DB: database}

	// POST rejected with 405.
	recPost := httptest.NewRecorder()
	srv.HandleSitemap(recPost, httptest.NewRequest(http.MethodPost, "/sitemap.xml", nil))
	if recPost.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST status = %d, want 405", recPost.Code)
	}

	// Nil DB safety.
	var nilSrv *Server
	recNil := httptest.NewRecorder()
	reqNil := httptest.NewRequest(http.MethodGet, "https://happy.run.app/sitemap.xml", nil)
	reqNil.Host = "happy.run.app"
	nilSrv.HandleSitemap(recNil, reqNil)
	if recNil.Code != http.StatusOK {
		t.Fatalf("nil server status = %d, want 200", recNil.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	req.Host = "happy-customer.run.app"
	rec := httptest.NewRecorder()
	srv.HandleSitemap(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/xml") {
		t.Errorf("Content-Type = %q", ct)
	}

	var parsed sitemapURLSet
	if err := xml.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("invalid XML sitemap: %v\n%s", err, rec.Body.String())
	}

	locs := make(map[string]sitemapURL, len(parsed.URLs))
	for _, u := range parsed.URLs {
		locs[u.Loc] = u
	}

	expectedLocs := []string{
		"https://happy-customer.run.app/",
		"https://happy-customer.run.app/?tab=bargains",
		"https://happy-customer.run.app/?tab=valuate",
		"https://happy-customer.run.app/?tab=stats",
		"https://happy-customer.run.app/?brands=Toyota",
		"https://happy-customer.run.app/?brands=Land+Rover",
		"https://happy-customer.run.app/?brands=Toyota&models=RAV4",
		"https://happy-customer.run.app/?tab=valuate&brand=Toyota&model=RAV4",
	}
	for _, want := range expectedLocs {
		if _, ok := locs[want]; !ok {
			t.Errorf("sitemap missing URL %q; got %d URLs", want, len(parsed.URLs))
		}
	}

	rav4Entry := locs["https://happy-customer.run.app/?brands=Toyota&models=RAV4"]
	if rav4Entry.LastMod != "2026-11-14" {
		t.Errorf("RAV4 lastmod = %q, want 2026-11-14", rav4Entry.LastMod)
	}
	// Land Rover Range Rover only has 1 sample, so valuate (< 3) must not be emitted.
	if _, ok := locs["https://happy-customer.run.app/?tab=valuate&brand=Land+Rover&model=Range+Rover"]; ok {
		t.Errorf("Range Rover (<3 samples) should not be emitted in valuate sitemap")
	}
}

func TestRenderIndexHTMLSEOLandings(t *testing.T) {
	database := seedSEOTestDB(t)
	srv := &Server{DB: database}

	// 1. Model browse landing: /?brands=Toyota&models=RAV4
	reqModel := httptest.NewRequest(http.MethodGet, "/?brands=Toyota&models=RAV4", nil)
	reqModel.Host = "happy.example.com"
	reqModel.Header.Set("X-Forwarded-Proto", "https")
	gotModel := srv.RenderIndexHTML(reqModel, testBaseHTML)

	if !strings.Contains(gotModel, "Toyota RAV4 usados en Costa Rica: precios y ofertas | Happy Customer") {
		t.Errorf("model landing title missing:\n%s", gotModel)
	}
	if !strings.Contains(gotModel, "desde $26,000 hasta $32,000") || !strings.Contains(gotModel, "mediana de mercado $28,000") {
		t.Errorf("model landing description missing real range:\n%s", gotModel)
	}
	if !strings.Contains(gotModel, `<link rel="canonical" href="https://happy.example.com/?brands=Toyota&amp;models=RAV4" />`) {
		t.Errorf("model landing canonical missing:\n%s", gotModel)
	}
	ldModel := extractJSONLDMap(t, gotModel)
	if ldModel["@type"] != "Product" {
		t.Errorf("model JSON-LD @type = %v, want Product", ldModel["@type"])
	}
	offers, _ := ldModel["offers"].(map[string]any)
	if offers == nil || offers["@type"] != "AggregateOffer" || offers["priceCurrency"] != "USD" {
		t.Fatalf("model AggregateOffer invalid: %#v", ldModel["offers"])
	}
	if offers["lowPrice"] != float64(26000) || offers["highPrice"] != float64(32000) || offers["offerCount"] != float64(3) {
		t.Errorf("model AggregateOffer bounds unexpected: %#v", offers)
	}

	// 2. Brand browse landing: /?brands=Toyota
	reqBrand := httptest.NewRequest(http.MethodGet, "/?brands=Toyota", nil)
	reqBrand.Host = "happy.example.com"
	reqBrand.Header.Set("X-Forwarded-Proto", "https")
	gotBrand := srv.RenderIndexHTML(reqBrand, testBaseHTML)
	if !strings.Contains(gotBrand, "Autos Toyota usados en Costa Rica: precios y catálogo | Happy Customer") {
		t.Errorf("brand landing title missing:\n%s", gotBrand)
	}
	if !strings.Contains(gotBrand, "desde $26,000 hasta $32,000") {
		t.Errorf("brand landing range missing:\n%s", gotBrand)
	}
	ldBrand := extractJSONLDMap(t, gotBrand)
	if offersB, ok := ldBrand["offers"].(map[string]any); !ok || offersB["@type"] != "AggregateOffer" || offersB["offerCount"] != float64(3) {
		t.Errorf("brand AggregateOffer invalid: %#v", ldBrand["offers"])
	}

	// 3. Valuate model landing without year: /?tab=valuate&brand=Toyota&model=RAV4
	reqValModel := httptest.NewRequest(http.MethodGet, "/?tab=valuate&brand=Toyota&model=RAV4", nil)
	reqValModel.Host = "happy.example.com"
	reqValModel.Header.Set("X-Forwarded-Proto", "https")
	gotValModel := srv.RenderIndexHTML(reqValModel, testBaseHTML)
	if !strings.Contains(gotValModel, "¿Cuánto vale un Toyota RAV4 en Costa Rica? | Happy Customer") {
		t.Errorf("valuate model title missing:\n%s", gotValModel)
	}
	if !strings.Contains(gotValModel, "$26,000–$32,000") {
		t.Errorf("valuate model range missing:\n%s", gotValModel)
	}
	ldVal := extractJSONLDMap(t, gotValModel)
	if offersV, ok := ldVal["offers"].(map[string]any); !ok || offersV["@type"] != "AggregateOffer" {
		t.Errorf("valuate model AggregateOffer invalid: %#v", ldVal["offers"])
	}

	// 4. Valuate model+year landing: /?tab=valuate&brand=Toyota&model=RAV4&year=2022
	reqValYear := httptest.NewRequest(http.MethodGet, "/?tab=valuate&brand=Toyota&model=RAV4&year=2022", nil)
	reqValYear.Host = "happy.example.com"
	reqValYear.Header.Set("X-Forwarded-Proto", "https")
	gotValYear := srv.RenderIndexHTML(reqValYear, testBaseHTML)
	if !strings.Contains(gotValYear, "¿Cuánto vale un Toyota RAV4 2022 en Costa Rica? | Happy Customer") {
		t.Errorf("valuate year title missing:\n%s", gotValYear)
	}
	if !strings.Contains(gotValYear, "$28,000–$32,000") {
		t.Errorf("valuate year range missing:\n%s", gotValYear)
	}
	ldValY := extractJSONLDMap(t, gotValYear)
	if ldValY["productionDate"] != "2022" {
		t.Errorf("valuate year productionDate = %v, want 2022", ldValY["productionDate"])
	}

	// 5. Individual car listing JSON-LD
	reqCar := httptest.NewRequest(http.MethodGet, "/?car="+url.QueryEscape("https://crautos.com/seo?c=1001"), nil)
	reqCar.Host = "happy.example.com"
	reqCar.Header.Set("X-Forwarded-Proto", "https")
	gotCar := srv.RenderIndexHTML(reqCar, testBaseHTML)
	ldCar := extractJSONLDMap(t, gotCar)
	if ldCar["@type"] != "Car" {
		t.Errorf("car JSON-LD @type = %v, want Car", ldCar["@type"])
	}

	// 6. XSS / Host header injection defense
	payload := `<script>alert(1)</script>`
	reqXSS := httptest.NewRequest(http.MethodGet, "/?brands="+url.QueryEscape(payload)+"&models="+url.QueryEscape(payload), nil)
	reqXSS.Host = "evil.com/<script>alert(1)</script>"
	gotXSS := srv.RenderIndexHTML(reqXSS, testBaseHTML)
	if strings.Contains(gotXSS, "<script>") {
		t.Errorf("untrusted brand/model/host produced unescaped <script>:\n%s", gotXSS)
	}
	if strings.Contains(gotXSS, "evil.com") {
		t.Errorf("invalid Host header leaked into canonical URL:\n%s", gotXSS)
	}
}
