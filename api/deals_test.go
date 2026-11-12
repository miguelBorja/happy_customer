package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"testing"
	"time"

	"crautosdb/db"
)

func TestRankDealURLs(t *testing.T) {
	stats := &db.MarketIndex{Groups: map[string]db.MarketStat{
		db.MarketKey("Toyota", "Hilux", 2018): {Median: 20000, Count: 6},
		db.MarketKey("Kia", "Rio", 2015):      {Median: 8000, Count: 2}, // too few comparables
	}} // KmSlope 0: no mileage adjustment
	// Incoming order = most recent first.
	keys := []db.CarPriceKey{
		{URL: "fair", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 19500},  // -2.5%
		{URL: "nodata", Brand: "Kia", Model: "Rio", Year: 2015, Price: 5000},      // ignored: count < 4
		{URL: "great", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 17000}, // -15%
		{URL: "high", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 23000},  // +15%
		{URL: "good", Brand: "toyota ", Model: "HILUX", Year: 2018, Price: 18800}, // -6%
	}

	if got, want := rankDealURLs(keys, stats, false, true), []string{"great", "good", "fair", "high", "nodata"}; !reflect.DeepEqual(got, want) {
		t.Errorf("bestFirst = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, true, false), []string{"great", "good"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood (recency) = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, true, true), []string{"great", "good"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood+bestFirst = %v, want %v", got, want)
	}
	if got := rankDealURLs(keys, nil, true, false); len(got) != 0 {
		t.Errorf("nil stats + onlyGood = %v, want none", got)
	}
}

// With the mileage adjustment, a cheap car with many km is compared against a lower reference
// (it stops being a "good" deal) and a low-km car against a higher one.
func TestRankDealURLsMileageAdjusted(t *testing.T) {
	stats := &db.MarketIndex{
		Groups: map[string]db.MarketStat{
			db.MarketKey("Toyota", "Hilux", 2018): {Median: 20000, Count: 8, MedianKm: 100000, KmCount: 8},
		},
		KmSlope: -0.02, // -2% per 10k km
	}
	keys := []db.CarPriceKey{
		// 180k km → +80k vs typical → expected ≈ 20000·e^(-0.16) ≈ 17043 → -6% vs plain, +10% adjusted.
		{URL: "highkm", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 18800, Km: 180000},
		// 40k km → expected ≈ 20000·e^(0.12) ≈ 22550 → -3% vs plain, -14% adjusted.
		{URL: "lowkm", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 19400, Km: 40000},
		// Unknown mileage → plain median: -6%.
		{URL: "nokm", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 18800},
	}
	if got, want := rankDealURLs(keys, stats, true, true), []string{"lowkm", "nokm"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood+bestFirst = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, false, true), []string{"lowkm", "nokm", "highkm"}; !reflect.DeepEqual(got, want) {
		t.Errorf("bestFirst = %v, want %v", got, want)
	}
}

// The badge thresholds live in two places (Go for deal=good / sortDeal, JS for the badges).
// This test reads the frontend file so they cannot drift apart.
func TestDealThresholdsMatchFrontend(t *testing.T) {
	src, err := os.ReadFile("../web/src/utils/marketDeal.js")
	if err != nil {
		t.Skipf("frontend not available: %v", err)
	}
	want := map[string]float64{
		"MIN_MARKET_COMPARABLES": minMarketComparables,
		"DEAL_GREAT_MAX_PCT":     greatDealMaxPct,
		"DEAL_GOOD_MAX_PCT":      goodDealMaxPct,
		"DEAL_HIGH_MIN_PCT":      highDealMinPct,
	}
	for name, goVal := range want {
		m := regexp.MustCompile(`export const ` + name + `\s*=\s*(-?[0-9.]+)`).FindSubmatch(src)
		if m == nil {
			t.Errorf("%s not found in marketDeal.js", name)
			continue
		}
		jsVal, err := strconv.ParseFloat(string(m[1]), 64)
		if err != nil || jsVal != goVal {
			t.Errorf("%s: marketDeal.js = %s, Go = %v", name, m[1], goVal)
		}
	}
}

// Gangas uses the "Gran precio" threshold over the same reference as the badges.
func TestRankDealsGreatOnly(t *testing.T) {
	stats := &db.MarketIndex{Groups: map[string]db.MarketStat{
		db.MarketKey("Toyota", "Hilux", 2018): {Median: 20000, Count: 6},
	}}
	keys := []db.CarPriceKey{
		{URL: "good", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 18800},  // -6%
		{URL: "edge", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 17600},  // -12% (inclusive)
		{URL: "great", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 15000}, // -25%
		{URL: "nodata", Brand: "Kia", Model: "Rio", Year: 2015, Price: 1000},
	}
	got := rankDeals(keys, stats, greatDealMaxPct, true)
	if len(got) != 2 || got[0].url != "great" || got[1].url != "edge" || got[0].pct != -25 {
		t.Errorf("great only = %+v", got)
	}
}

func TestDealFlag(t *testing.T) {
	cases := []struct {
		name            string
		price, expected int
		text            string
		want            string
	}{
		{"missing zero", 3940, 30290, "", flagTypo},           // ×10 = 1.3× reference
		{"extra zero", 250000, 20000, "", flagTypo},           // ÷10 = 1.25× reference
		{"too good to be true", 4348, 13845, "", flagOutlier}, // -69%, ×10 = 3.1× → not a typo
		{"too low + debt comment", 4348, 13845, flagDebt, flagDebt},
		{"great deal, damaged", 7000, 10000, flagCondition, flagCondition}, // -30%
		{"great deal, clean", 7000, 10000, "", ""},
		{"fair price, damaged: no flag", 9800, 10000, flagCondition, ""},
		{"very high but not ×10", 50000, 10000, "", ""},
	}
	for _, c := range cases {
		pct := float64(c.price-c.expected) / float64(c.expected) * 100
		if got := dealFlag(pct, c.price, c.expected, c.text); got != c.want {
			t.Errorf("%s: dealFlag(%.0f%%) = %q, want %q", c.name, pct, got, c.want)
		}
	}
}

// Flagged cars are excluded from deal=good / Gangas and go last in sortDeal=best.
func TestRankDealsSkipsFlagged(t *testing.T) {
	stats := &db.MarketIndex{
		Groups: map[string]db.MarketStat{
			db.MarketKey("Toyota", "Hilux", 2018): {Median: 20000, Count: 6},
		},
		TextFlags: map[string]string{"damaged": flagCondition},
	}
	keys := []db.CarPriceKey{
		{URL: "typo", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 2100},     // -89.5%, ×10 fits
		{URL: "damaged", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 14000}, // -30% + comment
		{URL: "great", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 16000},   // -20%
		{URL: "fair", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 20000},
	}
	if got, want := rankDealURLs(keys, stats, true, true), []string{"great"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, false, true), []string{"great", "fair", "typo", "damaged"}; !reflect.DeepEqual(got, want) {
		t.Errorf("bestFirst = %v, want %v", got, want)
	}
}

func TestPageOfURLs(t *testing.T) {
	urls := []string{"a", "b", "c", "d", "e"}
	if got := pageOfURLs(urls, 0, 2); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("first page = %v", got)
	}
	if got := pageOfURLs(urls, 4, 2); !reflect.DeepEqual(got, []string{"e"}) {
		t.Errorf("last page = %v", got)
	}
	if got := pageOfURLs(urls, 9, 2); got != nil {
		t.Errorf("past end = %v", got)
	}
}

// Duplicate physical cars are dropped: only one bargain survives and the /api/cars total
// count excludes the duplicate repost.
func TestHandleCarsAndBargainsExcludeDuplicates(t *testing.T) {
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

	cars := []db.Car{
		{URL: "https://crautos.com/c=1", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 14000, Kilometraje: 50000, Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-1001", Title: "ZNA Glory", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=2", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 14500, Kilometraje: 52000, Placa: "Termina en 2", ColorExterior: "GRIS", SellerPhone: "8888-1002", Title: "ZNA Glory", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=3", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 15000, Kilometraje: 54000, Placa: "Termina en 3", ColorExterior: "NEGRO", SellerPhone: "8888-1003", Title: "ZNA Glory", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=4", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 15500, Kilometraje: 56000, Placa: "Termina en 4", ColorExterior: "AZUL", SellerPhone: "8888-1004", Title: "ZNA Glory", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=dup-new", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 10000, Kilometraje: 60000, Placa: "Termina en 8", ColorExterior: "AZUL", SellerPhone: "2299-0852", Title: "ZNA Glory", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=dup-old", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 10000, Kilometraje: 60000, Placa: "Termina en 8", ColorExterior: "AZUL", SellerPhone: "2299-0852", Title: "ZNA Glory", ScrapedAt: baseTime.Add(-time.Hour), LastSeenAt: baseTime.Add(-time.Hour)},
		{URL: "https://crautos.com/c=damaged", Brand: "ZNA", Model: "Glory", Year: 2021, Price: 8000, Kilometraje: 70000, Placa: "Termina en 9", ColorExterior: "ROJO", SellerPhone: "8888-0000", Title: "ZNA Glory", Comment: "Detalles de pintura, la caja patina", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}

	srv := &Server{DB: database}

	// Bargains: only the deduplicated great deal remains.
	req := httptest.NewRequest(http.MethodGet, "/api/bargains", nil)
	rec := httptest.NewRecorder()
	srv.HandleBargains(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandleBargains status = %d, want 200", rec.Code)
	}
	var got []Bargain
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal bargains: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len(bargains) = %d, want 1: %+v", len(got), got)
	}
	if got[0].Car.URL != "https://crautos.com/c=dup-new" {
		t.Errorf("bargain URL = %q, want dup-new", got[0].Car.URL)
	}

	// Cars listing: 7 active - 1 duplicate repost = 6 in the total count.
	req = httptest.NewRequest(http.MethodGet, "/api/cars?isSold=false&limit=2", nil)
	rec = httptest.NewRecorder()
	srv.HandleCars(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandleCars status = %d, want 200", rec.Code)
	}
	if h := rec.Header().Get("X-Total-Count"); h != "6" {
		t.Errorf("X-Total-Count = %q, want 6", h)
	}
}
