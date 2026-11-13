# CrautosDB - Codebase Improvements & Architecture Guide

Last Updated: 2026-11-12

This document tracks architectural, performance, security, and maintainability improvements for the **CrautosDB** application (Scraper, API, Database, and Web Frontend). It complements [ux-improvements.md](./ux-improvements.md), which covers frontend/product features and UX polish.

---

## Table of Contents
1. [Architecture Overview & Status](#1-architecture-overview--status)
2. [Completed Improvements](#2-completed-improvements)
3. [Remaining Optional Enhancements (Backlog)](#3-remaining-optional-enhancements-backlog)
4. [Implementation Roadmap & Status](#4-implementation-roadmap--status)

---

## 1. Architecture Overview & Status

```mermaid
flowchart TD
    A[Scraper Engine] -->|Producer: Search & Pagination| B(crautos.com Search Form)
    A -->|15 Concurrent HTTP Workers| C(crautos.com Detail Pages)
    C -->|Parsed Car Models| D[(Database Layer)]
    D -->|Local SQLite / Turso / Postgres| E[API Server: Go net/http]
    E -->|REST API| F[Web UI / Analytics]
```

CrautosDB is a Go-based system that scrapes vehicle listings, stores them in SQLite / Turso / PostgreSQL, and exposes an API server and analytical web interface.

---

## 2. Completed Improvements

### ✅ Migration of Detail Scraping & Backfill to Fast HTTP + `goquery`
* **Previous State:** 4 Selenium WebDrivers (Chrome processes) scraped individual car detail pages, accumulating V8 heap bloat until crashing (`0xc000013a`).
* **Current State:**
  * Replaced Chrome detail scraping with **15 concurrent HTTP worker goroutines** using Go's `net/http` and `github.com/PuerkitoBio/goquery`.
  * Replaced Seller Backfilling with **20 concurrent HTTP worker goroutines**.
  * Memory footprint dropped from **>4 GB to ~20 MB** and scraping speed increased by **~20x–30x**.

### ✅ Pure HTTP Search Producer (100% Elimination of Selenium & ChromeDriver)
* **Previous State:** The search producer relied on ChromeDriver for search forms and pagination, requiring bundled `chromedriver.exe` binaries (~20 MB) and headless Chrome.
* **Current State:**
  * Replaced Selenium search producer with direct HTTP POST requests to `searchresults.cfm?p=N` and `goquery` pagination parsing.
  * Removed `github.com/tebeka/selenium` and all ChromeDriver dependencies completely.

### ✅ Database Batching & Multi-Row Upserts (`UpsertCarBatch`)
* **Previous State:** Scraped cars were upserted serially one by one over HTTP/WebSocket to Turso (`libsql://`), incurring 50–150 ms per network round-trip.
* **Current State:**
  * Added `UpsertCarBatch` in `db/queries.go` performing multi-row SQL upserts chunked into 25 records per query (with `recordPriceChanges` tracking in `price_history`).
  * Buffered result collector in `scraper/scraper.go` (25-car batches + 2s ticker flush + individual-retry fallback), reducing remote write latency by ~90–95%.

### ✅ Security: Cloud Run Secret Manager & Local `.env` Autoload
* **Current State:**
  * Production deployments (`deploy_gcp.ps1` with `-SyncSecrets` and `cloudbuild.yaml`) inject `DATABASE_URL` and `OPENROUTER_API_KEY` via Google Cloud Secret Manager (`--set-secrets`) instead of plaintext environment flags.
  * Local development uses stdlib `loadDotEnv(".env")` in `main.go` (without overwriting existing env vars or Secret Manager values), with [.env.example](../.env.example) as template and `.env` / `.env.*` ignored in [.gitignore](../.gitignore).

### ✅ Startup Optimization: Opt-In `CleanUpData` (`-cleanup` Flag)
* **Current State:**
  * Removed the automatic full-table `CleanUpData()` scan from `db.Init()` (`db/db.go`) for instant API and test startup.
  * Exposed cleanup on demand via the `-cleanup` CLI flag in `main.go` (default `false`).
  * Added fast SQL pre-cleanup for placeholder comments (`'-'`, `'--'`, `'---'`, `'.'`, `' '`) and explicit `rows.Close()` before opening the update transaction so SQLite's single-connection pool never deadlocks.

### ✅ Database Connection Pooling (`sql.DB`) & Composite Indexes
* **Current State:**
  * Configured driver-aware `sql.DB` pool limits in `db/db.go` (`Init`):
    * Remote drivers (`postgres`, `libsql`): `SetMaxOpenConns(25)`, `SetMaxIdleConns(10)`, `SetConnMaxLifetime(5m)`, `SetConnMaxIdleTime(2m)`.
    * Local `sqlite`: `SetMaxOpenConns(1)`, `SetMaxIdleConns(1)`, and `PRAGMA busy_timeout=5000` (keeping `:memory:` databases alive in tests and preventing `SQLITE_BUSY` under concurrent writes).
  * Added composite and latency indexes in `schema`: `idx_cars_active_brand_year`, `idx_cars_active_price`, `idx_cars_active_scraped`, and `idx_cars_last_seen`.

### ✅ In-Memory TTL Cache for Filter & Stats Endpoints
* **Current State:**
  * Implemented thread-safe 5-minute TTL caching in `api/cache.go` (`serverCache` on zero-value-safe `api.Server`) for `/api/brands`, `/api/provinces`, `/api/sellers/top`, `/api/stats` (consolidating the 3 car-count queries into one SQL scan), and `/api/stats/detailed`.
  * `HandleRecordVisit` increments `statsVisits` directly via `incrementCachedVisits()` so visit counts reflect immediately without invalidating cached catalog aggregates.
  * Complements the 15-minute `MarketIndex` cache in `api/market.go`.

### ✅ Standardized JSON Error Responses
* **Current State:**
  * Replaced raw `http.Error(...)` calls across `api/handlers.go`, `api/deals.go`, and `api/price_history.go` with `respondError(w, code, message)` returning `{"error", "code"}` and `Content-Type: application/json`, keeping internal DB/HTTP errors strictly in server logs.
  * Deferred SSE headers (`text/event-stream`) in `HandleAICompare` until streaming actually begins so pre-stream OpenRouter failures return clean JSON errors, and updated `compareWithAI` in `web/src/api/client.js` to extract `parsedErr.error`.

### ✅ Graceful HTTP Server Shutdown
* **Current State:**
  * Replaced blocking `http.ListenAndServe` in `main.go` with `signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)` and `&http.Server{ReadHeaderTimeout: 10s, IdleTimeout: 120s}` calling `Shutdown` with a 10-second drain timeout (while avoiding a short `WriteTimeout` so SSE streams on `/api/ai/compare` remain uninterrupted).

### ✅ Multi-Stage Alpine `Dockerfile`, `.dockerignore`, CI Quality Gate (`gofmt`/`go vet`/`go test`) & Unit Tests
* **Current State:**
  * Multi-stage Alpine [Dockerfile](../Dockerfile) (with [.dockerignore](../.dockerignore) excluding local DBs, secrets, binaries, and `node_modules`) runs `npm run lint` (`eslint .`), `npm run build`, `gofmt -l main.go api db scraper cmd`, `CGO_ENABLED=0 go vet`, and `CGO_ENABLED=0 go test -count=1` across all Go packages before compiling the static Linux binary.
  * Automated unit test coverage across `scraper/` (`scraper_test.go` + offline HTML fixtures in `scraper/testdata/`), `db/` (`db_optimizations_test.go`, `count_cars_test.go`, `market_test.go`, `market_flags_test.go`, `price_history_test.go`, `queries_test.go`), and `api/` (`cache_errors_test.go`, `deals_test.go`, `price_history_test.go`).

### ✅ Scraper Context Propagation & Cancellation Safety
* **Current State:**
  * Shared `signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)` in [main.go](../main.go) propagates into `scraper.Run(ctx)`, `ProcessBrand(ctx, ...)`, `BackfillSellers(ctx)`, and `BackfillComments(ctx)`, plus `-migrate` workers and graceful background scraper drain on server shutdown.
  * Search POSTs (`producer`) and detail/backfill GETs (`scrapeCarHTTP`, `fetchSellerHTTP`, `BackfillComments`) use `http.NewRequestWithContext`, interruptible sleeps (`sleepContext`), HTTP `200 OK` validation before comment backfill writes, and skip `MarkSold` whenever `ctx.Err() != nil` so partial scrapes never misclassify remaining inventory as sold.

### ✅ Offline Scraper HTML Fixtures & End-to-End Tests
* **Current State:**
  * Added representative offline HTML fixtures in `scraper/testdata/` (`used_car_detail.html`, `used_car_fallback.html`, `new_car_detail.html`, `search_results_page1.html`) paired with `httptest.Server` + SQLite `:memory:` tests in `scraper/scraper_test.go`.
  * Verifies `scrapeUsedCarHTTP` (standard + colones/miles/fallback table), `scrapeNewCarHTTP`, `BackfillSellers`, `BackfillComments` (including HTTP 500 preservation), and `ProcessBrand` end-to-end (`MarkSold` on complete runs vs. preservation on canceled `ctx`).

---

## 3. Remaining Optional Enhancements (Backlog)

*All planned P1–P3 architectural, CI, and offline-test items are complete. Optional future enhancement:*
* **`golangci-lint` in CI:** Add `golangci-lint` alongside the existing `gofmt -l`, `go vet`, and `go test -count=1` gates if stricter static analyzers beyond standard `go vet` are desired later.

---

## 4. Implementation Roadmap & Status

| Status | Feature / Task | Scope | Outcome |
| :---: | :--- | :---: | :--- |
| **Completed** | **Fast HTTP + `goquery` Workers** | Scraper | 20–30x faster scraping, ~20 MB RAM |
| **Completed** | **Pure HTTP Search Producer** | Scraper | Removes Selenium & ChromeDriver completely |
| **Completed** | **Batch DB Upserts (`UpsertCarBatch`)** | DB / Scraper | 90–95% reduction in remote DB write latency |
| **Completed** | **Secret Manager & Local `.env` Autoload** | Infra / App | Zero plaintext secrets in deploy scripts or VCS |
| **Completed** | **Connection Pooling (`sql.DB`) & Composite Indexes** | DB | Prevents connection exhaustion & speeds filtered queries |
| **Completed** | **Startup `CleanUpData` Optimization (`-cleanup`)** | DB / CLI | Instant application and test startup |
| **Completed** | **In-Memory TTL Cache for Filter & Stats API** | API | Sub-millisecond static/stats responses + live visit counter |
| **Completed** | **Standardized JSON Error Responses** | API / Web | Consistent `{"error", "code"}` responses without SQL leaks |
| **Completed** | **Graceful HTTP Server Shutdown** | Server | Clean `SIGINT`/`SIGTERM` request draining |
| **Completed** | **Unit Tests (Parsers, DB Optimizations, API Cache/Errors)** | Tests | Guards parser logic, pool/indexes, cache TTL, and JSON errors |
| **Completed** | **Scraper Context Propagation** | Scraper / CLI | Clean `SIGINT`/`SIGTERM` cancellation & `MarkSold` safety |
| **Completed** | **Offline HTML Detail Fixture Tests** | Scraper / Tests | Catch upstream `crautos.com` HTML structure changes offline |
| **Completed** | **Run `go vet` / `go test` in CI + `.dockerignore`** | CI/CD | Automated backend vet & test gate in Cloud Build |
