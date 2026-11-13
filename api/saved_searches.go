package api

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxDigestSearches = 15

// SearchDigestRequestItem represents one saved search to summarize.
type SearchDigestRequestItem struct {
	ID    string `json:"id"`
	Query string `json:"query"`
	Since string `json:"since"`
}

// SearchDigestResult summarizes matching listings, new listings and price drops since a timestamp.
type SearchDigestResult struct {
	ID         string `json:"id"`
	TotalCount int    `json:"totalCount"`
	NewCount   int    `json:"newCount"`
	DropCount  int    `json:"dropCount"`
}

// HandleSearchesDigest accepts up to 15 saved filter queries and returns total, new and drop counts.
func (s *Server) HandleSearchesDigest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var body struct {
		Searches []SearchDigestRequestItem `json:"searches"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	items := body.Searches
	if len(items) > maxDigestSearches {
		items = items[:maxDigestSearches]
	}

	stats := s.getMarketStats()
	results := make([]SearchDigestResult, 0, len(items))

	for _, item := range items {
		rawQuery := strings.TrimPrefix(strings.TrimSpace(item.Query), "?")
		q, _ := url.ParseQuery(rawQuery)
		f := parseFilterQuery(q)
		if q.Get("isSold") == "" {
			active := false
			f.IsSold = &active
		}
		if stats != nil {
			f.ExcludeURLs = stats.ActiveDuplicateURLs()
		}

		keys, err := s.DB.GetCarPriceKeys(f)
		if err != nil {
			log.Printf("[API ERROR] GetCarPriceKeys (digest %s) failed: %v", item.ID, err)
			respondError(w, http.StatusInternalServerError, "Failed to compute search digest")
			return
		}

		onlyGood := q.Get("deal") == "good"
		onlyDrops := q.Get("priceDrop") == "true"
		if onlyGood || onlyDrops {
			allowedURLs := rankDealAndDropURLs(keys, stats, onlyGood, onlyDrops, false, f)
			allowedSet := make(map[string]struct{}, len(allowedURLs))
			for _, u := range allowedURLs {
				allowedSet[u] = struct{}{}
			}
			filtered := keys[:0]
			for _, k := range keys {
				if _, ok := allowedSet[k.URL]; ok {
					filtered = append(filtered, k)
				}
			}
			keys = filtered
		}

		res := SearchDigestResult{
			ID:         item.ID,
			TotalCount: len(keys),
		}

		if sinceStr := strings.TrimSpace(item.Since); sinceStr != "" {
			if sinceTime, err := time.Parse(time.RFC3339, sinceStr); err == nil {
				for _, k := range keys {
					if !k.ScrapedAt.IsZero() && k.ScrapedAt.After(sinceTime) {
						res.NewCount++
					}
					if _, _, changedAt, ok := qualifyingPriceDrop(stats, k); ok && !changedAt.IsZero() && changedAt.After(sinceTime) {
						res.DropCount++
					}
				}
			}
		}

		results = append(results, res)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
	})
}
