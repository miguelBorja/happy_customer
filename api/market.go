package api

import (
	"log"
	"sync"
	"time"

	"crautosdb/db"
)

var marketCache struct {
	sync.Mutex
	stats    map[string]db.MarketStat
	loadedAt time.Time
}

type CarWithMarket struct {
	db.Car
	MarketMedian int `json:"MarketMedian,omitempty"`
	MarketCount  int `json:"MarketCount,omitempty"`
}

func (s *Server) getMarketStats() map[string]db.MarketStat {
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
		if stats != nil {
			key := db.MarketKey(car.Brand, car.Model, car.Year)
			if stat, ok := stats[key]; ok {
				cwm.MarketMedian = stat.Median
				cwm.MarketCount = stat.Count
			}
		}
		result = append(result, cwm)
	}
	return result
}
