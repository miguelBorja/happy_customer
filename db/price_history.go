package db

import (
	"sort"
	"time"
)

// PriceChange summarizes a listing's cleaned price history when at least two distinct prices exist.
type PriceChange struct {
	InitialPrice  int       // oldest clean recorded price
	PreviousPrice int       // clean price immediately preceding CurrentPrice
	CurrentPrice  int       // latest clean recorded price
	ChangedAt     time.Time // when CurrentPrice was first observed
	Changes       int       // number of clean transitions (len(clean) - 1)
}

// CleanPriceHistory filters invalid/typo prices and collapses consecutive identical prices,
// preserving the earliest SeenAt of each price plateau.
func CleanPriceHistory(points []PricePoint, expected int) []PricePoint {
	valid := make([]PricePoint, 0, len(points))
	for _, p := range points {
		if p.Price > 0 {
			valid = append(valid, p)
		}
	}
	if len(valid) == 0 {
		return []PricePoint{}
	}

	ref := expected
	if ref <= 0 && len(valid) >= 3 {
		sorted := make([]int, len(valid))
		for i, p := range valid {
			sorted[i] = p.Price
		}
		sort.Ints(sorted)
		ref = medianInt(sorted)
	}

	filtered := valid
	if ref > 0 {
		nonTypos := make([]PricePoint, 0, len(valid))
		for _, p := range valid {
			if !IsTypoPrice(p.Price, ref) {
				nonTypos = append(nonTypos, p)
			}
		}
		if len(nonTypos) > 0 {
			filtered = nonTypos
		}
	}

	collapsed := make([]PricePoint, 0, len(filtered))
	for _, p := range filtered {
		if len(collapsed) == 0 || collapsed[len(collapsed)-1].Price != p.Price {
			collapsed = append(collapsed, p)
		}
	}

	// Two-point typo guard when no market/median anchor exists: a 10x jump between 2 points
	// indicates a missing/extra-zero typo introduction or fix rather than a real price change.
	if ref <= 0 && len(collapsed) == 2 && IsTypoPrice(collapsed[0].Price, collapsed[1].Price) {
		return collapsed[1:]
	}

	return collapsed
}

// SummarizePriceHistory returns a PriceChange summary when CleanPriceHistory has at least 2 points.
func SummarizePriceHistory(points []PricePoint, expected int) (PriceChange, bool) {
	clean := CleanPriceHistory(points, expected)
	if len(clean) < 2 {
		return PriceChange{}, false
	}
	return PriceChange{
		InitialPrice:  clean[0].Price,
		PreviousPrice: clean[len(clean)-2].Price,
		CurrentPrice:  clean[len(clean)-1].Price,
		ChangedAt:     clean[len(clean)-1].SeenAt,
		Changes:       len(clean) - 1,
	}, true
}

// GetChangedPriceHistories returns price histories (oldest first) for all listings with >1 row.
func (d *DB) GetChangedPriceHistories() (map[string][]PricePoint, error) {
	q := `SELECT ph.url, ph.price, ph.seen_at
	FROM price_history ph
	WHERE ph.url IN (
		SELECT url FROM price_history GROUP BY url HAVING COUNT(*) > 1
	)
	ORDER BY ph.url ASC, ph.seen_at ASC, ph.id ASC`
	rows, err := d.Query(d.queryFormat(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string][]PricePoint)
	for rows.Next() {
		var u string
		var p PricePoint
		if err := rows.Scan(&u, &p.Price, &p.SeenAt); err != nil {
			return nil, err
		}
		out[u] = append(out[u], p)
	}
	return out, rows.Err()
}
