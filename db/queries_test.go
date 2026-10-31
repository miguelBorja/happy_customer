package db

import (
	"fmt"
	"os"
	"testing"
	"time"
)

func setupTestDB(t *testing.T) (*DB, func()) {
	t.Helper()
	dbPath := fmt.Sprintf("test_db_%d.sqlite", time.Now().UnixNano())
	database, err := Init(dbPath)
	if err != nil {
		t.Fatalf("Failed to init test db: %v", err)
	}

	cleanup := func() {
		database.Close()
		os.Remove(dbPath)
	}

	return database, cleanup
}

func TestUpsertCarBatch(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	// 1. Test empty batch
	if err := database.UpsertCarBatch(nil); err != nil {
		t.Errorf("UpsertCarBatch(nil) error: %v", err)
	}
	if err := database.UpsertCarBatch([]Car{}); err != nil {
		t.Errorf("UpsertCarBatch([]) error: %v", err)
	}

	// 2. Test single car batch
	singleCar := Car{
		URL:        "https://crautos.com/cardetail.cfm?c=1",
		Title:      "Toyota Corolla 2021",
		Brand:      "Toyota",
		Model:      "Corolla",
		Year:       2021,
		Price:      18000,
		ScrapedAt:  time.Now(),
		LastSeenAt: time.Now(),
	}
	if err := database.UpsertCarBatch([]Car{singleCar}); err != nil {
		t.Fatalf("UpsertCarBatch single car error: %v", err)
	}

	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM cars").Scan(&count); err != nil {
		t.Fatalf("QueryRow failed: %v", err)
	}
	if count != 1 {
		t.Errorf("expected count 1, got %d", count)
	}

	// 3. Test multi-car batch exceeding chunk size (e.g. 60 cars across 3 chunks: 25 + 25 + 10)
	multiCars := make([]Car, 60)
	for i := 0; i < 60; i++ {
		multiCars[i] = Car{
			URL:           fmt.Sprintf("https://crautos.com/cardetail.cfm?c=%d", 100+i),
			Title:         fmt.Sprintf("Hyundai Tucson %d", i),
			Brand:         "Hyundai",
			Model:         "Tucson",
			Year:          2018 + (i % 6),
			Price:         15000 + i*100,
			Combustible:   "Gasolina",
			Transmision:   "Automática",
			Provincia:     "San José",
			SellerName:    "Dealer Auto",
			SellerPhone:   "2222-2222",
			SellerAddress: "San Jose",
			Comment:       "Excelente estado",
			Equipments: map[string]bool{
				"Aire acondicionado": true,
				"Frenos ABS":         true,
			},
			ScrapedAt:  time.Now(),
			LastSeenAt: time.Now(),
		}
	}

	if err := database.UpsertCarBatch(multiCars); err != nil {
		t.Fatalf("UpsertCarBatch 60 cars error: %v", err)
	}

	if err := database.QueryRow("SELECT COUNT(*) FROM cars").Scan(&count); err != nil {
		t.Fatalf("QueryRow failed: %v", err)
	}
	if count != 61 { // 1 previous + 60 new = 61
		t.Errorf("expected count 61, got %d", count)
	}

	// 4. Test conflict update (upsert existing cars with new price and comment)
	updateCars := []Car{
		{
			URL:        "https://crautos.com/cardetail.cfm?c=1",
			Title:      "Toyota Corolla 2021 Updated",
			Brand:      "Toyota",
			Price:      17500,
			Comment:    "Precio rebajado!",
			ScrapedAt:  time.Now(),
			LastSeenAt: time.Now(),
		},
		{
			URL:        "https://crautos.com/cardetail.cfm?c=100",
			Title:      "Hyundai Tucson 0 Updated",
			Brand:      "Hyundai",
			Price:      14000,
			Comment:    "Oferta especial",
			ScrapedAt:  time.Now(),
			LastSeenAt: time.Now(),
		},
	}

	if err := database.UpsertCarBatch(updateCars); err != nil {
		t.Fatalf("UpsertCarBatch update error: %v", err)
	}

	// Count should still be 61
	if err := database.QueryRow("SELECT COUNT(*) FROM cars").Scan(&count); err != nil {
		t.Fatalf("QueryRow failed: %v", err)
	}
	if count != 61 {
		t.Errorf("expected count 61 after update, got %d", count)
	}

	// Verify updated fields
	var price int
	var comment string
	if err := database.QueryRow("SELECT price, comment FROM cars WHERE url = ?", "https://crautos.com/cardetail.cfm?c=1").Scan(&price, &comment); err != nil {
		t.Fatalf("QueryRow car 1 failed: %v", err)
	}
	if price != 17500 || comment != "Precio rebajado!" {
		t.Errorf("car 1: expected price 17500, comment 'Precio rebajado!', got %d, %q", price, comment)
	}
}
