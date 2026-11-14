package api

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"crautosdb/db"
)

// Market-deal thresholds (signed % vs the mileage-adjusted median). Must match the exported
// constants in web/src/utils/marketDeal.js; TestDealThresholdsMatchFrontend enforces it.
// great/high are used by the badges; greatDealMaxPct also defines the Gangas tab (HandleBargains).
const (
	minMarketComparables = 4     // includes the car itself
	greatDealMaxPct      = -12.0 // "Gran precio"
	goodDealMaxPct       = -5.0  // "Buen precio" or better (deal=good)
	highDealMinPct       = 10.0  // "Sobre el mercado"
)

// Price-drop badge thresholds. Must match web/src/utils/priceHistory.js; TestDealThresholdsMatchFrontend
// enforces it. A drop must be both >= $100 and >= 1% of the previous price to earn the badge.
const (
	minBadgeDropUSD = 100
	minBadgeDropPct = 1.0
)

// Motivated-seller filter thresholds. Must match web/src/utils/motivatedSeller.js;
// TestDealThresholdsMatchFrontend enforces it.
const (
	minMotivatedDays  = 45
	minMotivatedDrops = 2
)

// "Check the price" flags (MarketFlag in the API). A flagged car gets a warning badge instead of
// a deal level, is excluded from deal=good and Gangas, and goes last in sortDeal=best.
const (
	flagTypo      = "typo"               // price looks off by a factor of 10 (missing or extra zero)
	flagOutlier   = "outlier"            // too far below market to be a real deal
	flagCondition = db.TextFlagCondition // comment: damaged / repairs / for parts
	flagDebt      = db.TextFlagDebt      // comment: assume a loan / lien
)

// dealFlag classifies a listing whose deviation is pct (vs expected). textFlag comes from the
// comment and only matters when the price would otherwise earn a "good" badge or better.
func dealFlag(pct float64, price, expected int, textFlag string) string {
	if db.IsTypoPrice(price, expected) {
		return flagTypo
	}
	if pct <= db.SuspiciousLowPct {
		if textFlag != "" {
			return textFlag
		}
		return flagOutlier
	}
	if pct <= goodDealMaxPct && textFlag != "" {
		return textFlag
	}
	return ""
}

// marketDealPct returns the signed deviation (%) of price vs the market median for its
// brand/model/year adjusted to its mileage, the "check the price" flag, and false when there is
// not enough market data.
func marketDealPct(stats *db.MarketIndex, k db.CarPriceKey) (float64, string, bool) {
	if k.Price <= 0 {
		return 0, "", false
	}
	ref, ok := stats.Lookup(k.Brand, k.Model, k.Year, k.Km)
	if !ok || ref.Expected <= 0 || ref.Count < minMarketComparables {
		return 0, "", false
	}
	pct := float64(k.Price-ref.Expected) / float64(ref.Expected) * 100
	return pct, dealFlag(pct, k.Price, ref.Expected, stats.TextFlag(k.URL)), true
}

// qualifyingPriceDrop reports whether a listing has a clean price drop that earns the
// "price drop" badge: same current price as the cleaned history, previous > current,
// no market/typo flag, and drop >= $100 and >= 1% of the previous price.
func qualifyingPriceDrop(stats *db.MarketIndex, k db.CarPriceKey) (dropUSD int, dropPct float64, changedAt time.Time, ok bool) {
	pc, has := stats.PriceChangeOf(k.URL)
	if !has || k.Price <= 0 || pc.CurrentPrice != k.Price || pc.PreviousPrice <= k.Price {
		return 0, 0, time.Time{}, false
	}
	_, flag, _ := marketDealPct(stats, k)
	if flag != "" {
		return 0, 0, time.Time{}, false
	}
	if db.IsTypoPrice(k.Price, pc.PreviousPrice) {
		return 0, 0, time.Time{}, false
	}
	drop := pc.PreviousPrice - k.Price
	pct := float64(drop) / float64(pc.PreviousPrice) * 100
	if drop < minBadgeDropUSD || pct < minBadgeDropPct {
		return 0, 0, time.Time{}, false
	}
	return drop, pct, pc.ChangedAt, true
}

// qualifyingMotivated reports whether an active, unflagged listing has strong negotiation
// leverage: listed >= minMotivatedDays days and/or >= minMotivatedDrops clean price drops.
func qualifyingMotivated(stats *db.MarketIndex, k db.CarPriceKey, now time.Time) (days int, drops int, score int, ok bool) {
	if k.IsSold || k.Price <= 0 {
		return 0, 0, 0, false
	}
	_, flag, _ := marketDealPct(stats, k)
	if flag != "" {
		return 0, 0, 0, false
	}
	if ageDays, hasAge := db.ListingAgeDays(k.FechaIngreso, k.ScrapedAt, now); hasAge {
		days = ageDays
	}
	if pc, has := stats.PriceChangeOf(k.URL); has && pc.CurrentPrice == k.Price && pc.InitialPrice > k.Price && !db.IsTypoPrice(k.Price, pc.InitialPrice) {
		drops = pc.Drops
	}
	if days < minMotivatedDays && drops < minMotivatedDrops {
		return 0, 0, 0, false
	}
	cappedDays := days
	if cappedDays > 180 {
		cappedDays = 180
	}
	score = drops*30 + cappedDays
	return days, drops, score, true
}

// rankDealURLs filters and/or orders the candidate keys (already most-recent-first) by market deal.
// onlyGood keeps cars at least goodDealMaxPct below market; bestFirst orders by deviation ascending,
// with flagged cars and cars lacking market data last. Ties keep the incoming (recency) order.
func rankDealURLs(keys []db.CarPriceKey, stats *db.MarketIndex, onlyGood, bestFirst bool) []string {
	maxPct := math.Inf(1)
	if onlyGood {
		maxPct = goodDealMaxPct
	}
	items := rankDeals(keys, stats, maxPct, bestFirst)
	urls := make([]string, len(items))
	for i, it := range items {
		urls[i] = it.url
	}
	return urls
}

type rankedDeal struct {
	url string
	pct float64 // signed deviation vs the mileage-adjusted median
	ok  bool    // false when there is not enough market data or the price is flagged
}

// rankDeals is the core of rankDealURLs. With a finite maxPct only unflagged cars with market data
// and pct <= maxPct are kept; with +Inf every car is kept.
func rankDeals(keys []db.CarPriceKey, stats *db.MarketIndex, maxPct float64, bestFirst bool) []rankedDeal {
	filter := !math.IsInf(maxPct, 1)
	items := make([]rankedDeal, 0, len(keys))
	for _, k := range keys {
		pct, flag, ok := marketDealPct(stats, k)
		ok = ok && flag == ""
		if filter && (!ok || pct > maxPct) {
			continue
		}
		items = append(items, rankedDeal{url: k.URL, pct: pct, ok: ok})
	}
	if bestFirst {
		sort.SliceStable(items, func(i, j int) bool {
			if items[i].ok != items[j].ok {
				return items[i].ok
			}
			return items[i].ok && items[i].pct < items[j].pct
		})
	}
	return items
}

type rankedDrop struct {
	key       db.CarPriceKey
	dropPct   float64
	changedAt time.Time
}

type rankedMotivated struct {
	key   db.CarPriceKey
	days  int
	drops int
	score int
}

func hasColumnSort(f db.FilterParams) bool {
	return f.SortPrice != "" || f.SortYear != "" || f.SortKm != "" || f.SortTitle != ""
}

func compareKeysByColumns(a, b db.CarPriceKey, f db.FilterParams) bool {
	if f.SortYear != "" && a.Year != b.Year {
		if f.SortYear == "asc" {
			return a.Year < b.Year
		}
		return a.Year > b.Year
	}
	if f.SortPrice != "" && a.Price != b.Price {
		if f.SortPrice == "asc" {
			return a.Price < b.Price
		}
		return a.Price > b.Price
	}
	if f.SortKm != "" && a.Km != b.Km {
		if f.SortKm == "asc" {
			return a.Km < b.Km
		}
		return a.Km > b.Km
	}
	return false
}

// rankCatalogURLs resolves deal, price-drop, and motivated-seller catalog filters/sorts.
func rankCatalogURLs(keys []db.CarPriceKey, stats *db.MarketIndex, onlyGood, onlyDrops, onlyMotivated, bestFirst bool, f db.FilterParams, now time.Time) []string {
	if onlyMotivated {
		motivated := make([]rankedMotivated, 0, len(keys))
		for _, k := range keys {
			days, drops, score, ok := qualifyingMotivated(stats, k, now)
			if !ok {
				continue
			}
			motivated = append(motivated, rankedMotivated{key: k, days: days, drops: drops, score: score})
		}
		if onlyDrops || onlyGood || bestFirst {
			filtered := make([]db.CarPriceKey, len(motivated))
			for i, m := range motivated {
				filtered[i] = m.key
			}
			return rankCatalogURLs(filtered, stats, onlyGood, onlyDrops, false, bestFirst, f, now)
		}
		if hasColumnSort(f) {
			sort.SliceStable(motivated, func(i, j int) bool {
				return compareKeysByColumns(motivated[i].key, motivated[j].key, f)
			})
		} else {
			sort.SliceStable(motivated, func(i, j int) bool {
				if motivated[i].score != motivated[j].score {
					return motivated[i].score > motivated[j].score
				}
				if motivated[i].drops != motivated[j].drops {
					return motivated[i].drops > motivated[j].drops
				}
				return motivated[i].days > motivated[j].days
			})
		}
		urls := make([]string, len(motivated))
		for i, m := range motivated {
			urls[i] = m.key.URL
		}
		return urls
	}

	if !onlyDrops {
		return rankDealURLs(keys, stats, onlyGood, bestFirst)
	}

	drops := make([]rankedDrop, 0, len(keys))
	for _, k := range keys {
		_, pct, changedAt, ok := qualifyingPriceDrop(stats, k)
		if !ok {
			continue
		}
		drops = append(drops, rankedDrop{key: k, dropPct: pct, changedAt: changedAt})
	}

	if onlyGood || bestFirst {
		filtered := make([]db.CarPriceKey, len(drops))
		for i, d := range drops {
			filtered[i] = d.key
		}
		return rankDealURLs(filtered, stats, onlyGood, bestFirst)
	}

	if hasColumnSort(f) {
		sort.SliceStable(drops, func(i, j int) bool {
			return compareKeysByColumns(drops[i].key, drops[j].key, f)
		})
	} else {
		sort.SliceStable(drops, func(i, j int) bool {
			if !drops[i].changedAt.Equal(drops[j].changedAt) {
				return drops[i].changedAt.After(drops[j].changedAt)
			}
			return drops[i].dropPct > drops[j].dropPct
		})
	}

	urls := make([]string, len(drops))
	for i, d := range drops {
		urls[i] = d.key.URL
	}
	return urls
}

// maxBargains caps the Gangas tab.
const maxBargains = 50

// Bargain is one entry of /api/bargains. Same market reference as the badges: MarketPrice is the
// mileage-adjusted median (car.MarketExpected) and DiscountPercent = -pct.
type Bargain struct {
	Car             CarWithMarket `json:"car"`
	MarketPrice     int           `json:"marketPrice"`
	DiscountPercent float64       `json:"discountPercent"`
}

// HandleBargains serves the Gangas tab: active listings with a "Gran precio" badge
// (pct <= greatDealMaxPct vs the mileage-adjusted median), biggest discount first.
func (s *Server) HandleBargains(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stats := s.getMarketStats()
	active := false
	keys, err := s.DB.GetCarPriceKeys(db.FilterParams{IsSold: &active, ExcludeURLs: stats.ActiveDuplicateURLs()})
	if err != nil {
		log.Printf("[API ERROR] GetCarPriceKeys (bargains) failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to fetch bargains")
		return
	}
	ranked := rankDeals(keys, stats, greatDealMaxPct, true)
	if len(ranked) > maxBargains {
		ranked = ranked[:maxBargains]
	}

	bargains := []Bargain{}
	if len(ranked) > 0 {
		urls := make([]string, len(ranked))
		for i, it := range ranked {
			urls[i] = it.url
		}
		loaded, err := s.DB.GetCarsByURLs(urls)
		if err != nil {
			log.Printf("[API ERROR] GetCarsByURLs (bargains) failed: %v", err)
			respondError(w, http.StatusInternalServerError, "Failed to fetch bargains")
			return
		}
		cars := s.withMarket(orderCarsByURLs(loaded, urls))
		pctByURL := make(map[string]float64, len(ranked))
		for _, it := range ranked {
			pctByURL[it.url] = it.pct
		}
		for _, c := range cars {
			bargains = append(bargains, Bargain{Car: c, MarketPrice: c.MarketExpected, DiscountPercent: -pctByURL[c.URL]})
		}
	}
	if err := json.NewEncoder(w).Encode(bargains); err != nil {
		log.Printf("[API ERROR] Failed to encode bargains response: %v", err)
	}
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

// serveDealCars answers /api/cars when deal=good, priceDrop=true, motivated=true, and/or sortDeal=best:
// it evaluates matching cars against market/history signals, then loads only the requested page.
func (s *Server) serveDealCars(w http.ResponseWriter, f db.FilterParams, onlyGood, onlyDrops, onlyMotivated, bestFirst bool) {
	keys, err := s.DB.GetCarPriceKeys(f)
	if err != nil {
		log.Printf("[API ERROR] GetCarPriceKeys failed: %v", err)
		respondError(w, http.StatusInternalServerError, "Failed to fetch cars")
		return
	}
	urls := rankCatalogURLs(keys, s.getMarketStats(), onlyGood, onlyDrops, onlyMotivated, bestFirst, f, time.Now())
	page := pageOfURLs(urls, f.Offset, f.Limit)

	cars := []db.Car{}
	if len(page) > 0 {
		loaded, err := s.DB.GetCarsByURLs(page)
		if err != nil {
			log.Printf("[API ERROR] GetCarsByURLs failed: %v", err)
			respondError(w, http.StatusInternalServerError, "Failed to fetch cars")
			return
		}
		cars = orderCarsByURLs(loaded, page)
	}

	w.Header().Set("X-Total-Count", strconv.Itoa(len(urls)))
	w.Header().Set("Access-Control-Expose-Headers", "X-Total-Count")
	if err := json.NewEncoder(w).Encode(s.withMarket(cars)); err != nil {
		log.Printf("[API ERROR] Failed to encode deal cars response: %v", err)
	}
}
