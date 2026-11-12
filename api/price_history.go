package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"crautosdb/db"
)

// HandlePriceHistory serves GET /api/cars/price-history?url=<encoded>, returning the cleaned
// price timeline (oldest first) for a listing.
func (s *Server) HandlePriceHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	carURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if carURL == "" {
		http.Error(w, "missing url parameter", http.StatusBadRequest)
		return
	}

	points, err := s.DB.GetPriceHistory(carURL)
	if err != nil {
		log.Printf("[API ERROR] GetPriceHistory failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	expected := 0
	if cars, err := s.DB.GetCarsByURLs([]string{carURL}); err == nil && len(cars) == 1 {
		if ref, ok := s.getMarketStats().Lookup(cars[0].Brand, cars[0].Model, cars[0].Year, cars[0].Kilometraje); ok {
			expected = ref.Expected
		}
	}

	clean := db.CleanPriceHistory(points, expected)
	if clean == nil {
		clean = []db.PricePoint{}
	}
	json.NewEncoder(w).Encode(clean)
}
