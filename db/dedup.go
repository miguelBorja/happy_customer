package db

import (
	"strings"
	"unicode"
)

// dedupCandidate holds the fields needed to decide whether two listings describe the
// same physical car.
type dedupCandidate struct {
	url      string
	subModel string // disambiguates multi-word brand/prefix models like "Donfeng (ZNA) GLORY" vs "KARRY"
	price    int
	km       int
	plate    byte     // trailing digit '0'..'9', or 0 when unknown ("ND", "Termina en D", etc.)
	color    string   // normalized primary exterior color word ("" when unknown)
	phones   []string // normalized 8-digit phone numbers
}

// newDedupCandidate builds a candidate from a listing's raw fields.
func newDedupCandidate(url, title, brand, model string, price, km int, placa, color, sellerPhone string) dedupCandidate {
	return dedupCandidate{
		url:      url,
		subModel: dedupSubModel(brand, model, title),
		price:    price,
		km:       km,
		plate:    plateDigit(placa),
		color:    primaryColor(color),
		phones:   extractPhones(sellerPhone),
	}
}

// plateDigit returns the trailing digit of placa when it looks like a plate description
// ("8", "Termina en 8"), or 0 when it cannot tell ("ND", "Termina en D", "Termina en -").
func plateDigit(placa string) byte {
	s := strings.TrimSpace(placa)
	if s == "" {
		return 0
	}
	runes := []rune(s)
	last := runes[len(runes)-1]
	if last < '0' || last > '9' {
		return 0
	}
	if len(runes) == 1 {
		return byte(last)
	}
	// A trailing digit only counts when it stands on its own (preceded by a space or a non-digit),
	// not as part of a longer alphanumeric plate ("ABC123").
	prev := runes[len(runes)-2]
	if prev == ' ' || prev < '0' || prev > '9' {
		return byte(last)
	}
	return 0
}

// primaryColor normalizes the exterior color to a single main token ("" when unknown).
func primaryColor(color string) string {
	s := accentReplacer.Replace(strings.ToLower(strings.TrimSpace(color)))
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	if len(fields) == 0 {
		return ""
	}
	w := fields[0]
	if w == "nd" || w == "otro" {
		return ""
	}
	if len(w) > 4 && strings.HasSuffix(w, "s") {
		w = strings.TrimSuffix(w, "s")
	}
	if w == "plata" {
		w = "plateado"
	}
	return w
}

// extractPhones scans s for 8-digit Costa Rican phone numbers (dddd-dddd or dddddddd bounded
// by non-digits), returning deduplicated 8-digit strings.
func extractPhones(s string) []string {
	var phones []string
	seen := map[string]bool{}
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			phones = append(phones, p)
		}
	}
	r := []rune(s)
	n := len(r)
	digit := func(i int) bool { return i >= 0 && i < n && r[i] >= '0' && r[i] <= '9' }
	for i := 0; i < n; i++ {
		if !digit(i) {
			continue
		}
		// Only start on a digit run boundary (previous char is a non-digit or the string start).
		if i > 0 && digit(i-1) {
			continue
		}
		// Pattern: dddd-dddd
		if digit(i+1) && digit(i+2) && digit(i+3) && i+4 < n && r[i+4] == '-' &&
			digit(i+5) && digit(i+6) && digit(i+7) && digit(i+8) && !digit(i+9) {
			add(string(r[i:i+4]) + string(r[i+5:i+9]))
			continue
		}
		// Pattern: dddddddd
		if digit(i+1) && digit(i+2) && digit(i+3) && digit(i+4) && digit(i+5) && digit(i+6) && digit(i+7) && !digit(i+8) {
			add(string(r[i : i+8]))
			continue
		}
	}
	return phones
}

// dedupSubModel disambiguates multi-word brand/prefix models by looking at the title.
func dedupSubModel(brand, model, title string) string {
	m := strings.ToLower(strings.TrimSpace(model))
	if strings.HasPrefix(m, "(") || m == "benz" || m == "rover" || m == "wall" || m == "romeo" || m == "martin" {
		fields := strings.Fields(strings.ToLower(title))
		if len(fields) >= 3 {
			return fields[2]
		}
	}
	return m
}

// sharesPhone reports whether the two phone lists have any number in common.
func sharesPhone(a, b []string) bool {
	for _, x := range a {
		for _, y := range b {
			if x == y {
				return true
			}
		}
	}
	return false
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// samePhysicalCar reports whether two candidates describe the same physical listing: same seller
// re-posting, price-change reposts, or different sellers / branches / a consignee offering the
// same car. Conflicting known plate digits, colors or sub-models always mean different cars.
func samePhysicalCar(a, b dedupCandidate) bool {
	// Different sub-model of the same brand/prefix: different cars.
	if a.subModel != "" && b.subModel != "" && a.subModel != b.subModel {
		return false
	}
	// Conflicting known plate digit: different cars.
	if a.plate != 0 && b.plate != 0 && a.plate != b.plate {
		return false
	}
	// Conflicting known exterior color: different cars.
	if a.color != "" && b.color != "" && a.color != b.color {
		return false
	}

	sharedPhone := sharesPhone(a.phones, b.phones)

	// Same seller phone & same price: same car with the same (or within-rounding) mileage.
	if sharedPhone && a.price == b.price {
		return a.km == b.km || (validKm(a.km) && validKm(b.km) && absInt(a.km-b.km) <= 2000)
	}
	// Same seller phone & price-change repost: same plate and color, near-identical mileage.
	if sharedPhone && a.plate != 0 && a.plate == b.plate && a.color != "" && a.color == b.color {
		return validKm(a.km) && validKm(b.km) && absInt(a.km-b.km) <= 2000
	}
	// Two sellers / branches / consignee posting the same physical car: same price, plate and
	// color with near-identical mileage.
	if a.price == b.price && a.plate != 0 && a.plate == b.plate && a.color != "" && a.color == b.color {
		return validKm(a.km) && validKm(b.km) && absInt(a.km-b.km) <= 1000
	}
	return false
}
