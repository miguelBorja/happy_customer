package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

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
		Brand:       q.Get("brand"),
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
		ScrapedFrom: q.Get("scrapedFrom"),
		ScrapedTo:   q.Get("scrapedTo"),
	}

	if k, _ := strconv.Atoi(q.Get("kmMax")); k > 0 { f.KmMax = k }
	if k, _ := strconv.Atoi(q.Get("kmMin")); k > 0 { f.KmMin = k }
	if p, _ := strconv.Atoi(q.Get("priceMax")); p > 0 { f.PriceMax = p }
	if p, _ := strconv.Atoi(q.Get("priceMin")); p > 0 { f.PriceMin = p }

	if isSoldStr := q.Get("isSold"); isSoldStr != "" {
		b := isSoldStr == "true"
		f.IsSold = &b
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
		Car1     map[string]interface{} `json:"car1"`
		Car2     map[string]interface{} `json:"car2"`
		Language string                 `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	lang := "Spanish"
	if body.Language == "en" {
		lang = "English"
	}

	car1Name, _ := body.Car1["Title"].(string)
	car1YearVal, _ := body.Car1["Year"].(float64)
	car1Year := int(car1YearVal)

	car2Name, _ := body.Car2["Title"].(string)
	car2YearVal, _ := body.Car2["Year"].(float64)
	car2Year := int(car2YearVal)

	car1JSON, _ := json.MarshalIndent(body.Car1, "", "  ")
	car2JSON, _ := json.MarshalIndent(body.Car2, "", "  ")

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

	prompt := fmt.Sprintf(`You are an expert automotive advisor specializing in the Costa Rican used car market. Compare these two cars and respond entirely in %[1]s.
Keep your response extremely concise, direct, and fact-focused. Avoid conversational fluff or general introductions.

You MUST refer to the cars exactly as "%[8]s" (which is %[2]s %[3]d) and "%[9]s" (which is %[4]s %[5]d) throughout your entire response. Never use Spanish terms like "Carro 1" or "Carro 2" when the language is English, and never translate or deviate from "%[8]s" and "%[9]s".

If the vehicles belong to different segments (e.g., Sedan vs SUV), have different powertrains (e.g., EV vs Gas/Diesel), or represent different brands, explicitly analyze the trade-offs regarding segment utility, resale value, availability of spare parts in Costa Rica, and brand reputation in the Costa Rican market.

CAR 1: %[2]s (%[3]d)
%[6]s

CAR 2: %[4]s (%[5]d)
%[7]s

Provide the comparison in these exact, short sections:

1. **\U0001F4CA %[10]s**: A single sentence comparing both vehicles, highlighting segment or brand differences if applicable.
2. **\u2699\uFE0F %[11]s**: 3-4 bullet points highlighting the main trade-offs (price vs year/mileage, segment pros/cons, brand reliability, parts availability in Costa Rica).
3. **\u2705 %[12]s**:
   - *%[8]s (%[2]s)*: 2 key pros / 1 con.
   - *%[9]s (%[4]s)*: 2 key pros / 1 con.
4. **\U0001F3C6 %[13]s**: Clearly declare the WINNER and justify it in 2-3 sentences max. You MUST start this section with "Winner: %[8]s" or "Winner: %[9]s" (or "Ganador: %[8]s" or "Ganador: %[9]s" if Spanish).`, 
		lang, car1Name, car1Year, car2Name, car2Year, string(car1JSON), string(car2JSON),
		labelCar1, labelCar2, hResumen, hDiferencias, hProsContras, hGanador)

	openRouterBody := map[string]interface{}{
		"model": "google/gemini-2.5-flash",
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream": true,
	}

	reqBody, err := json.Marshal(openRouterBody)
	if err != nil {
		http.Error(w, "Failed to marshal request", http.StatusInternalServerError)
		return
	}

	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "https://happy-customer.app")
	req.Header.Set("X-Title", "Happy Customer")

	client := &http.Client{}
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

	// Stream SSE response to client
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			flusher.Flush()
		}
		if err != nil {
			break
		}
	}
}
