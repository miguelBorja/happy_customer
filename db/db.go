package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"unicode"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

// DB wraps sql.DB
type DB struct {
	*sql.DB
	DriverName string // "sqlite" or "postgres"
}

// Init opens (or creates) the database at path and runs migrations.
// Supports standard SQLite paths or postgres:// connection strings.
func Init(path string) (*DB, error) {
	var sqlDB *sql.DB
	var err error
	var driverName string

	if strings.HasPrefix(path, "postgres://") || strings.HasPrefix(path, "postgresql://") {
		driverName = "postgres"
		// Append binary_parameters=yes to support PgBouncer transaction pooling mode without prepared statement errors
		if !strings.Contains(path, "binary_parameters=") {
			if strings.Contains(path, "?") {
				path += "&binary_parameters=yes"
			} else {
				path += "?binary_parameters=yes"
			}
		}
		sqlDB, err = sql.Open("postgres", path)
		if err != nil {
			return nil, fmt.Errorf("open postgres: %w", err)
		}
	} else {
		driverName = "sqlite"
		sqlDB, err = sql.Open("sqlite", path)
		if err != nil {
			return nil, fmt.Errorf("open sqlite: %w", err)
		}
		// SQLite specific pragmas for optimization
		for _, p := range []string{
			"PRAGMA journal_mode=WAL",
			"PRAGMA synchronous=NORMAL",
			"PRAGMA cache_size=-64000",
			"PRAGMA foreign_keys=ON",
		} {
			if _, err := sqlDB.Exec(p); err != nil {
				sqlDB.Close()
				return nil, fmt.Errorf("pragma %q: %w", p, err)
			}
		}
	}

	d := &DB{
		DB:         sqlDB,
		DriverName: driverName,
	}
	if err := d.migrate(); err != nil {
		sqlDB.Close()
		return nil, err
	}
	if err := d.CleanUpData(); err != nil {
		log.Printf("Warning: startup database cleanup failed: %v", err)
	}
	return d, nil
}

func (d *DB) migrate() error {
	s := schema
	if d.DriverName == "postgres" {
		// PostgreSQL uses TIMESTAMP instead of DATETIME
		s = strings.ReplaceAll(s, "DATETIME", "TIMESTAMP")
		// PostgreSQL uses SERIAL instead of AUTOINCREMENT
		s = strings.ReplaceAll(s, "INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
	}

	if _, err := d.Exec(s); err != nil {
		return err
	}
	// Add seller columns if they don't exist (for existing SQLite databases)
	if d.DriverName == "sqlite" {
		for _, col := range []string{
			"ALTER TABLE cars ADD COLUMN seller_name TEXT DEFAULT ''",
			"ALTER TABLE cars ADD COLUMN seller_phone TEXT DEFAULT ''",
			"ALTER TABLE cars ADD COLUMN seller_address TEXT DEFAULT ''",
			"ALTER TABLE cars ADD COLUMN comment TEXT DEFAULT ''",
		} {
			d.Exec(col) // ignore errors (column already exists)
		}
	} else if d.DriverName == "postgres" {
		d.Exec("ALTER TABLE cars ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT ''")
		d.Exec("ALTER TABLE cars ENABLE ROW LEVEL SECURITY")
	}
	return nil
}

const schema = `
CREATE TABLE IF NOT EXISTS cars (
    url                          TEXT PRIMARY KEY,
    title                        TEXT NOT NULL,
    brand                        TEXT,
    model                        TEXT,
    year                         INTEGER,
    price                        INTEGER,
    price_text                   TEXT,
    pasajeros                    TEXT,
    puertas                      TEXT,
    cilindrada                   TEXT,
    color_exterior               TEXT,
    color_interior               TEXT,
    combustible                  TEXT,
    estado                       TEXT,
    estilo                       TEXT,
    fecha_ingreso                TEXT,
    kilometraje                  INTEGER DEFAULT 0,
    placa                        TEXT,
    precio_negociable            TEXT,
    provincia                    TEXT,
    se_recibe                    TEXT,
    transmision                  TEXT,
    pago_impuestos               TEXT,
    equip_aire_ac                INTEGER DEFAULT 0,
    equip_aire_climatizado       INTEGER DEFAULT 0,
    equip_alarma                 INTEGER DEFAULT 0,
    equip_android_auto           INTEGER DEFAULT 0,
    equip_apple_carplay          INTEGER DEFAULT 0,
    equip_aros_lujo              INTEGER DEFAULT 0,
    equip_asiento_memoria        INTEGER DEFAULT 0,
    equip_asientos_electricos    INTEGER DEFAULT 0,
    equip_bluetooth              INTEGER DEFAULT 0,
    equip_bolsa_aire             INTEGER DEFAULT 0,
    equip_caja_dual              INTEGER DEFAULT 0,
    equip_cierre_central         INTEGER DEFAULT 0,
    equip_computadora            INTEGER DEFAULT 0,
    equip_control_crucero        INTEGER DEFAULT 0,
    equip_control_descenso       INTEGER DEFAULT 0,
    equip_radio_volante          INTEGER DEFAULT 0,
    equip_estabilidad            INTEGER DEFAULT 0,
    equip_camara_360             INTEGER DEFAULT 0,
    equip_camara_retroceso       INTEGER DEFAULT 0,
    equip_desempanador           INTEGER DEFAULT 0,
    equip_direccion              INTEGER DEFAULT 0,
    equip_espejos_electricos     INTEGER DEFAULT 0,
    equip_frenos_abs             INTEGER DEFAULT 0,
    equip_halogenos              INTEGER DEFAULT 0,
    equip_llave_inteligente      INTEGER DEFAULT 0,
    equip_xenon                  INTEGER DEFAULT 0,
    equip_radio_usb              INTEGER DEFAULT 0,
    equip_retrovisores           INTEGER DEFAULT 0,
    equip_revision_tecnica       INTEGER DEFAULT 0,
    equip_sensor_lluvia          INTEGER DEFAULT 0,
    equip_sensores_retroceso     INTEGER DEFAULT 0,
    equip_sensores_frontales     INTEGER DEFAULT 0,
    equip_sunroof                INTEGER DEFAULT 0,
    equip_tapiceria_cuero        INTEGER DEFAULT 0,
    equip_turbo                  INTEGER DEFAULT 0,
    equip_vidrios_electricos     INTEGER DEFAULT 0,
    equip_vidrios_tintados       INTEGER DEFAULT 0,
    equip_volante_ajustable      INTEGER DEFAULT 0,
    equip_volante_multifuncional INTEGER DEFAULT 0,
    seller_name                  TEXT DEFAULT '',
    seller_phone                 TEXT DEFAULT '',
    seller_address               TEXT DEFAULT '',
    comment                      TEXT DEFAULT '',
    is_sold                      INTEGER DEFAULT 0,
    scraped_at                   DATETIME,
    last_seen_at                 DATETIME,
    sold_at                      DATETIME
);
CREATE INDEX IF NOT EXISTS idx_cars_brand        ON cars(brand);
CREATE INDEX IF NOT EXISTS idx_cars_year         ON cars(year);
CREATE INDEX IF NOT EXISTS idx_cars_price        ON cars(price);
CREATE INDEX IF NOT EXISTS idx_cars_kilometraje  ON cars(kilometraje);
CREATE INDEX IF NOT EXISTS idx_cars_is_sold      ON cars(is_sold);
CREATE INDEX IF NOT EXISTS idx_cars_estilo       ON cars(estilo);
CREATE INDEX IF NOT EXISTS idx_cars_transmision  ON cars(transmision);
CREATE INDEX IF NOT EXISTS idx_cars_combustible  ON cars(combustible);

CREATE TABLE IF NOT EXISTS page_views (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address  TEXT,
    user_agent  TEXT,
    path        TEXT,
    visited_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at);
`

// queryFormat converts SQLite '?' placeholders to PostgreSQL '$1', '$2' etc. if the active driver is Postgres.
func (d *DB) queryFormat(query string) string {
	if d.DriverName != "postgres" {
		return query
	}
	var sb strings.Builder
	paramIndex := 1
	for _, r := range query {
		if r == '?' {
			sb.WriteString(fmt.Sprintf("$%d", paramIndex))
			paramIndex++
		} else {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// QueryFormat is a public wrapper around queryFormat to allow other packages to format placeholder queries.
func (d *DB) QueryFormat(query string) string {
	return d.queryFormat(query)
}

func cleanString(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func CleanComment(comment string) string {
	c := strings.TrimSpace(comment)
	if c == "" {
		return ""
	}
	for _, r := range c {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return c
		}
	}
	return ""
}

func (d *DB) CleanUpData() error {
	rows, err := d.Query("SELECT url, title, comment FROM cars")
	if err != nil {
		return err
	}
	defer rows.Close()

	type updateInfo struct {
		url     string
		title   string
		brand   string
		model   string
		comment string
	}
	var updates []updateInfo

	for rows.Next() {
		var url, title, comment string
		if err := rows.Scan(&url, &title, &comment); err != nil {
			return err
		}

		cleanedTitle := cleanString(title)
		cleanedComment := CleanComment(comment)

		if cleanedTitle != title || cleanedComment != comment {
			// Extract brand and model from cleaned title
			parts := strings.Fields(cleanedTitle)
			brand := ""
			model := ""
			if len(parts) > 0 {
				brand = parts[0]
				if len(parts) > 1 {
					model = parts[1]
				}
			}
			updates = append(updates, updateInfo{
				url:     url,
				title:   cleanedTitle,
				brand:   brand,
				model:   model,
				comment: cleanedComment,
			})
		}
	}

	if len(updates) > 0 {
		log.Printf("[DB] Found %d cars needing title/comment cleanups. Updating in database...", len(updates))
		tx, err := d.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()

		stmt, err := tx.Prepare(d.queryFormat("UPDATE cars SET title=?, brand=?, model=?, comment=? WHERE url=?"))
		if err != nil {
			return err
		}
		defer stmt.Close()

		for _, u := range updates {
			if _, err := stmt.Exec(u.title, u.brand, u.model, u.comment, u.url); err != nil {
				return err
			}
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		log.Printf("[DB] Successfully cleaned up %d records.", len(updates))
	}
	return nil
}

func (d *DB) RecordVisit(ip, ua, path string) error {
	query := d.queryFormat("INSERT INTO page_views (ip_address, user_agent, path) VALUES (?, ?, ?)")
	_, err := d.Exec(query, ip, ua, path)
	return err
}

func (d *DB) GetTotalVisits() (int, error) {
	var count int
	query := d.queryFormat("SELECT count(*) FROM page_views")
	err := d.QueryRow(query).Scan(&count)
	return count, err
}
