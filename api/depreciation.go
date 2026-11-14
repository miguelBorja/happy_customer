package api

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// DepreciationPoint is one model year of the brand/model price curve.
type DepreciationPoint struct {
	Year       int     `json:"year"`
	Median     int     `json:"median"`
	P25        int     `json:"p25"`
	P75        int     `json:"p75"`
	Count      int     `json:"count"`
	MedianKm   int     `json:"medianKm,omitempty"`
	LowSample  bool    `json:"lowSample"`
	YoYDropUSD int     `json:"yoyDropUSD,omitempty"`
	YoYDropPct float64 `json:"yoyDropPct,omitempty"`
}

// SweetSpotInfo is the year pair with the steepest annualized drop ("año dulce"):
// buying the older year saves money compared to the newer one.
type SweetSpotInfo struct {
	Year           int     `json:"year"`
	ComparedToYear int     `json:"comparedToYear"`
	Median         int     `json:"median"`
	SavingsUSD     int     `json:"savingsUSD"`
	SavingsPct     float64 `json:"savingsPct"`
}

// DepreciationResponse is the year-by-year depreciation curve of a brand/model.
type DepreciationResponse struct {
	Brand            string              `json:"brand"`
	Model            string              `json:"model"`
	Points           []DepreciationPoint `json:"points"`
	TotalSamples     int                 `json:"totalSamples"`
	AvgAnnualDropPct float64             `json:"avgAnnualDropPct"`
	SweetSpot        *SweetSpotInfo      `json:"sweetSpot,omitempty"`
}

// HandleDepreciation builds the depreciation curve for a brand/model purely from the
// in-memory market index (s.getMarketStats), so it runs no extra SQL queries.
func (s *Server) HandleDepreciation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	q := r.URL.Query()
	brand := strings.TrimSpace(q.Get("brand"))
	model := strings.TrimSpace(q.Get("model"))
	if brand == "" || model == "" {
		respondError(w, http.StatusBadRequest, "Missing brand or model parameter")
		return
	}

	resp := DepreciationResponse{
		Brand:  brand,
		Model:  model,
		Points: []DepreciationPoint{},
	}

	groups := s.getMarketStats()
	if groups == nil || groups.Groups == nil {
		writeJSONDepreciation(w, resp)
		return
	}

	points := make([]DepreciationPoint, 0, len(groups.Groups))
	maxYear := time.Now().Year() + 1
	wantBrand := strings.ToLower(brand)
	wantModel := strings.ToLower(model)

	for k, g := range groups.Groups {
		parts := strings.Split(k, "|")
		if len(parts) != 3 || parts[0] != wantBrand || parts[1] != wantModel {
			continue
		}
		year, err := strconv.Atoi(parts[2])
		if err != nil || year < 1990 || year > maxYear {
			continue
		}
		if g.Count < 1 || g.Median <= 0 {
			continue
		}
		points = append(points, DepreciationPoint{
			Year:      year,
			Median:    g.Median,
			P25:       g.P25,
			P75:       g.P75,
			Count:     g.Count,
			MedianKm:  g.MedianKm,
			LowSample: g.Count < minMarketComparables,
		})
		resp.TotalSamples += g.Count
	}

	sort.Slice(points, func(i, j int) bool { return points[i].Year < points[j].Year })

	// Year-over-year (annualized) drops against the immediately newer year.
	for i := 0; i < len(points)-1; i++ {
		older := &points[i]
		newer := points[i+1]
		gap := newer.Year - older.Year
		if gap < 1 || gap > 3 || newer.Median <= older.Median || older.Median <= 0 {
			continue
		}
		annualizedPct := (1 - math.Pow(float64(older.Median)/float64(newer.Median), 1.0/float64(gap))) * 100
		older.YoYDropPct = math.Round(annualizedPct*10) / 10
		dropUSD := newer.Median - older.Median
		if gap > 1 {
			older.YoYDropUSD = int(math.Round(float64(dropUSD) / float64(gap)))
		} else {
			older.YoYDropUSD = dropUSD
		}
	}

	if pct, ok := depreciationAvgAnnualDrop(points, minMarketComparables); ok {
		resp.AvgAnnualDropPct = pct
	} else if pct, ok := depreciationAvgAnnualDrop(points, 2); ok {
		resp.AvgAnnualDropPct = pct
	}

	if spot := depreciationSweetSpot(points, minMarketComparables); spot != nil {
		resp.SweetSpot = spot
	} else if spot := depreciationSweetSpot(points, 3); spot != nil {
		resp.SweetSpot = spot
	}

	resp.Points = points
	writeJSONDepreciation(w, resp)
}

// writeJSONDepreciation encodes the response (always 200 OK).
func writeJSONDepreciation(w http.ResponseWriter, resp DepreciationResponse) {
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// depreciationAvgAnnualDrop computes the CAGR drop between the oldest and newest years
// that have at least minCount samples (nil/0 when there is nothing reliable to compare).
func depreciationAvgAnnualDrop(points []DepreciationPoint, minCount int) (float64, bool) {
	var oldest, newest *DepreciationPoint
	for i := range points {
		if points[i].Count >= minCount && points[i].Median > 0 {
			oldest = &points[i]
			break
		}
	}
	for i := len(points) - 1; i >= 0; i-- {
		if points[i].Count >= minCount && points[i].Median > 0 {
			newest = &points[i]
			break
		}
	}
	if oldest == nil || newest == nil {
		return 0, false
	}
	span := newest.Year - oldest.Year
	if span < 2 || newest.Median <= oldest.Median {
		return 0, false
	}
	cagr := (1 - math.Pow(float64(oldest.Median)/float64(newest.Median), 1.0/float64(span))) * 100
	return math.Round(cagr*10) / 10, true
}

// depreciationSweetSpot picks the adjacent year pair (within the last 10 years) with the
// steepest annualized drop, provided the saving is meaningful (>= 800 USD and >= 5%).
func depreciationSweetSpot(points []DepreciationPoint, minCount int) *SweetSpotInfo {
	if len(points) < 2 {
		return nil
	}
	maxYear := points[len(points)-1].Year

	var best *SweetSpotInfo
	bestScore := math.Inf(-1)
	bestYear := 0

	for i := 0; i < len(points)-1; i++ {
		older := points[i]
		newer := points[i+1]
		gap := newer.Year - older.Year
		if older.Year < maxYear-10 || older.Year >= maxYear || gap < 1 || gap > 2 {
			continue
		}
		if older.Count < minCount || newer.Count < minCount {
			continue
		}
		if newer.Median <= older.Median {
			continue
		}
		savings := newer.Median - older.Median
		if savings < 800 {
			continue
		}
		savingsPct := (float64(savings) / float64(newer.Median)) * 100
		if savingsPct < 5.0 {
			continue
		}
		score := (1 - math.Pow(float64(older.Median)/float64(newer.Median), 1.0/float64(gap))) * 100
		if best == nil || score > bestScore || (score == bestScore && older.Year > bestYear) {
			best = &SweetSpotInfo{
				Year:           older.Year,
				ComparedToYear: newer.Year,
				Median:         older.Median,
				SavingsUSD:     savings,
				SavingsPct:     math.Round(savingsPct*10) / 10,
			}
			bestScore = score
			bestYear = older.Year
		}
	}

	return best
}
