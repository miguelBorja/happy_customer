package scraper

import (
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
	precioRegexp     = regexp.MustCompile(`,|\(|$|\)|\*|`)
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
}

func NewScraper(database *db.DB, force bool, skipRefreshedHours int) *Scraper {
	return &Scraper{
		DB:                 database,
		Force:              force,
		SkipRefreshedHours: skipRefreshedHours,
	}
}

func (s *Scraper) Run() {
	for brandName, brandID := range targetBrands {
		log.Printf("=== Starting Brand: %s ===\n", brandName)
		s.ProcessBrand(brandName, brandID)
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

func (s *Scraper) BackfillSellers() {
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
	for _, url := range urls {
		jobs <- url
	}
	close(jobs)

	client := createHTTPClient()
	var wg sync.WaitGroup
	var updatedCount uint64
	var totalChecked uint64

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range jobs {
				name, phone, address, err := s.fetchSellerHTTP(client, url)
				if err != nil {
					log.Printf("Error fetching seller for %s: %v", url, err)
					continue
				}
				if name != "" || phone != "" || address != "" {
					if err := s.DB.UpdateSeller(url, name, phone, address); err != nil {
						log.Printf("Error updating seller for %s: %v", url, err)
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

func (s *Scraper) fetchSellerHTTP(client *http.Client, url string) (name, phone, address string, err error) {
	req, err := http.NewRequest("GET", url, nil)
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

func (s *Scraper) BackfillComments() {
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
	for _, url := range urls {
		jobs <- url
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

	client := createHTTPClient()

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range jobs {
				req, err := http.NewRequest("GET", url, nil)
				if err != nil {
					continue
				}
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

				resp, err := client.Do(req)
				if err != nil {
					log.Printf("Error fetching %s: %v", url, err)
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

				err = s.DB.UpdateComment(url, comment)
				if err != nil {
					log.Printf("Error updating comment for %s: %v", url, err)
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

func (s *Scraper) ProcessBrand(brandName, brandID string) {
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

	httpClient := createHTTPClient()

	// Spawn fast HTTP workers (Zero Chrome memory footprint)
	for i := 0; i < HTTPWorkerCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			s.worker(id, httpClient, jobs, results)
		}(i)
	}

	producerDone := make(chan map[string]bool)
	go func() {
		seen := s.producer(httpClient, brandName, brandID, jobs, activeCars)
		close(jobs)
		producerDone <- seen
	}()

	doneCollecting := make(chan int)
	go func() {
		counter := 0
		for car := range results {
			if err := s.DB.UpsertCar(car); err != nil {
				log.Printf("Error saving car %s: %v", car.URL, err)
			} else {
				counter++
			}
			if counter%10 == 0 {
				log.Printf("Saved %d new/updated cars...", counter)
			}
		}
		doneCollecting <- counter
	}()

	wg.Wait()
	close(results)
	savedCount := <-doneCollecting
	seenUrls := <-producerDone

	if seenUrls != nil {
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
	}
	log.Printf("Finished brand %s. Saved/updated %d cars.\n", brandName, savedCount)
}

func (s *Scraper) producer(client *http.Client, brandName, brandID string, jobs chan<- string, active map[string]time.Time) map[string]bool {
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
		"yearfrom":  {"2010"},
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

	seenUrls := make(map[string]bool)
	queuedCount := 0
	skippedCount := 0

	for page := 1; ; page++ {
		targetURL := fmt.Sprintf("https://crautos.com/autosusados/searchresults.cfm?p=%d", page)
		req, err := http.NewRequest("POST", targetURL, strings.NewReader(form.Encode()))
		if err != nil {
			log.Printf("[%s] Error building request for page %d: %v", brandName, page, err)
			break
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
		req.Header.Set("Referer", "https://crautos.com/autosusados/index.cfm")

		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(500 * time.Millisecond)
			resp, err = client.Do(req)
			if err != nil {
				log.Printf("[%s] Error fetching search page %d: %v", brandName, page, err)
				break
			}
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			log.Printf("[%s] Unexpected status %d on search page %d", brandName, resp.StatusCode, page)
			break
		}

		doc, err := goquery.NewDocumentFromReader(resp.Body)
		resp.Body.Close()
		if err != nil {
			log.Printf("[%s] Failed to parse HTML on search page %d: %v", brandName, page, err)
			break
		}

		pageCarCount := 0
		doc.Find("td.brandtitle a").Each(func(i int, el *goquery.Selection) {
			href, exists := el.Attr("href")
			href = strings.TrimSpace(href)
			if exists && href != "" && strings.Contains(href, "cardetail.cfm") {
				if !strings.HasPrefix(href, "http") {
					if strings.HasPrefix(href, "/") {
						href = "https://crautos.com" + href
					} else {
						href = "https://crautos.com/autosusados/" + href
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
						jobs <- href
						queuedCount++
					}
				}
			}
		})

		if pageCarCount == 0 {
			break
		}

		// Check if there is a next page element (.page-item.page-next)
		hasNext := false
		doc.Find(".page-item.page-next .page-link, .page-item .page-link").Each(func(i int, s *goquery.Selection) {
			txt := strings.TrimSpace(s.Text())
			if txt == ">" || txt == "»" {
				hasNext = true
			}
		})

		if !hasNext {
			break
		}

		time.Sleep(100 * time.Millisecond)
	}

	if skippedCount > 0 {
		log.Printf("[%s] Producer summary: %d queued, %d skipped (already refreshed within %dh)", brandName, queuedCount, skippedCount, s.SkipRefreshedHours)
	} else {
		log.Printf("[%s] Producer summary: %d queued", brandName, queuedCount)
	}

	return seenUrls
}

func (s *Scraper) worker(id int, client *http.Client, jobs <-chan string, results chan<- db.Car) {
	for url := range jobs {
		car, err := s.scrapeCarHTTP(client, url)
		if err != nil {
			time.Sleep(500 * time.Millisecond)
			car, err = s.scrapeCarHTTP(client, url)
			if err != nil {
				log.Printf("Worker %d failed to fetch URL %s: %v", id, url, err)
				continue
			}
		}

		if car.Title == "" || car.Price <= 0 || car.Year <= 0 {
			log.Printf("Warning: Worker %d parsed invalid/empty details for %s (Title: %q, Price: %d, Year: %d). Skipping DB update.", id, url, car.Title, car.Price, car.Year)
			continue
		}

		results <- *car
	}
}

func (s *Scraper) scrapeCarHTTP(client *http.Client, url string) (*db.Car, error) {
	req, err := http.NewRequest("GET", url, nil)
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
		URL:        url,
		ScrapedAt:  time.Now(),
		LastSeenAt: time.Now(),
		Equipments: make(map[string]bool),
		Comment:    "-",
	}

	if strings.Contains(url, "/autosnuevos/") {
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
