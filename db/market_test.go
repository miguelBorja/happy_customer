package db

import (
	"math"
	"reflect"
	"testing"
	"time"
)

func TestBuildMarketIndexFitsMileageSlope(t *testing.T) {
	// Synthetic catalog: price falls 2% per 10k km around each group's median mileage.
	groups := map[string][]marketSample{}
	for g, base := range map[string]float64{"a|x|2018": 20000, "b|y|2015": 9000, "c|z|2020": 30000} {
		for i := 0; i < 30; i++ {
			km := 40000 + i*5000 // 40k..185k, median 112.5k
			price := base * math.Exp(-0.02*float64(km-112500)/10000)
			groups[g] = append(groups[g], marketSample{price: int(math.Round(price)), km: km})
		}
	}
	groups["d|w|2010"] = []marketSample{{price: 5000, km: 0}, {price: 5200}, {price: 4800}, {price: 5100}}

	idx := buildMarketIndex(groups)
	if math.Abs(idx.KmSlope-(-0.02)) > 0.002 {
		t.Fatalf("KmSlope = %.4f, want ≈ -0.02", idx.KmSlope)
	}
	if s := idx.Groups["a|x|2018"]; s.Count != 30 || s.KmCount != 30 || s.MedianKm != 112500 {
		t.Errorf("group a = %+v", s)
	}

	ref, ok := idx.Lookup("A ", "X", 2018, 162500) // +50k km → ≈ -10%
	if !ok || ref.Expected >= ref.Median || math.Abs(float64(ref.Expected)/float64(ref.Median)-math.Exp(idx.KmSlope*5)) > 0.001 {
		t.Errorf("high-km lookup = %+v", ref)
	}
	if ref, _ := idx.Lookup("a", "x", 2018, 0); ref.Expected != ref.Median {
		t.Errorf("unknown km should not adjust: %+v", ref)
	}
	// Group without known mileage: no adjustment.
	if ref, ok := idx.Lookup("d", "w", 2010, 300000); !ok || ref.Expected != ref.Median || ref.MedianKm != 0 {
		t.Errorf("group without km = %+v", ref)
	}
	if _, ok := idx.Lookup("nope", "x", 2018, 1000); ok {
		t.Error("unknown group should not be found")
	}
}

func TestKmAdjustClamps(t *testing.T) {
	// The km delta is capped at 100k and the factor at ±25%.
	if got, want := kmAdjustFactor(-0.02, 900000, 100000), math.Exp(-0.02*kmMaxDelta); math.Abs(got-want) > 1e-9 {
		t.Errorf("delta clamp: got %.4f, want %.4f", got, want)
	}
	if got := kmAdjustFactor(-0.05, 0, 200000); got != 1+kmAdjustMaxDeviation {
		t.Errorf("factor clamp: got %.4f", got)
	}
}

func TestBuildMarketIndexNoSlopeWithFewSamples(t *testing.T) {
	groups := map[string][]marketSample{
		"a|x|2018": {
			{price: 20000, km: 50000},
			{price: 18000, km: 150000},
			{price: 19000, km: 100000},
			{price: 21000, km: 30000},
		},
	}
	idx := buildMarketIndex(groups)
	if idx.KmSlope != 0 || idx.KmSamples != 0 {
		t.Errorf("slope should not be fitted with %d samples: %+v", 4, idx)
	}
	if ref, _ := idx.Lookup("a", "x", 2018, 200000); ref.Expected != ref.Median {
		t.Errorf("no slope → no adjustment: %+v", ref)
	}
}

func TestBuildMarketIndexExcludesFlaggedAndTypos(t *testing.T) {
	groups := map[string][]marketSample{
		"toyota|rav4|2022": {
			{price: 20000},
			{price: 20400},
			{price: 20600},
			{price: 21000},
			{price: 2050},   // missing-zero typo
			{price: 205000}, // extra-zero typo
			{price: 12000, textFlag: TextFlagCondition}, // damaged, priced well below
			{price: 8000, textFlag: TextFlagDebt},       // debt, priced well below
		},
	}
	idx := buildMarketIndex(groups)
	stat := idx.Groups["toyota|rav4|2022"]
	if stat.Count != 4 {
		t.Errorf("Count = %d, want 4", stat.Count)
	}
	if stat.Median != 20500 {
		t.Errorf("Median = %d, want 20500", stat.Median)
	}

	// A flagged sample at a fair price (-1.5%) must not be excluded.
	groups["toyota|rav4|2022"] = append(groups["toyota|rav4|2022"], marketSample{price: 20200, textFlag: TextFlagCondition})
	idx = buildMarketIndex(groups)
	if got := idx.Groups["toyota|rav4|2022"].Count; got != 5 {
		t.Errorf("fair-priced flagged Count = %d, want 5", got)
	}
}

func TestGetAllMarketStatsDeduplicatesAndExcludeURLs(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	baseTime := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

	cars := []Car{
		{URL: "https://crautos.com/c=2", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 30000, Kilometraje: 50000, Placa: "Termina en 3", ColorExterior: "GRIS", SellerPhone: "8888-1111", Title: "Toyota RAV4", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=1", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 30000, Kilometraje: 50000, Placa: "Termina en 3", ColorExterior: "GRIS", SellerPhone: "8888-1111", Title: "Toyota RAV4", ScrapedAt: baseTime.Add(-time.Hour), LastSeenAt: baseTime.Add(-time.Hour)},
		{URL: "https://crautos.com/c=3", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 30000, Kilometraje: 50500, Placa: "Termina en 3", ColorExterior: "GRIS", SellerPhone: "8888-9999", Title: "Toyota RAV4", ScrapedAt: baseTime.Add(-2 * time.Hour), LastSeenAt: baseTime.Add(-2 * time.Hour)},
		{URL: "https://crautos.com/c=0", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 31000, Kilometraje: 49500, Placa: "Termina en 3", ColorExterior: "GRIS", SellerPhone: "8888-1111", Title: "Toyota RAV4", ScrapedAt: baseTime.Add(-24 * time.Hour), LastSeenAt: baseTime.Add(-24 * time.Hour)},
		{URL: "https://crautos.com/c=4", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 31000, Kilometraje: 40000, Placa: "Termina en 7", ColorExterior: "BLANCO", SellerPhone: "8888-1111", Title: "Toyota RAV4", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=5", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 32000, Kilometraje: 30000, Placa: "Termina en 8", ColorExterior: "NEGRO", SellerPhone: "8888-2222", Title: "Toyota RAV4", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=6", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 29000, Kilometraje: 60000, Placa: "Termina en 9", ColorExterior: "AZUL", SellerPhone: "8888-3333", Title: "Toyota RAV4", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=7", Brand: "Toyota", Model: "RAV4", Year: 2022, Price: 3000, Kilometraje: 55000, Placa: "Termina en 1", ColorExterior: "ROJO", SellerPhone: "7777-1111", Title: "Toyota RAV4", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	if err := database.MarkSold([]string{"https://crautos.com/c=0"}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}

	stats, err := database.GetAllMarketStats()
	if err != nil {
		t.Fatalf("GetAllMarketStats: %v", err)
	}

	stat := stats.Groups[MarketKey("Toyota", "RAV4", 2022)]
	if stat.Count != 4 {
		t.Errorf("Count = %d, want 4", stat.Count)
	}
	if stat.Median != 30500 {
		t.Errorf("Median = %d, want 30500", stat.Median)
	}

	wantDups := []string{"https://crautos.com/c=1", "https://crautos.com/c=3"}
	if got := stats.ActiveDuplicateURLs(); !reflect.DeepEqual(got, wantDups) {
		t.Errorf("ActiveDuplicateURLs = %v, want %v", got, wantDups)
	}

	active := false
	fp := FilterParams{IsSold: &active, ExcludeURLs: stats.ActiveDuplicateURLs()}
	if n, err := database.CountCars(fp); err != nil || n != 5 {
		t.Errorf("CountCars = %d, %v; want 5", n, err)
	}
	if got, err := database.GetCars(fp); err != nil || len(got) != 5 {
		t.Errorf("GetCars len = %d, %v; want 5", len(got), err)
	}
	if got, err := database.GetCarPriceKeys(fp); err != nil || len(got) != 5 {
		t.Errorf("GetCarPriceKeys len = %d, %v; want 5", len(got), err)
	}
}

func TestMarketPercentilesAndSellerActiveCount(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	baseTime := time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)
	cars := []Car{
		// Same seller phone 8888-1111 has 2 unique active cars (c=10, c=11) + 1 active duplicate (c=12) + 1 sold car (c=13).
		{URL: "https://crautos.com/c=10", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 20000, Kilometraje: 60000, Placa: "Termina en 1", ColorExterior: "GRIS", SellerName: "AutosCR", SellerPhone: "8888-1111", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=12", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 20000, Kilometraje: 60000, Placa: "Termina en 1", ColorExterior: "GRIS", SellerName: "AutosCR", SellerPhone: "8888-1111", ScrapedAt: baseTime.Add(-time.Hour), LastSeenAt: baseTime.Add(-time.Hour)},
		{URL: "https://crautos.com/c=11", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 24000, Kilometraje: 50000, Placa: "Termina en 2", ColorExterior: "BLANCO", SellerName: "AutosCR", SellerPhone: "8888-1111", ScrapedAt: baseTime, LastSeenAt: baseTime},
		{URL: "https://crautos.com/c=13", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 22000, Kilometraje: 55000, Placa: "Termina en 3", ColorExterior: "AZUL", SellerName: "AutosCR", SellerPhone: "8888-1111", ScrapedAt: baseTime.Add(-48 * time.Hour), LastSeenAt: baseTime.Add(-48 * time.Hour)},
		// Individual seller with 1 active car.
		{URL: "https://crautos.com/c=14", Brand: "Honda", Model: "CR-V", Year: 2020, Price: 28000, Kilometraje: 40000, Placa: "Termina en 4", ColorExterior: "NEGRO", SellerName: "Juan Perez", SellerPhone: "8777-2222", ScrapedAt: baseTime, LastSeenAt: baseTime},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	if err := database.MarkSold([]string{"https://crautos.com/c=13"}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}

	stats, err := database.GetAllMarketStats()
	if err != nil {
		t.Fatalf("GetAllMarketStats: %v", err)
	}

	stat := stats.Groups[MarketKey("Honda", "CR-V", 2020)]
	// Sorted clean prices: 20000, 22000, 24000, 28000 -> P25 = 21500, Median = 23000, P75 = 25000.
	if stat.P25 != 21500 || stat.Median != 23000 || stat.P75 != 25000 {
		t.Errorf("stat quartiles = (P25=%d, Med=%d, P75=%d), want (21500, 23000, 25000)", stat.P25, stat.Median, stat.P75)
	}

	if got := stats.SellerActiveCount("https://crautos.com/c=10"); got != 2 {
		t.Errorf("SellerActiveCount(c=10) = %d, want 2 (deduped)", got)
	}
	if got := stats.SellerActiveCount("https://crautos.com/c=14"); got != 1 {
		t.Errorf("SellerActiveCount(c=14) = %d, want 1", got)
	}

	summary, err := database.GetValuationSummary("Honda", "CR-V", 2020, 2020, stats.ActiveDuplicateURLs())
	if err != nil {
		t.Fatalf("GetValuationSummary: %v", err)
	}
	if summary.ActiveCount != 3 || summary.SoldCount != 1 {
		t.Errorf("summary counts = (active=%d, sold=%d), want (3, 1)", summary.ActiveCount, summary.SoldCount)
	}
	if summary.MinPrice != 20000 || summary.MaxPrice != 28000 {
		t.Errorf("summary min/max = (%d, %d), want (20000, 28000)", summary.MinPrice, summary.MaxPrice)
	}
	if len(summary.ComparableURLs) != 3 {
		t.Errorf("ComparableURLs len = %d, want 3", len(summary.ComparableURLs))
	}
}
