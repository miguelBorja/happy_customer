package db

import (
	"strings"
	"unicode"
)

// Listing text flags: the seller's comment explains a low price that is not a real deal.
const (
	TextFlagCondition = "condition" // damaged, needs repair, for parts
	TextFlagDebt      = "debt"      // the price is only the equity: assume a loan, lien
)

// Price-quality thresholds, shared by the market index (db/market.go) and the deal flags
// (api/deals.go) so both use a single source of truth.
const (
	SuspiciousLowPct     = -50.0 // below this the price is more likely an error than a deal
	TypoHighPct          = 400.0 // 5x the reference: only flagged when it looks like an extra zero
	TypoRatioMin         = 0.6   // price*10 (or /10) within [0.6, 1.6]* the reference -> typo
	TypoRatioMax         = 1.6
	FlaggedExcludeMaxPct = -5.0 // text-flagged cars at <= -5% vs reference are not comparable
)

// IsTypoPrice reports whether price looks off by a factor of 10 (missing or extra zero)
// compared to expected.
func IsTypoPrice(price, expected int) bool {
	if price <= 0 || expected <= 0 {
		return false
	}
	pct := float64(price-expected) / float64(expected) * 100
	if pct > SuspiciousLowPct && pct < TypoHighPct {
		return false
	}
	r := float64(price) / float64(expected)
	return (r*10 >= TypoRatioMin && r*10 <= TypoRatioMax) || (r/10 >= TypoRatioMin && r/10 <= TypoRatioMax)
}

// Phrases are matched on the normalized comment (lowercase, no accents, single spaces).
// Keep them specific: "repuesto" alone would match "llanta de repuesto" (spare tire).
var conditionPhrases = []string{
	// For parts / spare parts.
	"para repuesto", "como repuesto", "por repuesto", "en repuesto",
	"para partes", "por partes", "en partes", "para piezas",
	// Crash / flood / total loss.
	"chocado", "chocada", "colisionado", "colisionada", "perdida total", "salvage",
	"inundado", "inundada",
	// Won't start.
	"no enciende", "no arranca", "no prende",
	// Repair / engine / gearbox basics.
	"reparar motor", "reparar el motor", "necesita reparar", "necesita reparacion", "para reparar",
	"motor malo", "motor fundido", "motor danado", "motor pegado", "caja mala", "caja danada",
	"por eso el precio", "por eso el bajo precio", "de ahi el precio",
	// Paint / cosmetic / body issues.
	"detalle de pintura", "detalles de pintura", "detalle en pintura", "detalles en pintura",
	"detalle estetico", "detalles esteticos",
	"detalle en carroceria", "detalles en carroceria", "detalles menores en carroceria", "detalle de carroceria", "detalles de carroceria",
	"arreglo en carroceria", "arreglos en carroceria", "arreglos de carroceria",
	"golpe en la carroceria", "golpes en la carroceria", "golpe en carroceria", "golpes en carroceria",
	"golpe leve", "choque leve", "reparar golpe", "reparar un golpe",
	// Gearbox / transmission / turbine issues.
	"caja patina", "patina la caja", "problema de caja", "problemas de caja", "falla en la caja", "fallo en la caja",
	"problema de transmision", "problemas de transmision", "problema en la transmision", "problemas en la transmision",
	"problemas con la turbina", "problema con la turbina", "turbina mala", "turbina danada",
	// Engine / mechanical / electrical / inspection issues.
	"block del motor danado", "block danado", "cabezote malo", "cabezote danado", "empaque de cabezote",
	"se calienta", "recalienta", "consume aceite", "consume mucho aceite", "quema aceite", "bota humo",
	"problema mecanico", "problemas mecanicos", "detalle mecanico", "detalles mecanicos", "falla mecanica", "fallo mecanico", "averia mecanica",
	"problema electrico", "problemas electricos", "falla electrica", "fallo electrico",
	"no camina", "para proyecto", "a revisar", "debe revisarse",
	"necesita arreglo", "necesita arreglos", "ocupa reparacion", "ocupa arreglo", "ocupa arreglos", "requiere reparacion",
	"por eso el valor",
}

var debtPhrases = []string{
	"cedo deuda", "cedo la deuda", "ceder deuda", "cesion de deuda", "traspaso de deuda",
	"asumir deuda", "asumir la deuda", "asuma deuda", "asuma la deuda", "asumir credito",
	"asumir el credito", "cedo credito", "cedo el credito", "cedo financiamiento",
	"gravamen", "con deuda",
	// Prenda / embargo (lien).
	"tiene prenda", "con prenda", "prenda vigente",
	"embargo", "con embargo", "tiene embargo",
	// Pending marchamo (road tax).
	"debe marchamo", "debe marchamos", "marchamos pendientes", "marchamo atrasado", "marchamos atrasados",
	// Continue paying the existing loan.
	"seguir pagando", "siga pagando", "continuar pagando",
}

// Single words that, right before a phrase, negate it ("nunca chocado", "cero golpes").
var negations = []string{"no", "nunca", "sin", "jamas", "ni", "cero", "ningun", "ninguna"}

// Two-word sequences that negate a following phrase ("libre de prenda", "no tiene problemas").
var negations2 = []string{"libre de", "exento de", "no tiene", "no posee", "no presenta", "sin ningun", "sin ninguna", "cero ningun"}

var accentReplacer = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")

func normalizeComment(s string) string {
	if s == "" {
		return ""
	}
	out := accentReplacer.Replace(strings.ToLower(s))
	// Collapse punctuation and whitespace so phrases match across "chocado," or "no  enciende".
	var b strings.Builder
	space := true
	for _, r := range out {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			space = false
		} else if !space {
			b.WriteByte(' ')
			space = true
		}
	}
	return " " + strings.TrimSpace(b.String()) + " "
}

// containsPhrase reports whether text (normalized) contains phrase as whole words and not
// right after a negation word.
func containsPhrase(text, phrase string) bool {
	needle := " " + phrase + " "
	from := 0
	for {
		i := strings.Index(text[from:], needle)
		if i < 0 {
			return false
		}
		pos := from + i
		before := strings.Fields(text[:pos])
		negated := false
		if len(before) > 0 {
			prev := before[len(before)-1]
			for _, n := range negations {
				if prev == n {
					negated = true
					break
				}
			}
			if !negated && len(before) >= 2 {
				prev2 := before[len(before)-2] + " " + prev
				for _, n := range negations2 {
					if prev2 == n {
						negated = true
						break
					}
				}
			}
		}
		if !negated {
			return true
		}
		from = pos + 1
	}
}

// DetectTextFlag returns TextFlagCondition, TextFlagDebt or "" for a listing comment.
func DetectTextFlag(comment string) string {
	text := normalizeComment(comment)
	if text == "" {
		return ""
	}
	for _, p := range conditionPhrases {
		if containsPhrase(text, p) {
			return TextFlagCondition
		}
	}
	for _, p := range debtPhrases {
		if containsPhrase(text, p) {
			return TextFlagDebt
		}
	}
	return ""
}
