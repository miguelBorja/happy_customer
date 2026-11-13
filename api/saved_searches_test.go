package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"crautosdb/db"
)

func TestHandleSearchesDigest(t *testing.T) {
	database, err := db.Init(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()
	resetMarketStatsCache()
	t.Cleanup(resetMarketStatsCache)

	since := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	before := since.Add(-24 * time.Hour)
	after := since.Add(6 * time.Hour)

	cars := []db.Car{
		// Old car that dropped price after `since` (also below market so deal=good matches).
		{URL: "https://crautos.com/c=1", Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 21000, Kilometraje: 90000, Placa: "Termina en 1", ColorExterior: "BLANCO", SellerPhone: "8888-0001", ScrapedAt: before, LastSeenAt: after},
		// New car scraped after `since`.
		{URL: "https://crautos.com/c=2", Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 25000, Kilometraje: 90000, Placa: "Termina en 2", ColorExterior: "GRIS", SellerPhone: "8888-0002", ScrapedAt: after, LastSeenAt: after},
		// Extra comparables to reach >= 4 in group.
		{URL: "https://crautos.com/c=3", Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 26000, Kilometraje: 85000, Placa: "Termina en 3", ColorExterior: "NEGRO", SellerPhone: "8888-0003", ScrapedAt: before, LastSeenAt: before},
		{URL: "https://crautos.com/c=4", Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 27000, Kilometraje: 80000, Placa: "Termina en 4", ColorExterior: "PLATA", SellerPhone: "8888-0004", ScrapedAt: before, LastSeenAt: before},
		// Sold car should not be counted when isSold isn't requested.
		{URL: "https://crautos.com/c=5", Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 24000, Kilometraje: 95000, Placa: "Termina en 5", ColorExterior: "ROJO", SellerPhone: "8888-0005", ScrapedAt: after, LastSeenAt: after},
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}
	if err := database.MarkSold([]string{"https://crautos.com/c=5"}); err != nil {
		t.Fatalf("MarkSold: %v", err)
	}
	// Record price history drop 24500 -> 21000 after `since`.
	if _, err := database.Exec("DELETE FROM price_history WHERE url = ?", "https://crautos.com/c=1"); err != nil {
		t.Fatalf("delete price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", "https://crautos.com/c=1", 24500, before); err != nil {
		t.Fatalf("insert prev price_history: %v", err)
	}
	if _, err := database.Exec("INSERT INTO price_history (url, price, seen_at) VALUES (?, ?, ?)", "https://crautos.com/c=1", 21000, after); err != nil {
		t.Fatalf("insert curr price_history: %v", err)
	}

	// Build 16 items to also verify the 15-item cap.
	searches := []SearchDigestRequestItem{
		{ID: "hilux", Query: "brands=Toyota&models=Hilux", Since: since.Format(time.RFC3339)},
		{ID: "hilux-good", Query: "brands=Toyota&models=Hilux&deal=good", Since: since.Format(time.RFC3339)},
	}
	for i := 0; i < 14; i++ {
		searches = append(searches, SearchDigestRequestItem{ID: fmt.Sprintf("extra-%d", i), Query: "brands=Kia"})
	}
	payload, _ := json.Marshal(map[string]interface{}{"searches": searches})

	srv := &Server{DB: database}
	req := httptest.NewRequest(http.MethodPost, "/api/searches/digest", bytes.NewReader(payload))
	rec := httptest.NewRecorder()
	srv.HandleSearchesDigest(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var parsed struct {
		Results []SearchDigestResult `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(parsed.Results) != 15 {
		t.Fatalf("results len = %d, want capped 15", len(parsed.Results))
	}

	r0 := parsed.Results[0]
	if r0.ID != "hilux" || r0.TotalCount != 4 || r0.NewCount != 1 || r0.DropCount != 1 {
		t.Errorf("hilux digest = %+v, want total=4, new=1, drop=1", r0)
	}
	r1 := parsed.Results[1]
	if r1.ID != "hilux-good" || r1.TotalCount != 1 || r1.NewCount != 0 || r1.DropCount != 1 {
		t.Errorf("hilux-good digest = %+v, want total=1, new=0, drop=1", r1)
	}
}
