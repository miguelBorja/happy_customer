package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

type BackupData struct {
	Timestamp time.Time                `json:"timestamp"`
	Source    string                   `json:"source"`
	Cars      []map[string]interface{} `json:"cars"`
	PageViews []map[string]interface{} `json:"page_views"`
}

func queryTable(db *sql.DB, tableName string) ([]map[string]interface{}, error) {
	rows, err := db.Query(fmt.Sprintf("SELECT * FROM %s", tableName))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}

	for rows.Next() {
		columns := make([]interface{}, len(cols))
		columnPointers := make([]interface{}, len(cols))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return nil, err
		}

		rowMap := make(map[string]interface{})
		for i, colName := range cols {
			val := columns[i]
			if b, ok := val.([]byte); ok {
				rowMap[colName] = string(b)
			} else {
				rowMap[colName] = val
			}
		}
		results = append(results, rowMap)
	}
	return results, nil
}

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// Fetch connection string from command line flag, defaulting to DATABASE_URL env var, or local sqlite path
	defaultConn := os.Getenv("DATABASE_URL")
	if defaultConn == "" {
		defaultConn = "cars.db"
	}

	connFlag := flag.String("conn", defaultConn, "Connection string (PostgreSQL URL or SQLite file path)")
	outFlag := flag.String("out", "", "Output JSON file path (optional)")
	flag.Parse()

	dbPath := *connFlag
	var driverName string

	if strings.HasPrefix(dbPath, "postgres://") || strings.HasPrefix(dbPath, "postgresql://") {
		driverName = "postgres"
		// Append binary_parameters=yes to support PgBouncer transaction pooling mode
		if !strings.Contains(dbPath, "binary_parameters=") {
			if strings.Contains(dbPath, "?") {
				dbPath += "&binary_parameters=yes"
			} else {
				dbPath += "?binary_parameters=yes"
			}
		}
		log.Printf("Connecting to PostgreSQL remote database...")
	} else {
		driverName = "sqlite"
		log.Printf("Connecting to local SQLite database: %s", dbPath)
	}

	db, err := sql.Open(driverName, dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to connect/ping database: %v. Please make sure the database is online and reachable.", err)
	}
	log.Println("Database connection established successfully.")

	log.Println("Exporting 'cars' table...")
	cars, err := queryTable(db, "cars")
	if err != nil {
		log.Fatalf("Failed to query 'cars' table: %v", err)
	}
	log.Printf("Exported %d records from 'cars' table.", len(cars))

	log.Println("Exporting 'page_views' table...")
	pageViews, err := queryTable(db, "page_views")
	if err != nil {
		log.Fatalf("Failed to query 'page_views' table: %v", err)
	}
	log.Printf("Exported %d records from 'page_views' table.", len(pageViews))

	backup := BackupData{
		Timestamp: time.Now(),
		Source:    driverName,
		Cars:      cars,
		PageViews: pageViews,
	}

	// Determine output path
	outputPath := *outFlag
	if outputPath == "" {
		if err := os.MkdirAll("backups", 0755); err != nil {
			log.Fatalf("Failed to create backups directory: %v", err)
		}
		timestamp := time.Now().Format("20060102_150405")
		outputPath = filepath.Join("backups", fmt.Sprintf("backup_%s_%s.json", driverName, timestamp))
	}

	log.Printf("Writing backup to: %s", outputPath)
	file, err := os.Create(outputPath)
	if err != nil {
		log.Fatalf("Failed to create output file: %v", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(backup); err != nil {
		log.Fatalf("Failed to write JSON backup: %v", err)
	}

	log.Printf("Backup completed successfully! Saved to %s", outputPath)
}
