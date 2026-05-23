package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB wraps sql.DB
type DB struct {
	*sql.DB
}

// Init opens (or creates) the SQLite database at path and runs migrations.
func Init(path string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	for _, p := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA cache_size=-64000",
		"PRAGMA foreign_keys=ON",
	} {
		if _, err := sqlDB.Exec(p); err != nil {
			return nil, fmt.Errorf("pragma %q: %w", p, err)
		}
	}
	d := &DB{sqlDB}
	return d, d.migrate()
}

func (d *DB) migrate() error {
	if _, err := d.Exec(schema); err != nil {
		return err
	}
	// Add seller columns if they don't exist (for existing databases)
	for _, col := range []string{
		"ALTER TABLE cars ADD COLUMN seller_name TEXT DEFAULT ''",
		"ALTER TABLE cars ADD COLUMN seller_phone TEXT DEFAULT ''",
		"ALTER TABLE cars ADD COLUMN seller_address TEXT DEFAULT ''",
	} {
		d.Exec(col) // ignore errors (column already exists)
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
`
