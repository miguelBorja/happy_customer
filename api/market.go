package api

import (
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"crautosdb/db"
	"crautosdb/thumbs"
)

var marketCache struct {
	sync.Mutex
	stats    *db.MarketIndex
	loadedAt time.Time
}

// CarWithMarket adds the market reference to a car. MarketExpected is the median adjusted to the
// car's mileage; the deal badges (and sortDeal/deal=good) compare the price against it.
type CarWithMarket struct {
	db.Car
	MarketMedian      int    `json:"MarketMedian,omitempty"`
	MarketCount       int    `json:"MarketCount,omitempty"`
	MarketExpected    int    `json:"MarketExpected,omitempty"`
	MarketP25         int    `json:"MarketP25,omitempty"`
	MarketP75         int    `json:"MarketP75,omitempty"`
	MarketMedianKm    int    `json:"MarketMedianKm,omitempty"`
	SellerActiveCount int    `json:"SellerActiveCount,omitempty"`
	ThumbURL          string `json:"ThumbURL,omitempty"`
	// MarketFlag ("typo", "outlier", "condition", "debt") means "check the price": the badge
	// shows a warning instead of a deal level (see dealFlag in deals.go).
	MarketFlag     string     `json:"MarketFlag,omitempty"`
	PricePrevious  int        `json:"PricePrevious,omitempty"`
	PriceInitial   int        `json:"PriceInitial,omitempty"`
	PriceChangedAt *time.Time `json:"PriceChangedAt,omitempty"`
	PriceChanges   int        `json:"PriceChanges,omitempty"`
	PriceDrops     int        `json:"PriceDrops,omitempty"`
}

func (s *Server) getMarketStats() *db.MarketIndex {
	marketCache.Lock()
	defer marketCache.Unlock()

	if marketCache.stats != nil && time.Since(marketCache.loadedAt) < 15*time.Minute {
		return marketCache.stats
	}

	stats, err := s.DB.GetAllMarketStats()
	if err != nil {
		log.Printf("[API ERROR] GetMarketStats failed: %v", err)
		return marketCache.stats
	}

	marketCache.stats = stats
	marketCache.loadedAt = time.Now()
	return marketCache.stats
}

func (s *Server) withMarket(cars []db.Car) []CarWithMarket {
	result := make([]CarWithMarket, 0, len(cars))
	if len(cars) == 0 {
		return result
	}

	stats := s.getMarketStats()
	thumbsBase := strings.TrimRight(strings.TrimSpace(os.Getenv("THUMBS_PUBLIC_BASE")), "/")
	for _, car := range cars {
		cwm := CarWithMarket{
			Car:               car,
			SellerActiveCount: stats.SellerActiveCount(car.URL),
		}
		if thumbsBase != "" && car.ThumbStatus == db.ThumbStored {
			if id := thumbs.CarID(car.URL); id != "" {
				cwm.ThumbURL = thumbsBase + "/" + id + ".jpg"
			}
		}
		if ref, ok := stats.Lookup(car.Brand, car.Model, car.Year, car.Kilometraje); ok {
			cwm.MarketMedian = ref.Median
			cwm.MarketCount = ref.Count
			cwm.MarketExpected = ref.Expected
			cwm.MarketP25 = ref.ExpectedP25
			cwm.MarketP75 = ref.ExpectedP75
			cwm.MarketMedianKm = ref.MedianKm
			// Same key and rules as sortDeal / deal=good / Gangas.
			_, cwm.MarketFlag, _ = marketDealPct(stats, db.CarPriceKey{
				URL: car.URL, Brand: car.Brand, Model: car.Model, Year: car.Year, Price: car.Price, Km: car.Kilometraje,
			})
		}
		if pc, ok := stats.PriceChangeOf(car.URL); ok && pc.CurrentPrice == car.Price && cwm.MarketFlag != flagTypo {
			if pc.PreviousPrice > 0 && pc.PreviousPrice != car.Price {
				changedAt := pc.ChangedAt
				cwm.PricePrevious = pc.PreviousPrice
				cwm.PriceInitial = pc.InitialPrice
				cwm.PriceChangedAt = &changedAt
				cwm.PriceChanges = pc.Changes
			}
			if pc.Drops > 0 && pc.InitialPrice > car.Price && !db.IsTypoPrice(car.Price, pc.InitialPrice) {
				cwm.PriceDrops = pc.Drops
				if cwm.PriceInitial == 0 {
					cwm.PriceInitial = pc.InitialPrice
				}
			}
		}
		result = append(result, cwm)
	}
	return result
}
