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
		SortBy:      q.Get("sortBy"),
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
