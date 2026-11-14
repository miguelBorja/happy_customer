package api

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"crautosdb/db"
)

// Costa Rica closing/ownership estimation constants.
// Must match web/src/utils/crCostEstimator.js (transfer, turnkey, marchamo Ley 10390).
const (
	negDefaultFxRate   = 510.0 // CRC per USD
	negTransferPct     = 0.04  // 4% of price
	negTransferBaseUSD = 90.0  // fixed paperwork/handling
	negMinTransferUSD  = 250   // floor
	negFiscalFactor    = 0.85  // fiscal value ≈ 85% of purchase price
	negMarchamoBaseCRC = 30_000.0
	negMarchamoSOACRC  = 36_000.0
	negElectricTaxRate = 0.6 // PE/hybrid-electric reduction on the circulation tax

	negStaleDays     = minMotivatedDays  // days listed that turn the seller into a motivated seller
	negMinPriceDrops = minMotivatedDrops // clean price drops that do the same
)

// --- safe field readers (JSON numbers arrive as float64, ints may be int) ---

func negField(car map[string]interface{}, key string) interface{} {
	if car == nil {
		return nil
	}
	if v, ok := car[key]; ok && v != nil {
		return v
	}
	for k, v := range car {
		if v != nil && strings.EqualFold(k, key) {
			return v
		}
	}
	return nil
}

func negString(car map[string]interface{}, key string) string {
	switch t := negField(car, key).(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	case json.Number:
		return t.String()
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", t))
	}
}

func negFloat(car map[string]interface{}, key string) (float64, bool) {
	switch t := negField(car, key).(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case int32:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	case string:
		s := strings.TrimSpace(t)
		s = strings.ReplaceAll(s, "$", "")
		s = strings.ReplaceAll(s, ",", "")
		s = strings.TrimSpace(s)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	}
	return 0, false
}

func negInt(car map[string]interface{}, key string) int {
	f, ok := negFloat(car, key)
	if !ok {
		return 0
	}
	return int(math.Round(f))
}

func negBool(car map[string]interface{}, key string) bool {
	switch t := negField(car, key).(type) {
	case bool:
		return t
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "true", "si", "sí", "yes", "1":
			return true
		}
		return false
	case float64:
		return t != 0
	case int:
		return t != 0
	}
	return false
}

func negMap(car map[string]interface{}, key string) map[string]interface{} {
	if m, ok := negField(car, key).(map[string]interface{}); ok {
		return m
	}
	return nil
}

func negComma(n int) string {
	s := strconv.Itoa(n)
	sign := ""
	if strings.HasPrefix(s, "-") {
		sign = "-"
		s = s[1:]
	}
	var out []byte
	for i := 0; i < len(s); i++ {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, s[i])
	}
	return sign + string(out)
}

func negUSD(n int) string { return "$" + negComma(n) }

// --- Costa Rica cost estimator ---

// negTransferUSD estimates the Registro Nacional transfer/traspaso cost in USD
// (matches web/src/utils/crCostEstimator.js): max(250, round(price*4% + 90)).
func negTransferUSD(price int) int {
	if price <= 0 {
		return 0
	}
	est := math.Round(float64(price)*negTransferPct + negTransferBaseUSD)
	if est < negMinTransferUSD {
		est = negMinTransferUSD
	}
	return int(est)
}

// negMarchamoCRC estimates the yearly marchamo (Ley 10390 progressive brackets) in colones,
// applying the electric reduction to the tax and then the fixed SOA/stamp floor.
func negMarchamoCRC(price int, combustible string, fxRate float64) float64 {
	if price <= 0 || fxRate <= 0 {
		return 0
	}
	fiscal := float64(price) * fxRate * negFiscalFactor
	brackets := []struct{ limit, rate float64 }{
		{7_000_000, 0.015},
		{15_000_000, 0.021},
		{30_000_000, 0.028},
		{math.Inf(1), 0.032},
	}
	tax := 0.0
	lower := 0.0
	for _, b := range brackets {
		if fiscal <= lower {
			break
		}
		tax += (math.Min(fiscal, b.limit) - lower) * b.rate
		lower = b.limit
	}
	fuel := strings.ToLower(combustible)
	if strings.Contains(fuel, "eléctric") || strings.Contains(fuel, "electric") {
		tax *= negElectricTaxRate
	}
	return math.Max(negMarchamoBaseCRC, tax) + negMarchamoSOACRC
}

func negMarchamoUSD(price int, combustible string, fxRate float64) int {
	return int(math.Round(negMarchamoCRC(price, combustible, fxRate) / fxRate))
}

// negMentionsUnpaidTaxes reports whether the listing comment states pending taxes/plates.
func negMentionsUnpaidTaxes(pagoImpuestos string) bool {
	lower := strings.ToLower(strings.TrimSpace(pagoImpuestos))
	if lower == "" {
		return false
	}
	for _, needle := range []string{"no", "debe", "pendiente", "sin pagar"} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

// negSellerProfile derives the seller type from the number of active listings of the seller.
func negSellerProfile(count int) string {
	switch {
	case count <= 0:
		return "desconocido (sin historial de anuncios en CrautosDB)"
	case count == 1:
		return "Particular (1 anuncio activo)"
	case count <= 4:
		return fmt.Sprintf("Vendedor con varios autos (%d activos)", count)
	default:
		return fmt.Sprintf("Agencia / autolote (%d activos)", count)
	}
}

// buildNegotiationBrief renders a compact markdown block with the negotiation signals
// (price history, days listed, seller profile, market reference) and the Costa Rican
// closing/ownership cost estimates used by HandleAICompare.
func buildNegotiationBrief(stats *db.MarketIndex, car map[string]interface{}, label string, now time.Time) string {
	label = strings.TrimSpace(label)
	if label == "" {
		label = "Vehículo"
	}

	url := negString(car, "URL")
	title := negString(car, "Title")
	brand := negString(car, "Brand")
	model := negString(car, "Model")
	year := negInt(car, "Year")
	price := negInt(car, "Price")
	km := negInt(car, "Kilometraje")
	fechaIngreso := negString(car, "FechaIngreso")
	scrapedAt, _ := time.Parse(time.RFC3339, negString(car, "ScrapedAt"))
	negotiable := negBool(car, "PrecioNegociable")
	recibe := negString(car, "SeRecibe")
	pagoImpuestos := negString(car, "PagoImpuestos")
	combustible := negString(car, "Combustible")
	sellerName := negString(car, "SellerName")
	sellerPhone := negString(car, "SellerPhone")

	expected := negInt(car, "MarketExpected")
	p25 := negInt(car, "MarketP25")
	p75 := negInt(car, "MarketP75")
	median := negInt(car, "MarketMedian")
	count := negInt(car, "MarketCount")
	flag := negString(car, "MarketFlag")
	priceInitial := negInt(car, "PriceInitial")
	pricePrevious := negInt(car, "PricePrevious")
	priceDrops := negInt(car, "PriceDrops")
	sellerCount := negInt(car, "SellerActiveCount")

	daysListedClient := negInt(car, "daysListed")
	if daysListedClient == 0 {
		daysListedClient = negInt(car, "DaysListed")
	}

	crCosts := negMap(car, "crCosts")
	fxRate := negDefaultFxRate
	if v, ok := negFloat(crCosts, "fxRate"); ok && v > 0 {
		fxRate = v
	}
	unpaidTaxes := negMentionsUnpaidTaxes(pagoImpuestos) || negBool(crCosts, "unpaidTaxes")

	// --- server-side enrichment ---
	if stats != nil {
		hasGroup := brand != "" && model != "" && year > 0
		if hasGroup && price > 0 {
			if ref, ok := stats.Lookup(brand, model, year, km); ok {
				if expected == 0 {
					expected = ref.Expected
				}
				if p25 == 0 {
					p25 = ref.ExpectedP25
				}
				if p75 == 0 {
					p75 = ref.ExpectedP75
				}
				if median == 0 {
					median = ref.Median
				}
				if count == 0 {
					count = ref.Count
				}
			}
			if _, f, ok := marketDealPct(stats, db.CarPriceKey{
				URL: url, Brand: brand, Model: model, Year: year, Price: price, Km: km,
			}); ok && flag == "" {
				flag = f
			}
		}
		if url != "" {
			if pc, ok := stats.PriceChangeOf(url); ok &&
				pc.CurrentPrice == price && price > 0 &&
				!db.IsTypoPrice(price, pc.InitialPrice) && flag != flagTypo {
				priceInitial = pc.InitialPrice
				pricePrevious = pc.PreviousPrice
				priceDrops = pc.Drops
			}
			if sellerCount == 0 {
				sellerCount = stats.SellerActiveCount(url)
			}
		}
	}

	daysListed := 0
	hasAge := false
	if ageDays, ok := db.ListingAgeDays(fechaIngreso, scrapedAt, now); ok {
		daysListed, hasAge = ageDays, true
	} else if daysListedClient > 0 {
		daysListed, hasAge = daysListedClient, true
	}

	// --- CR closing & ownership estimates ---
	transferUSD := negTransferUSD(price)
	turnkeyUSD := 0
	if price > 0 {
		turnkeyUSD = price + transferUSD
	}
	marchamoUSD := negMarchamoUSD(price, combustible, fxRate)
	fiscalCRC := float64(price) * fxRate * negFiscalFactor

	// --- market position ---
	ref := expected
	if ref == 0 {
		ref = median
	}
	pctVsMarket := 0.0
	hasMarket := ref > 0 && price > 0
	if hasMarket {
		pctVsMarket = float64(price-ref) / float64(ref) * 100
	}

	// --- seller profile & leverage ---
	profile := negSellerProfile(sellerCount)

	var points []string
	if hasAge && daysListed >= negStaleDays {
		points = append(points, fmt.Sprintf("%d días publicado", daysListed))
	}
	if priceDrops >= negMinPriceDrops {
		points = append(points, fmt.Sprintf("%d recortes de precio", priceDrops))
	}
	if negotiable {
		points = append(points, "anunciado como negociable")
	}
	if hasMarket && pctVsMarket > 0 {
		points = append(points, fmt.Sprintf("precio %+.1f%% sobre el mercado", pctVsMarket))
	}
	if sellerCount >= 5 {
		points = append(points, fmt.Sprintf("vendedor con %d anuncios activos", sellerCount))
	}
	leverage := "BAJA"
	switch {
	case len(points) >= 2:
		leverage = "ALTA"
	case len(points) == 1:
		leverage = "MEDIA"
	}

	// --- cash offer band ---
	opening, target, ceiling := 0, 0, 0
	if price > 0 {
		if hasMarket && price > ref {
			// At/above market: anchor between P25 and the mileage-adjusted expected value.
			opening = p25
			if opening <= 0 || opening >= ref {
				opening = int(math.Round(float64(ref) * 0.93))
			}
			ceiling = ref
		} else {
			// Already below market: ask for 3%..7% off the asking price.
			opening = int(math.Round(float64(price) * 0.93))
			ceiling = int(math.Round(float64(price) * 0.97))
		}
		if len(points) >= 1 {
			opening = int(math.Round(float64(opening) * 0.97))
		}
		if opening > ceiling {
			opening = ceiling
		}
		target = int(math.Round(float64(opening+ceiling) / 2))
	}

	// --- render ---
	var b strings.Builder
	fmt.Fprintf(&b, "NEGOTIATION & CR MARKET SIGNALS for %s", label)
	var modelLine strings.Builder
	if brand != "" {
		modelLine.WriteString(brand)
	}
	if model != "" {
		if modelLine.Len() > 0 {
			modelLine.WriteString(" ")
		}
		modelLine.WriteString(model)
	}
	if year > 0 {
		if modelLine.Len() > 0 {
			modelLine.WriteString(" ")
		}
		modelLine.WriteString(strconv.Itoa(year))
	}
	if modelLine.Len() > 0 {
		fmt.Fprintf(&b, " — %s", modelLine.String())
	}
	b.WriteString(":\n")

	if title != "" && !strings.EqualFold(title, modelLine.String()) {
		fmt.Fprintf(&b, "- Título del anuncio: %s\n", title)
	}
	if url != "" {
		fmt.Fprintf(&b, "- URL: %s\n", url)
	}

	switch {
	case price <= 0:
		b.WriteString("- Precio: no informado\n")
	case priceInitial > price && pricePrevious > 0 && pricePrevious != price && priceInitial != price:
		fmt.Fprintf(&b, "- Precio: %s (inicial %s → previo %s → actual %s, %d drops)\n",
			negUSD(price), negUSD(priceInitial), negUSD(pricePrevious), negUSD(price), priceDrops)
	default:
		fmt.Fprintf(&b, "- Precio: %s\n", negUSD(price))
	}
	if km > 0 {
		fmt.Fprintf(&b, "- Kilometraje: %s km\n", negComma(km))
	}
	if hasAge {
		fmt.Fprintf(&b, "- Días publicado / days listed: %d\n", daysListed)
	}
	fmt.Fprintf(&b, "- Perfil del vendedor: %s\n", profile)
	if sellerName != "" || sellerPhone != "" {
		fmt.Fprintf(&b, "- Contacto: %s %s\n", sellerName, sellerPhone)
	}

	extras := make([]string, 0, 4)
	if negotiable {
		extras = append(extras, "¿Negociable?: Sí")
	}
	if recibe != "" {
		extras = append(extras, "¿Recibe?: "+recibe)
	}
	if pagoImpuestos != "" {
		extras = append(extras, "Pago de impuestos: "+pagoImpuestos)
	}
	if combustible != "" {
		extras = append(extras, "Combustible: "+combustible)
	}
	if len(extras) > 0 {
		fmt.Fprintf(&b, "- %s\n", strings.Join(extras, " | "))
	}

	if count > 0 && (median > 0 || expected > 0) {
		fmt.Fprintf(&b, "- Referencia CrautosDB (%d comparables): P25 %s | Mediana %s | Expected ajustado a km %s | P75 %s\n",
			count, negUSD(p25), negUSD(median), negUSD(expected), negUSD(p75))
		if hasMarket {
			pos := "sobre"
			if pctVsMarket < 0 {
				pos = "bajo"
			}
			fmt.Fprintf(&b, "  → El precio está %+.1f%% %s el valor esperado de mercado.\n", pctVsMarket, pos)
		}
	} else {
		b.WriteString("- Sin datos de mercado suficientes en CrautosDB para este modelo/año (no ancles con cifras inventadas).\n")
	}
	if flag != "" {
		fmt.Fprintf(&b, "- ⚠️ Bandera de precio: %s (verifica el precio/anuncio antes de ofertar).\n", flag)
	}

	if price > 0 {
		fmt.Fprintf(&b, "- Costos de cierre CR (TC ₡%s por USD): traspaso %s · llave en mano (turnkey) %s\n",
			negComma(int(fxRate)), negUSD(transferUSD), negUSD(turnkeyUSD))
		fmt.Fprintf(&b, "- Marchamo estimado: %s/año (Ley 10390, valor fiscal ₡%s)\n",
			negUSD(marchamoUSD), negComma(int(math.Round(fiscalCRC))))
	} else {
		b.WriteString("- Costos de cierre CR: no estimables sin precio.\n")
	}
	if unpaidTaxes {
		fmt.Fprintf(&b, "- ⚠️ Impuestos pendientes: el anuncio sugiere impuestos/marchamo sin pagar (%s). Descuenta esa deuda del precio y exige el recibo al día.\n",
			strings.TrimSpace("Pago de impuestos: "+pagoImpuestos))
	} else {
		b.WriteString("- Impuestos: sin señales de deuda en el anuncio (confirma marchamo al día igualmente).\n")
	}

	fmt.Fprintf(&b, "- Palanca de negociación: %s", leverage)
	if len(points) > 0 {
		fmt.Fprintf(&b, " (%s)", strings.Join(points, " · "))
	}
	b.WriteString("\n")
	if price > 0 {
		fmt.Fprintf(&b, "- Oferta de contado / cash offer: apertura %s · objetivo %s · techo (no pagar más de) %s\n",
			negUSD(opening), negUSD(target), negUSD(ceiling))
	}

	return b.String()
}

// negotiationSystemGuidelines returns the language-specific instructions that teach the LLM
// how to use the negotiation brief (cash offers, mechanical/legal checklist, WhatsApp drafts).
func negotiationSystemGuidelines(langCode string) string {
	english := strings.HasPrefix(strings.ToLower(strings.TrimSpace(langCode)), "en")

	const fence = "```whatsapp\n"
	var b strings.Builder
	if english {
		b.WriteString("\nNEGOTIATION, MECHANICAL & COSTA RICAN LEGAL GUIDELINES:\n")
		b.WriteString("1. Cash offer strategy (\"How much should I offer in cash?\"): always ground the answer in the CrautosDB signals above — cite the exact Expected value and the P25/P75 band, the days listed, the price drops, the seller profile (private owner vs. agency/lot) and the turnkey cost (asking price + Registro Nacional transfer + marchamo + any unpaid taxes mentioned in the listing). Give a concrete opening offer and a maximum ceiling in USD, and explain which arguments to use (stale listing, repeated price cuts, comparable inventory, paying the transfer in cash immediately).\n")
		b.WriteString("2. Model checklist: for the specific model/year, list the known mechanical weak points (engine, transmission, common CR-environment issues), the DEKRA inspection points to insist on, and the Costa Rican legal checks: Registro Nacional liens/gravámenes (\"cédula, hoja de delincuencia\" is not needed; check the vehicle's gravámenes and prendas), marchamo paid, RITEVE current, and unpaid taxes/plates. Never promise you verified them: tell the user exactly what to request from the seller.\n")
		b.WriteString("3. WhatsApp offer drafting: ")
	} else {
		b.WriteString("\nPAUTAS DE NEGOCIACIÓN, REVISIÓN MECÁNICA Y LEGAL EN COSTA RICA:\n")
		b.WriteString("1. Estrategia de oferta de contado (\"¿Cuánto ofertar de contado?\"): basa siempre la respuesta en las señales CrautosDB de arriba — cita el valor Expected y la banda P25/P75 exactos, los días publicado, los recortes de precio, el perfil del vendedor (particular vs. agencia/autolote) y el costo llave en mano (precio + traspaso del Registro Nacional + marchamo + impuestos pendientes si el anuncio los menciona). Da una oferta de apertura y un techo máximo concretos en dólares y explica qué argumentos usar (anuncio viejo, recortes repetidos, inventario comparable, pagar el traspaso de inmediato).\n")
		b.WriteString("2. Revisión del modelo: para ese modelo/año indica las fallas mecánicas conocidas (motor, caja, problemas típicos en el clima/tránsito de Costa Rica), los puntos a exigir en la revisión DEKRA y las verificaciones legales ticas: gravámenes/prendas en el Registro Nacional, marchamo al día, RITEVE vigente e impuestos/placas pendientes. Nunca afirmes que tú los verificaste: dile al usuario exactamente qué pedirle al vendedor.\n")
		b.WriteString("3. Redacción de la oferta por WhatsApp: ")
	}
	b.WriteString("CRITICAL FORMATTING RULE — whenever the user asks you to draft/write a WhatsApp offer or a message to the seller, wrap ONLY the ready-to-send message body inside a fenced code block tagged whatsapp, exactly like this:\n")
	b.WriteString(fence)
	if english {
		b.WriteString("Buenas, pura vida. I saw your [car] on CrautosDB. I'm ready to close this week with cash: could we do $X? I cover the transfer at the Registro Nacional right away. Thanks!\n")
	} else {
		b.WriteString("Buenas, pura vida. Vi su [carro] en CrautosDB y estoy listo para cerrar esta semana de contado: ¿lo podríamos dejar en $X? Yo me encargo del traspaso en el Registro Nacional de una vez. ¡Gracias!\n")
	}
	b.WriteString("```\n")
	b.WriteString("Use polite, natural Costa Rican Spanish (\"Buenas, pura vida...\") when the answer language is Spanish, keep the message short (2-4 sentences), mention readiness for a quick cash closing and immediate transfer, and put NO commentary, notes, placeholders explanations or extra text inside the code fence. Everything outside the fence is normal markdown. This is mandatory because the frontend renders any ```whatsapp block as a 1-click \"Send via WhatsApp\" button.\n")

	return b.String()
}
