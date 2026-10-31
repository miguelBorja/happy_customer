package db

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

type MarketStat struct {
	Median int
	Count  int
}

func MarketKey(brand, model string, year int) string {
	return strings.ToLower(strings.TrimSpace(brand)) + "|" + strings.ToLower(strings.TrimSpace(model)) + "|" + strconv.Itoa(year)
}

func (d *DB) GetAllMarketStats() (map[string]MarketStat, error) {
	q := `SELECT brand, model, year, price FROM cars WHERE price > 0 AND brand != '' AND model != ''`
	rows, err := d.Query(d.queryFormat(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make(map[string][]int)
	for rows.Next() {
		var brand, model string
		var year, price int
		if err := rows.Scan(&brand, &model, &year, &price); err != nil {
			return nil, err
		}
		k := MarketKey(brand, model, year)
		groups[k] = append(groups[k], price)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	stats := make(map[string]MarketStat, len(groups))
	for k, prices := range groups {
		sort.Ints(prices)
		n := len(prices)
		var median int
		if n%2 == 1 {
			median = prices[n/2]
		} else {
			median = int(math.Round(float64(prices[n/2-1]+prices[n/2]) / 2.0))
		}
		stats[k] = MarketStat{
			Median: median,
			Count:  n,
		}
	}

	return stats, nil
}
