package api

import (
	"encoding/json"
	"net/http"
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
	
	json.NewEncoder(w).Encode(map[string]int{
		"total": total,
		"active": active,
		"sold": sold,
	})
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
