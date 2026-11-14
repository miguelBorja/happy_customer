package db

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var fechaIngresoRe = regexp.MustCompile(`(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})`)

var spanishMonths = map[string]time.Month{
	"enero":      time.January,
	"febrero":    time.February,
	"marzo":      time.March,
	"abril":      time.April,
	"mayo":       time.May,
	"junio":      time.June,
	"julio":      time.July,
	"agosto":     time.August,
	"septiembre": time.September,
	"setiembre":  time.September,
	"octubre":    time.October,
	"noviembre":  time.November,
	"diciembre":  time.December,
}

// ParseFechaIngreso parses a Crautos Spanish publish date string (e.g. "28 de Mayo del 2026")
// into a calendar date at UTC midnight.
func ParseFechaIngreso(text string) (time.Time, bool) {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return time.Time{}, false
	}
	m := fechaIngresoRe.FindStringSubmatch(lower)
	if m == nil {
		return time.Time{}, false
	}
	day, err := strconv.Atoi(m[1])
	if err != nil {
		return time.Time{}, false
	}
	month, ok := spanishMonths[m[2]]
	if !ok {
		return time.Time{}, false
	}
	year, err := strconv.Atoi(m[3])
	if err != nil {
		return time.Time{}, false
	}
	d := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	if d.Year() != year || d.Month() != month || d.Day() != day {
		return time.Time{}, false
	}
	return d, true
}

// ListingAgeDays returns the whole calendar days elapsed since the listing's publish date
// (FechaIngreso first, falling back to scrapedAt), clamped to >= 0.
func ListingAgeDays(fechaIngreso string, scrapedAt, now time.Time) (int, bool) {
	ref, ok := ParseFechaIngreso(fechaIngreso)
	if !ok {
		if scrapedAt.IsZero() {
			return 0, false
		}
		ref = scrapedAt
	}
	ny, nm, nd := now.Date()
	dy, dm, dd := ref.Date()
	today := time.Date(ny, nm, nd, 0, 0, 0, 0, time.UTC)
	day := time.Date(dy, dm, dd, 0, 0, 0, 0, time.UTC)
	days := int(math.Round(today.Sub(day).Hours() / 24.0))
	if days < 0 {
		days = 0
	}
	return days, true
}
