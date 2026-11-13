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

func TestModelsTradeInNegotiableAndFilteredBrands(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	cars := []Car{
		{
			URL:              "https://crautos.com/cardetail.cfm?c=301",
			Title:            "Toyota Hilux 2022",
			Brand:            "Toyota",
			Model:            "Hilux",
			Year:             2022,
			Price:            25000,
			Estilo:           "Pickup",
			SeRecibe:         "SI",
			PrecioNegociable: "NO",
			ScrapedAt:        now,
			LastSeenAt:       now,
		},
		{
			URL:              "https://crautos.com/cardetail.cfm?c=302",
			Title:            "Toyota RAV4 2021",
			Brand:            "Toyota",
			Model:            "RAV4",
			Year:             2021,
			Price:            28000,
			Estilo:           "SUV",
			SeRecibe:         "NO",
			PrecioNegociable: "SI",
			ScrapedAt:        now,
			LastSeenAt:       now,
		},
		{
			URL:              "https://crautos.com/cardetail.cfm?c=303",
			Title:            "Hyundai Tucson 2020",
			Brand:            "Hyundai",
			Model:            "Tucson",
			Year:             2020,
			Price:            20000,
			Estilo:           "SUV",
			SeRecibe:         "SI",
			PrecioNegociable: "SI",
			ScrapedAt:        now,
			LastSeenAt:       now,
		},
	}

	if err := database.UpsertCarBatch(cars); err != nil {
		t.Fatalf("UpsertCarBatch failed: %v", err)
	}

	// Models filter (single, case-insensitive)
	got, err := database.GetCars(FilterParams{Models: []string{"hilux"}})
	if err != nil {
		t.Fatalf("GetCars(Models: [hilux]) failed: %v", err)
	}
	if len(got) != 1 || got[0].Model != "Hilux" {
		t.Errorf("GetCars(Models: [hilux]) = %d cars, want 1 Hilux", len(got))
	}
	if n, err := database.CountCars(FilterParams{Models: []string{"hilux"}}); err != nil || n != 1 {
		t.Errorf("CountCars(Models: [hilux]) = %d, err %v; want 1", n, err)
	}

	// Models filter (multiple values)
	got, err = database.GetCars(FilterParams{Models: []string{"Hilux", "Tucson"}})
	if err != nil {
		t.Fatalf("GetCars(Models: [Hilux Tucson]) failed: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("GetCars(Models: [Hilux Tucson]) = %d cars, want 2", len(got))
	}
	if n, err := database.CountCars(FilterParams{Models: []string{"Hilux", "Tucson"}}); err != nil || n != 2 {
		t.Errorf("CountCars(Models: [Hilux Tucson]) = %d, err %v; want 2", n, err)
	}

	// SeRecibe and Negociable filters
	got, err = database.GetCars(FilterParams{SeRecibe: true})
	if err != nil {
		t.Fatalf("GetCars(SeRecibe) failed: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("GetCars(SeRecibe) = %d cars, want 2", len(got))
	}
	if n, err := database.CountCars(FilterParams{SeRecibe: true}); err != nil || n != 2 {
		t.Errorf("CountCars(SeRecibe) = %d, err %v; want 2", n, err)
	}

	got, err = database.GetCars(FilterParams{Negociable: true})
	if err != nil {
		t.Fatalf("GetCars(Negociable) failed: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("GetCars(Negociable) = %d cars, want 2", len(got))
	}
	if n, err := database.CountCars(FilterParams{Negociable: true}); err != nil || n != 2 {
		t.Errorf("CountCars(Negociable) = %d, err %v; want 2", n, err)
	}

	// GetFilteredBrands delegates to buildCarFilters (respects Estilo and SeRecibe)
	estiloBrands, err := database.GetFilteredBrands(FilterParams{Estilo: "SUV"})
	if err != nil {
		t.Fatalf("GetFilteredBrands(Estilo: SUV) failed: %v", err)
	}
	if len(estiloBrands) != 2 || estiloBrands[0] != "Hyundai" || estiloBrands[1] != "Toyota" {
		t.Errorf("GetFilteredBrands(Estilo: SUV) = %v, want [Hyundai Toyota]", estiloBrands)
	}

	seRecibeBrands, err := database.GetFilteredBrands(FilterParams{SeRecibe: true})
	if err != nil {
		t.Fatalf("GetFilteredBrands(SeRecibe) failed: %v", err)
	}
	if len(seRecibeBrands) != 2 || seRecibeBrands[0] != "Hyundai" || seRecibeBrands[1] != "Toyota" {
		t.Errorf("GetFilteredBrands(SeRecibe) = %v, want [Hyundai Toyota]", seRecibeBrands)
	}

	filteredBrands, err := database.GetFilteredBrands(FilterParams{Estilo: "SUV", SeRecibe: true})
	if err != nil {
		t.Fatalf("GetFilteredBrands(Estilo: SUV, SeRecibe) failed: %v", err)
	}
	if len(filteredBrands) != 1 || filteredBrands[0] != "Hyundai" {
		t.Errorf("GetFilteredBrands(Estilo: SUV, SeRecibe) = %v, want [Hyundai]", filteredBrands)
	}

	// GetFilteredModels returns a non-nil empty slice when no brand is given
	noBrandModels, err := database.GetFilteredModels(FilterParams{})
	if err != nil {
		t.Fatalf("GetFilteredModels(no brand) failed: %v", err)
	}
	if noBrandModels == nil || len(noBrandModels) != 0 {
		t.Errorf("GetFilteredModels(no brand) = %#v, want empty non-nil slice", noBrandModels)
	}

	// GetFilteredModels respects the selected brand/brands and remaining filters
	toyotaModels, err := database.GetFilteredModels(FilterParams{Brand: "Toyota"})
	if err != nil {
		t.Fatalf("GetFilteredModels(Toyota) failed: %v", err)
	}
	if len(toyotaModels) != 2 || toyotaModels[0] != "Hilux" || toyotaModels[1] != "RAV4" {
		t.Errorf("GetFilteredModels(Toyota) = %v, want [Hilux RAV4]", toyotaModels)
	}

	toyotaSeRecibeModels, err := database.GetFilteredModels(FilterParams{Brand: "Toyota", SeRecibe: true})
	if err != nil {
		t.Fatalf("GetFilteredModels(Toyota, SeRecibe) failed: %v", err)
	}
	if len(toyotaSeRecibeModels) != 1 || toyotaSeRecibeModels[0] != "Hilux" {
		t.Errorf("GetFilteredModels(Toyota, SeRecibe) = %v, want [Hilux]", toyotaSeRecibeModels)
	}

	multiBrandModels, err := database.GetFilteredModels(FilterParams{Brands: []string{"Toyota", "Hyundai"}})
	if err != nil {
		t.Fatalf("GetFilteredModels(Brands: [Toyota Hyundai]) failed: %v", err)
	}
	if len(multiBrandModels) != 3 || multiBrandModels[0] != "Hilux" || multiBrandModels[1] != "RAV4" || multiBrandModels[2] != "Tucson" {
		t.Errorf("GetFilteredModels(Brands: [Toyota Hyundai]) = %v, want [Hilux RAV4 Tucson]", multiBrandModels)
	}
}
