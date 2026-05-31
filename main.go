package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"sync"
	"sync/atomic"

	"crautosdb/api"
	"crautosdb/db"
	"crautosdb/scraper"
)

func main() {
	scrapeFlag := flag.Bool("scrape", true, "Run the scraper")
	serveFlag := flag.Bool("serve", true, "Run the API server")
	backfillFlag := flag.Bool("backfill", false, "Backfill seller info for existing cars")
	backfillCommentsFlag := flag.Bool("backfill-comments", false, "Backfill comments for active cars")
	portFlag := flag.String("port", "8080", "Port for the API server")
	migrateFlag := flag.Bool("migrate", false, "Migrate all data from local SQLite (cars.db) to Supabase")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// If the migrate flag is set, run migration and exit
	if *migrateFlag {
		log.Println("Starting data migration from SQLite to Supabase...")
		localDB, err := db.Init("cars.db")
		if err != nil {
			log.Fatalf("Failed to open local database: %v", err)
		}
		defer localDB.Close()

		supabaseURL := os.Getenv("DATABASE_URL")
		if supabaseURL == "" {
			log.Fatal("DATABASE_URL environment variable is not set. Cannot run migration.")
		}

		remoteDB, err := db.Init(supabaseURL)
		if err != nil {
			log.Fatalf("Failed to open remote database: %v", err)
		}
		defer remoteDB.Close()

		cars, err := localDB.GetCars(db.FilterParams{})
		if err != nil {
			log.Fatalf("Failed to retrieve cars from local database: %v", err)
		}

		log.Printf("Retrieved %d cars from SQLite. Migrating to Supabase...", len(cars))
		
		// Configure a concurrent worker pool
		numWorkers := 50
		jobs := make(chan db.Car, len(cars))
		for _, car := range cars {
			jobs <- car
		}
		close(jobs)

		var wg sync.WaitGroup
		var successCount uint64
		var processedCount uint64

		log.Printf("Spawning %d concurrent migration workers...", numWorkers)
		for w := 1; w <= numWorkers; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for car := range jobs {
					err := remoteDB.UpsertCar(car)
					atomic.AddUint64(&processedCount, 1)
					if err != nil {
						log.Printf("Error migrating %s: %v", car.URL, err)
					} else {
						atomic.AddUint64(&successCount, 1)
					}

					currProcessed := atomic.LoadUint64(&processedCount)
					if currProcessed%200 == 0 {
						log.Printf("Progress: %d/%d cars migrated...", currProcessed, len(cars))
					}
				}
			}()
		}
		wg.Wait()

		log.Printf("Migration finished! Successfully migrated %d out of %d cars.", successCount, len(cars))
		return
	}

	// Initialize Database dynamically based on environment
	dbPath := "cars.db"
	if envURL := os.Getenv("DATABASE_URL"); envURL != "" {
		dbPath = envURL
		log.Println("Database connection: Supabase PostgreSQL (from DATABASE_URL)")
	} else {
		log.Println("Database connection: Local SQLite (cars.db)")
	}

	database, err := db.Init(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	if *scrapeFlag || *backfillFlag || *backfillCommentsFlag {
		runScraper := func() {
			s, err := scraper.NewScraper(scraper.ChromeDriverPath, scraper.SeleniumPort, database)
			if err != nil {
				log.Fatalf("Failed to create scraper: %v", err)
			}
			defer s.Service.Stop()

			if *backfillFlag {
				log.Println("Starting seller backfill...")
				s.BackfillSellers()
			}
			if *backfillCommentsFlag {
				log.Println("Starting comment backfill...")
				s.BackfillComments()
			}
			if *scrapeFlag {
				log.Println("Starting scraper...")
				s.Run()
			}
		}

		if *serveFlag {
			// If serving, run the scraper asynchronously in a goroutine so the API server can start
			go runScraper()
		} else {
			// If not serving, run synchronously in the main thread so the program exits cleanly when finished
			runScraper()
		}
	}

	if *serveFlag {
		server := &api.Server{DB: database}
		
		mux := http.NewServeMux()
		mux.HandleFunc("/api/cars", server.HandleCars)
		mux.HandleFunc("/api/cars/favorites", server.HandleCarsByURLs)
		mux.HandleFunc("/api/brands", server.HandleBrands)
		mux.HandleFunc("/api/brands/filtered", server.HandleFilteredBrands)
		mux.HandleFunc("/api/provinces", server.HandleProvinces)
		mux.HandleFunc("/api/stats", server.HandleStats)
		mux.HandleFunc("/api/ai/compare", server.HandleAICompare)

		// Serve static frontend files if they exist
		if _, err := os.Stat("web/dist"); err == nil {
			fs := http.FileServer(http.Dir("web/dist"))
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				// Disable caching for HTML entrypoints to prevent caching issues on updates
				if r.URL.Path == "/" || r.URL.Path == "/index.html" {
					w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
					w.Header().Set("Pragma", "no-cache")
					w.Header().Set("Expires", "0")
				}
				fs.ServeHTTP(w, r)
			})
		} else {
			log.Println("Warning: web/dist not found. Frontend will not be served.")
		}

		log.Printf("Starting API server on :%s...\n", *portFlag)
		if err := http.ListenAndServe(":"+*portFlag, mux); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}
}
