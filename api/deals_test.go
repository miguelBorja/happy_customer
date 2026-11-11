package api

import (
	"reflect"
	"testing"

	"crautosdb/db"
)

func TestRankDealURLs(t *testing.T) {
	stats := map[string]db.MarketStat{
		db.MarketKey("Toyota", "Hilux", 2018): {Median: 20000, Count: 6},
		db.MarketKey("Kia", "Rio", 2015):      {Median: 8000, Count: 2}, // too few comparables
	}
	// Incoming order = most recent first.
	keys := []db.CarPriceKey{
		{URL: "fair", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 19500},  // -2.5%
		{URL: "nodata", Brand: "Kia", Model: "Rio", Year: 2015, Price: 5000},      // ignored: count < 4
		{URL: "great", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 17000}, // -15%
		{URL: "high", Brand: "Toyota", Model: "Hilux", Year: 2018, Price: 23000},  // +15%
		{URL: "good", Brand: "toyota ", Model: "HILUX", Year: 2018, Price: 18800}, // -6%
	}

	if got, want := rankDealURLs(keys, stats, false, true), []string{"great", "good", "fair", "high", "nodata"}; !reflect.DeepEqual(got, want) {
		t.Errorf("bestFirst = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, true, false), []string{"great", "good"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood (recency) = %v, want %v", got, want)
	}
	if got, want := rankDealURLs(keys, stats, true, true), []string{"great", "good"}; !reflect.DeepEqual(got, want) {
		t.Errorf("onlyGood+bestFirst = %v, want %v", got, want)
	}
}

func TestPageOfURLs(t *testing.T) {
	urls := []string{"a", "b", "c", "d", "e"}
	if got := pageOfURLs(urls, 0, 2); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("first page = %v", got)
	}
	if got := pageOfURLs(urls, 4, 2); !reflect.DeepEqual(got, []string{"e"}) {
		t.Errorf("last page = %v", got)
	}
	if got := pageOfURLs(urls, 9, 2); got != nil {
		t.Errorf("past end = %v", got)
	}
}
