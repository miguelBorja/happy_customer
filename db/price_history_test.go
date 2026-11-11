package db

import (
	"testing"
	"time"
)

func TestPriceHistoryRecordsOnlyChanges(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	mk := func(url string, price int) Car {
		return Car{URL: url, Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018,
			Price: price, ScrapedAt: now, LastSeenAt: now}
	}
	a, b := "https://crautos.com/a", "https://crautos.com/b"

	// New cars: first price recorded (batch path).
	if err := database.UpsertCarBatch([]Car{mk(a, 20000), mk(b, 15000)}); err != nil {
		t.Fatal(err)
	}
	// Same prices again: nothing new.
	if err := database.UpsertCarBatch([]Car{mk(a, 20000), mk(b, 15000)}); err != nil {
		t.Fatal(err)
	}
	// Price drop on a (single path).
	if err := database.UpsertCar(mk(a, 18500)); err != nil {
		t.Fatal(err)
	}

	ha, err := database.GetPriceHistory(a)
	if err != nil {
		t.Fatal(err)
	}
	if len(ha) != 2 || ha[0].Price != 20000 || ha[1].Price != 18500 {
		t.Fatalf("history a = %+v, want [20000 18500]", ha)
	}
	hb, err := database.GetPriceHistory(b)
	if err != nil {
		t.Fatal(err)
	}
	if len(hb) != 1 || hb[0].Price != 15000 {
		t.Fatalf("history b = %+v, want [15000]", hb)
	}
}
