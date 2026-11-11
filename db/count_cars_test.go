package db

import (
	"fmt"
	"testing"
	"time"
)

func TestCountCarsMatchesFiltersIgnoringLimit(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	var cars []Car
	for i := 0; i < 30; i++ {
		brand := "Toyota"
		if i%3 == 0 {
			brand = "Nissan"
		}
		cars = append(cars, Car{URL: fmt.Sprintf("https://crautos.com/c%d", i), Title: brand + " X", Brand: brand,
			Year: 2010 + i%10, Price: 10000 + i*100, ScrapedAt: now, LastSeenAt: now})
	}
	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatal(err)
	}

	f := FilterParams{Brand: "Toyota", Limit: 5, Offset: 5}
	n, err := database.CountCars(f)
	if err != nil {
		t.Fatal(err)
	}
	if n != 20 {
		t.Fatalf("CountCars(Toyota) = %d, want 20", n)
	}
	page, err := database.GetCars(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(page) != 5 {
		t.Fatalf("GetCars page = %d, want 5", len(page))
	}
	if all, _ := database.CountCars(FilterParams{}); all != 30 {
		t.Fatalf("CountCars(all) = %d, want 30", all)
	}
	keys, err := database.GetCarPriceKeys(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 20 || keys[0].Brand != "Toyota" || keys[0].Price <= 0 {
		t.Fatalf("GetCarPriceKeys(Toyota) = %d keys, first %+v", len(keys), keys[0])
	}
}
