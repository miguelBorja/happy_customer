package db

import (
	"path/filepath"
	"testing"
)

func TestCompositeIndexesCreated(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	rows, err := database.Query("SELECT name FROM sqlite_master WHERE type='index'")
	if err != nil {
		t.Fatalf("Failed to query sqlite_master: %v", err)
	}
	defer rows.Close()

	indexes := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("Failed to scan index name: %v", err)
		}
		indexes[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows error: %v", err)
	}

	for _, want := range []string{
		"idx_cars_active_brand_year",
		"idx_cars_active_price",
		"idx_cars_active_scraped",
		"idx_cars_last_seen",
	} {
		if !indexes[want] {
			t.Errorf("expected index %q to exist", want)
		}
	}
}

func TestCleanUpDataOptInAndSQLiteSingleConn(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cleanup.db")

	database, err := Init(dbPath)
	if err != nil {
		t.Fatalf("Failed to init db: %v", err)
	}

	if _, err := database.Exec(`INSERT INTO cars (url, title, brand, model, year, price, comment) VALUES
		('http://a', '  Toyota   Corolla  ', 'Toyota', 'Corolla', 2020, 10000, '-'),
		('http://b', 'Honda Civic', 'Honda', 'Civic', 2019, 9000, '---')`); err != nil {
		t.Fatalf("Failed to insert dirty rows: %v", err)
	}
	database.Close()

	// Re-open: Init must NOT alter dirty data.
	database, err = Init(dbPath)
	if err != nil {
		t.Fatalf("Failed to re-open db: %v", err)
	}
	defer database.Close()

	var title, comment string
	if err := database.QueryRow("SELECT title, comment FROM cars WHERE url = 'http://a'").Scan(&title, &comment); err != nil {
		t.Fatalf("Failed to read row: %v", err)
	}
	if title != "  Toyota   Corolla  " {
		t.Errorf("Init should not alter title, got %q", title)
	}
	if comment != "-" {
		t.Errorf("Init should not alter comment, got %q", comment)
	}

	if err := database.CleanUpData(); err != nil {
		t.Fatalf("CleanUpData failed: %v", err)
	}

	var brand, model string
	if err := database.QueryRow("SELECT title, brand, model, comment FROM cars WHERE url = 'http://a'").Scan(&title, &brand, &model, &comment); err != nil {
		t.Fatalf("Failed to read cleaned row: %v", err)
	}
	if title != "Toyota Corolla" {
		t.Errorf("expected title %q, got %q", "Toyota Corolla", title)
	}
	if brand != "Toyota" {
		t.Errorf("expected brand %q, got %q", "Toyota", brand)
	}
	if model != "Corolla" {
		t.Errorf("expected model %q, got %q", "Corolla", model)
	}
	if comment != "" {
		t.Errorf("expected empty comment, got %q", comment)
	}

	if err := database.QueryRow("SELECT comment FROM cars WHERE url = 'http://b'").Scan(&comment); err != nil {
		t.Fatalf("Failed to read row b: %v", err)
	}
	if comment != "" {
		t.Errorf("expected empty comment for b, got %q", comment)
	}
}

func TestInMemorySQLitePoolRetainsSchema(t *testing.T) {
	database, err := Init(":memory:")
	if err != nil {
		t.Fatalf("Failed to init in-memory db: %v", err)
	}
	defer database.Close()

	car := Car{
		URL:   "http://memory",
		Title: "Toyota Corolla",
	}
	if err := database.UpsertCarBatch([]Car{car}); err != nil {
		t.Fatalf("UpsertCarBatch failed: %v", err)
	}

	count, err := database.CountCars(FilterParams{})
	if err != nil {
		t.Fatalf("CountCars failed: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 car, got %d", count)
	}
}
