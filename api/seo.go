package api

import (
	"encoding/json"
	"encoding/xml"
	"html"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"

	"crautosdb/db"
)

const maxSitemapURLs = 10000

var (
	validHostRe    = regexp.MustCompile(`^[a-zA-Z0-9.-]+(:[0-9]+)?$`)
	canonicalTagRe = regexp.MustCompile(`<link\s+[^>]*\brel\s*=\s*["']canonical["'][^>]*?/?>`)
	ogURLTagRe     = regexp.MustCompile(`<meta\s+[^>]*\bproperty\s*=\s*["']og:url["'][^>]*?/?>`)
	jsonLDTagRe    = regexp.MustCompile(`(?s)<script\s+[^>]*\btype\s*=\s*["']application/ld\+json["'][^>]*>.*?</script>`)
	headCloseRe    = regexp.MustCompile(`(?i)</head>`)
)

type ldBrand struct {
	Type string `json:"@type"`
	Name string `json:"name"`
}

type ldAggregateOffer struct {
	Type          string `json:"@type"`
	PriceCurrency string `json:"priceCurrency"`
	LowPrice      int    `json:"lowPrice"`
	HighPrice     int    `json:"highPrice"`
	OfferCount    int    `json:"offerCount"`
	Availability  string `json:"availability,omitempty"`
	URL           string `json:"url,omitempty"`
}

type ldProductAggregate struct {
	Context        string            `json:"@context"`
	Type           string            `json:"@type"`
	Name           string            `json:"name"`
	Description    string            `json:"description,omitempty"`
	Brand          *ldBrand          `json:"brand,omitempty"`
	Model          string            `json:"model,omitempty"`
	ProductionDate string            `json:"productionDate,omitempty"`
	URL            string            `json:"url,omitempty"`
	Offers         *ldAggregateOffer `json:"offers,omitempty"`
}

type ldQuantitativeValue struct {
	Type     string `json:"@type"`
	Value    int    `json:"value"`
	UnitCode string `json:"unitCode"`
}

type ldOffer struct {
	Type          string `json:"@type"`
	PriceCurrency string `json:"priceCurrency"`
	Price         int    `json:"price"`
	Availability  string `json:"availability"`
	URL           string `json:"url,omitempty"`
}

type ldVehicleOffer struct {
	Context             string               `json:"@context"`
	Type                string               `json:"@type"`
	Name                string               `json:"name"`
	Description         string               `json:"description,omitempty"`
	Brand               *ldBrand             `json:"brand,omitempty"`
	Model               string               `json:"model,omitempty"`
	VehicleModelDate    string               `json:"vehicleModelDate,omitempty"`
	MileageFromOdometer *ldQuantitativeValue `json:"mileageFromOdometer,omitempty"`
	Image               string               `json:"image,omitempty"`
	URL                 string               `json:"url,omitempty"`
	Offers              *ldOffer             `json:"offers"`
}

type sitemapURL struct {
	Loc        string `xml:"loc"`
	LastMod    string `xml:"lastmod,omitempty"`
	ChangeFreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// resolveBaseURL determines the canonical origin (scheme + host) using PUBLIC_BASE_URL first,
// then sanitized X-Forwarded-Host / Host and X-Forwarded-Proto headers.
func resolveBaseURL(r *http.Request) string {
	if envBase := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")), "/"); envBase != "" {
		if strings.HasPrefix(envBase, "http://") || strings.HasPrefix(envBase, "https://") {
			if u, err := url.Parse(envBase); err == nil && u.Host != "" && validHostRe.MatchString(u.Host) {
				return u.Scheme + "://" + u.Host + strings.TrimRight(u.Path, "/")
			}
		}
	}
	if r == nil {
		return ""
	}
	rawHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if idx := strings.Index(rawHost, ","); idx >= 0 {
		rawHost = strings.TrimSpace(rawHost[:idx])
	}
	if rawHost == "" {
		rawHost = strings.TrimSpace(r.Host)
	}
	if rawHost == "" || !validHostRe.MatchString(rawHost) {
		return ""
	}

	proto := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")))
	if idx := strings.Index(proto, ","); idx >= 0 {
		proto = strings.TrimSpace(proto[:idx])
	}
	if proto != "http" && proto != "https" {
		hostOnly := rawHost
		if colon := strings.LastIndex(hostOnly, ":"); colon >= 0 {
			hostOnly = hostOnly[:colon]
		}
		if r.TLS != nil || strings.HasSuffix(strings.ToLower(hostOnly), ".run.app") {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	return proto + "://" + rawHost
}

func buildSEOURL(base string, pairs ...string) string {
	if base == "" {
		return ""
	}
	if len(pairs) == 0 {
		return base + "/"
	}
	var parts []string
	for i := 0; i+1 < len(pairs); i += 2 {
		k, v := pairs[i], pairs[i+1]
		if k == "" || v == "" {
			continue
		}
		parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
	}
	if len(parts) == 0 {
		return base + "/"
	}
	return base + "/?" + strings.Join(parts, "&")
}

func insertBeforeHeadClose(doc, snippet string) string {
	loc := headCloseRe.FindStringIndex(doc)
	if loc == nil {
		return doc
	}
	return doc[:loc[0]] + "    " + snippet + "\n  " + doc[loc[0]:]
}

// setCanonicalLink sets or inserts <link rel="canonical"> and <meta property="og:url"> in doc.
func setCanonicalLink(doc, canonicalURL string) string {
	if canonicalURL == "" {
		return doc
	}
	esc := html.EscapeString(canonicalURL)
	linkTag := `<link rel="canonical" href="` + esc + `" />`
	if canonicalTagRe.MatchString(doc) {
		doc = canonicalTagRe.ReplaceAllLiteralString(doc, linkTag)
	} else {
		doc = insertBeforeHeadClose(doc, linkTag)
	}

	ogURLTag := `<meta property="og:url" content="` + esc + `" />`
	if ogURLTagRe.MatchString(doc) {
		doc = ogURLTagRe.ReplaceAllLiteralString(doc, ogURLTag)
	} else {
		doc = insertBeforeHeadClose(doc, ogURLTag)
	}
	return doc
}

// setJSONLD encodes payload as JSON-LD (json.Marshal escapes <, >, &) and injects it before </head>.
func setJSONLD(doc string, payload any) string {
	if payload == nil {
		return doc
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return doc
	}
	tag := `<script type="application/ld+json">` + string(raw) + `</script>`
	if jsonLDTagRe.MatchString(doc) {
		return jsonLDTagRe.ReplaceAllLiteralString(doc, tag)
	}
	return insertBeforeHeadClose(doc, tag)
}

func buildProductAggregateJSONLD(name, description, brand, model string, year int, canonicalURL string, lowPrice, highPrice, offerCount, activeCount int) *ldProductAggregate {
	ld := &ldProductAggregate{
		Context:     "https://schema.org",
		Type:        "Product",
		Name:        name,
		Description: description,
		Model:       model,
		URL:         canonicalURL,
	}
	if brand != "" {
		ld.Brand = &ldBrand{Type: "Brand", Name: brand}
	}
	if year >= 1980 && year <= 2030 {
		ld.ProductionDate = strconv.Itoa(year)
	}
	if offerCount > 0 && lowPrice > 0 && highPrice >= lowPrice {
		avail := ""
		if activeCount > 0 {
			avail = "https://schema.org/InStock"
		}
		ld.Offers = &ldAggregateOffer{
			Type:          "AggregateOffer",
			PriceCurrency: "USD",
			LowPrice:      lowPrice,
			HighPrice:     highPrice,
			OfferCount:    offerCount,
			Availability:  avail,
			URL:           canonicalURL,
		}
	}
	return ld
}

// HandleRobotsTxt serves /robots.txt allowing crawlers on the SPA and its /api/* XHR endpoints.
func (s *Server) HandleRobotsTxt(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}

	var b strings.Builder
	b.WriteString("User-agent: *\nAllow: /\n")
	if base := resolveBaseURL(r); base != "" {
		b.WriteString("\nSitemap: ")
		b.WriteString(base)
		b.WriteString("/sitemap.xml\n")
	}
	_, _ = w.Write([]byte(b.String()))
}

// HandleSitemap serves a dynamic XML sitemap for core views, brands, models, and valuation pages.
func (s *Server) HandleSitemap(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}

	base := resolveBaseURL(r)
	urlSet := sitemapURLSet{
		Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
	}

	if base != "" {
		urlSet.URLs = append(urlSet.URLs,
			sitemapURL{Loc: base + "/", ChangeFreq: "daily", Priority: "1.0"},
			sitemapURL{Loc: buildSEOURL(base, "tab", "bargains"), ChangeFreq: "daily", Priority: "0.9"},
			sitemapURL{Loc: buildSEOURL(base, "tab", "valuate"), ChangeFreq: "weekly", Priority: "0.9"},
			sitemapURL{Loc: buildSEOURL(base, "tab", "stats"), ChangeFreq: "daily", Priority: "0.7"},
		)

		var stats *db.MarketIndex
		if s != nil && s.DB != nil {
			stats = s.getMarketStats()
		}
		if stats != nil {
			for _, b := range stats.SortedBrands() {
				if len(urlSet.URLs) >= maxSitemapURLs {
					break
				}
				if b.ActiveCount < 1 && b.TotalCount < 2 {
					continue
				}
				entry := sitemapURL{
					Loc:        buildSEOURL(base, "brands", b.Brand),
					ChangeFreq: "daily",
					Priority:   "0.8",
				}
				if !b.LastUpdated.IsZero() {
					entry.LastMod = b.LastUpdated.UTC().Format("2006-01-02")
				}
				urlSet.URLs = append(urlSet.URLs, entry)
			}

			for _, m := range stats.SortedModels() {
				if len(urlSet.URLs) >= maxSitemapURLs {
					break
				}
				lastMod := ""
				if !m.LastUpdated.IsZero() {
					lastMod = m.LastUpdated.UTC().Format("2006-01-02")
				}
				if m.ActiveCount >= 1 && len(urlSet.URLs) < maxSitemapURLs {
					urlSet.URLs = append(urlSet.URLs, sitemapURL{
						Loc:        buildSEOURL(base, "brands", m.Brand, "models", m.Model),
						LastMod:    lastMod,
						ChangeFreq: "daily",
						Priority:   "0.8",
					})
				}
				if m.TotalCount >= 3 && len(urlSet.URLs) < maxSitemapURLs {
					urlSet.URLs = append(urlSet.URLs, sitemapURL{
						Loc:        buildSEOURL(base, "tab", "valuate", "brand", m.Brand, "model", m.Model),
						LastMod:    lastMod,
						ChangeFreq: "weekly",
						Priority:   "0.7",
					})
				}
			}
		}
	}

	out, err := xml.MarshalIndent(urlSet, "", "  ")
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to generate sitemap")
		return
	}
	_, _ = w.Write([]byte(xml.Header))
	_, _ = w.Write(out)
}
