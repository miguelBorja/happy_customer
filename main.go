package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"crautosdb/api"
	"crautosdb/db"
	"crautosdb/scraper"
	"crautosdb/thumbs"
)

// loadDotEnv loads KEY=VALUE pairs from filename into the environment.
// Missing files are ignored silently. Existing environment variables are not overwritten.
func loadDotEnv(filename string) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return
	}
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		if key != "" && os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

func runThumbs(ctx context.Context, database *db.DB, backfill bool, limit, workers int, delay time.Duration) {
	bucket := strings.TrimSpace(os.Getenv("THUMBS_BUCKET"))
	if bucket == "" {
		log.Println("Thumbs: disabled (THUMBS_BUCKET not set)")
		return
	}
	store, err := thumbs.NewGCSStore(ctx, bucket)
	if err != nil {
		log.Printf("Warning: failed to initialize GCS thumbnail store: %v", err)
		return
	}
	defer func() { _ = store.Close() }()

	if limit <= 0 {
		limit = 1500
	}
	runner := &thumbs.Runner{
		DB:      database,
		Store:   store,
		Workers: workers,
		Delay:   delay,
	}
	if backfill {
		log.Println("Starting thumbnail backfill...")
		if _, err := runner.RunBackfill(ctx, limit); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("Warning: thumbnail backfill ended with error: %v", err)
		}
		return
	}

	log.Printf("Starting thumbnail sync (limit=%d, workers=%d, delay=%s)...", limit, workers, delay)
	thumbCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	if _, err := runner.Run(thumbCtx, limit); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("Warning: thumbnail sync ended with error: %v", err)
	}
}

func main() {
	loadDotEnv(".env")

	scrapeFlag := flag.Bool("scrape", true, "Run the scraper")
	serveFlag := flag.Bool("serve", true, "Run the API server")
	backfillFlag := flag.Bool("backfill", false, "Backfill seller info for existing cars")
	backfillCommentsFlag := flag.Bool("backfill-comments", false, "Backfill comments for active cars")
	thumbsFlag := flag.Bool("thumbs", true, "Download and store active listing thumbnails in GCS after scraping")
	thumbsOnlyFlag := flag.Bool("thumbs-only", false, "Run one active-only thumbnail batch (-thumbs-limit) without scraping and exit")
	backfillThumbsFlag := flag.Bool("backfill-thumbs", false, "Backfill listing thumbnails in GCS (including sold cars) and exit")
	thumbsLimitFlag := flag.Int("thumbs-limit", 1500, "Maximum active/retryable thumbnails (or backfill batch size) per run")
	thumbsWorkersFlag := flag.Int("thumbs-workers", 2, "Concurrent workers for thumbnail downloads")
	thumbsDelayFlag := flag.Duration("thumbs-delay", 400*time.Millisecond, "Pause between thumbnail downloads per worker")
	cleanupFlag := flag.Bool("cleanup", false, "Clean up whitespace and placeholder comments in existing car records")
	defaultPort := os.Getenv("PORT")
	if defaultPort == "" {
		defaultPort = "8080"
	}
	portFlag := flag.String("port", defaultPort, "Port for the API server")
	migrateFlag := flag.Bool("migrate", false, "Migrate all data from local SQLite (cars.db) to Supabase")
	forceScrapeFlag := flag.Bool("force-scrape", false, "Force scrape all cars even if they exist in the database")
	skipRefreshedHoursFlag := flag.Int("skip-refreshed-hours", 24, "Skip force-scraping cars that were already refreshed within this number of hours (0 to disable skipping)")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
					if ctx.Err() != nil {
						return
					}
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
		if strings.HasPrefix(envURL, "libsql://") || strings.HasPrefix(envURL, "libsqls://") {
			log.Println("Database connection: Turso SQLite (from DATABASE_URL)")
		} else {
			log.Println("Database connection: Supabase PostgreSQL (from DATABASE_URL)")
		}
	} else {
		log.Println("Database connection: Local SQLite (cars.db)")
	}

	database, err := db.Init(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	if *cleanupFlag {
		log.Println("Running database cleanup...")
		if err := database.CleanUpData(); err != nil {
			log.Printf("Warning: database cleanup failed: %v", err)
		}
	}

	var scraperDone chan struct{}
	if *scrapeFlag || *backfillFlag || *backfillCommentsFlag || *thumbsOnlyFlag || *backfillThumbsFlag {
		runScraper := func() {
			if *scrapeFlag || *backfillFlag || *backfillCommentsFlag {
				s := scraper.NewScraper(database, *forceScrapeFlag, *skipRefreshedHoursFlag)

				if *backfillFlag && ctx.Err() == nil {
					log.Println("Starting seller backfill...")
					s.BackfillSellers(ctx)
				}
				if *backfillCommentsFlag && ctx.Err() == nil {
					log.Println("Starting comment backfill...")
					s.BackfillComments(ctx)
				}
				if *scrapeFlag && ctx.Err() == nil {
					log.Println("Starting scraper...")
					s.Run(ctx)
					if *thumbsFlag && !*thumbsOnlyFlag && !*backfillThumbsFlag && ctx.Err() == nil {
						runThumbs(ctx, database, false, *thumbsLimitFlag, *thumbsWorkersFlag, *thumbsDelayFlag)
					}
				}
			}
			if *thumbsOnlyFlag && !*backfillThumbsFlag && ctx.Err() == nil {
				runThumbs(ctx, database, false, *thumbsLimitFlag, *thumbsWorkersFlag, *thumbsDelayFlag)
			}
			if *backfillThumbsFlag && ctx.Err() == nil {
				runThumbs(ctx, database, true, *thumbsLimitFlag, *thumbsWorkersFlag, *thumbsDelayFlag)
			}
		}

		if *serveFlag {
			// If serving, run the scraper asynchronously in a goroutine so the API server can start
			scraperDone = make(chan struct{})
			go func() {
				defer close(scraperDone)
				runScraper()
			}()
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
		mux.HandleFunc("/api/cars/price-history", server.HandlePriceHistory)
		mux.HandleFunc("/api/searches/digest", server.HandleSearchesDigest)
		mux.HandleFunc("/api/valuate", server.HandleValuate)
		mux.HandleFunc("/api/depreciation", server.HandleDepreciation)
		mux.HandleFunc("/api/bargains", server.HandleBargains)
		mux.HandleFunc("/api/brands", server.HandleBrands)
		mux.HandleFunc("/api/brands/filtered", server.HandleFilteredBrands)
		mux.HandleFunc("/api/models/filtered", server.HandleFilteredModels)
		mux.HandleFunc("/api/styles", server.HandleStyles)
		mux.HandleFunc("/api/provinces", server.HandleProvinces)
		mux.HandleFunc("/api/stats", server.HandleStats)
		mux.HandleFunc("/api/stats/detailed", server.HandleDetailedStats)
		mux.HandleFunc("/api/visit", server.HandleRecordVisit)
		mux.HandleFunc("/api/ai/compare", server.HandleAICompare)
		mux.HandleFunc("/api/sellers/top", server.HandleTopSellers)
		mux.HandleFunc("/api/sellers/summary", server.HandleSellerSummary)
		mux.HandleFunc("/sitemap.xml", server.HandleSitemap)
		mux.HandleFunc("/robots.txt", server.HandleRobotsTxt)

		// Serve static frontend files if they exist
		if _, err := os.Stat("web/dist"); err == nil {
			fs := http.FileServer(http.Dir("web/dist"))
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/" || r.URL.Path == "/index.html" {
					server.ServeIndexHTML(w, r, "web/dist/index.html")
					return
				}
				switch r.URL.Path {
				case "/sw.js":
					w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				case "/manifest.webmanifest":
					w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
					w.Header().Set("Cache-Control", "public, max-age=3600")
				}
				fs.ServeHTTP(w, r)
			})
		} else {
			log.Println("Warning: web/dist not found. Frontend will not be served.")
		}

		log.Printf("Starting API server on :%s...\n", *portFlag)

		httpServer := &http.Server{
			Addr:              ":" + *portFlag,
			Handler:           mux,
			ReadHeaderTimeout: 10 * time.Second,
			IdleTimeout:       120 * time.Second,
		}

		serverErr := make(chan error, 1)
		go func() {
			if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				serverErr <- err
			}
		}()

		select {
		case err := <-serverErr:
			log.Fatalf("Server failed: %v", err)
		case <-ctx.Done():
			log.Println("Shutting down server...")
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := httpServer.Shutdown(shutdownCtx); err != nil {
				log.Printf("Server shutdown error: %v", err)
			}
			if scraperDone != nil {
				waitTimer := time.NewTimer(10 * time.Second)
				select {
				case <-scraperDone:
				case <-waitTimer.C:
					log.Println("Timed out waiting for background scraper to finish.")
				}
				waitTimer.Stop()
			}
		}
	}
}
