package scraper

import (
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"crautosdb/db"

	"github.com/tebeka/selenium"
	"github.com/tebeka/selenium/chrome"
)

const (
	SeleniumPort = 4444
	WorkerCount  = 4
)

var ChromeDriverPath = getChromeDriverPath()

func getChromeDriverPath() string {
	if runtime.GOOS == "windows" {
		return "./chromedriver-win64/chromedriver.exe"
	}
	if runtime.GOOS == "darwin" {
		return "./chromedriver-mac-arm64/chromedriver"
	}
	return "chromedriver"
}

var (
	millasRegexp     = regexp.MustCompile(`,|millas| `)
	kilometersRegexp = regexp.MustCompile(`,|kms| `)
	precioRegexp     = regexp.MustCompile(`,|\(|$|\)|\*|`)
	precioNumRegexp  = regexp.MustCompile(`[^\d]`)

	targetBrands = map[string]string{
		"kia":           "19",
		"toyota":        "35",
		"hyundai":       "16",
		"honda":         "15",
		"ford":          "13",
		"nissan":        "26",
		"suzuki":        "34",
		"mazda":         "23",
		"donfeng (ZNA)": "64",
		"chery":         "88",
		"BYD":           "97",
		"changan":       "108",
		"electric":      "4",
	}
)

type Scraper struct {
	Service *selenium.Service
	Port    int
	DB      *db.DB
	Force   bool
	mu      sync.Mutex
}

func NewScraper(driverPath string, port int, database *db.DB, force bool) (*Scraper, error) {
	opts := []selenium.ServiceOption{
		selenium.Output(io.Discard),
	}
	service, err := selenium.NewChromeDriverService(driverPath, port, opts...)
	if err != nil {
		return nil, fmt.Errorf("chromedriver error: %w", err)
	}
	return &Scraper{Service: service, Port: port, DB: database, Force: force}, nil
}

func (s *Scraper) Run() {
	for brandName, brandID := range targetBrands {
		log.Printf("=== Starting Brand: %s ===\n", brandName)
		s.ProcessBrand(brandName, brandID)
	}
	log.Println("=== Scrape Run Completed ===")
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
	log.Printf("Backfilling seller info for %d cars...", len(urls))

	drivers := make([]selenium.WebDriver, 0, WorkerCount)
	for i := 0; i < WorkerCount; i++ {
		wd, err := s.createWebDriver()
		if err != nil {
			log.Printf("Error creating web driver for backfill worker %d: %v", i, err)
			for _, d := range drivers {
				d.Quit()
			}
			return
		}
		drivers = append(drivers, wd)
	}

	jobs := make(chan string, 200)
	var wg sync.WaitGroup

	for i := 0; i < WorkerCount; i++ {
		wg.Add(1)
		go func(id int, wd selenium.WebDriver) {
			defer wg.Done()
			defer wd.Quit()

			for url := range jobs {
				if err := wd.Get(url); err != nil {
					time.Sleep(1 * time.Second)
					wd.Get(url)
				}

				var name, phone, address string
				vendorTables, err := wd.FindElements(selenium.ByCSSSelector, "table.table-responsive")
				if err == nil {
					for _, vt := range vendorTables {
						txt, _ := vt.Text()
						if strings.Contains(txt, "Vendedor") {
							rows, _ := vt.FindElements(selenium.ByTagName, "tr")
							for _, tr := range rows {
								tds, _ := tr.FindElements(selenium.ByTagName, "td")
								if len(tds) >= 2 {
									key, _ := tds[0].Text()
									val, _ := tds[1].Text()
									key = cleanText(key)
									val = cleanText(val)
									switch {
									case strings.Contains(key, "Nombre"):
										name = val
									case strings.Contains(key, "Teléfono"):
										phone = val
									case strings.Contains(key, "Dirección"):
										address = val
									}
								}
							}
							break
						}
					}
				}

				if name != "" || phone != "" || address != "" {
					if err := s.DB.UpdateSeller(url, name, phone, address); err != nil {
						log.Printf("Error updating seller for %s: %v", url, err)
					}
				}
			}
		}(i, drivers[i])
	}

	counter := 0
	for _, url := range urls {
		jobs <- url
		counter++
		if counter%10 == 0 {
			log.Printf("Queued %d/%d URLs for backfill...", counter, len(urls))
		}
	}
	close(jobs)
	wg.Wait()
	log.Printf("Backfill complete. Processed %d cars.", len(urls))
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
	// Limit concurrency to 30 workers
	workerCount := 30
	var successCount uint64
	var noCommentCount uint64
	var totalChecked uint64

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range jobs {
				req, err := http.NewRequest("GET", url, nil)
				if err != nil {
					continue
				}
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

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

				// Save/Update the comment in the database
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


func (s *Scraper) ProcessBrand(brandName, brandID string) {
	var activeURLs []string
	var err error
	if brandName == "electric" {
		activeURLs, err = s.DB.GetActiveURLsByFuel("eléctric")
	} else {
		activeURLs, err = s.DB.GetActiveURLs(brandName)
	}
	if err != nil {
		log.Printf("Error getting active URLs for %s: %v", brandName, err)
		return
	}
	activeMap := make(map[string]bool)
	for _, u := range activeURLs {
		activeMap[u] = true
	}

	drivers := make([]selenium.WebDriver, 0, WorkerCount)
	for i := 0; i < WorkerCount; i++ {
		wd, err := s.createWebDriver()
		if err != nil {
			log.Printf("Error creating web driver for worker %d: %v", i, err)
			for _, d := range drivers {
				d.Quit()
			}
			return
		}
		drivers = append(drivers, wd)
	}

	prodWd, err := s.createWebDriver()
	if err != nil {
		log.Printf("Error creating web driver for producer: %v", err)
		for _, d := range drivers {
			d.Quit()
		}
		return
	}

	jobs := make(chan string, 200)
	results := make(chan db.Car, 200)
	var wg sync.WaitGroup

	for i := 0; i < WorkerCount; i++ {
		wg.Add(1)
		go func(id int, wd selenium.WebDriver) {
			defer wg.Done()
			s.worker(id, wd, jobs, results)
		}(i, drivers[i])
	}

	producerDone := make(chan map[string]bool)
	go func() {
		defer prodWd.Quit()
		seen := s.producer(prodWd, brandName, brandID, jobs, activeMap)
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
		for url := range activeMap {
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
	log.Printf("Finished brand %s. Saved %d cars.\n", brandName, savedCount)
}

func (s *Scraper) producer(wd selenium.WebDriver, brandName, brandID string, jobs chan<- string, active map[string]bool) map[string]bool {

	if err := wd.Get("https://crautos.com/autosusados/index.cfm"); err != nil {
		log.Printf("Failed to load home page: %v\n", err)
		return nil
	}

	searchBoxs, err := wd.FindElements(selenium.ByCSSSelector, ".searchform")
	if err != nil || len(searchBoxs) == 0 {
		return nil
	}
	searchForm := searchBoxs[len(searchBoxs)-1]

	if brandName == "electric" {
		selectDropdown(searchForm, "fuel", brandID)
	} else {
		selectDropdown(searchForm, "brand", brandID)
	}
	selectDropdown(searchForm, "yearfrom", "2010")

	btn, err := searchForm.FindElement(selenium.ByCSSSelector, "button[type='submit']")
	if err == nil {
		wd.ExecuteScript("arguments[0].click();", []interface{}{btn})
	}

	err = wd.WaitWithTimeoutAndInterval(func(d selenium.WebDriver) (bool, error) {
		elems, err := d.FindElements(selenium.ByCSSSelector, "td.brandtitle")
		return err == nil && len(elems) > 0, nil
	}, 20*time.Second, 1*time.Second)

	if err != nil {
		return nil
	}

	pageCount := 1
	seenUrls := make(map[string]bool)
	for {
		elements, err := wd.FindElements(selenium.ByCSSSelector, "td.brandtitle a")
		if err == nil {
			for _, el := range elements {
				href, _ := el.GetAttribute("href")
				if href != "" && (strings.HasPrefix(href, "http") || strings.Contains(href, "cardetail.cfm")) {
					seenUrls[href] = true
					// Always scrape if not active or if force scraping is enabled to ensure we get updates (e.g. price updates)
					if s.Force || !active[href] {
						jobs <- href
					}
				}
			}
		}

		pagination, err := wd.FindElement(selenium.ByCSSSelector, ".page-item.page-next .page-link")
		if err != nil {
			break
		}
		wd.ExecuteScript("arguments[0].click();", []interface{}{pagination})

		pageCount++
		nextPageStr := strconv.Itoa(pageCount)
		err = wd.WaitWithTimeoutAndInterval(func(d selenium.WebDriver) (bool, error) {
			active, err := d.FindElement(selenium.ByCSSSelector, ".page-item.active .page-link")
			if err != nil {
				return false, nil
			}
			txt, _ := active.Text()
			return strings.TrimSpace(txt) == nextPageStr, nil
		}, 15*time.Second, 500*time.Millisecond)
		if err != nil {
			break
		}
	}
	return seenUrls
}

func (s *Scraper) worker(id int, wd selenium.WebDriver, jobs <-chan string, results chan<- db.Car) {
	defer wd.Quit()

	for url := range jobs {
		if err := wd.Get(url); err != nil {
			time.Sleep(1 * time.Second)
			if err := wd.Get(url); err != nil {
				log.Printf("Worker %d failed to load URL %s: %v", id, url, err)
				continue
			}
		}

		car := db.Car{
			URL:        url,
			ScrapedAt:  time.Now(),
			LastSeenAt: time.Now(),
			Equipments: make(map[string]bool),
			Comment:    "-",
		}

		if strings.Contains(url, "/autosnuevos/") {
			_ = wd.WaitWithTimeoutAndInterval(func(d selenium.WebDriver) (bool, error) {
				_, err := d.FindElement(selenium.ByCSSSelector, ".text-center.text-white.pheader h2")
				return err == nil, nil
			}, 5*time.Second, 500*time.Millisecond)

			s.scrapeNewCar(wd, &car)
		} else {
			_ = wd.WaitWithTimeoutAndInterval(func(d selenium.WebDriver) (bool, error) {
				_, err := d.FindElement(selenium.ByCSSSelector, ".text-center.text-white.carheader")
				return err == nil, nil
			}, 5*time.Second, 500*time.Millisecond)

			container, err := wd.FindElement(selenium.ByCSSSelector, ".text-center.text-white.carheader")
			if err == nil {
				if h1s, err := container.FindElements(selenium.ByTagName, "h1"); err == nil && len(h1s) > 0 {
					fullTitle, _ := h1s[0].Text()
					car.Title, car.Brand, car.Model, car.Year = parseTitleBrandModelYear(fullTitle)
				}
				if h3, err := container.FindElement(selenium.ByTagName, "h3"); err == nil {
					txt, _ := h3.Text()
					car.PriceText = cleanText(txt)
					car.Price = parsePrice(car.PriceText)
				}
			}

			// Attributes
			var table selenium.WebElement
			var tableErr error
			table, tableErr = wd.FindElement(selenium.ByCSSSelector, "table.mytext2")
			if tableErr != nil {
				tables, err := wd.FindElements(selenium.ByTagName, "table")
				if err == nil {
					for _, t := range tables {
						txt, _ := t.Text()
						if strings.Contains(txt, "Cilindrada") || strings.Contains(txt, "Combustible") {
							table = t
							tableErr = nil
							break
						}
					}
				}
			}

			if tableErr == nil {
				rows, _ := table.FindElements(selenium.ByTagName, "tr")
				for _, tr := range rows {
					tds, _ := tr.FindElements(selenium.ByTagName, "td")
					if len(tds) >= 2 {
						key, _ := tds[0].Text()
						val, _ := tds[1].Text()
						key = cleanText(key)
						val = cleanText(val)

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
					} else if len(tds) == 1 {
						txt, _ := tds[0].Text()
						txt = cleanText(txt)
						if txt != "" && !strings.Contains(txt, "ha sido visto") {
							car.Comment = txt
						}
					}
				}
			}

			// Equipments
			equipTables, err := wd.FindElements(selenium.ByCSSSelector, "table.table-bordered")
			if err == nil {
				for _, tbl := range equipTables {
					rows, _ := tbl.FindElements(selenium.ByTagName, "tr")
					for _, tr := range rows {
						tds, _ := tr.FindElements(selenium.ByTagName, "td")
						if len(tds) >= 2 {
							key, _ := tds[0].Text()
							if icon, err := tds[1].FindElement(selenium.ByCSSSelector, "i.icon-check"); err == nil && icon != nil {
								car.Equipments[cleanText(key)] = true
							}
						}
					}
				}
			}

			// Vendedor (seller) info
			vendorTables, err := wd.FindElements(selenium.ByCSSSelector, "table.table-responsive")
			if err == nil {
				for _, vt := range vendorTables {
					txt, _ := vt.Text()
					if strings.Contains(txt, "Vendedor") {
						rows, _ := vt.FindElements(selenium.ByTagName, "tr")
						for _, tr := range rows {
							tds, _ := tr.FindElements(selenium.ByTagName, "td")
							if len(tds) >= 2 {
								key, _ := tds[0].Text()
								val, _ := tds[1].Text()
								key = cleanText(key)
								val = cleanText(val)
								switch {
								case strings.Contains(key, "Nombre"):
									car.SellerName = val
								case strings.Contains(key, "Teléfono"):
									car.SellerPhone = val
								case strings.Contains(key, "Dirección"):
									car.SellerAddress = val
								}
							}
						}
						break
					}
				}
			}
		}

		if car.Title == "" || car.Price <= 0 || car.Year <= 0 {
			log.Printf("Warning: Worker %d parsed invalid/empty details for %s (Title: %q, Price: %d, Year: %d). Skipping DB update.", id, url, car.Title, car.Price, car.Year)
			continue
		}

		results <- car
	}
}

func (s *Scraper) scrapeNewCar(wd selenium.WebDriver, car *db.Car) {
	car.Estado = "Nuevo"
	car.Kilometraje = 0

	// 1. Get Brand and basic Model from header (.pheader h2)
	header, err := wd.FindElement(selenium.ByCSSSelector, ".text-center.text-white.pheader h2")
	var brandHeader string
	if err == nil {
		brandHeader, _ = header.Text()
		brandHeader = cleanText(brandHeader)
	}

	// 2. Parse Technical Specs inside #fichatecnica
	techTable, err := wd.FindElement(selenium.ByCSSSelector, "#fichatecnica table")
	var version, style, fuel, transmission, doors, passengers string
	var year, price int
	var priceText string

	if err == nil {
		rows, err := techTable.FindElements(selenium.ByTagName, "tr")
		if err == nil {
			for _, tr := range rows {
				tds, err := tr.FindElements(selenium.ByTagName, "td")
				if err == nil && len(tds) >= 2 {
					key, _ := tds[0].Text()
					val, _ := tds[1].Text()
					key = cleanText(key)
					val = cleanText(val)

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
			}
		}
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
		car.Provincia = "San José" // default province for agencies if not specified
	}

	// 3. Dealer (Seller) Info inside #dealer
	dealerContainer, err := wd.FindElement(selenium.ByCSSSelector, "#dealer")
	if err == nil {
		if h4, err := dealerContainer.FindElement(selenium.ByTagName, "h4"); err == nil {
			car.SellerName, _ = h4.Text()
			car.SellerName = cleanText(car.SellerName)
		}
		if h5, err := dealerContainer.FindElement(selenium.ByTagName, "h5"); err == nil {
			car.SellerAddress, _ = h5.Text()
			car.SellerAddress = cleanText(car.SellerAddress)
		}
		// Search for telephone number in table rows
		if rows, err := dealerContainer.FindElements(selenium.ByTagName, "tr"); err == nil {
			for _, tr := range rows {
				tds, err := tr.FindElements(selenium.ByTagName, "td")
				if err == nil && len(tds) >= 2 {
					k, _ := tds[0].Text()
					v, _ := tds[1].Text()
					k = cleanText(k)
					v = cleanText(v)
					if strings.Contains(k, "Telef") || strings.Contains(k, "Teléfono") || strings.Contains(k, "Celular") {
						car.SellerPhone = v
						break
					}
				}
			}
		}
	}
}

func (s *Scraper) createWebDriver() (selenium.WebDriver, error) {
	caps := selenium.Capabilities{
		"browserName":      "chrome",
		"pageLoadStrategy": "eager",
	}
	chromeCaps := chrome.Capabilities{
		Args: []string{
			"--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
			"--window-size=1920,1080", "--log-level=3", "--disable-extensions", "--disable-images",
			"--disable-logging", "--silent",
		},
	}
	caps.AddChrome(chromeCaps)

	s.mu.Lock()
	wd, err := selenium.NewRemote(caps, fmt.Sprintf("http://localhost:%d/wd/hub", s.Port))
	s.mu.Unlock()

	if err != nil {
		log.Printf("Failed to create WebDriver session: %v. Retrying in 2 seconds...", err)
		time.Sleep(2 * time.Second)

		s.mu.Lock()
		wd, err = selenium.NewRemote(caps, fmt.Sprintf("http://localhost:%d/wd/hub", s.Port))
		s.mu.Unlock()

		if err != nil {
			return nil, fmt.Errorf("failed to connect to selenium after retry: %w", err)
		}
	}
	if wd != nil {
		wd.SetPageLoadTimeout(30 * time.Second)
	}
	return wd, nil
}

func selectDropdown(parent selenium.WebElement, name, value string) error {
	elem, err := parent.FindElement(selenium.ByName, name)
	if err != nil {
		return err
	}
	opt, err := elem.FindElement(selenium.ByCSSSelector, fmt.Sprintf("option[value='%s']", value))
	if err != nil {
		return err
	}
	return opt.Click()
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
