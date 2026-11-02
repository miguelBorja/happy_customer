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

func TestFuelAndTransmissionFilterVariants(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	cars := []Car{
		{
			URL:         "https://crautos.com/cardetail.cfm?c=201",
			Title:       "Tesla Model 3 2022",
			Brand:       "Tesla",
			Model:       "Model 3",
			Year:        2022,
			Price:       35000,
			Combustible: "Eléctrico",
			Transmision: "Automática",
			ScrapedAt:   now,
			LastSeenAt:  now,
		},
		{
			URL:         "https://crautos.com/cardetail.cfm?c=202",
			Title:       "Toyota Prius 2021",
			Brand:       "Toyota",
			Model:       "Prius",
			Year:        2021,
			Price:       22000,
			Combustible: "Híbrido",
			Transmision: "Automática/Dual",
			ScrapedAt:   now,
			LastSeenAt:  now,
		},
		{
			URL:         "https://crautos.com/cardetail.cfm?c=203",
			Title:       "Land Rover Defender 2020",
			Brand:       "Land",
			Model:       "Defender",
			Year:        2020,
			Price:       60000,
			Combustible: "Diesel",
			Transmision: "Manual",
			ScrapedAt:   now,
			LastSeenAt:  now,
		},
	}

	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch failed: %v", err)
	}

	electricVariants := []string{"Eléctrico", "electrico", "eléctrico", "electric"}
	for _, fuel := range electricVariants {
		cars, err := database.GetCars(FilterParams{Combustible: fuel})
		if err != nil {
			t.Fatalf("GetCars(Combustible: %q) failed: %v", fuel, err)
		}
		if len(cars) != 1 || cars[0].Brand != "Tesla" {
			t.Errorf("GetCars(Combustible: %q) expected 1 Tesla car, got %d", fuel, len(cars))
		}

		brands, err := database.GetFilteredBrands(FilterParams{Combustible: fuel})
		if err != nil {
			t.Fatalf("GetFilteredBrands(Combustible: %q) failed: %v", fuel, err)
		}
		if len(brands) != 1 || brands[0] != "Tesla" {
			t.Errorf("GetFilteredBrands(Combustible: %q) expected [Tesla], got %v", fuel, brands)
		}
	}

	hybridVariants := []string{"Híbrido", "hibrido"}
	for _, fuel := range hybridVariants {
		cars, err := database.GetCars(FilterParams{Combustible: fuel})
		if err != nil {
			t.Fatalf("GetCars(Combustible: %q) failed: %v", fuel, err)
		}
		if len(cars) != 1 || cars[0].Brand != "Toyota" {
			t.Errorf("GetCars(Combustible: %q) expected 1 Toyota car, got %d", fuel, len(cars))
		}

		brands, err := database.GetFilteredBrands(FilterParams{Combustible: fuel})
		if err != nil {
			t.Fatalf("GetFilteredBrands(Combustible: %q) failed: %v", fuel, err)
		}
		if len(brands) != 1 || brands[0] != "Toyota" {
			t.Errorf("GetFilteredBrands(Combustible: %q) expected [Toyota], got %v", fuel, brands)
		}
	}

	transVariants := []string{"Automática", "Automática/Dual"}
	for _, trans := range transVariants {
		cars, err := database.GetCars(FilterParams{Transmision: trans})
		if err != nil {
			t.Fatalf("GetCars(Transmision: %q) failed: %v", trans, err)
		}
		if len(cars) != 2 {
			t.Errorf("GetCars(Transmision: %q) expected 2 cars, got %d", trans, len(cars))
		}

		brands, err := database.GetFilteredBrands(FilterParams{Transmision: trans})
		if err != nil {
			t.Fatalf("GetFilteredBrands(Transmision: %q) failed: %v", trans, err)
		}
		if len(brands) != 2 {
			t.Errorf("GetFilteredBrands(Transmision: %q) expected 2 brands, got %d", trans, len(brands))
		}
	}

	// Test multi-word brand resolution in GetActiveURLs and GetActiveCarsLastSeen
	activeURLs, err := database.GetActiveURLs("Land Rover")
	if err != nil {
		t.Fatalf("GetActiveURLs('Land Rover') failed: %v", err)
	}
	if len(activeURLs) != 1 || activeURLs[0] != "https://crautos.com/cardetail.cfm?c=203" {
		t.Errorf("GetActiveURLs('Land Rover') expected 1 URL, got %v", activeURLs)
	}

	activeMap, err := database.GetActiveCarsLastSeen("Land Rover")
	if err != nil {
		t.Fatalf("GetActiveCarsLastSeen('Land Rover') failed: %v", err)
	}
	if len(activeMap) != 1 || activeMap["https://crautos.com/cardetail.cfm?c=203"].IsZero() {
		t.Errorf("GetActiveCarsLastSeen('Land Rover') expected map with car 203, got %v", activeMap)
	}
}
