package api

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"crautosdb/db"
)

var marchamoRe = regexp.MustCompile(`Marchamo estimado: \$([0-9,]+)`)

func spanishDate(t time.Time) string {
	months := []string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
		"agosto", "septiembre", "octubre", "noviembre", "diciembre"}
	return fmt.Sprintf("%d de %s del %d", t.Day(), months[int(t.Month())-1], t.Year())
}

func negotiationFixture(electric bool) map[string]interface{} {
	combustible := "Gasolina"
	if electric {
		combustible = "Eléctrico"
	}
	return map[string]interface{}{
		"URL":              "https://www.crautos.com/usados/-/987654",
		"Title":            "Toyota RAV4 2019",
		"Brand":            "Toyota",
		"Model":            "RAV4",
		"Year":             float64(2019),
		"Price":            float64(19500),
		"Kilometraje":      float64(62000),
		"PrecioNegociable": true,
		"SeRecibe":         "No",
		"PagoImpuestos":    "No",
		"Combustible":      combustible,
		"SellerName":       "Autos del Valle",
	}
}

func negotiationFixtureStats() *db.MarketIndex {
	return &db.MarketIndex{
		Groups: map[string]db.MarketStat{
			db.MarketKey("Toyota", "RAV4", 2019): {
				Median: 18000, P25: 16800, P75: 19200, Count: 8, MedianKm: 60000, KmCount: 6,
			},
		},
		TextFlags: map[string]string{},
		PriceChanges: map[string]db.PriceChange{
			"https://www.crautos.com/usados/-/987654": {
				CurrentPrice:  19500,
				PreviousPrice: 20500,
				InitialPrice:  22000,
				Drops:         2,
				ChangedAt:     time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
			},
		},
		SellerCounts: map[string]int{
			"https://www.crautos.com/usados/-/987654": 12,
		},
	}
}

func marchamoFromBrief(t *testing.T, brief string) int {
	t.Helper()
	m := marchamoRe.FindStringSubmatch(brief)
	if m == nil {
		t.Fatalf("marchamo line not found in brief:\n%s", brief)
	}
	n, err := strconv.Atoi(strings.ReplaceAll(m[1], ",", ""))
	if err != nil {
		t.Fatalf("bad marchamo value %q: %v", m[1], err)
	}
	return n
}

func TestBuildNegotiationBriefOverpricedStale(t *testing.T) {
	now := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	car := negotiationFixture(true)
	car["FechaIngreso"] = spanishDate(now.AddDate(0, 0, -65))

	brief := buildNegotiationBrief(negotiationFixtureStats(), car, "Carro 1", now)

	wants := []string{
		"NEGOTIATION & CR MARKET SIGNALS for Carro 1",
		"$16,800", // P25
		"$18,000", // median / expected
		"$19,200", // P75
		"days listed: 65",
		"2 drops",
		"Agencia / autolote (12 activos)",
		"$870",    // transfer = round(19500*0.04+90)
		"$20,370", // turnkey = 19500 + 870
		"Impuestos pendientes",
		"Oferta de contado",
		"$16,296", // opening = P25 * 0.97
	}
	for _, w := range wants {
		if !strings.Contains(brief, w) {
			t.Errorf("brief missing %q:\n%s", w, brief)
		}
	}
	if strings.Contains(brief, "Bandera de precio") {
		t.Errorf("unexpected price flag for a +8%% car:\n%s", brief)
	}
	if !strings.Contains(brief, "+8.3% sobre") {
		t.Errorf("brief missing deviation vs market:\n%s", brief)
	}
}

func TestBuildNegotiationBriefElectricMarchamoCheaper(t *testing.T) {
	now := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	stats := negotiationFixtureStats()

	electricCar := negotiationFixture(true)
	electricCar["FechaIngreso"] = spanishDate(now.AddDate(0, 0, -65))
	gasCar := negotiationFixture(false)
	gasCar["FechaIngreso"] = spanishDate(now.AddDate(0, 0, -65))

	electric := marchamoFromBrief(t, buildNegotiationBrief(stats, electricCar, "Carro E", now))
	gas := marchamoFromBrief(t, buildNegotiationBrief(stats, gasCar, "Carro G", now))

	if electric <= 0 || gas <= 0 {
		t.Fatalf("marchamo estimates must be positive: electric=%d gas=%d", electric, gas)
	}
	if electric >= gas {
		t.Errorf("electric marchamo (%d) must be lower than gasoline (%d)", electric, gas)
	}
	if got := negMarchamoUSD(19500, "Gasolina", negDefaultFxRate); got != gas {
		t.Errorf("gas marchamo mismatch: got %d want %d", got, gas)
	}
	if got := negMarchamoUSD(19500, "Eléctrico", negDefaultFxRate); got != electric {
		t.Errorf("electric marchamo mismatch: got %d want %d", got, electric)
	}
}

func TestBuildNegotiationBriefWithoutStats(t *testing.T) {
	now := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	car := negotiationFixture(false)
	car["daysListed"] = float64(50)
	car["PagoImpuestos"] = ""
	car["crCosts"] = map[string]interface{}{
		"fxRate":      float64(520),
		"unpaidTaxes": true,
		"transferUSD": float64(1),
		"turnkeyUSD":  float64(1),
		"marchamoUSD": float64(1),
	}

	brief := buildNegotiationBrief(nil, car, "Carro 2", now)

	for _, w := range []string{"days listed: 50", "Sin datos de mercado suficientes", "Impuestos pendientes", "$870"} {
		if !strings.Contains(brief, w) {
			t.Errorf("brief missing %q:\n%s", w, brief)
		}
	}
}

func TestNegotiationSystemGuidelinesWhatsAppFence(t *testing.T) {
	for _, lang := range []string{"es", "en"} {
		got := negotiationSystemGuidelines(lang)
		if !strings.Contains(got, "```whatsapp") {
			t.Errorf("guidelines for %q must require a ```whatsapp fence:\n%s", lang, got)
		}
		if !strings.Contains(got, "oferta de contado") && lang == "es" {
			t.Errorf("spanish guidelines must cover the cash offer strategy:\n%s", got)
		}
		if !strings.Contains(got, "Cash offer strategy") && lang == "en" {
			t.Errorf("english guidelines must cover the cash offer strategy:\n%s", got)
		}
		if !strings.Contains(got, "DEKRA") {
			t.Errorf("guidelines for %q must mention the DEKRA inspection", lang)
		}
	}
}
