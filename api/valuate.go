package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"crautosdb/db"
)

// ValuationResponse describes the market valuation bands, liquidity metrics and live comparables.
type ValuationResponse struct {
	Brand            string          `json:"brand"`
	Model            string          `json:"model"`
	Year             int             `json:"year"`
	Km               int             `json:"km"`
	Confidence       string          `json:"confidence"` // "high", "medium", "low", "none"
	SampleCount      int             `json:"sampleCount"`
	YearWindow       int             `json:"yearWindow"` // 0 = exact year, 1 = year ± 1 fallback
	Median           int             `json:"median"`
	MedianKm         int             `json:"medianKm"`
	KmAdjustmentPct  float64         `json:"kmAdjustmentPct"`
	QuickSalePrice   int             `json:"quickSalePrice"`
	FairPrice        int             `json:"fairPrice"`
	OptimisticPrice  int             `json:"optimisticPrice"`
	MinPrice         int             `json:"minPrice"`
	MaxPrice         int             `json:"maxPrice"`
	ActiveCount      int             `json:"activeCount"`
	SoldCount        int             `json:"soldCount"`
	SoldRate         float64         `json:"soldRate"`
	MedianDaysListed int             `json:"medianDaysListed"`
	Comparables      []CarWithMarket `json:"comparables"`
}

// HandleValuate computes a seller-facing market valuation for brand/model/year/km.
func (s *Server) HandleValuate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	q := r.URL.Query()
	brand := strings.TrimSpace(q.Get("brand"))
	model := strings.TrimSpace(q.Get("model"))
	year, errYear := strconv.Atoi(strings.TrimSpace(q.Get("year")))
	if brand == "" || model == "" || errYear != nil || year < 1980 || year > 2030 {
		respondError(w, http.StatusBadRequest, "Missing or invalid brand, model, or year")
		return
	}

	km := 0
	if rawKm := strings.TrimSpace(q.Get("km")); rawKm != "" {
		parsedKm, errKm := strconv.Atoi(rawKm)
		if errKm != nil || parsedKm < 0 {
			respondError(w, http.StatusBadRequest, "Invalid km parameter")
			return
		}
		km = parsedKm
	}

	stats := s.getMarketStats()
	ref, ok := stats.Lookup(brand, model, year, km)
	yearWindow := 0

	if (!ok || ref.Count < minMarketComparables) && stats != nil && stats.Groups != nil {
		var weightSum, kmWeightSum float64
		var medSum, p25Sum, p75Sum, medKmSum float64
		totalCount := 0
		usedAdjacent := false

		for y := year - 1; y <= year+1; y++ {
			stat, exists := stats.Groups[db.MarketKey(brand, model, y)]
			if !exists || stat.Count <= 0 || stat.Median <= 0 {
				continue
			}
			if y != year {
				usedAdjacent = true
			}
			wgt := float64(stat.Count)
			yearFactor := math.Pow(1.04, float64(year-y))
			medSum += float64(stat.Median) * yearFactor * wgt
			p25Val := stat.P25
			if p25Val <= 0 {
				p25Val = int(math.Round(float64(stat.Median) * 0.92))
			}
			p75Val := stat.P75
			if p75Val <= 0 {
				p75Val = int(math.Round(float64(stat.Median) * 1.08))
			}
			p25Sum += float64(p25Val) * yearFactor * wgt
			p75Sum += float64(p75Val) * yearFactor * wgt
			weightSum += wgt
			totalCount += stat.Count

			if stat.MedianKm > 0 && stat.KmCount > 0 {
				kmW := float64(stat.KmCount)
				medKmSum += float64(stat.MedianKm) * kmW
				kmWeightSum += kmW
			}
		}

		if totalCount > 0 && usedAdjacent {
			yearWindow = 1
			baseMed := int(math.Round(medSum / weightSum))
			baseP25 := int(math.Round(p25Sum / weightSum))
			baseP75 := int(math.Round(p75Sum / weightSum))
			medKm := 0
			if kmWeightSum > 0 {
				medKm = int(math.Round(medKmSum / kmWeightSum))
			}
			factor := stats.KmAdjustFactor(km, medKm)
			ref = db.MarketRef{
				Median:      baseMed,
				P25:         baseP25,
				P75:         baseP75,
				Count:       totalCount,
				MedianKm:    medKm,
				Expected:    int(math.Round(float64(baseMed) * factor)),
				ExpectedP25: int(math.Round(float64(baseP25) * factor)),
				ExpectedP75: int(math.Round(float64(baseP75) * factor)),
			}
			ok = true
		}
	}

	resp := ValuationResponse{
		Brand:       brand,
		Model:       model,
		Year:        year,
		Km:          km,
		Confidence:  "none",
		YearWindow:  yearWindow,
		Comparables: []CarWithMarket{},
	}

	var excludeURLs []string
	if stats != nil {
		excludeURLs = stats.ActiveDuplicateURLs()
	}
	summary, err := s.DB.GetValuationSummary(brand, model, year-yearWindow, year+yearWindow, excludeURLs)
	if err != nil {
		log.Printf("[API ERROR] GetValuationSummary failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to compute valuation")
		return
	}

	resp.MinPrice = summary.MinPrice
	resp.MaxPrice = summary.MaxPrice
	resp.ActiveCount = summary.ActiveCount
	resp.SoldCount = summary.SoldCount
	if totalListings := summary.ActiveCount + summary.SoldCount; totalListings > 0 {
		resp.SoldRate = math.Round(float64(summary.SoldCount)/float64(totalListings)*1000) / 1000
	}
	resp.MedianDaysListed = summary.MedianDaysListed

	if len(summary.ComparableURLs) > 0 {
		loaded, err := s.DB.GetCarsByURLs(summary.ComparableURLs)
		if err != nil {
			log.Printf("[API ERROR] GetCarsByURLs (valuate) failed: %v", err)
			respondError(w, http.StatusInternalServerError, "Failed to load comparables")
			return
		}
		resp.Comparables = s.withMarket(orderCarsByURLs(loaded, summary.ComparableURLs))
	}

	if !ok || ref.Count == 0 || ref.Expected <= 0 {
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	resp.SampleCount = ref.Count
	switch {
	case yearWindow == 0 && ref.Count >= 10:
		resp.Confidence = "high"
	case yearWindow == 0 && ref.Count >= minMarketComparables:
		resp.Confidence = "medium"
	default:
		resp.Confidence = "low"
	}

	resp.Median = ref.Median
	resp.MedianKm = ref.MedianKm
	resp.FairPrice = ref.Expected

	quick := ref.ExpectedP25
	if quick <= 0 || quick > int(math.Round(float64(resp.FairPrice)*0.95)) {
		quick = int(math.Round(float64(resp.FairPrice) * 0.93))
	}
	optimistic := ref.ExpectedP75
	if optimistic < int(math.Round(float64(resp.FairPrice)*1.05)) {
		optimistic = int(math.Round(float64(resp.FairPrice) * 1.07))
	}
	resp.QuickSalePrice = quick
	resp.OptimisticPrice = optimistic

	if ref.Median > 0 {
		resp.KmAdjustmentPct = math.Round(float64(ref.Expected-ref.Median)/float64(ref.Median)*1000) / 10
	}

	_ = json.NewEncoder(w).Encode(resp)
}
