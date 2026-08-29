package scraper

import (
	"testing"
)

func TestParseTitleBrandModelYear(t *testing.T) {
	tests := []struct {
		input         string
		expectedTitle string
		expectedBrand string
		expectedModel string
		expectedYear  int
	}{
		{
			input:         "Toyota RAV4 2022",
			expectedTitle: "Toyota RAV4",
			expectedBrand: "Toyota",
			expectedModel: "RAV4",
			expectedYear:  2022,
		},
		{
			input:         "Hyundai Tucson Limited 2020",
			expectedTitle: "Hyundai Tucson Limited",
			expectedBrand: "Hyundai",
			expectedModel: "Tucson",
			expectedYear:  2020,
		},
		{
			input:         "BYD Tang EV 2024",
			expectedTitle: "BYD Tang EV",
			expectedBrand: "BYD",
			expectedModel: "Tang",
			expectedYear:  2024,
		},
	}

	for _, tt := range tests {
		title, brand, model, year := parseTitleBrandModelYear(tt.input)
		if title != tt.expectedTitle {
			t.Errorf("parseTitleBrandModelYear(%q) title = %q, want %q", tt.input, title, tt.expectedTitle)
		}
		if brand != tt.expectedBrand {
			t.Errorf("parseTitleBrandModelYear(%q) brand = %q, want %q", tt.input, brand, tt.expectedBrand)
		}
		if model != tt.expectedModel {
			t.Errorf("parseTitleBrandModelYear(%q) model = %q, want %q", tt.input, model, tt.expectedModel)
		}
		if year != tt.expectedYear {
			t.Errorf("parseTitleBrandModelYear(%q) year = %d, want %d", tt.input, year, tt.expectedYear)
		}
	}
}

func TestParsePrice(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"$15,000", 15000},
		{"$ 24,500", 24500},
		{"¢ 5,100,000", 10000}, // 5100000 / 510 = 10000
		{"$0", 0},
	}

	for _, tt := range tests {
		got := parsePrice(tt.input)
		if got != tt.expected {
			t.Errorf("parsePrice(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func TestParseKilometraje(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"45,000 kms", 45000},
		{"10,000 millas", 16093},
		{"0 kms", 0},
		{"-", 0},
	}

	for _, tt := range tests {
		got := parseKilometraje(tt.input)
		if got != tt.expected {
			t.Errorf("parseKilometraje(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}
