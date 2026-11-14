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

func runSellerSummaryRequest(t *testing.T, s *Server, method, target string) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	s.HandleSellerSummary(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func TestHandleSellerSummaryValidation(t *testing.T) {
	srv := &Server{}

	if code, _ := runSellerSummaryRequest(t, srv, http.MethodPost, "/api/sellers/summary?name=Autos"); code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 405", code)
	}
	if code, _ := runSellerSummaryRequest(t, srv, http.MethodGet, "/api/sellers/summary"); code != http.StatusBadRequest {
		t.Fatalf("missing name status = %d, want 400", code)
	}
	if code, _ := runSellerSummaryRequest(t, srv, http.MethodGet, "/api/sellers/summary?name=A"); code != http.StatusBadRequest {
		t.Fatalf("1-char name status = %d, want 400", code)
	}
}

func TestHandleSellerSummaryMetrics(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "sellers.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	now := time.Now().UTC().Truncate(time.Second)

	// Market comparables so marketDealPct has >= 4 samples for Toyota RAV4 2020 and Hyundai Tucson 2021.
	for i := 0; i < 4; i++ {
		if err := database.UpsertCar(db.Car{
			URL:         fmt.Sprintf("https://crautos.com/market-rav4-%d", i),
			Title:       "Toyota RAV4 2020",
			Brand:       "Toyota",
			Model:       "RAV4",
			Year:        2020,
			Price:       20000,
			Kilometraje: 60000,
			SellerName:  fmt.Sprintf("Other Seller %d", i),
			ScrapedAt:   now.Add(-48 * time.Hour),
			LastSeenAt:  now,
		}); err != nil {
			t.Fatalf("seed rav4 market %d: %v", i, err)
		}
		if err := database.UpsertCar(db.Car{
			URL:         fmt.Sprintf("https://crautos.com/market-tucson-%d", i),
			Title:       "Hyundai Tucson 2021",
			Brand:       "Hyundai",
			Model:       "Tucson",
			Year:        2021,
			Price:       20000,
			Kilometraje: 50000,
			SellerName:  fmt.Sprintf("Other Tucson %d", i),
			ScrapedAt:   now.Add(-48 * time.Hour),
			LastSeenAt:  now,
		}); err != nil {
			t.Fatalf("seed tucson market %d: %v", i, err)
		}
	}

	// Seller "Autos del Valle":
	// - Active #1: Toyota RAV4 2020 at $18,000 (-10% vs market $20,000), negotiable, trade-in Sí
	// - Active #2: Hyundai Tucson 2021 at $21,000 (+5% vs market $20,000) -> avg delta = -2.5%
	// - Active #3: Typo price Toyota Yaris 2020 at $2,000 (excluded from market delta via flagTypo when median=20000? wait give Yaris no market group so price counts cleanly, and add a RAV4 typo at $2,000 to verify flag exclusion!)
	//   Wait: putting RAV4 typo at $2,000 as a separate active car excluded from delta: let's add 1 more active RAV4 at $2,000!
	// - Sold #1: Sold after 10 days
	// - Sold #2: Sold after 30 days -> median exit days = 20
	sellerCars := []db.Car{
		{
			URL:              "https://crautos.com/valle-1",
			Title:            "Toyota RAV4 2020",
			Brand:            "Toyota",
			Model:            "RAV4",
			Year:             2020,
			Price:            18000,
			Kilometraje:      60000,
			Provincia:        "San José",
			SeRecibe:         "Sí",
			PrecioNegociable: "Sí",
			SellerName:       "Autos del Valle",
			SellerPhone:      "2222-1111",
			ScrapedAt:        now.Add(-5 * 24 * time.Hour),
			LastSeenAt:       now,
		},
		{
			URL:              "https://crautos.com/valle-2",
			Title:            "Hyundai Tucson 2021",
			Brand:            "Hyundai",
			Model:            "Tucson",
			Year:             2021,
			Price:            21000,
			Kilometraje:      50000,
			Provincia:        "San José",
			SeRecibe:         "No",
			PrecioNegociable: "No",
			SellerName:       "Autos del Valle",
			SellerPhone:      "2222-1111",
			ScrapedAt:        now.Add(-7 * 24 * time.Hour),
			LastSeenAt:       now,
		},
		{
			URL:              "https://crautos.com/valle-3-typo",
			Title:            "Toyota RAV4 2020",
			Brand:            "Toyota",
			Model:            "RAV4",
			Year:             2020,
			Price:            2000, // typo -> flagged, must be excluded from market delta average
			Kilometraje:      60000,
			Provincia:        "Heredia",
			SeRecibe:         "Sí",
			PrecioNegociable: "No",
			SellerName:       "Autos del Valle",
			SellerPhone:      "8888-9999",
			ScrapedAt:        now.Add(-2 * 24 * time.Hour),
			LastSeenAt:       now,
		},
		{
			URL:         "https://crautos.com/valle-sold-1",
			Title:       "Toyota Corolla 2019",
			Brand:       "Toyota",
			Model:       "Corolla",
			Year:        2019,
			Price:       15000,
			Kilometraje: 70000,
			Provincia:   "San José",
			SellerName:  "Autos del Valle",
			ScrapedAt:   now.Add(-40 * 24 * time.Hour),
			LastSeenAt:  now.Add(-30 * 24 * time.Hour),
		},
		{
			URL:         "https://crautos.com/valle-sold-2",
			Title:       "Honda Civic 2018",
			Brand:       "Honda",
			Model:       "Civic",
			Year:        2018,
			Price:       14000,
			Kilometraje: 80000,
			Provincia:   "San José",
			SellerName:  "Autos del Valle",
			ScrapedAt:   now.Add(-60 * 24 * time.Hour),
			LastSeenAt:  now.Add(-30 * 24 * time.Hour),
		},
	}
	if err := database.UpsertCarBatch(sellerCars); err != nil {
		t.Fatalf("seed seller cars: %v", err)
	}
	for _, spec := range []struct {
		url    string
		soldAt time.Time
	}{
		{url: "https://crautos.com/valle-sold-1", soldAt: now.Add(-30 * 24 * time.Hour)},
		{url: "https://crautos.com/valle-sold-2", soldAt: now.Add(-30 * 24 * time.Hour)},
	} {
		if _, err := database.Exec(
			"UPDATE cars SET is_sold = 1, sold_at = ? WHERE url = ?",
			spec.soldAt.Format("2006-01-02 15:04:05"), spec.url,
		); err != nil {
			t.Fatalf("mark sold %s: %v", spec.url, err)
		}
	}

	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	srv := &Server{DB: database}
	code, body := runSellerSummaryRequest(t, srv, http.MethodGet, "/api/sellers/summary?name=autos+del+valle")
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", code, string(body))
	}

	var resp SellerSummaryResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal response: %v (body=%s)", err, string(body))
	}

	if resp.DisplayName != "Autos del Valle" {
		t.Errorf("DisplayName = %q, want Autos del Valle", resp.DisplayName)
	}
	if resp.SellerType != "dealer" {
		t.Errorf("SellerType = %q, want dealer", resp.SellerType)
	}
	if resp.ActiveCount != 3 || resp.SoldCount != 2 || resp.TotalCount != 5 {
		t.Errorf("counts = active:%d sold:%d total:%d, want 3/2/5", resp.ActiveCount, resp.SoldCount, resp.TotalCount)
	}
	if resp.SoldRatePct == nil || *resp.SoldRatePct != 40.0 {
		t.Errorf("SoldRatePct = %v, want 40.0", resp.SoldRatePct)
	}
	if resp.MarketSampleCount != 2 || resp.AvgMarketDeltaPct == nil || *resp.AvgMarketDeltaPct != -2.5 {
		t.Errorf("market delta = count:%d pct:%v, want count:2 pct:-2.5", resp.MarketSampleCount, resp.AvgMarketDeltaPct)
	}
	if resp.DaysMetric != "sold" || resp.MedianExitDays == nil || *resp.MedianExitDays != 20 {
		t.Errorf("days = metric:%q median:%v, want sold/20", resp.DaysMetric, resp.MedianExitDays)
	}
	if resp.TradeInCount != 2 || resp.NegotiableCount != 1 {
		t.Errorf("flags = tradeIn:%d neg:%d, want 2/1", resp.TradeInCount, resp.NegotiableCount)
	}
	if resp.PrimaryProvince != "San José" {
		t.Errorf("PrimaryProvince = %q, want San José", resp.PrimaryProvince)
	}
	if len(resp.TopBrands) == 0 || resp.TopBrands[0].Brand != "Toyota" || resp.TopBrands[0].TotalCount != 3 {
		t.Errorf("TopBrands = %+v, want Toyota leading with TotalCount=3", resp.TopBrands)
	}
}
