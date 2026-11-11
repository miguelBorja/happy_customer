package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"

	"crautosdb/db"
)

// Market-deal thresholds. Keep in sync with web/src/utils/marketDeal.js.
const (
	minMarketComparables = 4    // includes the car itself
	goodDealMaxPct       = -5.0 // "Buen precio" or better
)

// marketDealPct returns the signed deviation (%) of price vs the market median for its
// brand/model/year, and false when there is not enough market data.
func marketDealPct(stats map[string]db.MarketStat, k db.CarPriceKey) (float64, bool) {
	if stats == nil || k.Price <= 0 {
		return 0, false
	}
	stat, ok := stats[db.MarketKey(k.Brand, k.Model, k.Year)]
	if !ok || stat.Median <= 0 || stat.Count < minMarketComparables {
		return 0, false
	}
	return float64(k.Price-stat.Median) / float64(stat.Median) * 100, true
}

// rankDealURLs filters and/or orders the candidate keys (already most-recent-first) by market deal.
// onlyGood keeps cars at least goodDealMaxPct below market; bestFirst orders by deviation ascending,
// with cars lacking market data last. Ties keep the incoming (recency) order.
func rankDealURLs(keys []db.CarPriceKey, stats map[string]db.MarketStat, onlyGood, bestFirst bool) []string {
	type ranked struct {
		url string
		pct float64
		ok  bool
	}
	items := make([]ranked, 0, len(keys))
	for _, k := range keys {
		pct, ok := marketDealPct(stats, k)
		if onlyGood && (!ok || pct > goodDealMaxPct) {
			continue
		}
		items = append(items, ranked{url: k.URL, pct: pct, ok: ok})
	}
	if bestFirst {
		sort.SliceStable(items, func(i, j int) bool {
			if items[i].ok != items[j].ok {
				return items[i].ok
			}
			return items[i].ok && items[i].pct < items[j].pct
		})
	}
	urls := make([]string, len(items))
	for i, it := range items {
		urls[i] = it.url
	}
	return urls
}

// pageOfURLs returns urls[offset:offset+limit] (bounds-safe).
func pageOfURLs(urls []string, offset, limit int) []string {
	if offset >= len(urls) {
		return nil
	}
	end := len(urls)
	if limit > 0 && offset+limit < end {
		end = offset + limit
	}
	return urls[offset:end]
}

// orderCarsByURLs reorders cars to follow urls (GetCarsByURLs returns its own order).
func orderCarsByURLs(cars []db.Car, urls []string) []db.Car {
	byURL := make(map[string]db.Car, len(cars))
	for _, c := range cars {
		byURL[c.URL] = c
	}
	out := make([]db.Car, 0, len(urls))
	for _, u := range urls {
		if c, ok := byURL[u]; ok {
			out = append(out, c)
		}
	}
	return out
}

// serveDealCars answers /api/cars when deal=good and/or sortDeal=best: it ranks every matching
// car against the market median, then loads only the requested page. X-Total-Count is always set.
func (s *Server) serveDealCars(w http.ResponseWriter, f db.FilterParams, onlyGood, bestFirst bool) {
	keys, err := s.DB.GetCarPriceKeys(f)
	if err != nil {
		log.Printf("[API ERROR] GetCarPriceKeys failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	urls := rankDealURLs(keys, s.getMarketStats(), onlyGood, bestFirst)
	page := pageOfURLs(urls, f.Offset, f.Limit)

	cars := []db.Car{}
	if len(page) > 0 {
		loaded, err := s.DB.GetCarsByURLs(page)
		if err != nil {
			log.Printf("[API ERROR] GetCarsByURLs failed: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		cars = orderCarsByURLs(loaded, page)
	}

	w.Header().Set("X-Total-Count", strconv.Itoa(len(urls)))
	w.Header().Set("Access-Control-Expose-Headers", "X-Total-Count")
	json.NewEncoder(w).Encode(s.withMarket(cars))
}
