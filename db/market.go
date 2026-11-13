package db

import (
	"database/sql"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// MarketStat summarizes the comparable listings (active + sold) of one brand/model/year.
type MarketStat struct {
	Median   int
	P25      int
	P75      int
	Count    int
	MedianKm int // median mileage of the comparables with a known mileage (0 = unknown)
	KmCount  int // comparables with a known mileage
}

// MarketIndex holds the per-group stats plus the mileage adjustment learned from the whole catalog.
type MarketIndex struct {
	Groups map[string]MarketStat
	// KmSlope is the change in log(price) per 10,000 km above the group's median mileage
	// (always ≤ 0). Example: -0.02 ≈ -2% of value for every extra 10k km.
	KmSlope float64
	// KmSamples is how many listings were used to fit KmSlope (0 = no adjustment).
	KmSamples int
	// TextFlags maps a listing URL to TextFlagCondition / TextFlagDebt when its comment explains
	// a low price (see market_flags.go). Listings without a flag are absent.
	TextFlags map[string]string
	// DuplicateURLs holds the sorted URLs of active listings that duplicate a newer active
	// listing of the same physical car (see dedup.go). Sold duplicates are not included.
	DuplicateURLs []string
	// PriceChanges maps a listing URL to its cleaned price-change summary (listings with >=2 distinct prices).
	PriceChanges map[string]PriceChange
	// SellerCounts maps a listing URL to the number of unique active listings by the same seller.
	SellerCounts map[string]int
}

// TextFlag returns the comment-based flag of a listing ("" when none).
func (m *MarketIndex) TextFlag(url string) string {
	if m == nil || m.TextFlags == nil {
		return ""
	}
	return m.TextFlags[url]
}

// ActiveDuplicateURLs returns the sorted URLs of active listings that duplicate a newer
// active listing of the same physical car.
func (m *MarketIndex) ActiveDuplicateURLs() []string {
	if m == nil {
		return nil
	}
	return m.DuplicateURLs
}

// PriceChangeOf returns the cached price-change summary for a listing URL, if any.
func (m *MarketIndex) PriceChangeOf(url string) (PriceChange, bool) {
	if m == nil || m.PriceChanges == nil {
		return PriceChange{}, false
	}
	pc, ok := m.PriceChanges[url]
	return pc, ok
}

// SellerActiveCount returns the number of unique active listings by the listing's seller (0 when unknown).
func (m *MarketIndex) SellerActiveCount(url string) int {
	if m == nil || m.SellerCounts == nil {
		return 0
	}
	return m.SellerCounts[url]
}

// MarketRef is the market reference for one specific listing.
type MarketRef struct {
	Median      int // plain median of the group
	P25         int
	P75         int
	Count       int
	MedianKm    int // typical mileage of the group (0 = unknown)
	Expected    int // median adjusted to this listing's mileage (== Median when not adjustable)
	ExpectedP25 int
	ExpectedP75 int
}

// Mileage-adjustment parameters.
const (
	maxValidKm           = 1_000_000 // ignore obvious typos
	minKmComparables     = 3         // comparables with known mileage needed to adjust a group
	minFitGroupSize      = 4         // only groups with this many comparables feed the slope fit
	minKmFitSamples      = 50        // below this the slope is not trusted (no adjustment)
	kmMaxDelta           = 10.0      // clamp |km - medianKm| to 100k km (fit and adjustment): the effect flattens beyond
	kmFitMaxLogDev       = 0.7       // clamp |log(price/median)| (≈ -50%/+100%) when fitting
	kmSlopeMin           = -0.05     // at most -5% per 10k km
	kmAdjustMaxDeviation = 0.25      // the adjusted median stays within ±25% of the plain median
)

func MarketKey(brand, model string, year int) string {
	return strings.ToLower(strings.TrimSpace(brand)) + "|" + strings.ToLower(strings.TrimSpace(model)) + "|" + strconv.Itoa(year)
}

func validKm(km int) bool { return km > 0 && km <= maxValidKm }

func medianInt(sorted []int) int {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	if n%2 == 1 {
		return sorted[n/2]
	}
	return int(math.Round(float64(sorted[n/2-1]+sorted[n/2]) / 2.0))
}

func percentileInt(sorted []int, p float64) int {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	if n == 1 {
		return sorted[0]
	}
	pos := p * float64(n-1)
	lo := int(math.Floor(pos))
	hi := int(math.Ceil(pos))
	if lo == hi {
		return sorted[lo]
	}
	frac := pos - float64(lo)
	return int(math.Round(float64(sorted[lo])*(1-frac) + float64(sorted[hi])*frac))
}

// Lookup returns the market reference for a listing, adjusting the group median and percentiles
// to the listing's mileage. ok is false when the group is unknown.
func (m *MarketIndex) Lookup(brand, model string, year, km int) (MarketRef, bool) {
	if m == nil || m.Groups == nil {
		return MarketRef{}, false
	}
	stat, ok := m.Groups[MarketKey(brand, model, year)]
	if !ok {
		return MarketRef{}, false
	}
	ref := MarketRef{
		Median:      stat.Median,
		P25:         stat.P25,
		P75:         stat.P75,
		Count:       stat.Count,
		MedianKm:    stat.MedianKm,
		Expected:    stat.Median,
		ExpectedP25: stat.P25,
		ExpectedP75: stat.P75,
	}
	if m.KmSlope < 0 && validKm(km) && stat.MedianKm > 0 && stat.KmCount >= minKmComparables && stat.Median > 0 {
		factor := kmAdjustFactor(m.KmSlope, km, stat.MedianKm)
		ref.Expected = int(math.Round(float64(stat.Median) * factor))
		if stat.P25 > 0 {
			ref.ExpectedP25 = int(math.Round(float64(stat.P25) * factor))
		}
		if stat.P75 > 0 {
			ref.ExpectedP75 = int(math.Round(float64(stat.P75) * factor))
		}
	}
	return ref, true
}

// KmAdjustFactor exposes the mileage adjustment multiplier for a listing with km vs. medianKm.
func (m *MarketIndex) KmAdjustFactor(km, medianKm int) float64 {
	if m == nil || m.KmSlope >= 0 || !validKm(km) || medianKm <= 0 {
		return 1.0
	}
	return kmAdjustFactor(m.KmSlope, km, medianKm)
}

// kmAdjustFactor is the multiplier applied to the group median for a listing with km kilometers.
func kmAdjustFactor(slope float64, km, medianKm int) float64 {
	dx := math.Max(-kmMaxDelta, math.Min(kmMaxDelta, float64(km-medianKm)/10000.0))
	f := math.Exp(slope * dx)
	return math.Max(1-kmAdjustMaxDeviation, math.Min(1+kmAdjustMaxDeviation, f))
}

type marketSample struct {
	price, km int
	textFlag  string
}

// filterCleanSamples removes obvious price typos and text-flagged cars priced well below the
// group's seed median, so a damaged/parts/debt listing cannot drag the median down.
func filterCleanSamples(samples []marketSample) []marketSample {
	seedPrices := make([]int, 0, len(samples))
	for _, s := range samples {
		if s.price > 0 && s.textFlag == "" {
			seedPrices = append(seedPrices, s.price)
		}
	}
	if len(seedPrices) == 0 {
		for _, s := range samples {
			if s.price > 0 {
				seedPrices = append(seedPrices, s.price)
			}
		}
	}
	sort.Ints(seedPrices)
	seed := medianInt(seedPrices)
	if seed <= 0 {
		return samples
	}
	clean := make([]marketSample, 0, len(samples))
	for _, s := range samples {
		if IsTypoPrice(s.price, seed) {
			continue
		}
		if s.textFlag != "" && float64(s.price-seed)/float64(seed)*100 <= FlaggedExcludeMaxPct {
			continue
		}
		clean = append(clean, s)
	}
	if len(clean) == 0 {
		return samples
	}
	return clean
}

// buildMarketIndex groups the samples by key, computes medians and fits the mileage slope.
func buildMarketIndex(groups map[string][]marketSample) *MarketIndex {
	idx := &MarketIndex{Groups: make(map[string]MarketStat, len(groups))}

	// Pooled within-group regression of log(price/median) on (km - medianKm)/10k.
	var sx, sy, sxx, sxy float64
	var n int

	for k, samples := range groups {
		clean := filterCleanSamples(samples)
		prices := make([]int, 0, len(clean))
		kms := make([]int, 0, len(clean))
		for _, s := range clean {
			prices = append(prices, s.price)
			if validKm(s.km) {
				kms = append(kms, s.km)
			}
		}
		sort.Ints(prices)
		sort.Ints(kms)
		stat := MarketStat{
			Median:   medianInt(prices),
			P25:      percentileInt(prices, 0.25),
			P75:      percentileInt(prices, 0.75),
			Count:    len(prices),
			MedianKm: medianInt(kms),
			KmCount:  len(kms),
		}
		idx.Groups[k] = stat

		if stat.Count < minFitGroupSize || stat.KmCount < minKmComparables || stat.Median <= 0 {
			continue
		}
		for _, s := range clean {
			if !validKm(s.km) || s.price <= 0 {
				continue
			}
			x := math.Max(-kmMaxDelta, math.Min(kmMaxDelta, float64(s.km-stat.MedianKm)/10000.0))
			y := math.Max(-kmFitMaxLogDev, math.Min(kmFitMaxLogDev, math.Log(float64(s.price)/float64(stat.Median))))
			sx += x
			sy += y
			sxx += x * x
			sxy += x * y
			n++
		}
	}

	if n >= minKmFitSamples {
		fn := float64(n)
		den := sxx - sx*sx/fn
		if den > 0 {
			slope := (sxy - sx*sy/fn) / den
			idx.KmSlope = math.Max(kmSlopeMin, math.Min(0, slope))
			idx.KmSamples = n
		}
	}
	return idx
}

func normSellerName(name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	switch n {
	case "", "-", "--", "nd", "n/a", "no indica":
		return ""
	}
	return n
}

// GetAllMarketStats builds the market index (median price per brand/model/year over active and
// sold listings, plus the mileage adjustment, comment-based flags, and seller active counts).
func (d *DB) GetAllMarketStats() (*MarketIndex, error) {
	q := `SELECT url, COALESCE(title, ''), brand, model, year, price, COALESCE(kilometraje, 0),
		COALESCE(placa, ''), COALESCE(color_exterior, ''), COALESCE(seller_name, ''), COALESCE(seller_phone, ''),
		COALESCE(comment, ''), COALESCE(is_sold, 0)
	FROM cars
	WHERE price > 0 AND brand != '' AND model != ''
	ORDER BY is_sold ASC, scraped_at DESC, url DESC`
	rows, err := d.Query(d.queryFormat(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type carLookupKey struct {
		brand, model string
		year, km     int
	}
	type sellerRef struct {
		phones []string
		name   string
	}

	groups := make(map[string][]marketSample)
	textFlags := make(map[string]string)
	carKeys := make(map[string]carLookupKey)
	seen := make(map[string][]dedupCandidate)
	sellerRefs := make(map[string]sellerRef)
	phoneActiveCount := make(map[string]int)
	nameActiveCount := make(map[string]int)
	var dupURLs []string
	for rows.Next() {
		var url, title, brand, model, placa, color, sellerName, sellerPhone, comment string
		var year, price, km, isSold int
		if err := rows.Scan(&url, &title, &brand, &model, &year, &price, &km, &placa, &color, &sellerName, &sellerPhone, &comment, &isSold); err != nil {
			return nil, err
		}
		carKeys[url] = carLookupKey{brand: brand, model: model, year: year, km: km}
		tf := DetectTextFlag(comment)
		if tf != "" {
			textFlags[url] = tf
		}

		cand := newDedupCandidate(url, title, brand, model, price, km, placa, color, sellerPhone)
		sName := normSellerName(sellerName)
		sellerRefs[url] = sellerRef{phones: cand.phones, name: sName}

		k := MarketKey(brand, model, year)
		dup := false
		for _, prev := range seen[k] {
			if samePhysicalCar(prev, cand) {
				dup = true
				break
			}
		}
		if dup {
			if isSold == 0 {
				dupURLs = append(dupURLs, url)
			}
			continue
		}
		seen[k] = append(seen[k], cand)
		groups[k] = append(groups[k], marketSample{price: price, km: km, textFlag: tf})
		if isSold == 0 {
			for _, p := range cand.phones {
				phoneActiveCount[p]++
			}
			if sName != "" {
				nameActiveCount[sName]++
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sort.Strings(dupURLs)
	idx := buildMarketIndex(groups)
	idx.TextFlags = textFlags
	idx.DuplicateURLs = dupURLs

	if len(sellerRefs) > 0 {
		idx.SellerCounts = make(map[string]int, len(sellerRefs))
		for u, ref := range sellerRefs {
			best := 0
			if ref.name != "" && nameActiveCount[ref.name] > best {
				best = nameActiveCount[ref.name]
			}
			for _, p := range ref.phones {
				if phoneActiveCount[p] > best {
					best = phoneActiveCount[p]
				}
			}
			if best > 0 {
				idx.SellerCounts[u] = best
			}
		}
	}

	if histories, err := d.GetChangedPriceHistories(); err != nil {
		log.Printf("Warning: GetChangedPriceHistories failed: %v", err)
	} else if len(histories) > 0 {
		idx.PriceChanges = make(map[string]PriceChange, len(histories))
		for u, pts := range histories {
			expected := 0
			if ck, ok := carKeys[u]; ok {
				if ref, ok := idx.Lookup(ck.brand, ck.model, ck.year, ck.km); ok {
					expected = ref.Expected
				}
			}
			if pc, ok := SummarizePriceHistory(pts, expected); ok {
				idx.PriceChanges[u] = pc
			}
		}
	}

	return idx, nil
}

// ValuationDBSummary aggregates inventory liquidity, price bounds and top active comparables
// for a brand/model over a year range.
type ValuationDBSummary struct {
	ActiveCount      int
	SoldCount        int
	MinPrice         int
	MaxPrice         int
	MedianDaysListed int
	ComparableURLs   []string
}

// GetValuationSummary queries active and sold cars for brand/model within [yearMin, yearMax],
// excluding duplicate URLs, and returns summary liquidity metrics plus up to 6 comparable active URLs.
func (d *DB) GetValuationSummary(brand, model string, yearMin, yearMax int, excludeURLs []string) (ValuationDBSummary, error) {
	q := `SELECT url, COALESCE(year, 0), COALESCE(price, 0), COALESCE(is_sold, 0), scraped_at, sold_at
		FROM cars
		WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?) AND year >= ? AND year <= ?`
	rows, err := d.Query(d.queryFormat(q), brand, model, yearMin, yearMax)
	if err != nil {
		return ValuationDBSummary{}, err
	}
	defer rows.Close()

	excludeSet := make(map[string]struct{}, len(excludeURLs))
	for _, u := range excludeURLs {
		excludeSet[u] = struct{}{}
	}

	type activeCand struct {
		url       string
		year      int
		price     int
		scrapedAt time.Time
	}

	var summary ValuationDBSummary
	var rawPrices []int
	var soldDays []int
	var activeDays []int
	var activeCands []activeCand
	now := time.Now()

	for rows.Next() {
		var u string
		var yr, price, isSold int
		var scrapedAtStr, soldAtStr sql.NullString
		if err := rows.Scan(&u, &yr, &price, &isSold, &scrapedAtStr, &soldAtStr); err != nil {
			return ValuationDBSummary{}, err
		}
		if _, excluded := excludeSet[u]; excluded {
			continue
		}

		scrapedAt := parseTimeHelper(scrapedAtStr)
		soldAt := parseTimeHelper(soldAtStr)

		if isSold == 1 {
			summary.SoldCount++
			if !scrapedAt.IsZero() && !soldAt.IsZero() && !soldAt.Before(scrapedAt) {
				days := int(math.Round(soldAt.Sub(scrapedAt).Hours() / 24.0))
				if days < 0 {
					days = 0
				}
				soldDays = append(soldDays, days)
			}
		} else {
			summary.ActiveCount++
			if !scrapedAt.IsZero() {
				days := int(math.Round(now.Sub(scrapedAt).Hours() / 24.0))
				if days < 0 {
					days = 0
				}
				activeDays = append(activeDays, days)
			}
			if price > 0 {
				activeCands = append(activeCands, activeCand{url: u, year: yr, price: price, scrapedAt: scrapedAt})
			}
		}

		if price > 0 {
			rawPrices = append(rawPrices, price)
		}
	}
	if err := rows.Err(); err != nil {
		return ValuationDBSummary{}, err
	}

	seed := 0
	if len(rawPrices) > 0 {
		sort.Ints(rawPrices)
		seed = medianInt(rawPrices)
		cleanPrices := make([]int, 0, len(rawPrices))
		for _, p := range rawPrices {
			if !IsTypoPrice(p, seed) {
				cleanPrices = append(cleanPrices, p)
			}
		}
		if len(cleanPrices) == 0 {
			cleanPrices = rawPrices
		}
		summary.MinPrice = cleanPrices[0]
		summary.MaxPrice = cleanPrices[len(cleanPrices)-1]
	}

	if len(soldDays) >= 3 {
		sort.Ints(soldDays)
		summary.MedianDaysListed = medianInt(soldDays)
	} else if len(activeDays) > 0 {
		sort.Ints(activeDays)
		summary.MedianDaysListed = medianInt(activeDays)
	} else if len(soldDays) > 0 {
		sort.Ints(soldDays)
		summary.MedianDaysListed = medianInt(soldDays)
	}

	targetYear := (yearMin + yearMax) / 2
	filteredActive := make([]activeCand, 0, len(activeCands))
	for _, c := range activeCands {
		if seed > 0 && IsTypoPrice(c.price, seed) {
			continue
		}
		filteredActive = append(filteredActive, c)
	}
	sort.Slice(filteredActive, func(i, j int) bool {
		di := absInt(filteredActive[i].year - targetYear)
		dj := absInt(filteredActive[j].year - targetYear)
		if di != dj {
			return di < dj
		}
		if !filteredActive[i].scrapedAt.Equal(filteredActive[j].scrapedAt) {
			return filteredActive[i].scrapedAt.After(filteredActive[j].scrapedAt)
		}
		return filteredActive[i].url < filteredActive[j].url
	})
	if len(filteredActive) > 6 {
		filteredActive = filteredActive[:6]
	}
	summary.ComparableURLs = make([]string, len(filteredActive))
	for i, c := range filteredActive {
		summary.ComparableURLs[i] = c.url
	}

	return summary, nil
}
