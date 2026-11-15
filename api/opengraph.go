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

	"crautosdb/db"
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

// RenderIndexHTML rewrites the Open Graph / Twitter metadata, canonical URL, and JSON-LD of
// baseHTML based on the request query string. A plain "/" (no recognized params) returns baseHTML unchanged.
func (s *Server) RenderIndexHTML(r *http.Request, baseHTML string) string {
	q := r.URL.Query()

	// Individual listing.
	if carURL := strings.TrimSpace(q.Get("car")); carURL != "" {
		return s.renderCarMeta(r, baseHTML, carURL)
	}

	// Side-by-side comparison link (?compare=url1,url2,...).
	if compareParam := strings.TrimSpace(q.Get("compare")); compareParam != "" {
		return s.renderCompareMeta(r, baseHTML, compareParam)
	}

	// Seller valuation calculator (?tab=valuate&brand=...&model=...&year=...).
	if q.Get("tab") == "valuate" {
		return s.renderValuateMeta(r, baseHTML, q)
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
		doc = setCanonicalLink(doc, buildSEOURL(resolveBaseURL(r), "tab", "bargains"))
		return doc
	}

	// Stats tab.
	if q.Get("tab") == "stats" {
		const title = "Estadísticas del mercado automotriz en Costa Rica | Happy Customer"
		const desc = "Marcas, modelos, precios promedio, curvas de depreciación y volumen del mercado usado en Costa Rica."
		doc := replaceTitleTag(baseHTML, title)
		doc = replaceMetaTag(doc, "name", "description", desc)
		doc = replaceMetaTag(doc, "property", "og:title", title)
		doc = replaceMetaTag(doc, "property", "og:description", desc)
		doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
		doc = setTwitterCard(doc, "summary")
		doc = setCanonicalLink(doc, buildSEOURL(resolveBaseURL(r), "tab", "stats"))
		return doc
	}

	// Shared filter link or SEO brand/model landing.
	if hasFilterParam(q) {
		return s.renderFilterMeta(r, baseHTML, q)
	}

	// Plain "/".
	return baseHTML
}

func (s *Server) renderCarMeta(r *http.Request, baseHTML, carURL string) string {
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
	} else if cm.ThumbURL != "" {
		ogImage = cm.ThumbURL
	}

	canonicalURL := buildSEOURL(resolveBaseURL(r), "car", carURL)

	doc := replaceTitleTag(baseHTML, title)
	doc = replaceMetaTag(doc, "name", "description", desc)
	doc = replaceMetaTag(doc, "property", "og:title", title)
	doc = replaceMetaTag(doc, "property", "og:description", desc)
	doc = replaceMetaTag(doc, "property", "og:image", ogImage)
	doc = setTwitterCard(doc, twitterCard)
	doc = setCanonicalLink(doc, canonicalURL)

	if car.Price > 0 && cm.MarketFlag != flagTypo {
		avail := "https://schema.org/InStock"
		if sold {
			avail = "https://schema.org/SoldOut"
		}
		ld := &ldVehicleOffer{
			Context:     "https://schema.org",
			Type:        "Car",
			Name:        label,
			Description: desc,
			Model:       strings.TrimSpace(car.Model),
			URL:         canonicalURL,
			Offers: &ldOffer{
				Type:          "Offer",
				PriceCurrency: "USD",
				Price:         car.Price,
				Availability:  avail,
				URL:           canonicalURL,
			},
		}
		if b := strings.TrimSpace(car.Brand); b != "" {
			ld.Brand = &ldBrand{Type: "Brand", Name: b}
		}
		if car.Year > 0 {
			ld.VehicleModelDate = strconv.Itoa(car.Year)
		}
		if car.Kilometraje > 0 {
			ld.MileageFromOdometer = &ldQuantitativeValue{
				Type:     "QuantitativeValue",
				Value:    car.Kilometraje,
				UnitCode: "KMT",
			}
		}
		if !sold && strings.HasPrefix(ogImage, "https://") {
			ld.Image = ogImage
		}
		doc = setJSONLD(doc, ld)
	}
	return doc
}

func (s *Server) renderCompareMeta(r *http.Request, baseHTML, compareParam string) string {
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
	doc = setCanonicalLink(doc, buildSEOURL(resolveBaseURL(r), "compare", strings.Join(urls, ",")))
	return doc
}

func (s *Server) renderValuateMeta(r *http.Request, baseHTML string, q url.Values) string {
	brand := strings.TrimSpace(q.Get("brand"))
	model := strings.TrimSpace(q.Get("model"))
	year, _ := strconv.Atoi(strings.TrimSpace(q.Get("year")))
	validYear := year >= 1980 && year <= 2030

	title := "¿A cuánto vender mi carro en Costa Rica? | Happy Customer"
	desc := "Calcula el precio justo de mercado, venta rápida y competencia activa para tu vehículo en Costa Rica."
	base := resolveBaseURL(r)
	canonicalURL := buildSEOURL(base, "tab", "valuate")

	var stats *db.MarketIndex
	if s != nil && s.DB != nil && brand != "" {
		stats = s.getMarketStats()
	}

	var ld any
	if brand != "" && model != "" {
		displayBrand, displayModel := brand, model
		ms, hasModel := stats.LookupModel(brand, model)
		if hasModel {
			if ms.Brand != "" {
				displayBrand = ms.Brand
			}
			if ms.Model != "" {
				displayModel = ms.Model
			}
		}
		subject := displayBrand + " " + displayModel
		if validYear {
			subject += " " + strconv.Itoa(year)
			canonicalURL = buildSEOURL(base, "tab", "valuate", "brand", displayBrand, "model", displayModel, "year", strconv.Itoa(year))
		} else {
			canonicalURL = buildSEOURL(base, "tab", "valuate", "brand", displayBrand, "model", displayModel)
		}
		title = "¿Cuánto vale un " + subject + " en Costa Rica? | Happy Customer"
		desc = "Rango estimado de mercado ajustado por kilometraje, liquidez y comparables activos para " + subject + " en Costa Rica."

		if validYear && stats != nil && stats.Groups != nil {
			if stat, ok := stats.Groups[db.MarketKey(brand, model, year)]; ok && stat.Count > 0 && stat.Median > 0 {
				desc = fmt.Sprintf("Valor de mercado para %s en Costa Rica: mediana $%s (rango $%s–$%s, %d comparables en CrautosDB).", subject, formatCommaInt(stat.Median), formatCommaInt(stat.MinPrice), formatCommaInt(stat.MaxPrice), stat.Count)
				offerCount := stat.ActiveCount
				if offerCount == 0 {
					offerCount = stat.Count
				}
				ld = buildProductAggregateJSONLD(subject+" en Costa Rica", desc, displayBrand, displayModel, year, canonicalURL, stat.MinPrice, stat.MaxPrice, offerCount, stat.ActiveCount)
			}
		}
		if ld == nil && hasModel && ms.TotalCount > 0 && ms.MedianPrice > 0 {
			yearSpan := ""
			if ms.YearMin > 0 && ms.YearMax > ms.YearMin {
				yearSpan = fmt.Sprintf(", años %d–%d", ms.YearMin, ms.YearMax)
			} else if ms.YearMin > 0 {
				yearSpan = fmt.Sprintf(", año %d", ms.YearMin)
			}
			desc = fmt.Sprintf("Precio y depreciación de %s en Costa Rica: rango $%s–$%s, mediana $%s (%d comparables%s).", subject, formatCommaInt(ms.MinPrice), formatCommaInt(ms.MaxPrice), formatCommaInt(ms.MedianPrice), ms.TotalCount, yearSpan)
			offerCount := ms.ActiveCount
			if offerCount == 0 {
				offerCount = ms.TotalCount
			}
			yr := 0
			if validYear {
				yr = year
			}
			ld = buildProductAggregateJSONLD(subject+" en Costa Rica", desc, displayBrand, displayModel, yr, canonicalURL, ms.MinPrice, ms.MaxPrice, offerCount, ms.ActiveCount)
		}
	} else if brand != "" {
		displayBrand := brand
		if bs, ok := stats.LookupBrand(brand); ok && bs.TotalCount > 0 && bs.MedianPrice > 0 {
			if bs.Brand != "" {
				displayBrand = bs.Brand
			}
			desc = fmt.Sprintf("Tasador de autos %s en Costa Rica: %d comparables desde $%s hasta $%s (mediana $%s).", displayBrand, bs.TotalCount, formatCommaInt(bs.MinPrice), formatCommaInt(bs.MaxPrice), formatCommaInt(bs.MedianPrice))
			offerCount := bs.ActiveCount
			if offerCount == 0 {
				offerCount = bs.TotalCount
			}
			ld = buildProductAggregateJSONLD("Autos "+displayBrand+" en Costa Rica", desc, displayBrand, "", 0, buildSEOURL(base, "tab", "valuate", "brand", displayBrand), bs.MinPrice, bs.MaxPrice, offerCount, bs.ActiveCount)
		}
		canonicalURL = buildSEOURL(base, "tab", "valuate", "brand", displayBrand)
	}

	doc := replaceTitleTag(baseHTML, title)
	doc = replaceMetaTag(doc, "name", "description", desc)
	doc = replaceMetaTag(doc, "property", "og:title", title)
	doc = replaceMetaTag(doc, "property", "og:description", desc)
	doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
	doc = setTwitterCard(doc, "summary")
	doc = setCanonicalLink(doc, canonicalURL)
	doc = setJSONLD(doc, ld)
	return doc
}

func isPureSEOLanding(q url.Values) (brand, model string, exactYear int, ok bool) {
	for _, narrow := range []string{
		"estilo", "provincia", "priceMin", "priceMax", "priceMode",
		"kmMin", "kmMax", "kmMode", "combustible", "transmision",
		"deal", "priceDrop", "motivated", "seRecibe", "negociable",
		"title", "sellerName", "sellerMode", "equipments",
		"scrapedFrom", "scrapedTo", "scrapedPeriod",
	} {
		if strings.TrimSpace(q.Get(narrow)) != "" {
			return "", "", 0, false
		}
	}
	if isSold := strings.TrimSpace(q.Get("isSold")); isSold != "" && isSold != "false" {
		return "", "", 0, false
	}

	brands := splitNonEmpty(q.Get("brands"))
	if len(brands) == 0 {
		brands = splitNonEmpty(q.Get("brand"))
	}
	models := splitNonEmpty(q.Get("models"))
	if len(brands) != 1 || len(models) > 1 {
		return "", "", 0, false
	}

	yMin := strings.TrimSpace(q.Get("yearMin"))
	yMax := strings.TrimSpace(q.Get("yearMax"))
	if yMin != "" || yMax != "" {
		if yMin != yMax {
			return "", "", 0, false
		}
		yr, err := strconv.Atoi(yMin)
		if err != nil || yr < 1980 || yr > 2030 {
			return "", "", 0, false
		}
		exactYear = yr
	}

	if len(models) == 1 {
		model = models[0]
	}
	return brands[0], model, exactYear, true
}

func (s *Server) renderFilterMeta(r *http.Request, baseHTML string, q url.Values) string {
	base := resolveBaseURL(r)

	if brand, model, exactYear, ok := isPureSEOLanding(q); ok {
		var stats *db.MarketIndex
		if s != nil && s.DB != nil {
			stats = s.getMarketStats()
		}

		var title, desc, canonicalURL string
		var ld any

		if model != "" {
			displayBrand, displayModel := brand, model
			ms, hasModel := stats.LookupModel(brand, model)
			if hasModel {
				if ms.Brand != "" {
					displayBrand = ms.Brand
				}
				if ms.Model != "" {
					displayModel = ms.Model
				}
			}

			subject := displayBrand + " " + displayModel
			if exactYear > 0 {
				subject += " " + strconv.Itoa(exactYear)
				yearStr := strconv.Itoa(exactYear)
				canonicalURL = buildSEOURL(base, "brands", displayBrand, "models", displayModel, "yearMin", yearStr, "yearMax", yearStr)
			} else {
				canonicalURL = buildSEOURL(base, "brands", displayBrand, "models", displayModel)
			}
			title = subject + " usados en Costa Rica: precios y ofertas | Happy Customer"
			desc = "Explora precios, kilometraje y comparación de mercado para " + subject + " usados en Costa Rica."

			if exactYear > 0 && stats != nil && stats.Groups != nil {
				if stat, exists := stats.Groups[db.MarketKey(displayBrand, displayModel, exactYear)]; exists && stat.Count > 0 && stat.Median > 0 {
					count := stat.ActiveCount
					if count == 0 {
						count = stat.Count
					}
					desc = fmt.Sprintf("%d %s en Costa Rica desde $%s hasta $%s (mediana de mercado $%s).", count, subject, formatCommaInt(stat.MinPrice), formatCommaInt(stat.MaxPrice), formatCommaInt(stat.Median))
					ld = buildProductAggregateJSONLD(subject+" usados en Costa Rica", desc, displayBrand, displayModel, exactYear, canonicalURL, stat.MinPrice, stat.MaxPrice, count, stat.ActiveCount)
				}
			}
			if ld == nil && hasModel && ms.TotalCount > 0 && ms.MedianPrice > 0 {
				yearSpan := ""
				if ms.YearMin > 0 && ms.YearMax > ms.YearMin {
					yearSpan = fmt.Sprintf(", años %d–%d", ms.YearMin, ms.YearMax)
				} else if ms.YearMin > 0 {
					yearSpan = fmt.Sprintf(", año %d", ms.YearMin)
				}
				if ms.ActiveCount > 0 {
					desc = fmt.Sprintf("%d %s %s en venta en Costa Rica desde $%s hasta $%s (mediana de mercado $%s%s).", ms.ActiveCount, ms.Brand, ms.Model, formatCommaInt(ms.MinPrice), formatCommaInt(ms.MaxPrice), formatCommaInt(ms.MedianPrice), yearSpan)
				} else {
					desc = fmt.Sprintf("Precios de %s %s usados en Costa Rica (%d comparables) desde $%s hasta $%s (mediana $%s%s).", ms.Brand, ms.Model, ms.TotalCount, formatCommaInt(ms.MinPrice), formatCommaInt(ms.MaxPrice), formatCommaInt(ms.MedianPrice), yearSpan)
				}
				offerCount := ms.ActiveCount
				if offerCount == 0 {
					offerCount = ms.TotalCount
				}
				ld = buildProductAggregateJSONLD(subject+" usados en Costa Rica", desc, ms.Brand, ms.Model, exactYear, canonicalURL, ms.MinPrice, ms.MaxPrice, offerCount, ms.ActiveCount)
			}
		} else {
			displayBrand := brand
			bs, hasBrand := stats.LookupBrand(brand)
			if hasBrand && bs.Brand != "" {
				displayBrand = bs.Brand
			}

			if exactYear > 0 {
				yearStr := strconv.Itoa(exactYear)
				canonicalURL = buildSEOURL(base, "brands", displayBrand, "yearMin", yearStr, "yearMax", yearStr)
				title = fmt.Sprintf("Autos %s %d usados en Costa Rica: precios y catálogo | Happy Customer", displayBrand, exactYear)
				desc = fmt.Sprintf("Explora precios de mercado, rebajas y comparables de autos %s %d usados en Costa Rica.", displayBrand, exactYear)
			} else {
				canonicalURL = buildSEOURL(base, "brands", displayBrand)
				title = fmt.Sprintf("Autos %s usados en Costa Rica: precios y catálogo | Happy Customer", displayBrand)
				desc = fmt.Sprintf("Explora precios de mercado, rebajas y comparables de autos %s usados en Costa Rica.", displayBrand)
			}

			if exactYear == 0 && hasBrand && bs.TotalCount > 0 && bs.MedianPrice > 0 {
				if bs.ActiveCount > 0 {
					desc = fmt.Sprintf("%d autos %s en venta en Costa Rica (%d modelos) desde $%s hasta $%s (mediana $%s).", bs.ActiveCount, bs.Brand, bs.ModelCount, formatCommaInt(bs.MinPrice), formatCommaInt(bs.MaxPrice), formatCommaInt(bs.MedianPrice))
				} else {
					desc = fmt.Sprintf("Catálogo de autos %s usados en Costa Rica (%d comparables) desde $%s hasta $%s (mediana $%s).", bs.Brand, bs.TotalCount, formatCommaInt(bs.MinPrice), formatCommaInt(bs.MaxPrice), formatCommaInt(bs.MedianPrice))
				}
				offerCount := bs.ActiveCount
				if offerCount == 0 {
					offerCount = bs.TotalCount
				}
				ld = buildProductAggregateJSONLD("Autos "+bs.Brand+" usados en Costa Rica", desc, bs.Brand, "", 0, canonicalURL, bs.MinPrice, bs.MaxPrice, offerCount, bs.ActiveCount)
			}
		}

		doc := replaceTitleTag(baseHTML, title)
		doc = replaceMetaTag(doc, "name", "description", desc)
		doc = replaceMetaTag(doc, "property", "og:title", title)
		doc = replaceMetaTag(doc, "property", "og:description", desc)
		doc = replaceMetaTag(doc, "property", "og:image", "/favicon.png")
		doc = setTwitterCard(doc, "summary")
		doc = setCanonicalLink(doc, canonicalURL)
		doc = setJSONLD(doc, ld)
		return doc
	}

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
	if base != "" {
		if encoded := q.Encode(); encoded != "" {
			doc = setCanonicalLink(doc, base+"/?"+encoded)
		}
	}
	return doc
}

func hasFilterParam(q url.Values) bool {
	for _, p := range []string{
		"brands", "brand", "models", "estilo", "provincia",
		"yearMin", "yearMax", "priceMin", "priceMax", "kmMax",
		"combustible", "transmision", "deal", "priceDrop", "motivated",
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
	if q.Get("motivated") == "true" {
		parts = append(parts, "vendedores motivados")
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
	_, _ = w.Write([]byte(s.RenderIndexHTML(r, string(data))))
}
