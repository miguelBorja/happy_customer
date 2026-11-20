package api

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"crautosdb/db"
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

// SavedSearchMatches holds the outcome of evaluating a saved search.
type SavedSearchMatches struct {
	TotalCount int
	NewURLs    []string
	DropURLs   []string
}

// EvaluateSavedSearch runs a saved filter query and reports the total matches plus the URLs
// that are new or whose price dropped since the given timestamp.
func (s *Server) EvaluateSavedSearch(stats *db.MarketIndex, rawQuery string, since time.Time, now time.Time) (SavedSearchMatches, error) {
	var result SavedSearchMatches

	raw := strings.TrimPrefix(strings.TrimSpace(rawQuery), "?")
	q, _ := url.ParseQuery(raw)
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
		return result, err
	}

	onlyGood := q.Get("deal") == "good"
	onlyDrops := q.Get("priceDrop") == "true"
	onlyMotivated := q.Get("motivated") == "true"
	if onlyGood || onlyDrops || onlyMotivated {
		allowedURLs := rankCatalogURLs(keys, stats, onlyGood, onlyDrops, onlyMotivated, false, f, now)
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

	result.TotalCount = len(keys)

	if !since.IsZero() {
		for _, k := range keys {
			if !k.ScrapedAt.IsZero() && k.ScrapedAt.After(since) {
				result.NewURLs = append(result.NewURLs, k.URL)
			}
			if _, _, changedAt, ok := qualifyingPriceDrop(stats, k); ok && !changedAt.IsZero() && changedAt.After(since) {
				result.DropURLs = append(result.DropURLs, k.URL)
			}
		}
	}

	return result, nil
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
		var sinceTime time.Time
		if sinceStr := strings.TrimSpace(item.Since); sinceStr != "" {
			if parsed, err := time.Parse(time.RFC3339, sinceStr); err == nil {
				sinceTime = parsed
			}
		}

		matches, err := s.EvaluateSavedSearch(stats, item.Query, sinceTime, time.Now())
		if err != nil {
			log.Printf("[API ERROR] EvaluateSavedSearch (digest %s) failed: %v", item.ID, err)
			respondError(w, http.StatusInternalServerError, "Failed to compute search digest")
			return
		}

		results = append(results, SearchDigestResult{
			ID:         item.ID,
			TotalCount: matches.TotalCount,
			NewCount:   len(matches.NewURLs),
			DropCount:  len(matches.DropURLs),
		})
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
	})
}
