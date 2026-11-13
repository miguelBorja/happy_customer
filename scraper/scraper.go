package scraper

import (
	"context"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"crautosdb/db"

	"github.com/PuerkitoBio/goquery"
)

const (
	HTTPWorkerCount = 15
)

var (
	millasRegexp     = regexp.MustCompile(`,|millas| `)
	kilometersRegexp = regexp.MustCompile(`,|kms| `)
	precioNumRegexp  = regexp.MustCompile(`[^\d]`)

	targetBrands = map[string]string{
		"electric":      "4",
		"chevrolet":     "6",
		"daihatsu":      "10",
		"Fiat":          "12",
		"ford":          "13",
		"honda":         "15",
		"hyundai":       "16",
		"kia":           "19",
		"land rover":    "21",
		"mazda":         "23",
		"mitsubishi":    "25",
		"nissan":        "26",
		"Peugeot":       "27",
		"suzuki":        "34",
		"toyota":        "35",
		"volkswagen":    "36",
		"volvo":         "37",
		"citroen":       "46",
		"mini":          "51",
		"skoda":         "53",
		"donfeng (ZNA)": "64",
		"JAC":           "75",
		"mahindra":      "81",
		"chery":         "88",
		"BYD":           "97",
		"changan":       "108",
		"Haval":         "121",
		"xpeng":         "122",
		"omoda":         "129",
		"kaiyi":         "131",
		"neta":          "133",
		"zeekr":         "132",
	}
)

type Scraper struct {
	DB                 *db.DB
	Force              bool
	SkipRefreshedHours int
	BaseURL            string
	HTTPClient         *http.Client
}

func NewScraper(database *db.DB, force bool, skipRefreshedHours int) *Scraper {
	return &Scraper{
		DB:                 database,
		Force:              force,
		SkipRefreshedHours: skipRefreshedHours,
		BaseURL:            "https://crautos.com",
	}
}

func (s *Scraper) baseURL() string {
	if trimmed := strings.TrimRight(strings.TrimSpace(s.BaseURL), "/"); trimmed != "" {
		return trimmed
	}
	return "https://crautos.com"
}

func (s *Scraper) httpClient() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return createHTTPClient()
}

func normalizeContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func sleepContext(ctx context.Context, d time.Duration) bool {
	if ctx.Err() != nil {
		return false
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (s *Scraper) Run(ctx context.Context) {
	ctx = normalizeContext(ctx)
	for brandName, brandID := range targetBrands {
		if ctx.Err() != nil {
			log.Printf("=== Scrape Run Canceled Before Brand %s (%v) ===", brandName, ctx.Err())
			return
		}
		log.Printf("=== Starting Brand: %s ===\n", brandName)
		s.ProcessBrand(ctx, brandName, brandID)
	}
	log.Println("=== Scrape Run Completed ===")
}

func createHTTPClient() *http.Client {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 25,
		IdleConnTimeout:     90 * time.Second,
		DisableKeepAlives:   false,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
	}
}

func (s *Scraper) BackfillSellers(ctx context.Context) {
	ctx = normalizeContext(ctx)
	urls, err := s.DB.GetURLsWithoutSeller()
	if err != nil {
		log.Printf("Error getting URLs without seller: %v", err)
		return
	}
	if len(urls) == 0 {
		log.Println("All cars already have seller info. Nothing to backfill.")
		return
	}
	log.Printf("Backfilling seller info for %d cars using fast HTTP workers...", len(urls))

	workerCount := 20
	jobs := make(chan string, len(urls))
	for _, u := range urls {
		jobs <- u
	}
	close(jobs)

	client := s.httpClient()
	var wg sync.WaitGroup
	var updatedCount uint64
	var totalChecked uint64

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for u := range jobs {
				if ctx.Err() != nil {
					return
				}
				name, phone, address, err := s.fetchSellerHTTP(ctx, client, u)
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					log.Printf("Error fetching seller for %s: %v", u, err)
					continue
				}
				if name != "" || phone != "" || address != "" {
					if err := s.DB.UpdateSeller(u, name, phone, address); err != nil {
						log.Printf("Error updating seller for %s: %v", u, err)
					} else {
						atomic.AddUint64(&updatedCount, 1)
					}
				}
				curr := atomic.AddUint64(&totalChecked, 1)
				if curr%100 == 0 {
					log.Printf("Progress: %d/%d sellers checked (Updated: %d)", curr, len(urls), atomic.LoadUint64(&updatedCount))
				}
			}
		}()
	}

	wg.Wait()
	log.Printf("Seller backfill complete. Checked %d cars, updated %d sellers.", len(urls), updatedCount)
}

func (s *Scraper) fetchSellerHTTP(ctx context.Context, client *http.Client, targetURL string) (name, phone, address string, err error) {
	ctx = normalizeContext(ctx)
	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", "", fmt.Errorf("bad status: %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return "", "", "", err
	}

	// Used car: table.table-responsive containing "Vendedor"
	doc.Find("table.table-responsive").EachWithBreak(func(_ int, vt *goquery.Selection) bool {
		if strings.Contains(vt.Text(), "Vendedor") {
			vt.Find("tr").Each(func(_ int, tr *goquery.Selection) {
				tds := tr.Find("td")
				if tds.Length() >= 2 {
					k := cleanText(tds.Eq(0).Text())
					v := cleanText(tds.Eq(1).Text())
					switch {
					case strings.Contains(k, "Nombre"):
						name = v
					case strings.Contains(k, "Teléfono"):
						phone = v
					case strings.Contains(k, "Dirección"):
						address = v
					}
				}
			})
			return false
		}
		return true
	})

	// New car: #dealer
	if name == "" && phone == "" && address == "" {
		dealer := doc.Find("#dealer")
		if dealer.Length() > 0 {
			name = cleanText(dealer.Find("h4").First().Text())
			address = cleanText(dealer.Find("h5").First().Text())
			dealer.Find("tr").EachWithBreak(func(_ int, tr *goquery.Selection) bool {
				tds := tr.Find("td")
				if tds.Length() >= 2 {
					k := cleanText(tds.Eq(0).Text())
					v := cleanText(tds.Eq(1).Text())
					if strings.Contains(k, "Telef") || strings.Contains(k, "Teléfono") || strings.Contains(k, "Celular") {
						phone = v
						return false
					}
				}
				return true
			})
		}
	}
	return name, phone, address, nil
}

func (s *Scraper) BackfillComments(ctx context.Context) {
	ctx = normalizeContext(ctx)
	urls, err := s.DB.GetURLsWithoutComment()
	if err != nil {
		log.Printf("Error getting URLs without comment: %v", err)
		return
	}
	if len(urls) == 0 {
		log.Println("All active cars already have comments checked. Nothing to backfill.")
		return
	}
	log.Printf("Backfilling comments for %d cars...", len(urls))

	jobs := make(chan string, len(urls))
	for _, u := range urls {
		jobs <- u
	}
	close(jobs)

	// Regexes for comment extraction
	reTable := regexp.MustCompile(`background-color:\s*#177001[^>]*>([^<]+)</td>`)
	reBgColor := regexp.MustCompile(`bgcolor="#FAF7B4"[^>]*>([^<]+)</td>`)

	var wg sync.WaitGroup
	workerCount := 30
	var successCount uint64
	var noCommentCount uint64
	var totalChecked uint64

	client := s.httpClient()

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for u := range jobs {
				if ctx.Err() != nil {
					return
				}
				req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
				if err != nil {
					continue
				}
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

				resp, err := client.Do(req)
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					log.Printf("Error fetching %s: %v", u, err)
					continue
				}

				if resp.StatusCode != http.StatusOK {
					resp.Body.Close()
					log.Printf("Unexpected status %d fetching comment for %s", resp.StatusCode, u)
					continue
				}

				bodyBytes, err := io.ReadAll(resp.Body)
				resp.Body.Close()
				if err != nil {
					continue
				}

				body := string(bodyBytes)
				comment := "-"

				match := reTable.FindStringSubmatch(body)
				if len(match) > 1 {
					comment = strings.TrimSpace(match[1])
				} else {
					match2 := reBgColor.FindStringSubmatch(body)
					if len(match2) > 1 {
						comment = strings.TrimSpace(match2[1])
					}
				}

				comment = html.UnescapeString(comment)

				err = s.DB.UpdateComment(u, comment)
				if err != nil {
					log.Printf("Error updating comment for %s: %v", u, err)
				} else {
					if db.CleanComment(comment) != "" {
						atomic.AddUint64(&successCount, 1)
					} else {
						atomic.AddUint64(&noCommentCount, 1)
					}
				}

				currTotal := atomic.AddUint64(&totalChecked, 1)
				if currTotal%100 == 0 {
					log.Printf("Progress: %d/%d cars checked for comments (Found: %d, None: %d)", currTotal, len(urls), atomic.LoadUint64(&successCount), atomic.LoadUint64(&noCommentCount))
				}
			}
		}()
	}

	wg.Wait()
	log.Printf("Comment backfill complete. Checked %d cars. Found comments for %d cars. No comment for %d cars.", len(urls), successCount, noCommentCount)
}

func isRecentlyRefreshed(lastSeen time.Time, skipHours int) bool {
	if lastSeen.IsZero() {
		return false
	}
	if time.Since(lastSeen) < time.Duration(skipHours)*time.Hour {
		return true
	}
	now := time.Now()
	if lastSeen.Year() == now.Year() && lastSeen.YearDay() == now.YearDay() {
		return true
	}
	return false
}

func (s *Scraper) ProcessBrand(ctx context.Context, brandName, brandID string) {
	ctx = normalizeContext(ctx)
	if ctx.Err() != nil {
		return
	}

	var activeCars map[string]time.Time
	var err error
	if brandName == "electric" {
		activeCars, err = s.DB.GetActiveCarsLastSeenByFuel("eléctric")
	} else {
		activeCars, err = s.DB.GetActiveCarsLastSeen(brandName)
	}
	if err != nil {
		log.Printf("Error getting active URLs for %s: %v", brandName, err)
		return
	}

	jobs := make(chan string, 300)
	results := make(chan db.Car, 300)
	var wg sync.WaitGroup

	httpClient := s.httpClient()

	// Spawn fast HTTP workers (Zero Chrome memory footprint)
	for i := 0; i < HTTPWorkerCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			s.worker(ctx, id, httpClient, jobs, results)
		}(i)
	}

	producerDone := make(chan map[string]bool)
	go func() {
		seen := s.producer(ctx, httpClient, brandName, brandID, jobs, activeCars)
		close(jobs)
		producerDone <- seen
	}()

	doneCollecting := make(chan int)
	go func() {
		counter := 0
		const batchSize = 25
		buffer := make([]db.Car, 0, batchSize)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		flush := func() {
			if len(buffer) == 0 {
				return
			}
			n := len(buffer)
			if err := s.DB.UpsertCarBatch(buffer); err != nil {
				log.Printf("Batch upsert of %d cars failed (%v), retrying individually...", n, err)
				for _, c := range buffer {
					if err := s.DB.UpsertCar(c); err != nil {
						log.Printf("Error saving car %s: %v", c.URL, err)
					} else {
						counter++
					}
				}
			} else {
				counter += n
			}
			log.Printf("Saved %d new/updated cars...", counter)
			buffer = buffer[:0]
		}

		for {
			select {
			case car, ok := <-results:
				if !ok {
					flush()
					doneCollecting <- counter
					return
				}
				buffer = append(buffer, car)
				if len(buffer) >= batchSize {
					flush()
				}
			case <-ticker.C:
				flush()
			}
		}
	}()

	wg.Wait()
	close(results)
	savedCount := <-doneCollecting
	seenUrls := <-producerDone

	if ctx.Err() != nil {
		log.Printf("Skipping MarkSold for %s: scrape canceled (%v).", brandName, ctx.Err())
	} else if len(seenUrls) > 0 {
		var sold []string
		for url := range activeCars {
			if !seenUrls[url] {
				sold = append(sold, url)
			}
		}
		if len(sold) > 0 {
			if err := s.DB.MarkSold(sold); err != nil {
				log.Printf("Error marking cars sold: %v", err)
			}
			log.Printf("Marked %d cars as sold.", len(sold))
		}
	} else {
		log.Printf("Skipping MarkSold for %s: search returned 0 URLs or encountered an error.", brandName)
	}
	log.Printf("Finished brand %s. Saved/updated %d cars.\n", brandName, savedCount)
}

func (s *Scraper) producer(ctx context.Context, client *http.Client, brandName, brandID string, jobs chan<- string, active map[string]time.Time) map[string]bool {
	form := url.Values{
		"brand":     {"00"},
		"modelstr":  {""},
		"style":     {"00"},
		"fuel":      {"0"},
		"trans":     {"0"},
		"financed":  {"00"},
		"recibe":    {"0"},
		"province":  {"0"},
		"doors":     {"0"},
		"yearfrom":  {"2000"},
		"yearto":    {"2027"},
		"pricefrom": {"100000"},
		"priceto":   {"800000000"},
		"orderby":   {"0"},
		"newused":   {"0"},
		"lformat":   {"0"},
		"l":         {"1"},
	}

	if brandName == "electric" {
		form.Set("fuel", brandID) // "4"
		form.Set("brand", "00")
	} else {
		form.Set("brand", brandID)
	}

	base := s.baseURL()
	encodedForm := form.Encode()
	seenUrls := make(map[string]bool)
	queuedCount := 0
	skippedCount := 0
	hadError := false

	for page := 1; ; page++ {
		if ctx.Err() != nil {
			hadError = true
			break
		}

		targetURL := fmt.Sprintf("%s/autosusados/searchresults.cfm?p=%d", base, page)
		doSearchPost := func() (*http.Response, error) {
			req, err := http.NewRequestWithContext(ctx, "POST", targetURL, strings.NewReader(encodedForm))
			if err != nil {
				return nil, err
			}
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
			req.Header.Set("Referer", base+"/autosusados/index.cfm")
			return client.Do(req)
		}

		resp, err := doSearchPost()
		if err != nil {
			if ctx.Err() != nil || !sleepContext(ctx, 500*time.Millisecond) {
				hadError = true
				break
			}
			resp, err = doSearchPost()
			if err != nil {
				log.Printf("[%s] Error fetching search page %d: %v", brandName, page, err)
				hadError = true
				break
			}
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			log.Printf("[%s] Unexpected status %d on search page %d", brandName, resp.StatusCode, page)
			hadError = true
			break
		}

		doc, err := goquery.NewDocumentFromReader(resp.Body)
		resp.Body.Close()
		if err != nil {
			log.Printf("[%s] Failed to parse HTML on search page %d: %v", brandName, page, err)
			hadError = true
			break
		}

		pageCarCount := 0
		doc.Find("td.brandtitle a").EachWithBreak(func(i int, el *goquery.Selection) bool {
			if ctx.Err() != nil {
				hadError = true
				return false
			}
			href, exists := el.Attr("href")
			href = strings.TrimSpace(href)
			if exists && href != "" && strings.Contains(href, "cardetail.cfm") {
				if !strings.HasPrefix(href, "http") {
					if strings.HasPrefix(href, "/") {
						href = base + href
					} else {
						href = base + "/autosusados/" + href
					}
				}

				if !seenUrls[href] {
					seenUrls[href] = true
					pageCarCount++

					lastSeen, existsInDB := active[href]
					shouldScrape := false
					if !existsInDB {
						shouldScrape = true
					} else if s.Force {
						if s.SkipRefreshedHours > 0 && isRecentlyRefreshed(lastSeen, s.SkipRefreshedHours) {
							skippedCount++
						} else {
							shouldScrape = true
						}
					}

					if shouldScrape {
						select {
						case <-ctx.Done():
							hadError = true
							return false
						case jobs <- href:
							queuedCount++
						}
					}
				}
			}
			return true
		})

		if hadError || pageCarCount == 0 {
			break
		}

		// Check if there is a next page element (.page-item.page-next)
		hasNext := false
		doc.Find(".page-item.page-next .page-link, .page-item .page-link").Each(func(i int, sel *goquery.Selection) {
			txt := strings.TrimSpace(sel.Text())
			if txt == ">" || txt == "»" {
				hasNext = true
			}
		})

		if !hasNext {
			break
		}

		if !sleepContext(ctx, 100*time.Millisecond) {
			hadError = true
			break
		}
	}

	if skippedCount > 0 {
		log.Printf("[%s] Producer summary: %d queued, %d skipped (already refreshed within %dh)", brandName, queuedCount, skippedCount, s.SkipRefreshedHours)
	} else {
		log.Printf("[%s] Producer summary: %d queued", brandName, queuedCount)
	}

	if hadError || len(seenUrls) == 0 {
		return nil
	}

	return seenUrls
}

func (s *Scraper) worker(ctx context.Context, id int, client *http.Client, jobs <-chan string, results chan<- db.Car) {
	for u := range jobs {
		if ctx.Err() != nil {
			return
		}
		car, err := s.scrapeCarHTTP(ctx, client, u)
		if err != nil {
			if ctx.Err() != nil || !sleepContext(ctx, 500*time.Millisecond) {
				return
			}
			car, err = s.scrapeCarHTTP(ctx, client, u)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("Worker %d failed to fetch URL %s: %v", id, u, err)
				continue
			}
		}

		if car.Title == "" || car.Price <= 0 || car.Year <= 0 {
			log.Printf("Warning: Worker %d parsed invalid/empty details for %s (Title: %q, Price: %d, Year: %d). Skipping DB update.", id, u, car.Title, car.Price, car.Year)
			continue
		}

		select {
		case <-ctx.Done():
			return
		case results <- *car:
		}
	}
}

func (s *Scraper) scrapeCarHTTP(ctx context.Context, client *http.Client, targetURL string) (*db.Car, error) {
	ctx = normalizeContext(ctx)
	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}

	car := &db.Car{
		URL:        targetURL,
		ScrapedAt:  time.Now(),
		LastSeenAt: time.Now(),
		Equipments: make(map[string]bool),
		Comment:    "-",
	}

	if strings.Contains(targetURL, "/autosnuevos/") {
		s.scrapeNewCarHTTP(doc, car)
	} else {
		s.scrapeUsedCarHTTP(doc, car)
	}

	return car, nil
}

func (s *Scraper) scrapeUsedCarHTTP(doc *goquery.Document, car *db.Car) {
	// 1. Title & Price from .carheader
	container := doc.Find(".text-center.text-white.carheader")
	if container.Length() > 0 {
		h1s := container.Find("h1")
		if h1s.Length() > 0 {
			car.Title, car.Brand, car.Model, car.Year = parseTitleBrandModelYear(h1s.First().Text())
		}
		h3s := container.Find("h3")
		if h3s.Length() > 0 {
			car.PriceText = cleanText(h3s.First().Text())
			car.Price = parsePrice(car.PriceText)
		} else if h1s.Length() > 1 {
			car.PriceText = cleanText(h1s.Eq(1).Text())
			car.Price = parsePrice(car.PriceText)
		}
	}

	// 2. Attributes from table.mytext2
	table := doc.Find("table.mytext2")
	if table.Length() == 0 {
		doc.Find("table").EachWithBreak(func(_ int, t *goquery.Selection) bool {
			txt := t.Text()
			if strings.Contains(txt, "Cilindrada") || strings.Contains(txt, "Combustible") {
				table = t
				return false
			}
			return true
		})
	}

	if table.Length() > 0 {
		table.Find("tr").Each(func(_ int, tr *goquery.Selection) {
			tds := tr.Find("td")
			if tds.Length() >= 2 {
				key := cleanText(tds.Eq(0).Text())
				val := cleanText(tds.Eq(1).Text())

				switch key {
				case "# de pasajeros":
					car.Pasajeros = val
				case "# de puertas":
					car.Puertas = val
				case "Cilindrada":
					car.Cilindrada = val
				case "Color exterior":
					car.ColorExterior = val
				case "Color interior":
					car.ColorInterior = val
				case "Combustible":
					car.Combustible = val
				case "Estado":
					car.Estado = val
				case "Estilo":
					car.Estilo = val
				case "Fecha de ingreso":
					car.FechaIngreso = val
				case "Kilometraje":
					car.Kilometraje = parseKilometraje(val)
				case "Placa":
					car.Placa = val
				case "Precio negociable":
					car.PrecioNegociable = val
				case "Provincia":
					car.Provincia = val
				case "Se recibe vehículo":
					car.SeRecibe = val
				case "Transmisión":
					car.Transmision = val
				case "Ya pagó impuestos":
					car.PagoImpuestos = val
				}
			} else if tds.Length() == 1 {
				txt := cleanText(tds.Eq(0).Text())
				if txt != "" && !strings.Contains(txt, "ha sido visto") && car.Comment == "-" {
					car.Comment = txt
				}
			}
		})
	}

	// 3. Equipments from table.table-bordered
	doc.Find("table.table-bordered").Each(func(_ int, tbl *goquery.Selection) {
		tbl.Find("tr").Each(func(_ int, tr *goquery.Selection) {
			tds := tr.Find("td")
			if tds.Length() >= 2 {
				key := cleanText(tds.Eq(0).Text())
				h, _ := tds.Eq(1).Html()
				if tds.Eq(1).Find("i.icon-check").Length() > 0 || strings.Contains(h, "icon-check") {
					car.Equipments[key] = true
				}
			}
		})
	})

	// 4. Seller info from table.table-responsive
	doc.Find("table.table-responsive").EachWithBreak(func(_ int, vt *goquery.Selection) bool {
		txt := vt.Text()
		if strings.Contains(txt, "Vendedor") {
			vt.Find("tr").Each(func(_ int, tr *goquery.Selection) {
				tds := tr.Find("td")
				if tds.Length() >= 2 {
					key := cleanText(tds.Eq(0).Text())
					val := cleanText(tds.Eq(1).Text())
					switch {
					case strings.Contains(key, "Nombre"):
						car.SellerName = val
					case strings.Contains(key, "Teléfono"):
						car.SellerPhone = val
					case strings.Contains(key, "Dirección"):
						car.SellerAddress = val
					}
				}
			})
			return false
		}
		return true
	})

	// 5. Comments fallback (highlighted cells)
	if car.Comment == "-" || car.Comment == "" {
		doc.Find("td[bgcolor='#FAF7B4'], td[style*='#177001']").EachWithBreak(func(_ int, s *goquery.Selection) bool {
			c := cleanText(s.Text())
			if c != "" && !strings.Contains(c, "ha sido visto") {
				car.Comment = c
				return false
			}
			return true
		})
	}
}

func (s *Scraper) scrapeNewCarHTTP(doc *goquery.Document, car *db.Car) {
	car.Estado = "Nuevo"
	car.Kilometraje = 0

	// 1. Get Brand and basic Model from header (.pheader h2)
	header := doc.Find(".text-center.text-white.pheader h2")
	var brandHeader string
	if header.Length() > 0 {
		brandHeader = cleanText(header.First().Text())
	}

	// 2. Parse Technical Specs inside #fichatecnica
	techTable := doc.Find("#fichatecnica table")
	var version, style, fuel, transmission, doors, passengers string
	var year, price int
	var priceText string

	if techTable.Length() > 0 {
		techTable.Find("tr").Each(func(_ int, tr *goquery.Selection) {
			tds := tr.Find("td")
			if tds.Length() >= 2 {
				key := cleanText(tds.Eq(0).Text())
				val := cleanText(tds.Eq(1).Text())

				switch key {
				case "Versión", "Version":
					version = val
				case "Precio":
					priceText = val
					price = parsePrice(val)
				case "Año", "Año:":
					year, _ = strconv.Atoi(val)
				case "Estilo":
					style = val
				case "Combustible":
					fuel = val
				case "Transmisión", "Transmisión:":
					transmission = val
				case "# de puertas":
					doors = val
				case "# de pasajeros":
					passengers = val
				case "Provincia":
					car.Provincia = val
				}
			}
		})
	}

	// Parse Brand & Model name
	car.Brand = ""
	if brandHeader != "" {
		parts := strings.Split(brandHeader, " ")
		if len(parts) > 0 {
			car.Brand = parts[0]
		}
	}

	if version != "" {
		car.Model = version
		if car.Brand != "" {
			car.Title = car.Brand + " " + version
		} else {
			car.Title = version
		}
	} else if brandHeader != "" {
		car.Model = brandHeader
		car.Title = brandHeader
	}

	if year > 0 {
		car.Year = year
		if car.Title != "" && !strings.Contains(car.Title, strconv.Itoa(year)) {
			car.Title = fmt.Sprintf("%s %d", car.Title, year)
		}
	}
	car.Price = price
	car.PriceText = priceText
	car.Estilo = style
	car.Combustible = fuel
	car.Transmision = transmission
	car.Puertas = doors
	car.Pasajeros = passengers

	if car.Provincia == "" {
		car.Provincia = "San José"
	}

	// 3. Dealer (Seller) Info inside #dealer
	dealer := doc.Find("#dealer")
	if dealer.Length() > 0 {
		car.SellerName = cleanText(dealer.Find("h4").First().Text())
		car.SellerAddress = cleanText(dealer.Find("h5").First().Text())
		dealer.Find("tr").EachWithBreak(func(_ int, tr *goquery.Selection) bool {
			tds := tr.Find("td")
			if tds.Length() >= 2 {
				k := cleanText(tds.Eq(0).Text())
				v := cleanText(tds.Eq(1).Text())
				if strings.Contains(k, "Telef") || strings.Contains(k, "Teléfono") || strings.Contains(k, "Celular") {
					car.SellerPhone = v
					return false
				}
			}
			return true
		})
	}
}

func cleanText(text string) string {
	return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(text, "\n", ""), "\t", ""))
}

func parseTitleBrandModelYear(text string) (title, brand, model string, year int) {
	cleaned := cleanText(text)
	parts := strings.Fields(cleaned)
	if len(parts) > 1 {
		y, err := strconv.Atoi(parts[len(parts)-1])
		if err == nil && y > 1900 && y < 2100 {
			year = y
			title = strings.Join(parts[:len(parts)-1], " ")
			parts = parts[:len(parts)-1]
		} else {
			title = strings.Join(parts, " ")
		}
	} else if len(parts) == 1 {
		title = parts[0]
	}
	if len(parts) > 0 {
		brand = parts[0]
		if len(parts) > 1 {
			model = parts[1]
		}
	}
	return
}

func parsePrice(text string) int {
	isColones := strings.Contains(text, "¢")
	numStr := precioNumRegexp.ReplaceAllString(text, "")
	if numStr == "" {
		return -1
	}
	val, err := strconv.Atoi(numStr)
	if err != nil {
		return -1
	}
	if isColones {
		// Convert to dollars roughly using 510
		return val / 510
	}
	return val
}

func parseKilometraje(val string) int {
	v := cleanText(val)
	if strings.Contains(v, " millas") {
		nums := millasRegexp.ReplaceAllString(v, "")
		if miles, err := strconv.Atoi(nums); err == nil {
			return int(float64(miles) * 1.60934)
		}
	}
	if strings.Contains(v, " kms") {
		nums := kilometersRegexp.ReplaceAllString(v, "")
		if kms, err := strconv.Atoi(nums); err == nil {
			return kms
		}
	}
	return 0
}
