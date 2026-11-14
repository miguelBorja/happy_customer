package db

import (
	"testing"
	"time"
)

func TestParseFechaIngreso(t *testing.T) {
	cases := []struct {
		input  string
		wantOK bool
		wantY  int
		wantM  time.Month
		wantD  int
	}{
		{"28 de Mayo del 2026", true, 2026, time.May, 28},
		{"5 de setiembre de 2025", true, 2025, time.September, 5},
		{" 14 de Septiembre del 2026 ", true, 2026, time.September, 14},
		{"1 de Enero de 2024", true, 2024, time.January, 1},
		{"30 de Febrero del 2026", false, 0, 0, 0},
		{"2026-05-28", false, 0, 0, 0},
		{"", false, 0, 0, 0},
	}

	for _, tc := range cases {
		got, ok := ParseFechaIngreso(tc.input)
		if ok != tc.wantOK {
			t.Errorf("ParseFechaIngreso(%q) ok = %v, want %v", tc.input, ok, tc.wantOK)
			continue
		}
		if ok && (got.Year() != tc.wantY || got.Month() != tc.wantM || got.Day() != tc.wantD) {
			t.Errorf("ParseFechaIngreso(%q) = %v, want %04d-%02d-%02d", tc.input, got, tc.wantY, tc.wantM, tc.wantD)
		}
	}
}

func TestListingAgeDays(t *testing.T) {
	now := time.Date(2026, time.November, 14, 15, 30, 0, 0, time.UTC)
	scrapedOld := time.Date(2026, time.September, 1, 10, 0, 0, 0, time.UTC)

	if days, ok := ListingAgeDays("14 de Octubre del 2026", scrapedOld, now); !ok || days != 31 {
		t.Errorf("FechaIngreso preferred: got (%d, %v), want (31, true)", days, ok)
	}

	if days, ok := ListingAgeDays("invalid", scrapedOld, now); !ok || days != 74 {
		t.Errorf("fallback to scrapedAt: got (%d, %v), want (74, true)", days, ok)
	}

	if days, ok := ListingAgeDays("", time.Time{}, now); ok || days != 0 {
		t.Errorf("missing both dates: got (%d, %v), want (0, false)", days, ok)
	}

	// Future date clamps to 0.
	if days, ok := ListingAgeDays("20 de Noviembre del 2026", time.Time{}, now); !ok || days != 0 {
		t.Errorf("future date: got (%d, %v), want (0, true)", days, ok)
	}
}
