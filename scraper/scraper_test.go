package scraper

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"crautosdb/db"
)

func TestParseTitleBrandModelYear(t *testing.T) {
	tests := []struct {
		input         string
		expectedTitle string
		expectedBrand string
		expectedModel string
		expectedYear  int
	}{
		{
			input:         "Toyota RAV4 2022",
			expectedTitle: "Toyota RAV4",
			expectedBrand: "Toyota",
			expectedModel: "RAV4",
			expectedYear:  2022,
		},
		{
			input:         "Hyundai Tucson Limited 2020",
			expectedTitle: "Hyundai Tucson Limited",
			expectedBrand: "Hyundai",
			expectedModel: "Tucson",
			expectedYear:  2020,
		},
		{
			input:         "BYD Tang EV 2024",
			expectedTitle: "BYD Tang EV",
			expectedBrand: "BYD",
			expectedModel: "Tang",
			expectedYear:  2024,
		},
	}

	for _, tt := range tests {
		title, brand, model, year := parseTitleBrandModelYear(tt.input)
		if title != tt.expectedTitle {
			t.Errorf("parseTitleBrandModelYear(%q) title = %q, want %q", tt.input, title, tt.expectedTitle)
		}
		if brand != tt.expectedBrand {
			t.Errorf("parseTitleBrandModelYear(%q) brand = %q, want %q", tt.input, brand, tt.expectedBrand)
		}
		if model != tt.expectedModel {
			t.Errorf("parseTitleBrandModelYear(%q) model = %q, want %q", tt.input, model, tt.expectedModel)
		}
		if year != tt.expectedYear {
			t.Errorf("parseTitleBrandModelYear(%q) year = %d, want %d", tt.input, year, tt.expectedYear)
		}
	}
}

func TestParsePrice(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"$15,000", 15000},
		{"$ 24,500", 24500},
		{"¢ 5,100,000", 10000}, // 5100000 / 510 = 10000
		{"$0", 0},
	}

	for _, tt := range tests {
		got := parsePrice(tt.input)
		if got != tt.expected {
			t.Errorf("parsePrice(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func TestParseKilometraje(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"45,000 kms", 45000},
		{"10,000 millas", 16093},
		{"0 kms", 0},
		{"-", 0},
	}

	for _, tt := range tests {
		got := parseKilometraje(tt.input)
		if got != tt.expected {
			t.Errorf("parseKilometraje(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func readTestFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", name, err)
	}
	return string(b)
}

func TestScrapeCarHTTP_OfflineFixtures(t *testing.T) {
	usedHTML := readTestFixture(t, "used_car_detail.html")
	fallbackHTML := readTestFixture(t, "used_car_fallback.html")
	newHTML := readTestFixture(t, "new_car_detail.html")

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/autosusados/cardetail.cfm":
			if r.URL.Query().Get("c") == "fallback" {
				_, _ = w.Write([]byte(fallbackHTML))
				return
			}
			_, _ = w.Write([]byte(usedHTML))
		case "/autosnuevos/cardetail.cfm":
			_, _ = w.Write([]byte(newHTML))
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	s := &Scraper{BaseURL: ts.URL, HTTPClient: ts.Client()}
	ctx := context.Background()

	t.Run("used_car_detail", func(t *testing.T) {
		car, err := s.scrapeCarHTTP(ctx, ts.Client(), ts.URL+"/autosusados/cardetail.cfm?c=1001")
		if err != nil {
			t.Fatalf("scrapeCarHTTP failed: %v", err)
		}
		if car.Title != "Toyota RAV4 Limited" || car.Brand != "Toyota" || car.Model != "RAV4" || car.Year != 2022 {
			t.Fatalf("unexpected identity fields: title=%q brand=%q model=%q year=%d", car.Title, car.Brand, car.Model, car.Year)
		}
		if car.Price != 31500 || car.Kilometraje != 38500 || car.Cilindrada != "2,500 cc" {
			t.Fatalf("unexpected numeric/spec fields: price=%d km=%d engine=%q", car.Price, car.Kilometraje, car.Cilindrada)
		}
		if car.Estilo != "SUV 4x4" || car.Combustible != "Gasolina" || car.Transmision != "Automática" || car.Provincia != "San José" || car.Placa != "Termina en 8" {
			t.Fatalf("unexpected table fields: %+v", car)
		}
		if !car.Equipments["Apple CarPlay"] || !car.Equipments["Cámara de retroceso"] || !car.Equipments["Sunroof/techo panorámico"] || car.Equipments["Turbo"] {
			t.Fatalf("unexpected equipments map: %+v", car.Equipments)
		}
		if car.SellerName != "Autos del Valle" || car.SellerPhone != "8888-1234" || car.SellerAddress != "Escazú, San José" {
			t.Fatalf("unexpected seller: name=%q phone=%q addr=%q", car.SellerName, car.SellerPhone, car.SellerAddress)
		}
		wantComment := "Único dueño, récords de agencia & marchamo al día."
		if car.Comment != wantComment {
			t.Fatalf("comment = %q, want %q", car.Comment, wantComment)
		}
	})

	t.Run("used_car_fallback", func(t *testing.T) {
		car, err := s.scrapeCarHTTP(ctx, ts.Client(), ts.URL+"/autosusados/cardetail.cfm?c=fallback")
		if err != nil {
			t.Fatalf("scrapeCarHTTP fallback failed: %v", err)
		}
		if car.Brand != "Hyundai" || car.Model != "Tucson" || car.Year != 2020 {
			t.Fatalf("unexpected identity: brand=%q model=%q year=%d", car.Brand, car.Model, car.Year)
		}
		if car.Price != 25000 || car.Kilometraje != 16093 {
			t.Fatalf("unexpected conversion: price=%d km=%d", car.Price, car.Kilometraje)
		}
		if car.Combustible != "Diésel" || car.Transmision != "Manual" || car.Provincia != "Alajuela" {
			t.Fatalf("unexpected table fallback values: fuel=%q trans=%q prov=%q", car.Combustible, car.Transmision, car.Provincia)
		}
		if car.Comment != "Impecable estado general" {
			t.Fatalf("comment = %q, want %q", car.Comment, "Impecable estado general")
		}
	})

	t.Run("new_car_detail", func(t *testing.T) {
		car, err := s.scrapeCarHTTP(ctx, ts.Client(), ts.URL+"/autosnuevos/cardetail.cfm?c=2001")
		if err != nil {
			t.Fatalf("scrapeCarHTTP new car failed: %v", err)
		}
		if car.Estado != "Nuevo" || car.Kilometraje != 0 || car.Brand != "Toyota" || car.Year != 2025 || car.Price != 36900 {
			t.Fatalf("unexpected new car values: estado=%q km=%d brand=%q year=%d price=%d", car.Estado, car.Kilometraje, car.Brand, car.Year, car.Price)
		}
		if car.SellerName != "Purdy Motor" || car.SellerPhone != "2519-7000" || car.Provincia != "Heredia" {
			t.Fatalf("unexpected dealer/province: seller=%q phone=%q prov=%q", car.SellerName, car.SellerPhone, car.Provincia)
		}
	})
}

func TestBackfillSellersAndComments_Offline(t *testing.T) {
	database, err := db.Init(":memory:")
	if err != nil {
		t.Fatalf("db.Init failed: %v", err)
	}
	defer database.Close()

	usedHTML := readTestFixture(t, "used_car_detail.html")
	fallbackHTML := readTestFixture(t, "used_car_fallback.html")

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			_, _ = w.Write([]byte(usedHTML))
		case "/fallback":
			_, _ = w.Write([]byte(fallbackHTML))
		case "/err500":
			http.Error(w, "upstream error", http.StatusInternalServerError)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	now := time.Now()
	seedCars := []db.Car{
		{URL: ts.URL + "/ok", Title: "Toyota RAV4", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 31500, ScrapedAt: now, LastSeenAt: now},
		{URL: ts.URL + "/fallback", Title: "Hyundai Tucson", Brand: "Hyundai", Model: "Tucson", Year: 2020, Price: 25000, SellerName: "Existing", ScrapedAt: now, LastSeenAt: now},
		{URL: ts.URL + "/err500", Title: "Suzuki Vitara", Brand: "Suzuki", Model: "Vitara", Year: 2019, Price: 19000, ScrapedAt: now, LastSeenAt: now},
	}
	for _, c := range seedCars {
		if err := database.UpsertCar(c); err != nil {
			t.Fatalf("UpsertCar failed: %v", err)
		}
	}

	s := &Scraper{DB: database, BaseURL: ts.URL, HTTPClient: ts.Client()}
	ctx := context.Background()
	s.BackfillSellers(ctx)
	s.BackfillComments(ctx)

	cars, err := database.GetCarsByURLs([]string{ts.URL + "/ok", ts.URL + "/fallback", ts.URL + "/err500"})
	if err != nil {
		t.Fatalf("GetCarsByURLs failed: %v", err)
	}
	byURL := make(map[string]db.Car, len(cars))
	for _, c := range cars {
		byURL[c.URL] = c
	}

	if got := byURL[ts.URL+"/ok"]; got.SellerName != "Autos del Valle" || got.SellerPhone != "8888-1234" || got.Comment != "Único dueño, récords de agencia & marchamo al día." {
		t.Fatalf("unexpected /ok backfill result: seller=%q phone=%q comment=%q", got.SellerName, got.SellerPhone, got.Comment)
	}
	if got := byURL[ts.URL+"/fallback"]; got.Comment != "Impecable estado general" || got.SellerName != "Existing" {
		t.Fatalf("unexpected /fallback backfill result: seller=%q comment=%q", got.SellerName, got.Comment)
	}
	if got := byURL[ts.URL+"/err500"]; got.SellerName != "" || got.Comment != "" {
		t.Fatalf("expected /err500 to remain untouched, got seller=%q comment=%q", got.SellerName, got.Comment)
	}
}

func TestProcessBrand_EndToEndAndCancelSafety(t *testing.T) {
	searchHTML := readTestFixture(t, "search_results_page1.html")
	usedHTML := readTestFixture(t, "used_car_detail.html")
	car1002HTML := strings.ReplaceAll(usedHTML, "Toyota RAV4 Limited 2022", "Toyota Yaris 2021")

	t.Run("normal_run_saves_new_and_marks_missing_sold", func(t *testing.T) {
		database, err := db.Init(":memory:")
		if err != nil {
			t.Fatalf("db.Init failed: %v", err)
		}
		defer database.Close()

		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/autosusados/searchresults.cfm":
				_, _ = w.Write([]byte(searchHTML))
			case "/autosusados/cardetail.cfm":
				if r.URL.Query().Get("c") == "1002" {
					_, _ = w.Write([]byte(car1002HTML))
					return
				}
				_, _ = w.Write([]byte(usedHTML))
			default:
				http.NotFound(w, r)
			}
		}))
		defer ts.Close()

		now := time.Now()
		existingURL := ts.URL + "/autosusados/cardetail.cfm?c=1001"
		missingURL := ts.URL + "/autosusados/cardetail.cfm?c=9999"
		newURL := ts.URL + "/autosusados/cardetail.cfm?c=1002"

		for _, c := range []db.Car{
			{URL: existingURL, Title: "Toyota RAV4 Limited", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 31500, ScrapedAt: now, LastSeenAt: now},
			{URL: missingURL, Title: "Toyota Hilux", Brand: "Toyota", Model: "Hilux", Year: 2019, Price: 29000, ScrapedAt: now, LastSeenAt: now},
		} {
			if err := database.UpsertCar(c); err != nil {
				t.Fatalf("seed UpsertCar failed: %v", err)
			}
		}

		s := &Scraper{DB: database, BaseURL: ts.URL, HTTPClient: ts.Client()}
		s.ProcessBrand(context.Background(), "toyota", "35")

		cars, err := database.GetCarsByURLs([]string{existingURL, missingURL, newURL})
		if err != nil {
			t.Fatalf("GetCarsByURLs failed: %v", err)
		}
		byURL := make(map[string]db.Car, len(cars))
		for _, c := range cars {
			byURL[c.URL] = c
		}

		if got, ok := byURL[newURL]; !ok || got.Title != "Toyota Yaris" || got.IsSold {
			t.Fatalf("expected new car c=1002 saved and active, got ok=%v car=%+v", ok, got)
		}
		if got := byURL[existingURL]; got.IsSold {
			t.Fatalf("expected listed car c=1001 to remain active")
		}
		if got := byURL[missingURL]; !got.IsSold {
			t.Fatalf("expected unlisted car c=9999 to be marked sold")
		}
	})

	t.Run("canceled_context_skips_mark_sold", func(t *testing.T) {
		database, err := db.Init(":memory:")
		if err != nil {
			t.Fatalf("db.Init failed: %v", err)
		}
		defer database.Close()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		var cancelOnce sync.Once
		paginatedHTML := strings.Replace(
			searchHTML,
			"</body>",
			`<div class="page-item page-next"><a class="page-link" href="?p=2">&gt;</a></div></body>`,
			1,
		)

		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/autosusados/searchresults.cfm":
				if r.URL.Query().Get("p") == "2" {
					cancelOnce.Do(cancel)
					<-ctx.Done()
					return
				}
				_, _ = w.Write([]byte(paginatedHTML))
			case "/autosusados/cardetail.cfm":
				_, _ = w.Write([]byte(usedHTML))
			default:
				http.NotFound(w, r)
			}
		}))
		defer ts.Close()

		now := time.Now()
		unlistedURL := ts.URL + "/autosusados/cardetail.cfm?c=9999"
		if err := database.UpsertCar(db.Car{
			URL: unlistedURL, Title: "Toyota Hilux", Brand: "Toyota", Model: "Hilux", Year: 2019, Price: 29000, ScrapedAt: now, LastSeenAt: now,
		}); err != nil {
			t.Fatalf("seed UpsertCar failed: %v", err)
		}

		s := &Scraper{DB: database, BaseURL: ts.URL, HTTPClient: ts.Client()}
		s.ProcessBrand(ctx, "toyota", "35")

		cars, err := database.GetCarsByURLs([]string{unlistedURL})
		if err != nil || len(cars) != 1 {
			t.Fatalf("GetCarsByURLs failed: err=%v len=%d", err, len(cars))
		}
		if cars[0].IsSold {
			t.Fatalf("expected c=9999 NOT to be marked sold after canceled scrape")
		}
	})
}
