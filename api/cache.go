package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"crautosdb/db"
)

const defaultCacheTTL = 5 * time.Minute

// ErrorResponse is the standardized JSON error body returned by the API.
type ErrorResponse struct {
	Error string `json:"error"`
	Code  int    `json:"code"`
}

func respondError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(ErrorResponse{
		Error: message,
		Code:  code,
	})
}

// serverCache holds the TTL-cached static lists and aggregate stats. Its zero value is ready
// to use, so a plain &Server{DB: database} works without a constructor.
type serverCache struct {
	mu sync.Mutex

	brands         []string
	brandsLoadedAt time.Time

	provinces         []string
	provincesLoadedAt time.Time

	sellers         []string
	sellersLoadedAt time.Time

	statsTotal    int
	statsActive   int
	statsSold     int
	statsVisits   int
	statsLoadedAt time.Time

	detailedStats         db.DetailedStats
	detailedStatsLoadedAt time.Time
}

func (s *Server) cacheTTL() time.Duration {
	if s.CacheTTL <= 0 {
		return defaultCacheTTL
	}
	return s.CacheTTL
}

func (s *Server) getBrands() ([]string, error) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.brandsLoadedAt.IsZero() && time.Since(s.cache.brandsLoadedAt) < s.cacheTTL() {
		return s.cache.brands, nil
	}

	rows, err := s.DB.Query(`SELECT DISTINCT brand FROM cars WHERE brand != '' ORDER BY brand ASC`)
	if err != nil {
		return nil, err
	}

	brands := []string{}
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			rows.Close()
			return nil, err
		}
		brands = append(brands, b)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	s.cache.brands = brands
	s.cache.brandsLoadedAt = time.Now()
	return brands, nil
}

func (s *Server) getProvinces() ([]string, error) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.provincesLoadedAt.IsZero() && time.Since(s.cache.provincesLoadedAt) < s.cacheTTL() {
		return s.cache.provinces, nil
	}

	rows, err := s.DB.Query(`SELECT DISTINCT provincia FROM cars WHERE provincia != '' AND provincia IS NOT NULL ORDER BY provincia ASC`)
	if err != nil {
		return nil, err
	}

	provinces := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return nil, err
		}
		provinces = append(provinces, p)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	s.cache.provinces = provinces
	s.cache.provincesLoadedAt = time.Now()
	return provinces, nil
}

func (s *Server) getTopSellers() ([]string, error) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.sellersLoadedAt.IsZero() && time.Since(s.cache.sellersLoadedAt) < s.cacheTTL() {
		return s.cache.sellers, nil
	}

	sellers, err := s.DB.GetTopSellers()
	if err != nil {
		return nil, err
	}
	if sellers == nil {
		sellers = []string{}
	}

	s.cache.sellers = sellers
	s.cache.sellersLoadedAt = time.Now()
	return sellers, nil
}

func (s *Server) getSummaryStats() (map[string]int, error) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.statsLoadedAt.IsZero() && time.Since(s.cache.statsLoadedAt) < s.cacheTTL() {
		return map[string]int{
			"total":  s.cache.statsTotal,
			"active": s.cache.statsActive,
			"sold":   s.cache.statsSold,
			"visits": s.cache.statsVisits,
		}, nil
	}

	var total, active, sold int
	err := s.DB.QueryRow(`SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_sold = 0 THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN is_sold = 1 THEN 1 ELSE 0 END), 0) FROM cars`).Scan(&total, &active, &sold)
	if err != nil {
		return nil, err
	}

	visits, err := s.DB.GetTotalVisits()
	if err != nil {
		log.Printf("[API ERROR] Failed to get total visits: %v", err)
		visits = 0
	}

	s.cache.statsTotal = total
	s.cache.statsActive = active
	s.cache.statsSold = sold
	s.cache.statsVisits = visits
	s.cache.statsLoadedAt = time.Now()

	return map[string]int{
		"total":  total,
		"active": active,
		"sold":   sold,
		"visits": visits,
	}, nil
}

func (s *Server) incrementCachedVisits() {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.statsLoadedAt.IsZero() {
		s.cache.statsVisits++
	}
}

func (s *Server) getDetailedStats() (db.DetailedStats, error) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if !s.cache.detailedStatsLoadedAt.IsZero() && time.Since(s.cache.detailedStatsLoadedAt) < s.cacheTTL() {
		return s.cache.detailedStats, nil
	}

	stats, err := s.DB.GetDetailedStats()
	if err != nil {
		return stats, err
	}

	s.cache.detailedStats = stats
	s.cache.detailedStatsLoadedAt = time.Now()
	return stats, nil
}
