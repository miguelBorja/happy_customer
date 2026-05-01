package main

import (
	"flag"
	"log"
	"net/http"
	"os"

	"crautosdb/api"
	"crautosdb/db"
	"crautosdb/scraper"
)

func main() {
	scrapeFlag := flag.Bool("scrape", true, "Run the scraper")
	serveFlag := flag.Bool("serve", true, "Run the API server")
	portFlag := flag.String("port", "8080", "Port for the API server")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// Initialize Database
	database, err := db.Init("cars.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()
	log.Println("Database initialized at cars.db")

	if *scrapeFlag {
		go func() {
			log.Println("Starting scraper...")
			s, err := scraper.NewScraper(scraper.ChromeDriverPath, scraper.SeleniumPort, database)
			if err != nil {
				log.Fatalf("Failed to create scraper: %v", err)
			}
			defer s.Service.Stop()
			s.Run()
		}()
	}

	if *serveFlag {
		server := &api.Server{DB: database}
		
		mux := http.NewServeMux()
		mux.HandleFunc("/api/cars", server.HandleCars)
		mux.HandleFunc("/api/brands", server.HandleBrands)
		mux.HandleFunc("/api/stats", server.HandleStats)

		// Serve static frontend files if they exist
		if _, err := os.Stat("web/dist"); err == nil {
			fs := http.FileServer(http.Dir("web/dist"))
			mux.Handle("/", fs)
		} else {
			log.Println("Warning: web/dist not found. Frontend will not be served.")
		}

		log.Printf("Starting API server on :%s...\n", *portFlag)
		if err := http.ListenAndServe(":"+*portFlag, mux); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	} else {
		// If not serving, wait forever so the scraper can finish
		select {}
	}
}
