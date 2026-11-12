package api

import (
	"log"
	"sync"
	"time"

	"crautosdb/db"
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
	MarketMedian   int `json:"MarketMedian,omitempty"`
	MarketCount    int `json:"MarketCount,omitempty"`
	MarketExpected int `json:"MarketExpected,omitempty"`
	MarketMedianKm int `json:"MarketMedianKm,omitempty"`
	// MarketFlag ("typo", "outlier", "condition", "debt") means "check the price": the badge
	// shows a warning instead of a deal level (see dealFlag in deals.go).
	MarketFlag     string     `json:"MarketFlag,omitempty"`
	PricePrevious  int        `json:"PricePrevious,omitempty"`
	PriceInitial   int        `json:"PriceInitial,omitempty"`
	PriceChangedAt *time.Time `json:"PriceChangedAt,omitempty"`
	PriceChanges   int        `json:"PriceChanges,omitempty"`
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
	for _, car := range cars {
		cwm := CarWithMarket{Car: car}
		if ref, ok := stats.Lookup(car.Brand, car.Model, car.Year, car.Kilometraje); ok {
			cwm.MarketMedian = ref.Median
			cwm.MarketCount = ref.Count
			cwm.MarketExpected = ref.Expected
			cwm.MarketMedianKm = ref.MedianKm
			// Same key and rules as sortDeal / deal=good / Gangas.
			_, cwm.MarketFlag, _ = marketDealPct(stats, db.CarPriceKey{
				URL: car.URL, Brand: car.Brand, Model: car.Model, Year: car.Year, Price: car.Price, Km: car.Kilometraje,
			})
		}
		if pc, ok := stats.PriceChangeOf(car.URL); ok && pc.CurrentPrice == car.Price && pc.PreviousPrice > 0 && pc.PreviousPrice != car.Price && cwm.MarketFlag != flagTypo {
			changedAt := pc.ChangedAt
			cwm.PricePrevious = pc.PreviousPrice
			cwm.PriceInitial = pc.InitialPrice
			cwm.PriceChangedAt = &changedAt
			cwm.PriceChanges = pc.Changes
		}
		result = append(result, cwm)
	}
	return result
}
