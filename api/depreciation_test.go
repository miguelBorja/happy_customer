package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

// seedDepreciationMarketCache fills the in-memory market index with a Toyota RAV4 curve,
// so the handler provably needs zero SQL queries.
func seedDepreciationMarketCache(t *testing.T) {
	t.Helper()

	groups := map[string]db.MarketStat{
		"toyota|rav4|2016": {Median: 5000, P25: 5000, P75: 5000, Count: 1},    // outlier, single sample
		"toyota|rav4|2018": {Median: 14000, P25: 13000, P75: 15000, Count: 5}, // steep-ish
		"toyota|rav4|2019": {Median: 16500, P25: 15500, P75: 17500, Count: 6},
		"toyota|rav4|2020": {Median: 19000, P25: 18000, P75: 20000, Count: 6},
		"toyota|rav4|2021": {Median: 22000, P25: 21000, P75: 23000, Count: 7},
		"toyota|rav4|2022": {Median: 27500, P25: 26000, P75: 29000, Count: 7}, // sweet spot candidate
		"toyota|rav4|2023": {Median: 35000, P25: 33000, P75: 37000, Count: 6}, // steep drop vs 2022
		"toyota|rav4|2024": {Median: 37000, P25: 35000, P75: 39000, Count: 5},
		// Unrelated group that must be ignored.
		"honda|cr-v|2020": {Median: 25000, P25: 24000, P75: 26000, Count: 4},
	}

	marketCache.Lock()
	marketCache.stats = &db.MarketIndex{Groups: groups}
	marketCache.loadedAt = time.Now()
	marketCache.Unlock()
	t.Cleanup(resetMarketStatsCache)
}

func runDepreciationRequest(t *testing.T, s *Server, method, target string) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	s.HandleDepreciation(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func decodeDepreciation(t *testing.T, body []byte) DepreciationResponse {
	t.Helper()
	var resp DepreciationResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal depreciation response: %v (body=%s)", err, string(body))
	}
	return resp
}

func TestHandleDepreciation(t *testing.T) {
	seedDepreciationMarketCache(t)
	s := &Server{}

	t.Run("curve and sweet spot", func(t *testing.T) {
		code, body := runDepreciationRequest(t, s, http.MethodGet, "/api/depreciation?brand=Toyota&model=RAV4")
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body=%s)", code, string(body))
		}
		resp := decodeDepreciation(t, body)

		if resp.Brand != "Toyota" || resp.Model != "RAV4" {
			t.Errorf("brand/model = %q/%q, want Toyota/RAV4", resp.Brand, resp.Model)
		}

		wantYears := []int{2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024}
		if len(resp.Points) != len(wantYears) {
			t.Fatalf("points = %d, want %d: %+v", len(resp.Points), len(wantYears), resp.Points)
		}
		for i, y := range wantYears {
			if resp.Points[i].Year != y {
				t.Errorf("points[%d].Year = %d, want %d (points=%+v)", i, resp.Points[i].Year, y, resp.Points)
			}
		}

		if resp.TotalSamples != 43 {
			t.Errorf("TotalSamples = %d, want 43", resp.TotalSamples)
		}

		if !resp.Points[0].LowSample {
			t.Errorf("2016 (count 1) should be LowSample")
		}
		for _, p := range resp.Points[1:] {
			if p.LowSample {
				t.Errorf("%d (count %d) should not be LowSample", p.Year, p.Count)
			}
		}

		// 2016 -> 2018 gap of 2 years: annualized drop and per-year USD drop.
		first := resp.Points[0]
		if first.YoYDropUSD != 4500 {
			t.Errorf("2016 YoYDropUSD = %d, want 4500", first.YoYDropUSD)
		}
		if first.YoYDropPct <= 0 {
			t.Errorf("2016 YoYDropPct = %v, want > 0", first.YoYDropPct)
		}

		if resp.AvgAnnualDropPct <= 0 {
			t.Errorf("AvgAnnualDropPct = %v, want > 0", resp.AvgAnnualDropPct)
		}
		if resp.AvgAnnualDropPct < 10 || resp.AvgAnnualDropPct > 20 {
			t.Errorf("AvgAnnualDropPct = %v, want roughly 15", resp.AvgAnnualDropPct)
		}

		spot := resp.SweetSpot
		if spot == nil {
			t.Fatalf("SweetSpot = nil, want 2022 vs 2023")
		}
		if spot.Year != 2022 || spot.ComparedToYear != 2023 {
			t.Errorf("SweetSpot years = %d vs %d, want 2022 vs 2023", spot.Year, spot.ComparedToYear)
		}
		if spot.Median != 27500 {
			t.Errorf("SweetSpot.Median = %d, want 27500", spot.Median)
		}
		if spot.SavingsUSD != 7500 {
			t.Errorf("SweetSpot.SavingsUSD = %d, want 7500", spot.SavingsUSD)
		}
		if spot.SavingsPct < 21 || spot.SavingsPct > 22 {
			t.Errorf("SweetSpot.SavingsPct = %v, want roughly 21.4", spot.SavingsPct)
		}
	})

	t.Run("missing parameters", func(t *testing.T) {
		for _, target := range []string{
			"/api/depreciation",
			"/api/depreciation?brand=Toyota",
			"/api/depreciation?model=RAV4",
			"/api/depreciation?brand=" + "%20" + "&model=RAV4",
		} {
			code, body := runDepreciationRequest(t, s, http.MethodGet, target)
			if code != http.StatusBadRequest {
				t.Errorf("%s: status = %d, want 400 (body=%s)", target, code, string(body))
			}
		}
	})

	t.Run("unknown model", func(t *testing.T) {
		code, body := runDepreciationRequest(t, s, http.MethodGet, "/api/depreciation?brand=Toyota&model=Corolla")
		if code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body=%s)", code, string(body))
		}
		if !strings.Contains(string(body), `"points":[]`) {
			t.Errorf("body should contain an empty points array: %s", string(body))
		}
		resp := decodeDepreciation(t, body)
		if resp.Points == nil {
			t.Errorf("Points = nil, want empty slice")
		}
		if len(resp.Points) != 0 {
			t.Errorf("Points = %+v, want empty", resp.Points)
		}
		if resp.SweetSpot != nil {
			t.Errorf("SweetSpot = %+v, want nil", resp.SweetSpot)
		}
		if resp.TotalSamples != 0 || resp.AvgAnnualDropPct != 0 {
			t.Errorf("TotalSamples/AvgAnnualDropPct = %d/%v, want 0/0", resp.TotalSamples, resp.AvgAnnualDropPct)
		}
	})

	t.Run("method not allowed", func(t *testing.T) {
		code, body := runDepreciationRequest(t, s, http.MethodPost, "/api/depreciation?brand=Toyota&model=RAV4")
		if code != http.StatusMethodNotAllowed {
			t.Errorf("POST status = %d, want 405 (body=%s)", code, string(body))
		}
	})

	t.Run("options preflight", func(t *testing.T) {
		code, body := runDepreciationRequest(t, s, http.MethodOptions, "/api/depreciation")
		if code != http.StatusOK {
			t.Errorf("OPTIONS status = %d, want 200 (body=%s)", code, string(body))
		}
	})
}
