package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"crautosdb/db"
)

type Server struct {
	DB *db.DB
}

func (s *Server) HandleCars(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	q := r.URL.Query()
	log.Printf("[API] HandleCars query params: %s", r.URL.RawQuery)
	f := db.FilterParams{
		Estilo:      q.Get("estilo"),
		Transmision: q.Get("transmision"),
		Combustible: q.Get("combustible"),
		Provincia:   q.Get("provincia"),
		SortBy:      q.Get("sortBy"),
		SortTitle:   q.Get("sortTitle"),
		SortYear:    q.Get("sortYear"),
		SortPrice:   q.Get("sortPrice"),
		SortKm:      q.Get("sortKm"),
		TitleQuery:  q.Get("title"),
		ScrapedFrom: q.Get("scrapedFrom"),
		ScrapedTo:   q.Get("scrapedTo"),
		SellerName:  q.Get("sellerName"),
	}

	if brandsParam := q.Get("brands"); brandsParam != "" {
		f.Brands = strings.Split(brandsParam, ",")
	} else if brandParam := q.Get("brand"); brandParam != "" {
		if strings.Contains(brandParam, ",") {
			f.Brands = strings.Split(brandParam, ",")
		} else {
			f.Brand = brandParam
		}
	}

	if y, _ := strconv.Atoi(q.Get("yearMin")); y > 0 { f.YearMin = y }
	if y, _ := strconv.Atoi(q.Get("yearMax")); y > 0 { f.YearMax = y }
	if p, _ := strconv.Atoi(q.Get("priceMin")); p > 0 { f.PriceMin = p }
	if p, _ := strconv.Atoi(q.Get("priceMax")); p > 0 { f.PriceMax = p }
	if k, _ := strconv.Atoi(q.Get("kmMin")); k > 0 { f.KmMin = k }
	if k, _ := strconv.Atoi(q.Get("kmMax")); k > 0 { f.KmMax = k }
	
	if isSoldStr := q.Get("isSold"); isSoldStr != "" {
		b := isSoldStr == "true"
		f.IsSold = &b
	}

	if eq := q.Get("equipments"); eq != "" {
		f.Equipments = strings.Split(eq, ",")
	}
	
	if limit, _ := strconv.Atoi(q.Get("limit")); limit > 0 {
		f.Limit = limit
	} else {
		f.Limit = 100 // default limit
	}
	
	if offset, _ := strconv.Atoi(q.Get("offset")); offset > 0 {
		f.Offset = offset
	}
	
	if desc := q.Get("sortDesc"); desc == "false" {
		f.SortDesc = false
	} else {
		f.SortDesc = true // default desc
	}

	cars, err := s.DB.GetCars(f)
	if err != nil {
		log.Printf("[API ERROR] GetCars failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	if cars == nil {
		cars = []db.Car{} // Return empty array instead of null
	}
	
	json.NewEncoder(w).Encode(cars)
}

func (s *Server) HandleBrands(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	rows, err := s.DB.Query(`SELECT DISTINCT brand FROM cars WHERE brand != '' ORDER BY brand ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	
	var brands []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err == nil {
			brands = append(brands, b)
		}
	}
	json.NewEncoder(w).Encode(brands)
}

func (s *Server) HandleFilteredBrands(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	q := r.URL.Query()
	f := db.FilterParams{
		TitleQuery:  q.Get("title"),
		Provincia:   q.Get("provincia"),
		Transmision: q.Get("transmision"),
		Combustible: q.Get("combustible"),
		SellerName:  q.Get("sellerName"),
		ScrapedFrom: q.Get("scrapedFrom"),
		ScrapedTo:   q.Get("scrapedTo"),
	}

	if y, _ := strconv.Atoi(q.Get("yearMin")); y > 0 { f.YearMin = y }
	if y, _ := strconv.Atoi(q.Get("yearMax")); y > 0 { f.YearMax = y }
	if k, _ := strconv.Atoi(q.Get("kmMax")); k > 0 { f.KmMax = k }
	if k, _ := strconv.Atoi(q.Get("kmMin")); k > 0 { f.KmMin = k }
	if p, _ := strconv.Atoi(q.Get("priceMax")); p > 0 { f.PriceMax = p }
	if p, _ := strconv.Atoi(q.Get("priceMin")); p > 0 { f.PriceMin = p }

	if isSoldStr := q.Get("isSold"); isSoldStr != "" {
		b := isSoldStr == "true"
		f.IsSold = &b
	}

	if eq := q.Get("equipments"); eq != "" {
		f.Equipments = strings.Split(eq, ",")
	}

	brands, err := s.DB.GetFilteredBrands(f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if brands == nil {
		brands = []string{}
	}

	json.NewEncoder(w).Encode(brands)
}

func (s *Server) HandleProvinces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	rows, err := s.DB.Query(`SELECT DISTINCT provincia FROM cars WHERE provincia != '' AND provincia IS NOT NULL ORDER BY provincia ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var provinces []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err == nil {
			provinces = append(provinces, p)
		}
	}

	if provinces == nil {
		provinces = []string{}
	}

	json.NewEncoder(w).Encode(provinces)
}

func (s *Server) HandleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	var total, active, sold int
	s.DB.QueryRow(`SELECT count(*) FROM cars`).Scan(&total)
	s.DB.QueryRow(`SELECT count(*) FROM cars WHERE is_sold=0`).Scan(&active)
	s.DB.QueryRow(`SELECT count(*) FROM cars WHERE is_sold=1`).Scan(&sold)
	
	visits, err := s.DB.GetTotalVisits()
	if err != nil {
		log.Printf("[API ERROR] Failed to get total visits: %v", err)
		visits = 0
	}
	
	json.NewEncoder(w).Encode(map[string]int{
		"total":  total,
		"active": active,
		"sold":   sold,
		"visits": visits,
	})
}

func (s *Server) HandleDetailedStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stats, err := s.DB.GetDetailedStats()
	if err != nil {
		log.Printf("[API ERROR] GetDetailedStats failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(stats)
}

func getClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		parts := strings.Split(ip, ",")
		return strings.TrimSpace(parts[0])
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	ip := r.RemoteAddr
	if lastColon := strings.LastIndex(ip, ":"); lastColon != -1 {
		ip = ip[:lastColon]
	}
	return strings.Trim(ip, "[]")
}

func (s *Server) HandleRecordVisit(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		body.Path = "/"
	}

	ip := getClientIP(r)
	ua := r.UserAgent()

	if err := s.DB.RecordVisit(ip, ua, body.Path); err != nil {
		log.Printf("[API ERROR] RecordVisit failed: %v", err)
		http.Error(w, "Failed to record visit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (s *Server) HandleCarsByURLs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		URLs []string `json:"urls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	cars, err := s.DB.GetCarsByURLs(body.URLs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if cars == nil {
		cars = []db.Car{}
	}

	json.NewEncoder(w).Encode(cars)
}

type OpenRouterToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type OpenRouterMessage struct {
	Role       string               `json:"role"`
	Content    string               `json:"content,omitempty"`
	ToolCalls  []OpenRouterToolCall `json:"tool_calls,omitempty"`
	ToolCallID string               `json:"tool_call_id,omitempty"`
}

type OpenRouterResponse struct {
	Choices []struct {
		Message OpenRouterMessage `json:"message"`
	} `json:"choices"`
}

func searchDuckDuckGo(query string) ([]map[string]string, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	form := url.Values{}
	form.Add("q", query)

	req, err := http.NewRequest("POST", "https://html.duckduckgo.com/html/", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	htmlStr := string(bodyBytes)
	var results []map[string]string

	reSnippet := regexp.MustCompile(`(?s)<a class="result__snippet"[^>]*>(.*?)</a>`)
	reTitle := regexp.MustCompile(`(?s)<a class="result__url"[^>]*>(.*?)</a>`)
	reTag := regexp.MustCompile(`<[^>]+>`)

	matches := reSnippet.FindAllStringSubmatch(htmlStr, 5)
	urlMatches := reTitle.FindAllStringSubmatch(htmlStr, 5)

	for i, m := range matches {
		if len(m) > 1 {
			snippet := html.UnescapeString(reTag.ReplaceAllString(m[1], ""))
			snippet = strings.TrimSpace(snippet)
			site := ""
			if i < len(urlMatches) && len(urlMatches[i]) > 1 {
				site = strings.TrimSpace(html.UnescapeString(reTag.ReplaceAllString(urlMatches[i][1], "")))
			}
			if snippet != "" {
				results = append(results, map[string]string{
					"source":  site,
					"snippet": snippet,
				})
			}
		}
	}

	return results, nil
}

func (s *Server) HandleAICompare(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		log.Println("[API ERROR] OPENROUTER_API_KEY environment variable is not set")
		http.Error(w, "AI service not configured", http.StatusInternalServerError)
		return
	}

	var body struct {
		Car1     map[string]interface{}   `json:"car1"`
		Car2     map[string]interface{}   `json:"car2"`
		Cars     []map[string]interface{} `json:"cars"`
		Language string                   `json:"language"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	lang := "Spanish"
	if body.Language == "en" {
		lang = "English"
	}

	var cars []map[string]interface{}
	if len(body.Cars) > 0 {
		for _, c := range body.Cars {
			if len(c) > 0 {
				cars = append(cars, c)
			}
		}
	} else {
		if len(body.Car1) > 0 {
			cars = append(cars, body.Car1)
		}
		if len(body.Car2) > 0 {
			cars = append(cars, body.Car2)
		}
	}

	var systemPrompt string
	var initialPrompt string

	if len(cars) >= 3 {
		hResumenTabla := "Tabla Comparativa"
		hAnalisis := "Análisis y Diferencias Clave"
		hVeredicto := "Veredicto & Ranking"
		hMejorGeneral := "Ganador / Mejor Compra General"
		hMejorPresupuesto := "Mejor Opción Económica"
		hMejorConfiabilidad := "Mejor en Confiabilidad & Repuestos"

		if body.Language == "en" {
			hResumenTabla = "Comparison Matrix"
			hAnalisis = "Key Analysis & Trade-offs"
			hVeredicto = "Verdict & Ranking"
			hMejorGeneral = "Winner / Best Overall Buy"
			hMejorPresupuesto = "Best Budget Option"
			hMejorConfiabilidad = "Best Reliability & Parts Support"
		}

		var vehiclesText strings.Builder
		var vehicleLabels []string
		for i, car := range cars {
			label := fmt.Sprintf("Carro %d", i+1)
			if body.Language == "en" {
				label = fmt.Sprintf("Car %d", i+1)
			}
			vehicleLabels = append(vehicleLabels, label)
			title, _ := car["Title"].(string)
			yearVal, _ := car["Year"].(float64)
			year := int(yearVal)
			carJSON, _ := json.MarshalIndent(car, "", "  ")
			vehiclesText.WriteString(fmt.Sprintf("- %s (%s %d):\n%s\n\n", label, title, year, string(carJSON)))
		}

		systemPrompt = fmt.Sprintf(`You are an expert automotive advisor specializing in the Costa Rican used car market and an assistant for the "Happy Customer" car platform.
You have direct access to database tools ("query_car_market_stats", "query_cars_db") and live internet search ("search_web").
Language to respond in: %[1]s.

VEHICLES CURRENTLY BEING COMPARED (%[2]d vehicles):
%[3]s
COSTA RICAN AUTOMOTIVE MARKET CONTEXT & GUIDELINES:
1. Always refer to the cars by their labels: %[4]s.
2. Official agencies and spare parts networks in Costa Rica:
   - Purdy Motor (Toyota, Lexus): Best and most abundant spare parts availability in Costa Rica, very extensive aftermarket.
   - Grupo Q (Hyundai, Isuzu, Chevrolet): Very high availability of OEM and generic parts nationwide.
   - Agencia Datsun (Nissan): Very high availability and widespread mechanics familiarity.
   - Motortec / Audi Costa Rica (Audi, Porsche, Volkswagen): High availability for routine maintenance parts; specialized EV/high-voltage electrical components require agency ordering.
   - Bavarian Motors (BMW, Mini): Premium agency support, higher maintenance costs, specialized independent shops available.
   - Veinsa Motors (Mitsubishi, Geely, Citroën, JMC): Standard agency network.
   - AutoStar (Mercedes-Benz, Jeep, Dodge, RAM): Premium network.
3. When asked about spare parts accessibility, maintenance costs, reliability, recall issues, or distributor networks, ALWAYS give a comprehensive, knowledgeable, and detailed answer. Use "search_web" to look up live internet information or official agency details whenever helpful. NEVER say you lack access to spare parts information.
4. If asked about market trends, average prices, similar vehicles, or inventory statistics in Costa Rica, call your database tools ("query_car_market_stats", "query_cars_db").
5. Keep answers concise, factual, structured, and easy to read with markdown.
6. For initial multi-vehicle comparisons, structure your response in:
   1. **📊 %[5]s**: A clean markdown comparison table containing columns: [Vehicle, Year, Mileage, Price, Fuel/Trans, Parts & Agency Support in CR].
   2. **⚙️ %[6]s**: 2-3 concise bullet points per vehicle analyzing strengths, weaknesses, and maintenance/fuel trade-offs for Costa Rican conditions.
   3. **🏆 %[7]s**:
      - **Ranking General**: Ranked list from #1 (best) to #%[2]d (worst value/fit).
      - **%[8]s**: Declare the overall top recommendation (e.g. "Ganador: Carro X" / "Winner: Car X").
      - **%[9]s**: Best choice for strict budget or lowest ongoing costs.
      - **%[10]s**: Best choice for durability, easiest resale, and spare parts availability.`,
			lang, len(cars), vehiclesText.String(), strings.Join(vehicleLabels, ", "),
			hResumenTabla, hAnalisis, hVeredicto,
			hMejorGeneral, hMejorPresupuesto, hMejorConfiabilidad)

		if body.Language == "en" {
			initialPrompt = fmt.Sprintf("Please provide a structured comparative analysis, ranking, and comparison table for all %d vehicles (%s).", len(cars), strings.Join(vehicleLabels, ", "))
		} else {
			initialPrompt = fmt.Sprintf("Por favor proporciona un análisis comparativo estructurado, tabla comparativa y ranking de los %d vehículos (%s).", len(cars), strings.Join(vehicleLabels, ", "))
		}
	} else if len(cars) == 2 {
		car1 := cars[0]
		car2 := cars[1]
		car1Name, _ := car1["Title"].(string)
		car1YearVal, _ := car1["Year"].(float64)
		car1Year := int(car1YearVal)

		car2Name, _ := car2["Title"].(string)
		car2YearVal, _ := car2["Year"].(float64)
		car2Year := int(car2YearVal)

		car1JSON, _ := json.MarshalIndent(car1, "", "  ")
		car2JSON, _ := json.MarshalIndent(car2, "", "  ")

		labelCar1 := "Carro 1"
		labelCar2 := "Carro 2"
		hResumen := "Resumen"
		hDiferencias := "Diferencias Clave"
		hProsContras := "Pros & Contras"
		hGanador := "GANADOR"

		if body.Language == "en" {
			labelCar1 = "Car 1"
			labelCar2 = "Car 2"
			hResumen = "Summary"
			hDiferencias = "Key Differences"
			hProsContras = "Pros & Cons"
			hGanador = "WINNER"
		}

		systemPrompt = fmt.Sprintf(`You are an expert automotive advisor specializing in the Costa Rican used car market and an assistant for the "Happy Customer" car platform.
You have direct access to database tools ("query_car_market_stats", "query_cars_db") and live internet search ("search_web").
Language to respond in: %[1]s.

VEHICLES CURRENTLY BEING COMPARED:
- %[8]s (%[2]s %[3]d):
%[6]s

- %[9]s (%[4]s %[5]d):
%[7]s

COSTA RICAN AUTOMOTIVE MARKET CONTEXT & GUIDELINES:
1. Always refer to the cars as "%[8]s" and "%[9]s" when comparing them.
2. Official agencies and spare parts networks in Costa Rica:
   - Purdy Motor (Toyota, Lexus): Best and most abundant spare parts availability in Costa Rica, very extensive aftermarket.
   - Grupo Q (Hyundai, Isuzu, Chevrolet): Very high availability of OEM and generic parts nationwide.
   - Agencia Datsun (Nissan): Very high availability and widespread mechanics familiarity.
   - Motortec / Audi Costa Rica (Audi, Porsche, Volkswagen): High availability for routine maintenance parts; specialized EV/high-voltage electrical components (e-tron battery modules, inverters) require agency ordering.
   - Bavarian Motors (BMW, Mini): Premium agency support, higher maintenance costs, specialized independent shops available.
   - Veinsa Motors (Mitsubishi, Geely, Citroën, JMC): Standard agency network.
   - AutoStar (Mercedes-Benz, Jeep, Dodge, RAM): Premium network.
3. When asked about spare parts accessibility, maintenance costs, reliability, recall issues, or distributor networks, ALWAYS give a comprehensive, knowledgeable, and detailed answer. Use "search_web" to look up live internet information or official agency details whenever helpful. NEVER say you lack access to spare parts information.
4. If asked about market trends, average prices, similar vehicles, or inventory statistics in Costa Rica, call your database tools ("query_car_market_stats", "query_cars_db").
5. Keep answers concise, factual, structured, and easy to read with markdown.
6. For initial vehicle comparisons, structure your response in:
   1. **📊 %[10]s**: Single sentence comparison.
   2. **⚙️ %[11]s**: 3-4 bullet points on trade-offs (price vs year/km, maintenance, parts availability in Costa Rica).
   3. **✅ %[12]s**: 2 key pros / 1 con for each car.
   4. **🏆 %[13]s**: Declare the winner ("Winner: %[8]s" or "Winner: %[9]s" / "Ganador: %[8]s" or "Ganador: %[9]s").`,
			lang, car1Name, car1Year, car2Name, car2Year, string(car1JSON), string(car2JSON),
			labelCar1, labelCar2, hResumen, hDiferencias, hProsContras, hGanador)

		initialPrompt = fmt.Sprintf(`Please provide a comprehensive head-to-head comparison of %s and %s following the required format.`, labelCar1, labelCar2)
	} else if len(cars) == 1 {
		car1 := cars[0]
		car1Name, _ := car1["Title"].(string)
		car1YearVal, _ := car1["Year"].(float64)
		car1Year := int(car1YearVal)
		car1JSON, _ := json.MarshalIndent(car1, "", "  ")

		systemPrompt = fmt.Sprintf(`You are an expert automotive advisor specializing in the Costa Rican used car market and an assistant for the "Happy Customer" car platform.
You have direct access to database tools ("query_car_market_stats", "query_cars_db") and live internet search ("search_web").
Language to respond in: %[1]s.

VEHICLE CURRENTLY ATTACHED FOR ANALYSIS:
- %[2]s (%[3]d):
%[4]s

COSTA RICAN AUTOMOTIVE MARKET CONTEXT & GUIDELINES:
1. Official agencies and spare parts networks in Costa Rica:
   - Purdy Motor (Toyota, Lexus), Grupo Q (Hyundai, Isuzu, Chevrolet), Agencia Datsun (Nissan), Motortec (Audi, Porsche, VW), Bavarian Motors (BMW, Mini), Veinsa (Mitsubishi, Geely), AutoStar (Mercedes, Jeep).
2. Evaluate price vs mileage/year fairness against the Costa Rican market using database query tools if needed.
3. Highlight pros, potential maintenance considerations, and spare parts availability in Costa Rica.
4. Keep answers concise, factual, structured, and easy to read with markdown.`,
			lang, car1Name, car1Year, string(car1JSON))

		initialPrompt = fmt.Sprintf(`Please provide a detailed valuation and analysis of %s (%d) for the Costa Rican market.`, car1Name, car1Year)
	} else {
		systemPrompt = fmt.Sprintf(`You are an expert automotive advisor specializing in the Costa Rican used car market and an assistant for the "Happy Customer" car platform.
You have direct access to database tools ("query_car_market_stats", "query_cars_db") and live internet search ("search_web").
Language to respond in: %[1]s.

GUIDELINES:
1. Help users discover cars, compare models, assess market prices, understand agency spare parts availability, and make informed car buying decisions in Costa Rica.
2. If asked about market stats, models for sale, or average prices in Costa Rica, call your database tools ("query_car_market_stats", "query_cars_db").
3. If asked about specific specs, recalls, or agency networks, use "search_web" to look up live internet information.
4. Keep answers concise, helpful, friendly, and structured with markdown.`,
			lang)

		initialPrompt = "Hello! How can I assist you with your car search or questions about the Costa Rican automotive market today?"
	}

	var promptMessages []OpenRouterMessage
	promptMessages = append(promptMessages, OpenRouterMessage{
		Role:    "system",
		Content: systemPrompt,
	})

	if len(body.Messages) > 0 {
		for _, msg := range body.Messages {
			promptMessages = append(promptMessages, OpenRouterMessage{
				Role:    msg.Role,
				Content: msg.Content,
			})
		}
	} else {
		promptMessages = append(promptMessages, OpenRouterMessage{
			Role:    "user",
			Content: initialPrompt,
		})
	}

	// Define Tools (Database Queries + Live Internet Search)
	tools := []map[string]interface{}{
		{
			"type": "function",
			"function": map[string]interface{}{
				"name": "search_web",
				"description": "Search the live internet for automotive technical specifications, spare parts accessibility, maintenance costs, common problems, recall notices, or dealer/agency information in Costa Rica and globally.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"query": map[string]interface{}{
							"type":        "string",
							"description": "Search query keywords, e.g. 'Audi e-tron repuestos Costa Rica disponibilidad agencias' or 'Toyota RAV4 vs Audi e-tron mantenimiento'",
						},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name": "query_car_market_stats",
				"description": "Query aggregated market stats (average price, min/max price, average mileage, total listings, sold count) from the Costa Rican cars database for a brand/model/year.",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"brand": map[string]interface{}{
							"type":        "string",
							"description": "Vehicle brand, e.g. Toyota, Audi, Hyundai, Nissan, BMW",
						},
						"model": map[string]interface{}{
							"type":        "string",
							"description": "Vehicle model name or keyword, e.g. E-TRON, RAV4, Tucson, Hilux",
						},
						"year_min": map[string]interface{}{
							"type":        "integer",
							"description": "Optional minimum year filter",
						},
						"year_max": map[string]interface{}{
							"type":        "integer",
							"description": "Optional maximum year filter",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name": "query_cars_db",
				"description": "Search actual car classifieds listings in the database with filters (brand, title/keywords, price range, year range, fuel, transmission).",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"brand": map[string]interface{}{
							"type":        "string",
							"description": "Brand filter",
						},
						"title": map[string]interface{}{
							"type":        "string",
							"description": "Search keywords or model",
						},
						"price_min": map[string]interface{}{
							"type":        "integer",
							"description": "Minimum price in USD",
						},
						"price_max": map[string]interface{}{
							"type":        "integer",
							"description": "Maximum price in USD",
						},
						"year_min": map[string]interface{}{
							"type":        "integer",
							"description": "Minimum year",
						},
						"year_max": map[string]interface{}{
							"type":        "integer",
							"description": "Maximum year",
						},
						"fuel": map[string]interface{}{
							"type":        "string",
							"description": "Fuel type: Gasolina, Diesel, Eléctrico, Híbrido",
						},
						"transmission": map[string]interface{}{
							"type":        "string",
							"description": "Transmisión: Manual, Automática, Dual",
						},
						"limit": map[string]interface{}{
							"type":        "integer",
							"description": "Max listings to return (default 5, max 10)",
						},
					},
				},
			},
		},
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	client := &http.Client{Timeout: 60 * time.Second}

	// 1. First call to evaluate if tool calls are requested
	firstReqBodyMap := map[string]interface{}{
		"model":    "google/gemini-2.5-flash",
		"messages": promptMessages,
		"tools":    tools,
	}

	firstReqBytes, _ := json.Marshal(firstReqBodyMap)
	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(firstReqBytes))
	if err != nil {
		http.Error(w, "Failed to create AI request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "https://happy-customer.app")
	req.Header.Set("X-Title", "Happy Customer")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[API ERROR] OpenRouter request failed: %v", err)
		http.Error(w, "Failed to call AI API", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		log.Printf("[API ERROR] OpenRouter returned %d: %s", resp.StatusCode, string(errBody))
		http.Error(w, fmt.Sprintf("AI API error: %d", resp.StatusCode), resp.StatusCode)
		return
	}

	var openRouterResp OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&openRouterResp); err != nil {
		log.Printf("[API ERROR] Failed to decode OpenRouter response: %v", err)
		http.Error(w, "Failed to parse AI response", http.StatusInternalServerError)
		return
	}

	if len(openRouterResp.Choices) == 0 {
		http.Error(w, "No response choice returned by AI", http.StatusInternalServerError)
		return
	}

	choiceMsg := openRouterResp.Choices[0].Message

	// If the model called tools, execute them against DB/Web and do a streamed completion
	if len(choiceMsg.ToolCalls) > 0 {
		promptMessages = append(promptMessages, choiceMsg)

		for _, toolCall := range choiceMsg.ToolCalls {
			fnName := toolCall.Function.Name
			fnArgsJSON := toolCall.Function.Arguments
			var toolOutput string

			if fnName == "search_web" {
				var args struct {
					Query string `json:"query"`
				}
				json.Unmarshal([]byte(fnArgsJSON), &args)
				webResults, err := searchDuckDuckGo(args.Query)
				if err != nil || len(webResults) == 0 {
					toolOutput = fmt.Sprintf(`{"status": "search completed", "query": "%s", "results": "No specific external snippets found. Use Costa Rican market context and general knowledge."}`, args.Query)
				} else {
					outBytes, _ := json.Marshal(webResults)
					toolOutput = string(outBytes)
				}
			} else if fnName == "query_car_market_stats" {
				var args struct {
					Brand   string `json:"brand"`
					Model   string `json:"model"`
					YearMin int    `json:"year_min"`
					YearMax int    `json:"year_max"`
				}
				json.Unmarshal([]byte(fnArgsJSON), &args)
				stats, err := s.DB.GetMarketStats(args.Brand, args.Model, args.YearMin, args.YearMax)
				if err != nil {
					toolOutput = fmt.Sprintf(`{"error": "%s"}`, err.Error())
				} else {
					outBytes, _ := json.Marshal(stats)
					toolOutput = string(outBytes)
				}
			} else if fnName == "query_cars_db" {
				var args struct {
					Brand        string `json:"brand"`
					Title        string `json:"title"`
					PriceMin     int    `json:"price_min"`
					PriceMax     int    `json:"price_max"`
					YearMin      int    `json:"year_min"`
					YearMax      int    `json:"year_max"`
					Fuel         string `json:"fuel"`
					Transmission string `json:"transmission"`
					Limit        int    `json:"limit"`
				}
				json.Unmarshal([]byte(fnArgsJSON), &args)
				limit := args.Limit
				if limit <= 0 || limit > 10 {
					limit = 5
				}
				f := db.FilterParams{
					Brand:       args.Brand,
					TitleQuery:  args.Title,
					PriceMin:    args.PriceMin,
					PriceMax:    args.PriceMax,
					YearMin:     args.YearMin,
					YearMax:     args.YearMax,
					Combustible: args.Fuel,
					Transmision: args.Transmission,
					Limit:       limit,
				}
				cars, err := s.DB.GetCars(f)
				if err != nil {
					toolOutput = fmt.Sprintf(`{"error": "%s"}`, err.Error())
				} else {
					type SimpleCar struct {
						Title       string `json:"title"`
						Year        int    `json:"year"`
						Price       int    `json:"price"`
						PriceText   string `json:"price_text"`
						Kilometraje int    `json:"kilometraje"`
						Combustible string `json:"combustible"`
						Transmision string `json:"transmision"`
						Provincia   string `json:"provincia"`
						URL         string `json:"url"`
					}
					var simple []SimpleCar
					for _, c := range cars {
						simple = append(simple, SimpleCar{
							Title:       c.Title,
							Year:        c.Year,
							Price:       c.Price,
							PriceText:   c.PriceText,
							Kilometraje: c.Kilometraje,
							Combustible: c.Combustible,
							Transmision: c.Transmision,
							Provincia:   c.Provincia,
							URL:         c.URL,
						})
					}
					outBytes, _ := json.Marshal(simple)
					toolOutput = string(outBytes)
				}
			} else {
				toolOutput = `{"error": "Unknown tool"}`
			}

			promptMessages = append(promptMessages, OpenRouterMessage{
				Role:       "tool",
				ToolCallID: toolCall.ID,
				Content:    toolOutput,
			})
		}

		// Stream the final answer after tool execution
		secondReqBodyMap := map[string]interface{}{
			"model":    "google/gemini-2.5-flash",
			"messages": promptMessages,
			"stream":   true,
		}
		secondReqBytes, _ := json.Marshal(secondReqBodyMap)
		secondReq, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(secondReqBytes))
		if err != nil {
			http.Error(w, "Failed to create streaming request", http.StatusInternalServerError)
			return
		}
		secondReq.Header.Set("Content-Type", "application/json")
		secondReq.Header.Set("Authorization", "Bearer "+apiKey)
		secondReq.Header.Set("HTTP-Referer", "https://happy-customer.app")
		secondReq.Header.Set("X-Title", "Happy Customer")

		secondResp, err := client.Do(secondReq)
		if err != nil {
			log.Printf("[API ERROR] Streamed OpenRouter request failed: %v", err)
			http.Error(w, "Failed to stream AI response", http.StatusInternalServerError)
			return
		}
		defer secondResp.Body.Close()

		buf := make([]byte, 4096)
		for {
			n, err := secondResp.Body.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
				flusher.Flush()
			}
			if err != nil {
				break
			}
		}
		return
	}

	// If no tool was called, stream the choice content directly as SSE
	if choiceMsg.Content != "" {
		// Send standard SSE chunk
		deltaPayload := map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"delta": map[string]string{
						"content": choiceMsg.Content,
					},
				},
			},
		}
		deltaBytes, _ := json.Marshal(deltaPayload)
		fmt.Fprintf(w, "data: %s\n\n", string(deltaBytes))
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}
}

func (s *Server) HandleBargains(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	bargains, err := s.DB.GetBargains()
	if err != nil {
		log.Printf("[API ERROR] GetBargains failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if bargains == nil {
		bargains = []db.BargainResult{}
	}

	json.NewEncoder(w).Encode(bargains)
}

func (s *Server) HandleTopSellers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	sellers, err := s.DB.GetTopSellers()
	if err != nil {
		log.Printf("[API ERROR] GetTopSellers failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(sellers)
}
