package scraper

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"crautosdb/db"

	"github.com/tebeka/selenium"
	"github.com/tebeka/selenium/chrome"
)

const (
	SeleniumPort     = 4444
	ChromeDriverPath = "./chromedriver-win64/chromedriver.exe"
	WorkerCount      = 4
)

var (
	millasRegexp     = regexp.MustCompile(`,|millas| `)
	kilometersRegexp = regexp.MustCompile(`,|kms| `)
	precioRegexp     = regexp.MustCompile(`,|\(|$|\)|\*|`)
	precioNumRegexp  = regexp.MustCompile(`[^\d]`)

	targetBrands = map[string]string{
		"kia":        "19",
		"toyota":     "35",
		"hyundai":    "16",
		"honda":      "15",
		"nissan":     "26",
		"suzuki":     "34",
		"electric":   "4",
	}
)

type Scraper struct {
	Service *selenium.Service
	Port    int
	DB      *db.DB
}

func NewScraper(driverPath string, port int, database *db.DB) (*Scraper, error) {
	opts := []selenium.ServiceOption{}
	service, err := selenium.NewChromeDriverService(driverPath, port, opts...)
	if err != nil {
		return nil, fmt.Errorf("chromedriver error: %w", err)
	}
	return &Scraper{Service: service, Port: port, DB: database}, nil
}

func (s *Scraper) Run() {
	for brandName, brandID := range targetBrands {
		log.Printf("=== Starting Brand: %s ===\n", brandName)
		s.ProcessBrand(brandName, brandID)
	}
	log.Println("=== Scrape Run Completed ===")
}

func (s *Scraper) ProcessBrand(brandName, brandID string) {
	activeURLs, err := s.DB.GetActiveURLs(brandName)
	if err != nil {
		log.Printf("Error getting active URLs for %s: %v", brandName, err)
		return
	}
	activeMap := make(map[string]bool)
	for _, u := range activeURLs {
		activeMap[u] = true
	}

	jobs := make(chan string, 200)
	results := make(chan db.Car, 200)
	var wg sync.WaitGroup

	for i := 0; i < WorkerCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			s.worker(id, jobs, results)
		}(i)
	}

	producerDone := make(chan map[string]bool)
	go func() {
		seen := s.producer(brandName, brandID, jobs, activeMap)
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

func (s *Scraper) producer(brandName, brandID string, jobs chan<- string, active map[string]bool) map[string]bool {
	wd := s.createWebDriver()
	defer wd.Quit()

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
				if href != "" {
					seenUrls[href] = true
					// Always scrape if not active to ensure we get updates or new cars
					if !active[href] {
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

func (s *Scraper) worker(id int, jobs <-chan string, results chan<- db.Car) {
	wd := s.createWebDriver()
	defer wd.Quit()

	for url := range jobs {
		if err := wd.Get(url); err != nil {
			time.Sleep(1 * time.Second)
			wd.Get(url)
		}

		car := db.Car{
			URL:        url,
			ScrapedAt:  time.Now(),
			LastSeenAt: time.Now(),
			Equipments: make(map[string]bool),
		}

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
					case "# de pasajeros": car.Pasajeros = val
					case "# de puertas": car.Puertas = val
					case "Cilindrada": car.Cilindrada = val
					case "Color exterior": car.ColorExterior = val
					case "Color interior": car.ColorInterior = val
					case "Combustible": car.Combustible = val
					case "Estado": car.Estado = val
					case "Estilo": car.Estilo = val
					case "Fecha de ingreso": car.FechaIngreso = val
					case "Kilometraje": car.Kilometraje = parseKilometraje(val)
					case "Placa": car.Placa = val
					case "Precio negociable": car.PrecioNegociable = val
					case "Provincia": car.Provincia = val
					case "Se recibe vehículo": car.SeRecibe = val
					case "Transmisión": car.Transmision = val
					case "Ya pagó impuestos": car.PagoImpuestos = val
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

		results <- car
	}
}

func (s *Scraper) createWebDriver() selenium.WebDriver {
	caps := selenium.Capabilities{
		"browserName":      "chrome",
		"pageLoadStrategy": "eager",
	}
	chromeCaps := chrome.Capabilities{
		Args: []string{
			"--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
			"--window-size=1920,1080", "--log-level=3", "--disable-extensions", "--disable-images",
		},
	}
	caps.AddChrome(chromeCaps)

	wd, err := selenium.NewRemote(caps, fmt.Sprintf("http://localhost:%d/wd/hub", s.Port))
	if err != nil {
		time.Sleep(2 * time.Second)
		wd, _ = selenium.NewRemote(caps, fmt.Sprintf("http://localhost:%d/wd/hub", s.Port))
	}
	if wd != nil {
		wd.SetPageLoadTimeout(30 * time.Second)
	}
	return wd
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
	title = cleanText(text)
	parts := strings.Split(title, " ")
	if len(parts) > 1 {
		y, err := strconv.Atoi(parts[len(parts)-1])
		if err == nil && y > 1900 && y < 2100 {
			year = y
			title = strings.Join(parts[:len(parts)-1], " ")
			parts = parts[:len(parts)-1]
		}
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
