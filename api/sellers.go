package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"crautosdb/db"
)

// SellerBrandStat captures a seller's inventory distribution for a single brand.
type SellerBrandStat struct {
	Brand       string `json:"brand"`
	ActiveCount int    `json:"activeCount"`
	TotalCount  int    `json:"totalCount"`
}

// SellerSummaryResponse summarizes a dealer or private seller's active inventory,
// turnover, and asking-price positioning relative to fair market medians.
type SellerSummaryResponse struct {
	Query             string            `json:"query"`
	DisplayName       string            `json:"displayName"`
	SellerType        string            `json:"sellerType"`
	ActiveCount       int               `json:"activeCount"`
	SoldCount         int               `json:"soldCount"`
	TotalCount        int               `json:"totalCount"`
	SoldRatePct       *float64          `json:"soldRatePct,omitempty"`
	AvgPriceUSD       int               `json:"avgPriceUSD"`
	AvgMarketDeltaPct *float64          `json:"avgMarketDeltaPct,omitempty"`
	MarketSampleCount int               `json:"marketSampleCount"`
	MedianExitDays    *int              `json:"medianExitDays,omitempty"`
	DaysMetric        string            `json:"daysMetric"`
	TradeInCount      int               `json:"tradeInCount"`
	NegotiableCount   int               `json:"negotiableCount"`
	PrimaryProvince   string            `json:"primaryProvince,omitempty"`
	Phones            []string          `json:"phones,omitempty"`
	TopBrands         []SellerBrandStat `json:"topBrands"`
}

var dealerNameTokens = map[string]struct{}{
	"autos":       {},
	"motors":      {},
	"motor":       {},
	"automotriz":  {},
	"agencia":     {},
	"agencias":    {},
	"importadora": {},
	"imports":     {},
	"multimarcas": {},
	"vehiculos":   {},
	"vehículos":   {},
	"garage":      {},
	"rent":        {},
	"leasing":     {},
	"grupo":       {},
	"purdy":       {},
	"veinsa":      {},
	"danissa":     {},
	"cori":        {},
	"sa":          {},
	"ltda":        {},
}

func classifySellerType(displayName string, activeCount, totalCount int) string {
	if activeCount >= 5 {
		return "dealer"
	}
	lower := strings.ToLower(strings.TrimSpace(displayName))
	if strings.Contains(lower, "s.a") || strings.Contains(lower, "rent a car") {
		return "dealer"
	}
	fields := strings.FieldsFunc(lower, func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != 'á' && r != 'é' && r != 'í' && r != 'ó' && r != 'ú' && r != 'ü' && r != 'ñ'
	})
	for _, tok := range fields {
		if _, ok := dealerNameTokens[tok]; ok {
			return "dealer"
		}
	}
	if activeCount >= 2 || totalCount >= 3 {
		return "multi"
	}
	return "private"
}

func computeMedianInt(vals []int) (int, bool) {
	if len(vals) == 0 {
		return 0, false
	}
	sorted := make([]int, len(vals))
	copy(sorted, vals)
	sort.Ints(sorted)
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[mid], true
	}
	return int(math.Round(float64(sorted[mid-1]+sorted[mid]) / 2.0)), true
}

func topStringKey(counts map[string]int) string {
	bestKey := ""
	bestCount := 0
	for k, c := range counts {
		if c > bestCount || (c == bestCount && k < bestKey) {
			bestKey = k
			bestCount = c
		}
	}
	return bestKey
}

func buildSellerSummary(query string, rows []db.SellerListingRow, stats *db.MarketIndex, now time.Time) SellerSummaryResponse {
	dupSet := map[string]struct{}{}
	if stats != nil {
		for _, u := range stats.ActiveDuplicateURLs() {
			dupSet[u] = struct{}{}
		}
	}

	nameCounts := map[string]int{}
	activeProvinceCounts := map[string]int{}
	allProvinceCounts := map[string]int{}
	phoneCounts := map[string]int{}
	brandMap := map[string]*SellerBrandStat{}

	var (
		activePriceSum   int64
		activePriceCount int
		allPriceSum      int64
		allPriceCount    int
		activeDeltaSum   float64
		activeDeltaCount int
		allDeltaSum      float64
		allDeltaCount    int
		soldDays         []int
		activeDays       []int
		activeCount      int
		soldCount        int
		activeTradeIn    int
		allTradeIn       int
		activeNegotiable int
		allNegotiable    int
	)

	for _, r := range rows {
		if !r.IsSold {
			if _, isDup := dupSet[r.URL]; isDup {
				continue
			}
		}

		if sName := strings.TrimSpace(r.SellerName); sName != "" {
			nameCounts[sName]++
		}
		if phone := strings.TrimSpace(r.SellerPhone); phone != "" {
			phoneCounts[phone]++
		}
		if prov := strings.TrimSpace(r.Provincia); prov != "" {
			allProvinceCounts[prov]++
			if !r.IsSold {
				activeProvinceCounts[prov]++
			}
		}

		if r.IsSold {
			soldCount++
			if !r.SoldAt.IsZero() {
				if d, ok := db.ListingAgeDays(r.FechaIngreso, r.ScrapedAt, r.SoldAt); ok {
					soldDays = append(soldDays, d)
				}
			}
		} else {
			activeCount++
			if d, ok := db.ListingAgeDays(r.FechaIngreso, r.ScrapedAt, now); ok {
				activeDays = append(activeDays, d)
			}
		}

		seRecibeLower := strings.ToLower(strings.TrimSpace(r.SeRecibe))
		acceptsTradeIn := seRecibeLower == "sí" || seRecibeLower == "si"
		if acceptsTradeIn {
			allTradeIn++
			if !r.IsSold {
				activeTradeIn++
			}
		}
		negLower := strings.ToLower(strings.TrimSpace(r.PrecioNegociable))
		if negLower == "sí" || negLower == "si" {
			allNegotiable++
			if !r.IsSold {
				activeNegotiable++
			}
		}

		if r.Price > 0 {
			allPriceSum += int64(r.Price)
			allPriceCount++
			if !r.IsSold {
				activePriceSum += int64(r.Price)
				activePriceCount++
			}
		}

		if brand := strings.TrimSpace(r.Brand); brand != "" {
			bs, ok := brandMap[brand]
			if !ok {
				bs = &SellerBrandStat{Brand: brand}
				brandMap[brand] = bs
			}
			bs.TotalCount++
			if !r.IsSold {
				bs.ActiveCount++
			}
		}

		if stats != nil && r.Price > 0 {
			key := db.CarPriceKey{
				URL:          r.URL,
				Brand:        r.Brand,
				Model:        r.Model,
				Year:         r.Year,
				Price:        r.Price,
				Km:           r.Kilometraje,
				ScrapedAt:    r.ScrapedAt,
				FechaIngreso: r.FechaIngreso,
				IsSold:       r.IsSold,
			}
			if pct, flag, ok := marketDealPct(stats, key); ok && flag == "" {
				allDeltaSum += pct
				allDeltaCount++
				if !r.IsSold {
					activeDeltaSum += pct
					activeDeltaCount++
				}
			}
		}
	}

	displayName := topStringKey(nameCounts)
	if displayName == "" {
		displayName = strings.TrimSpace(query)
	}

	totalCount := activeCount + soldCount
	resp := SellerSummaryResponse{
		Query:       strings.TrimSpace(query),
		DisplayName: displayName,
		SellerType:  classifySellerType(displayName, activeCount, totalCount),
		ActiveCount: activeCount,
		SoldCount:   soldCount,
		TotalCount:  totalCount,
		DaysMetric:  "none",
		TopBrands:   []SellerBrandStat{},
	}

	if totalCount > 0 {
		rate := math.Round(float64(soldCount)/float64(totalCount)*1000) / 10
		resp.SoldRatePct = &rate
	}

	if activeCount > 0 {
		resp.TradeInCount = activeTradeIn
		resp.NegotiableCount = activeNegotiable
		resp.PrimaryProvince = topStringKey(activeProvinceCounts)
		if activePriceCount > 0 {
			resp.AvgPriceUSD = int(math.Round(float64(activePriceSum) / float64(activePriceCount)))
		}
	} else {
		resp.TradeInCount = allTradeIn
		resp.NegotiableCount = allNegotiable
		resp.PrimaryProvince = topStringKey(allProvinceCounts)
		if allPriceCount > 0 {
			resp.AvgPriceUSD = int(math.Round(float64(allPriceSum) / float64(allPriceCount)))
		}
	}
	if resp.PrimaryProvince == "" {
		resp.PrimaryProvince = topStringKey(allProvinceCounts)
	}

	if activeDeltaCount > 0 {
		delta := math.Round(activeDeltaSum/float64(activeDeltaCount)*10) / 10
		resp.AvgMarketDeltaPct = &delta
		resp.MarketSampleCount = activeDeltaCount
	} else if allDeltaCount > 0 {
		delta := math.Round(allDeltaSum/float64(allDeltaCount)*10) / 10
		resp.AvgMarketDeltaPct = &delta
		resp.MarketSampleCount = allDeltaCount
	}

	if med, ok := computeMedianInt(soldDays); ok {
		resp.MedianExitDays = &med
		resp.DaysMetric = "sold"
	} else if med, ok := computeMedianInt(activeDays); ok {
		resp.MedianExitDays = &med
		resp.DaysMetric = "active"
	}

	if len(phoneCounts) > 0 {
		phones := make([]string, 0, len(phoneCounts))
		for p := range phoneCounts {
			phones = append(phones, p)
		}
		sort.Slice(phones, func(i, j int) bool {
			if phoneCounts[phones[i]] != phoneCounts[phones[j]] {
				return phoneCounts[phones[i]] > phoneCounts[phones[j]]
			}
			return phones[i] < phones[j]
		})
		if len(phones) > 3 {
			phones = phones[:3]
		}
		resp.Phones = phones
	}

	if len(brandMap) > 0 {
		brands := make([]SellerBrandStat, 0, len(brandMap))
		for _, bs := range brandMap {
			brands = append(brands, *bs)
		}
		sort.Slice(brands, func(i, j int) bool {
			if brands[i].ActiveCount != brands[j].ActiveCount {
				return brands[i].ActiveCount > brands[j].ActiveCount
			}
			if brands[i].TotalCount != brands[j].TotalCount {
				return brands[i].TotalCount > brands[j].TotalCount
			}
			return brands[i].Brand < brands[j].Brand
		})
		if len(brands) > 3 {
			brands = brands[:3]
		}
		resp.TopBrands = brands
	}

	return resp
}

// HandleSellerSummary serves GET /api/sellers/summary?name=... with seller reputation and inventory metrics.
func (s *Server) HandleSellerSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if utf8.RuneCountInString(name) < 2 {
		respondError(w, http.StatusBadRequest, "name query parameter is required (minimum 2 characters)")
		return
	}

	if s.DB == nil {
		respondError(w, http.StatusInternalServerError, "Database not initialized")
		return
	}

	rows, err := s.DB.GetSellerListings(name)
	if err != nil {
		log.Printf("[API ERROR] GetSellerListings failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to summarize seller inventory")
		return
	}

	stats := s.getMarketStats()
	summary := buildSellerSummary(name, rows, stats, time.Now().UTC())

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_ = json.NewEncoder(w).Encode(summary)
}
