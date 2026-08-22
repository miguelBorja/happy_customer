package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"crautosdb/db"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"
)

type BackupData struct {
	Timestamp time.Time                `json:"timestamp"`
	Source    string                   `json:"source"`
	Cars      []map[string]interface{} `json:"cars"`
	PageViews []map[string]interface{} `json:"page_views"`
}

func restoreTable(sqlDB *sql.DB, tableName string, records []map[string]interface{}) error {
	if len(records) == 0 {
		log.Printf("No records to restore for table %s", tableName)
		return nil
	}

	tx, err := sqlDB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Extract column names from the first record to build dynamic query template
	first := records[0]
	cols := make([]string, 0, len(first))
	for colName := range first {
		cols = append(cols, colName)
	}

	// We insert in batches of 200 to keep parameter count below SQLite/libsql limit of 32,766.
	// (200 records * ~60 columns = ~12,000 parameters)
	batchSize := 200
	log.Printf("Restoring %d records to %s using batch size %d...", len(records), tableName, batchSize)

	for i := 0; i < len(records); i += batchSize {
		end := i + batchSize
		if end > len(records) {
			end = len(records)
		}
		currentBatch := records[i:end]

		// Construct multi-row query: INSERT OR REPLACE INTO table (col1, col2) VALUES (?, ?), (?, ?) ...
		var queryBuilder strings.Builder
		queryBuilder.WriteString(fmt.Sprintf("INSERT OR REPLACE INTO %s (%s) VALUES ", tableName, strings.Join(cols, ", ")))

		vals := make([]interface{}, 0, len(currentBatch)*len(cols))
		for rowIndex, record := range currentBatch {
			if rowIndex > 0 {
				queryBuilder.WriteString(", ")
			}
			queryBuilder.WriteString("(")
			for colIndex, colName := range cols {
				if colIndex > 0 {
					queryBuilder.WriteString(", ")
				}
				queryBuilder.WriteString("?")
				vals = append(vals, record[colName])
			}
			queryBuilder.WriteString(")")
		}

		query := queryBuilder.String()
		if _, err := tx.Exec(query, vals...); err != nil {
			return fmt.Errorf("failed to execute batch insert starting at index %d for %s: %w", i, tableName, err)
		}

		log.Printf("Progress: restored %d/%d records to %s...", end, len(records), tableName)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully restored %d records to table %s", len(records), tableName)
	return nil
}

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	fileFlag := flag.String("file", "", "Path to the backup JSON file")
	connFlag := flag.String("conn", "", "Target connection string (SQLite file path or libsql:// URL)")
	flag.Parse()

	if *fileFlag == "" {
		log.Fatal("Error: -file argument is required.")
	}
	if *connFlag == "" {
		log.Fatal("Error: -conn argument is required.")
	}

	log.Printf("Reading backup file: %s", *fileFlag)
	fileBytes, err := os.ReadFile(*fileFlag)
	if err != nil {
		log.Fatalf("Failed to read backup file: %v", err)
	}

	var backup BackupData
	if err := json.Unmarshal(fileBytes, &backup); err != nil {
		log.Fatalf("Failed to unmarshal backup JSON: %v", err)
	}

	log.Printf("Loaded backup from %s (source: %s, timestamp: %s)", *fileFlag, backup.Source, backup.Timestamp.Format(time.RFC3339))
	log.Printf("Backup contains %d cars and %d page_views.", len(backup.Cars), len(backup.PageViews))

	log.Printf("Initializing target database at: %s", *connFlag)
	targetDB, err := db.Init(*connFlag)
	if err != nil {
		log.Fatalf("Failed to initialize target database: %v", err)
	}
	defer targetDB.Close()

	// 1. Restore cars
	if err := restoreTable(targetDB.DB, "cars", backup.Cars); err != nil {
		log.Fatalf("Error restoring cars: %v", err)
	}

	// 2. Restore page_views
	if err := restoreTable(targetDB.DB, "page_views", backup.PageViews); err != nil {
		log.Fatalf("Error restoring page_views: %v", err)
	}

	log.Println("Data restoration completed successfully!")
}
