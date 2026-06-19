package main

import (
	"fmt"
	"log"
	"os"

	"crautosdb/db"
)

func main() {
	database, err := db.Init(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Init failed: %v", err)
	}
	defer database.Close()

	rows, err := database.Query("SELECT url, title, year, price, price_text, is_sold FROM cars WHERE brand = 'Suzuki' AND model = 'ALTO' AND year = 2019 ORDER BY price DESC")
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var url, title, priceText string
		var year, price, isSold int
		rows.Scan(&url, &title, &year, &price, &priceText, &isSold)
		fmt.Printf("[%d] Price: %d | Text: %q | Title: %q | URL: %s\n", isSold, price, priceText, title, url)
	}
}
