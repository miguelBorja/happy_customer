package db

import (
	"testing"
	"time"
)

func TestPriceHistoryRecordsOnlyChanges(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	now := time.Now()
	mk := func(url string, price int) Car {
		return Car{URL: url, Title: "Toyota Hilux 2018", Brand: "Toyota", Model: "Hilux", Year: 2018,
			Price: price, ScrapedAt: now, LastSeenAt: now}
	}
	a, b := "https://crautos.com/a", "https://crautos.com/b"

	// New cars: first price recorded (batch path).
	if err := database.UpsertCarBatch([]Car{mk(a, 20000), mk(b, 15000)}); err != nil {
		t.Fatal(err)
	}
	// Same prices again: nothing new.
	if err := database.UpsertCarBatch([]Car{mk(a, 20000), mk(b, 15000)}); err != nil {
		t.Fatal(err)
	}
	// Price drop on a (single path).
	if err := database.UpsertCar(mk(a, 18500)); err != nil {
		t.Fatal(err)
	}

	ha, err := database.GetPriceHistory(a)
	if err != nil {
		t.Fatal(err)
	}
	if len(ha) != 2 || ha[0].Price != 20000 || ha[1].Price != 18500 {
		t.Fatalf("history a = %+v, want [20000 18500]", ha)
	}
	hb, err := database.GetPriceHistory(b)
	if err != nil {
		t.Fatal(err)
	}
	if len(hb) != 1 || hb[0].Price != 15000 {
		t.Fatalf("history b = %+v, want [15000]", hb)
	}

	changed, err := database.GetChangedPriceHistories()
	if err != nil {
		t.Fatal(err)
	}
	if len(changed) != 1 || len(changed[a]) != 2 || changed[a][0].Price != 20000 || changed[a][1].Price != 18500 {
		t.Fatalf("GetChangedPriceHistories = %+v, want only %q with [20000 18500]", changed, a)
	}
	if _, ok := changed[b]; ok {
		t.Fatalf("GetChangedPriceHistories unexpectedly included single-price %q", b)
	}
}

func TestCleanAndSummarizePriceHistory(t *testing.T) {
	t0 := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(24 * time.Hour)
	t2 := t0.Add(48 * time.Hour)

	if pc, ok := SummarizePriceHistory([]PricePoint{{Price: 20000, SeenAt: t0}}, 0); ok {
		t.Fatalf("single point should not summarize: %+v", pc)
	}

	pc, ok := SummarizePriceHistory([]PricePoint{
		{Price: 20000, SeenAt: t0},
		{Price: 18500, SeenAt: t1},
	}, 0)
	if !ok || pc.InitialPrice != 20000 || pc.PreviousPrice != 20000 || pc.CurrentPrice != 18500 || pc.Changes != 1 || !pc.ChangedAt.Equal(t1) {
		t.Fatalf("2-point drop = %+v, ok=%v", pc, ok)
	}

	pc, ok = SummarizePriceHistory([]PricePoint{
		{Price: 22000, SeenAt: t0},
		{Price: 20000, SeenAt: t1},
		{Price: 18500, SeenAt: t2},
	}, 0)
	if !ok || pc.InitialPrice != 22000 || pc.PreviousPrice != 20000 || pc.CurrentPrice != 18500 || pc.Changes != 2 || !pc.ChangedAt.Equal(t2) {
		t.Fatalf("multi-step drop = %+v, ok=%v", pc, ok)
	}

	// 2-point extra-zero typo fix should be ignored both with and without expected price.
	for _, exp := range []int{21000, 0} {
		if pc, ok := SummarizePriceHistory([]PricePoint{
			{Price: 200000, SeenAt: t0},
			{Price: 20000, SeenAt: t1},
		}, exp); ok {
			t.Fatalf("2-point typo (expected=%d) should not summarize: %+v", exp, pc)
		}
	}

	// 3-point typo-then-real-drop without market expected strips 200000 via median anchor.
	pc, ok = SummarizePriceHistory([]PricePoint{
		{Price: 200000, SeenAt: t0},
		{Price: 20000, SeenAt: t1},
		{Price: 18500, SeenAt: t2},
	}, 0)
	if !ok || pc.InitialPrice != 20000 || pc.PreviousPrice != 20000 || pc.CurrentPrice != 18500 || pc.Changes != 1 {
		t.Fatalf("3-point typo+drop = %+v, ok=%v", pc, ok)
	}

	// Bounce back across a typo collapses to single earliest point.
	bounce := CleanPriceHistory([]PricePoint{
		{Price: 20000, SeenAt: t0},
		{Price: 200000, SeenAt: t1},
		{Price: 20000, SeenAt: t2},
	}, 0)
	if len(bounce) != 1 || bounce[0].Price != 20000 || !bounce[0].SeenAt.Equal(t0) {
		t.Fatalf("bounce CleanPriceHistory = %+v, want single point at t0", bounce)
	}
	if pc, ok := SummarizePriceHistory([]PricePoint{
		{Price: 20000, SeenAt: t0},
		{Price: 200000, SeenAt: t1},
		{Price: 20000, SeenAt: t2},
	}, 0); ok {
		t.Fatalf("bounce should not summarize: %+v", pc)
	}
}

func TestSummarizePriceHistoryDropsCount(t *testing.T) {
	t0 := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(24 * time.Hour)
	t2 := t0.Add(48 * time.Hour)
	t3 := t0.Add(72 * time.Hour)

	// Two clean drops >= $100 and >= 1%.
	pc, ok := SummarizePriceHistory([]PricePoint{
		{Price: 22000, SeenAt: t0},
		{Price: 20500, SeenAt: t1},
		{Price: 18900, SeenAt: t2},
	}, 0)
	if !ok || pc.Drops != 2 {
		t.Fatalf("2 clean drops = %+v, ok=%v, want Drops=2", pc, ok)
	}

	// Price hike should yield Drops == 0.
	pc, ok = SummarizePriceHistory([]PricePoint{
		{Price: 15000, SeenAt: t0},
		{Price: 16000, SeenAt: t1},
	}, 0)
	if !ok || pc.Drops != 0 {
		t.Fatalf("price hike = %+v, ok=%v, want Drops=0", pc, ok)
	}

	// Tiny noise drop (< $100) does not count, while clean drop + small hike counts 1.
	pc, ok = SummarizePriceHistory([]PricePoint{
		{Price: 18000, SeenAt: t0},
		{Price: 17950, SeenAt: t1}, // -$50 ignored
		{Price: 18500, SeenAt: t2}, // hike ignored
		{Price: 17000, SeenAt: t3}, // clean drop counted
	}, 0)
	if !ok || pc.Drops != 1 {
		t.Fatalf("mixed history = %+v, ok=%v, want Drops=1", pc, ok)
	}
}
