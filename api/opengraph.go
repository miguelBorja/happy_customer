package api

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var crautosCarIDRe = regexp.MustCompile(`[?&]c=(\d+)`)

// formatCommaInt renders an integer with thousands separators (18500 -> "18,500").
func formatCommaInt(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.Itoa(n)
	out := make([]byte, 0, len(s)+len(s)/3)
	for i := 0; i < len(s); i++ {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, s[i])
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}

// replaceTitleTag replaces the <title>...</title> element in doc, escaping title first.
func replaceTitleTag(doc, title string) string {
	esc := html.EscapeString(title)
	re := regexp.MustCompile(`(?s)<title[^>]*>.*?</title>`)
	return re.ReplaceAllLiteralString(doc, "<title>"+esc+"</title>")
}

// replaceMetaTag replaces a <meta name="..." content="..."> or <meta property="..." content="...">
// element whose name/property equals key, escaping value first. It returns doc unchanged when no
// such element exists.
func replaceMetaTag(doc, attr, key, value string) string {
	esc := html.EscapeString(value)
	re := regexp.MustCompile(`<meta\s+[^>]*\b` + regexp.QuoteMeta(attr) + `\s*=\s*["']` + regexp.QuoteMeta(key) + `["'][^>]*?/?>`)
	return re.ReplaceAllLiteralString(doc, `<meta `+attr+`="`+key+`" content="`+esc+`" />`)
}

// setTwitterCard replaces an existing twitter:card meta tag or inserts one right after og:image.
func setTwitterCard(doc, card string) string {
	esc := html.EscapeString(card)
	re := regexp.MustCompile(`<meta\s+[^>]*\bname\s*=\s*["']twitter:card["'][^>]*?/?>`)
	newTag := `<meta name="twitter:card" content="` + esc + `" />`
	if re.MatchString(doc) {
		return re.ReplaceAllLiteralString(doc, newTag)
	}
	imgRe := regexp.MustCompile(`<meta\s+[^>]*\bproperty\s*=\s*["']og:image["'][^>]*?/?>`)
	loc := imgRe.FindStringIndex(doc)
	if loc == nil {
		return doc
	}
	return doc[:loc[1]] + "\n    " + newTag + doc[loc[1]:]
}

// RenderIndexHTML rewrites the Open Graph / Twitter metadata of baseHTML based on the request
// query string. A plain "/" (no recognized params) returns baseHTML unchanged.
func (s *Server) RenderIndexHTML(r *http.Request, baseHTML string) string {
	q := r.URL.Query()

	// Individual listing.
	if carURL := strings.TrimSpace(q.Get("car")); carURL != "" {
		return s.renderCarMeta(baseHTML, carURL)
	}

	// Side-by-side comparison link (?compare=url1,url2,...).
	if compareParam := strings.TrimSpace(q.Get("compare")); compareParam != "" {
		return s.renderCompareMeta(baseHTML, compareParam)
	}

	// Seller valuation calculator (?tab=valuate&brand=...&model=...&year=...).
	if q.Get("tab") == "valuate" {
		return renderValuateMeta(baseHTML, q)
	}

	// Gangas tab.
	if q.Get("tab") == "bargains" {
		const title = "Gangas del mercado | Happy Customer"
		const desc = "Vehículos usados muy por debajo de la mediana del mercado en Costa Rica."
		doc := replaceTitleTag(baseHTML, title)
		doc = replaceMetaTag(doc, "name", "description", desc)
		doc = replaceMetaTag(doc, "property", "og:title", title)
		doc = replaceMetaTag(doc, "property", "og:description", desc)
		doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
		doc = setTwitterCard(doc, "summary")
		return doc
	}

	// Shared filter link.
	if hasFilterParam(q) {
		summary := buildFilterSummary(q)
		title := "Autos usados filtrados | Happy Customer"
		desc := "Autos usados filtrados | Happy Customer"
		if summary != "" {
			title = "Búsqueda: " + summary + " | Happy Customer"
			desc = summary
		}
		doc := replaceTitleTag(baseHTML, title)
		doc = replaceMetaTag(doc, "name", "description", desc)
		doc = replaceMetaTag(doc, "property", "og:title", title)
		doc = replaceMetaTag(doc, "property", "og:description", desc)
		doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
		doc = setTwitterCard(doc, "summary")
		return doc
	}

	// Plain "/".
	return baseHTML
}

func (s *Server) renderCarMeta(baseHTML, carURL string) string {
	if s == nil || s.DB == nil {
		return baseHTML
	}
	cars, err := s.DB.GetCarsByURLs([]string{carURL})
	if err != nil || len(cars) == 0 {
		return baseHTML
	}
	cm := s.withMarket(cars)[0]
	car := cm.Car

	label := ""
	if b, m := strings.TrimSpace(car.Brand), strings.TrimSpace(car.Model); b != "" || m != "" {
		label = strings.TrimSpace(b + " " + m)
		if car.Year > 0 {
			label += " " + strconv.Itoa(car.Year)
		}
	}
	if label == "" {
		label = strings.TrimSpace(car.Title)
	}
	if label == "" {
		label = "Auto usado"
	}

	priceStr := ""
	if car.Price > 0 {
		priceStr = "$" + formatCommaInt(car.Price)
	} else {
		priceStr = strings.TrimSpace(car.PriceText)
	}

	sold := car.IsSold
	title := label
	if sold {
		title += " (Vendido)"
	}
	if priceStr != "" {
		title += " · " + priceStr
	}
	title += " | Happy Customer"

	var highlights []string
	if cm.MarketFlag == "" && cm.MarketExpected > 0 && car.Price > 0 {
		pct := float64(car.Price-cm.MarketExpected) / float64(cm.MarketExpected) * 100
		if pct <= greatDealMaxPct {
			highlights = append(highlights, "Gran precio")
		} else if pct <= goodDealMaxPct {
			highlights = append(highlights, "Buen precio")
		}
	}
	if cm.MarketFlag == "" && cm.PricePrevious > car.Price && car.Price > 0 {
		drop := cm.PricePrevious - car.Price
		if drop >= minBadgeDropUSD && float64(drop)/float64(cm.PricePrevious)*100 >= minBadgeDropPct {
			highlights = append(highlights, fmt.Sprintf("Bajó $%s", formatCommaInt(drop)))
		}
	}
	if car.Kilometraje > 0 {
		highlights = append(highlights, fmt.Sprintf("%s km", formatCommaInt(car.Kilometraje)))
	}
	for _, v := range []string{car.Transmision, car.Combustible, car.Estilo, car.Provincia} {
		if v = strings.TrimSpace(v); v != "" && v != "ND" {
			highlights = append(highlights, v)
		}
	}
	desc := strings.Join(highlights, " · ")
	if desc == "" {
		desc = "Vehículo usado en Costa Rica · Happy Customer"
	}

	ogImage := "/favicon.png"
	twitterCard := "summary"
	if !sold {
		if m := crautosCarIDRe.FindStringSubmatch(car.URL); len(m) > 1 {
			ogImage = "https://crautos.com/clasificados/usados/" + m[1] + "-1.jpg"
			twitterCard = "summary_large_image"
		}
	}

	doc := replaceTitleTag(baseHTML, title)
	doc = replaceMetaTag(doc, "name", "description", desc)
	doc = replaceMetaTag(doc, "property", "og:title", title)
	doc = replaceMetaTag(doc, "property", "og:description", desc)
	doc = replaceMetaTag(doc, "property", "og:image", ogImage)
	doc = setTwitterCard(doc, twitterCard)
	return doc
}

func (s *Server) renderCompareMeta(baseHTML, compareParam string) string {
	urls := splitNonEmpty(compareParam)
	if len(urls) > 4 {
		urls = urls[:4]
	}

	title := "Comparativa de autos usados | Happy Customer"
	desc := "Compara precio, kilometraje, equipamiento y valor de mercado en Costa Rica."
	ogImage := "/favicon.png"
	twitterCard := "summary"

	if s != nil && s.DB != nil && len(urls) > 0 {
		if cars, err := s.DB.GetCarsByURLs(urls); err == nil && len(cars) > 0 {
			ordered := orderCarsByURLs(cars, urls)
			if len(ordered) > 0 {
				var names []string
				var details []string
				for _, car := range ordered {
					label := strings.TrimSpace(strings.TrimSpace(car.Brand) + " " + strings.TrimSpace(car.Model))
					if car.Year > 0 && label != "" {
						label += " " + strconv.Itoa(car.Year)
					}
					if label == "" {
						label = strings.TrimSpace(car.Title)
					}
					if label == "" {
						label = "Auto"
					}
					names = append(names, label)

					var meta []string
					if car.Price > 0 {
						meta = append(meta, "$"+formatCommaInt(car.Price))
					}
					if car.Kilometraje > 0 {
						meta = append(meta, fmt.Sprintf("%s km", formatCommaInt(car.Kilometraje)))
					}
					if len(meta) > 0 {
						details = append(details, fmt.Sprintf("%s (%s)", label, strings.Join(meta, " · ")))
					} else {
						details = append(details, label)
					}

					if ogImage == "/favicon.png" && !car.IsSold {
						if m := crautosCarIDRe.FindStringSubmatch(car.URL); len(m) > 1 {
							ogImage = "https://crautos.com/clasificados/usados/" + m[1] + "-1.jpg"
							twitterCard = "summary_large_image"
						}
					}
				}
				title = "Comparativa: " + strings.Join(names, " vs ") + " | Happy Customer"
				desc = strings.Join(details, " · ")
			}
		}
	}

	doc := replaceTitleTag(baseHTML, title)
	doc = replaceMetaTag(doc, "name", "description", desc)
	doc = replaceMetaTag(doc, "property", "og:title", title)
	doc = replaceMetaTag(doc, "property", "og:description", desc)
	doc = replaceMetaTag(doc, "property", "og:image", ogImage)
	doc = setTwitterCard(doc, twitterCard)
	return doc
}

func renderValuateMeta(baseHTML string, q url.Values) string {
	brand := strings.TrimSpace(q.Get("brand"))
	model := strings.TrimSpace(q.Get("model"))
	year, _ := strconv.Atoi(strings.TrimSpace(q.Get("year")))

	title := "¿A cuánto vender mi carro en Costa Rica? | Happy Customer"
	desc := "Calcula el precio justo de mercado, venta rápida y competencia activa para tu vehículo en Costa Rica."
	if brand != "" && model != "" {
		subject := brand + " " + model
		if year >= 1980 && year <= 2030 {
			subject += " " + strconv.Itoa(year)
		}
		title = "¿Cuánto vale un " + subject + " en Costa Rica? | Happy Customer"
		desc = "Rango estimado de mercado ajustado por kilometraje, liquidez y comparables activos para " + subject + " en Costa Rica."
	}

	doc := replaceTitleTag(baseHTML, title)
	doc = replaceMetaTag(doc, "name", "description", desc)
	doc = replaceMetaTag(doc, "property", "og:title", title)
	doc = replaceMetaTag(doc, "property", "og:description", desc)
	doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
	doc = setTwitterCard(doc, "summary")
	return doc
}

func hasFilterParam(q url.Values) bool {
	for _, p := range []string{
		"brands", "brand", "models", "estilo", "provincia",
		"yearMin", "yearMax", "priceMin", "priceMax", "kmMax",
		"combustible", "transmision", "deal", "priceDrop",
		"seRecibe", "negociable", "title",
	} {
		if strings.TrimSpace(q.Get(p)) != "" {
			return true
		}
	}
	return false
}

func buildFilterSummary(q url.Values) string {
	var parts []string

	var brands []string
	if b := q.Get("brands"); strings.TrimSpace(b) != "" {
		brands = splitNonEmpty(b)
	} else if b := q.Get("brand"); strings.TrimSpace(b) != "" {
		brands = splitNonEmpty(b)
	}
	if len(brands) > 0 {
		parts = append(parts, strings.Join(brands, " / "))
	}
	if m := splitNonEmpty(q.Get("models")); len(m) > 0 {
		parts = append(parts, strings.Join(m, " / "))
	}

	if e := strings.TrimSpace(q.Get("estilo")); e != "" {
		parts = append(parts, e)
	}
	if p := strings.TrimSpace(q.Get("provincia")); p != "" {
		parts = append(parts, p)
	}

	priceMin, _ := strconv.Atoi(q.Get("priceMin"))
	priceMax, _ := strconv.Atoi(q.Get("priceMax"))
	switch {
	case priceMin > 0 && priceMax > 0:
		parts = append(parts, fmt.Sprintf("$%s–$%s", formatCommaInt(priceMin), formatCommaInt(priceMax)))
	case priceMax > 0:
		parts = append(parts, fmt.Sprintf("hasta $%s", formatCommaInt(priceMax)))
	case priceMin > 0:
		parts = append(parts, fmt.Sprintf("desde $%s", formatCommaInt(priceMin)))
	}

	yearMin, _ := strconv.Atoi(q.Get("yearMin"))
	yearMax, _ := strconv.Atoi(q.Get("yearMax"))
	switch {
	case yearMin > 0 && yearMax > 0:
		parts = append(parts, fmt.Sprintf("%d–%d", yearMin, yearMax))
	case yearMax > 0:
		parts = append(parts, fmt.Sprintf("hasta %d", yearMax))
	case yearMin > 0:
		parts = append(parts, fmt.Sprintf("desde %d", yearMin))
	}

	if c := strings.TrimSpace(q.Get("combustible")); c != "" {
		parts = append(parts, c)
	}
	if tr := strings.TrimSpace(q.Get("transmision")); tr != "" {
		parts = append(parts, tr)
	}
	if strings.TrimSpace(q.Get("deal")) != "" {
		parts = append(parts, "buenos precios")
	}
	if q.Get("priceDrop") == "true" {
		parts = append(parts, "bajaron de precio")
	}
	if q.Get("seRecibe") == "true" {
		parts = append(parts, "se recibe")
	}
	if q.Get("negociable") == "true" {
		parts = append(parts, "negociable")
	}
	if t := strings.TrimSpace(q.Get("title")); t != "" {
		parts = append(parts, t)
	}

	return strings.Join(parts, " · ")
}

func splitNonEmpty(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// ServeIndexHTML reads the built index.html, renders dynamic meta tags, and writes the result
// with no-cache headers.
func (s *Server) ServeIndexHTML(w http.ResponseWriter, r *http.Request, indexPath string) {
	data, err := os.ReadFile(indexPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Write([]byte(s.RenderIndexHTML(r, string(data))))
}
