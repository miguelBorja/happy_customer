package db

import (
	"database/sql"
	"strings"
	"time"
)

// SellerListingRow holds the listing fields needed to summarize a seller's inventory and pricing.
type SellerListingRow struct {
	URL              string
	SellerName       string
	SellerPhone      string
	Brand            string
	Model            string
	Year             int
	Price            int
	Kilometraje      int
	Provincia        string
	SeRecibe         string
	PrecioNegociable string
	IsSold           bool
	FechaIngreso     string
	ScrapedAt        time.Time
	SoldAt           time.Time
}

// GetSellerListings returns active and historical listings matching seller_name (case-insensitive substring),
// aligned with buildCarFilters' SellerName matching semantics.
func (d *DB) GetSellerListings(name string) ([]SellerListingRow, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return []SellerListingRow{}, nil
	}

	q := `SELECT url, COALESCE(seller_name, ''), COALESCE(seller_phone, ''),
		COALESCE(brand, ''), COALESCE(model, ''), COALESCE(year, 0),
		COALESCE(price, 0), COALESCE(kilometraje, 0), COALESCE(provincia, ''),
		COALESCE(se_recibe, ''), COALESCE(precio_negociable, ''), COALESCE(is_sold, 0),
		COALESCE(fecha_ingreso, ''), scraped_at, sold_at
		FROM cars
		WHERE LOWER(COALESCE(seller_name, '')) LIKE ?
		ORDER BY is_sold ASC, scraped_at DESC`

	rows, err := d.Query(d.queryFormat(q), "%"+strings.ToLower(trimmed)+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []SellerListingRow{}
	for rows.Next() {
		var r SellerListingRow
		var soldInt int
		var scrapedStr, soldStr sql.NullString
		if err := rows.Scan(
			&r.URL, &r.SellerName, &r.SellerPhone,
			&r.Brand, &r.Model, &r.Year,
			&r.Price, &r.Kilometraje, &r.Provincia,
			&r.SeRecibe, &r.PrecioNegociable, &soldInt,
			&r.FechaIngreso, &scrapedStr, &soldStr,
		); err != nil {
			return nil, err
		}
		r.IsSold = soldInt != 0
		r.ScrapedAt = parseTimeHelper(scrapedStr)
		r.SoldAt = parseTimeHelper(soldStr)
		out = append(out, r)
	}
	return out, rows.Err()
}
