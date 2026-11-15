package thumbs

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"crautosdb/db"
)

const (
	defaultWorkers    = 2
	defaultDelay      = 400 * time.Millisecond
	defaultMaxBlocked = 3
)

// ErrStoreUnavailable signals that repeated storage write errors forced the runner to stop early.
var ErrStoreUnavailable = errors.New("thumbnail store unavailable")

// Summary reports counts produced by a Runner execution.
type Summary struct {
	Stored  int
	Missing int
	Failed  int
	Skipped int
}

// Runner coordinates downloading pending thumbnails and uploading them to Store.
type Runner struct {
	DB         *db.DB
	Store      Store
	Client     *http.Client
	BaseURL    string
	Workers    int           // defaults to 2
	Delay      time.Duration // defaults to 400ms; < 0 disables delay (for tests)
	MaxBlocked int           // defaults to 3 consecutive/total 403/429 responses before aborting
}

// Run processes up to limit daily candidate listings and logs a summary line.
func (r *Runner) Run(ctx context.Context, limit int) (Summary, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	start := time.Now()
	urls, err := r.DB.ThumbCandidates(limit)
	if err != nil {
		return Summary{}, err
	}
	sum, runErr := r.processURLs(ctx, urls)
	log.Printf("Thumbs: stored=%d missing=%d failed=%d skipped=%d in %.1fs",
		sum.Stored, sum.Missing, sum.Failed, sum.Skipped, time.Since(start).Seconds())
	return sum, runErr
}

// RunBackfill processes all pending (thumb_status = 0) listings including sold cars in batches.
func (r *Runner) RunBackfill(ctx context.Context, batchSize int) (Summary, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if batchSize <= 0 {
		batchSize = 1000
	}
	start := time.Now()
	var total Summary
	for {
		if ctx.Err() != nil {
			break
		}
		urls, err := r.DB.ThumbBackfillCandidates(batchSize)
		if err != nil {
			return total, err
		}
		if len(urls) == 0 {
			break
		}
		batchSum, batchErr := r.processURLs(ctx, urls)
		total.Stored += batchSum.Stored
		total.Missing += batchSum.Missing
		total.Failed += batchSum.Failed
		total.Skipped += batchSum.Skipped
		if batchErr != nil {
			log.Printf("Thumbs backfill stopped: stored=%d missing=%d failed=%d skipped=%d in %.1fs (err=%v)",
				total.Stored, total.Missing, total.Failed, total.Skipped, time.Since(start).Seconds(), batchErr)
			return total, batchErr
		}
		if batchSum.Stored+batchSum.Missing+batchSum.Failed == 0 {
			break
		}
	}
	log.Printf("Thumbs backfill: stored=%d missing=%d failed=%d skipped=%d in %.1fs",
		total.Stored, total.Missing, total.Failed, total.Skipped, time.Since(start).Seconds())
	return total, ctx.Err()
}

func (r *Runner) processURLs(ctx context.Context, urls []string) (Summary, error) {
	if len(urls) == 0 {
		return Summary{}, nil
	}

	workers := r.Workers
	if workers <= 0 {
		workers = defaultWorkers
	}
	delay := r.Delay
	if delay == 0 {
		delay = defaultDelay
	}
	maxBlocked := r.MaxBlocked
	if maxBlocked <= 0 {
		maxBlocked = defaultMaxBlocked
	}
	client := r.Client
	if client == nil {
		client = DefaultHTTPClient()
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	jobs := make(chan string, len(urls))
	for _, u := range urls {
		jobs <- u
	}
	close(jobs)

	var (
		wg               sync.WaitGroup
		stored           atomic.Int64
		missing          atomic.Int64
		failed           atomic.Int64
		skipped          atomic.Int64
		blockedCount     atomic.Int64
		blockedTriggered atomic.Bool
		storeErrCount    atomic.Int64
		storeAborted     atomic.Bool
	)

	workerFn := func() {
		defer wg.Done()
		for u := range jobs {
			if runCtx.Err() != nil {
				skipped.Add(1)
				continue
			}

			id := CarID(u)
			if id == "" {
				if err := r.DB.SetThumbStatus(u, db.ThumbMissing); err != nil {
					log.Printf("Warning: SetThumbStatus missing(%s): %v", u, err)
				}
				missing.Add(1)
				continue
			}

			data, err := FetchFromBase(runCtx, client, r.BaseURL, id)
			if err != nil {
				switch {
				case runCtx.Err() != nil && !errors.Is(err, ErrBlocked):
					skipped.Add(1)
					continue
				case errors.Is(err, ErrNoThumb):
					if dbErr := r.DB.SetThumbStatus(u, db.ThumbMissing); dbErr != nil {
						log.Printf("Warning: SetThumbStatus missing(%s): %v", u, dbErr)
					}
					missing.Add(1)
				case errors.Is(err, ErrBlocked):
					if dbErr := r.DB.SetThumbStatus(u, db.ThumbFailed); dbErr != nil {
						log.Printf("Warning: SetThumbStatus failed(%s): %v", u, dbErr)
					}
					failed.Add(1)
					if blockedCount.Add(1) >= int64(maxBlocked) {
						if blockedTriggered.CompareAndSwap(false, true) {
							log.Printf("Thumbs: received %d HTTP 403/429 responses from Crautos; stopping step.", maxBlocked)
							cancel()
						}
					}
				default:
					if dbErr := r.DB.SetThumbStatus(u, db.ThumbFailed); dbErr != nil {
						log.Printf("Warning: SetThumbStatus failed(%s): %v", u, dbErr)
					}
					failed.Add(1)
				}
				sleepDelay(runCtx, delay)
				continue
			}

			if err := r.Store.Put(runCtx, Key(id), data); err != nil {
				if runCtx.Err() != nil {
					skipped.Add(1)
					continue
				}
				log.Printf("Warning: Store.Put(%s): %v", Key(id), err)
				if dbErr := r.DB.SetThumbStatus(u, db.ThumbFailed); dbErr != nil {
					log.Printf("Warning: SetThumbStatus failed(%s): %v", u, dbErr)
				}
				failed.Add(1)
				if storeErrCount.Add(1) >= int64(maxBlocked) {
					if storeAborted.CompareAndSwap(false, true) {
						log.Printf("Thumbs: received %d storage errors; stopping step (verify bucket exists and IAM roles).", maxBlocked)
						cancel()
					}
				}
				sleepDelay(runCtx, delay)
				continue
			}

			if err := r.DB.SetThumbStatus(u, db.ThumbStored); err != nil {
				log.Printf("Warning: SetThumbStatus stored(%s): %v", u, err)
			}
			stored.Add(1)
			sleepDelay(runCtx, delay)
		}
	}

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go workerFn()
	}
	wg.Wait()

	sum := Summary{
		Stored:  int(stored.Load()),
		Missing: int(missing.Load()),
		Failed:  int(failed.Load()),
		Skipped: int(skipped.Load()),
	}
	if blockedTriggered.Load() {
		return sum, ErrBlocked
	}
	if storeAborted.Load() {
		return sum, ErrStoreUnavailable
	}
	return sum, ctx.Err()
}

func sleepDelay(ctx context.Context, d time.Duration) {
	if d <= 0 || ctx.Err() != nil {
		return
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}
