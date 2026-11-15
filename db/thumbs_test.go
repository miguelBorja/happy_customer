package db

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestThumbMigrationAndUpsertPreservesStatus(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")

	// Simulate an older database before thumb columns existed.
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	legacySchema := `
	CREATE TABLE cars (
		url TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		brand TEXT,
		model TEXT,
		year INTEGER,
		price INTEGER,
		price_text TEXT,
		pasajeros TEXT,
		puertas TEXT,
		cilindrada TEXT,
		color_exterior TEXT,
		color_interior TEXT,
		combustible TEXT,
		estado TEXT,
		estilo TEXT,
		fecha_ingreso TEXT,
		kilometraje INTEGER DEFAULT 0,
		placa TEXT,
		precio_negociable TEXT,
		provincia TEXT,
		se_recibe TEXT,
		transmision TEXT,
		pago_impuestos TEXT,
		equip_aire_ac INTEGER DEFAULT 0,
		equip_aire_climatizado INTEGER DEFAULT 0,
		equip_alarma INTEGER DEFAULT 0,
		equip_android_auto INTEGER DEFAULT 0,
		equip_apple_carplay INTEGER DEFAULT 0,
		equip_aros_lujo INTEGER DEFAULT 0,
		equip_asiento_memoria INTEGER DEFAULT 0,
		equip_asientos_electricos INTEGER DEFAULT 0,
		equip_bluetooth INTEGER DEFAULT 0,
		equip_bolsa_aire INTEGER DEFAULT 0,
		equip_caja_dual INTEGER DEFAULT 0,
		equip_cierre_central INTEGER DEFAULT 0,
		equip_computadora INTEGER DEFAULT 0,
		equip_control_crucero INTEGER DEFAULT 0,
		equip_control_descenso INTEGER DEFAULT 0,
		equip_radio_volante INTEGER DEFAULT 0,
		equip_estabilidad INTEGER DEFAULT 0,
		equip_camara_360 INTEGER DEFAULT 0,
		equip_camara_retroceso INTEGER DEFAULT 0,
		equip_desempanador INTEGER DEFAULT 0,
		equip_direccion INTEGER DEFAULT 0,
		equip_espejos_electricos INTEGER DEFAULT 0,
		equip_frenos_abs INTEGER DEFAULT 0,
		equip_halogenos INTEGER DEFAULT 0,
		equip_llave_inteligente INTEGER DEFAULT 0,
		equip_xenon INTEGER DEFAULT 0,
		equip_radio_usb INTEGER DEFAULT 0,
		equip_retrovisores INTEGER DEFAULT 0,
		equip_revision_tecnica INTEGER DEFAULT 0,
		equip_sensor_lluvia INTEGER DEFAULT 0,
		equip_sensores_retroceso INTEGER DEFAULT 0,
		equip_sensores_frontales INTEGER DEFAULT 0,
		equip_sunroof INTEGER DEFAULT 0,
		equip_tapiceria_cuero INTEGER DEFAULT 0,
		equip_turbo INTEGER DEFAULT 0,
		equip_vidrios_electricos INTEGER DEFAULT 0,
		equip_vidrios_tintados INTEGER DEFAULT 0,
		equip_volante_ajustable INTEGER DEFAULT 0,
		equip_volante_multifuncional INTEGER DEFAULT 0,
		seller_name TEXT DEFAULT '',
		seller_phone TEXT DEFAULT '',
		seller_address TEXT DEFAULT '',
		comment TEXT DEFAULT '',
		is_sold INTEGER DEFAULT 0,
		scraped_at DATETIME,
		last_seen_at DATETIME,
		sold_at DATETIME
	);
	INSERT INTO cars (
		url, title, brand, model, year, price, price_text, pasajeros, puertas, cilindrada,
		color_exterior, color_interior, combustible, estado, estilo, fecha_ingreso,
		kilometraje, placa, precio_negociable, provincia, se_recibe, transmision, pago_impuestos,
		seller_name, seller_phone, seller_address, comment,
		scraped_at, last_seen_at
	)
	VALUES (
		'https://crautos.com/autosusados/cardetail.cfm?c=1001', 'Toyota Yaris 2020', 'Toyota', 'Yaris', 2020, 14000, '$14,000',
		'', '', '', '', '', '', '', '', '', 0, '', '', '', '', '', '', '', '', '', '',
		'2026-11-01 10:00:00', '2026-11-01 10:00:00'
	);
	`
	if _, err := rawDB.Exec(legacySchema); err != nil {
		rawDB.Close()
		t.Fatalf("legacy schema setup: %v", err)
	}
	rawDB.Close()

	database, err := Init(dbPath)
	if err != nil {
		t.Fatalf("db.Init on legacy DB: %v", err)
	}
	defer database.Close()

	// Verify idx_cars_thumb exists.
	var idxName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cars_thumb'`).Scan(&idxName); err != nil {
		t.Fatalf("expected idx_cars_thumb index after migration: %v", err)
	}

	u1 := "https://crautos.com/autosusados/cardetail.cfm?c=1001"
	u2 := "https://crautos.com/autosusados/cardetail.cfm?c=1002"
	u3 := "https://crautos.com/autosusados/cardetail.cfm?c=1003"

	cars, err := database.GetCars(FilterParams{})
	if err != nil {
		t.Fatalf("GetCars: %v", err)
	}
	if len(cars) != 1 || cars[0].ThumbStatus != ThumbPending {
		t.Fatalf("expected legacy car with ThumbPending (0), got %+v", cars)
	}

	if err := database.SetThumbStatus(u1, ThumbStored); err != nil {
		t.Fatalf("SetThumbStatus: %v", err)
	}

	// Re-scraping via UpsertCar and UpsertCarBatch must NOT reset thumb_status.
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	updated1 := Car{
		URL: u1, Title: "Toyota Yaris 2020 Updated", Brand: "Toyota", Model: "Yaris", Year: 2020, Price: 13800,
		ScrapedAt: now, LastSeenAt: now, ThumbStatus: ThumbPending,
	}
	if err := database.UpsertCar(updated1); err != nil {
		t.Fatalf("UpsertCar: %v", err)
	}

	new2 := Car{URL: u2, Title: "Honda Civic 2021", Brand: "Honda", Model: "Civic", Year: 2021, Price: 19000, ScrapedAt: now, LastSeenAt: now}
	new3 := Car{URL: u3, Title: "Suzuki Swift 2022", Brand: "Suzuki", Model: "Swift", Year: 2022, Price: 15500, ScrapedAt: now, LastSeenAt: now}
	if err := database.UpsertCarBatch([]Car{updated1, new2, new3}); err != nil {
		t.Fatalf("UpsertCarBatch: %v", err)
	}

	byURL, err := database.GetCarsByURLs([]string{u1, u2})
	if err != nil {
		t.Fatalf("GetCarsByURLs: %v", err)
	}
	statusByURL := map[string]int{}
	for _, c := range byURL {
		statusByURL[c.URL] = c.ThumbStatus
	}
	if statusByURL[u1] != ThumbStored {
		t.Errorf("u1 ThumbStatus = %d, want ThumbStored (%d) preserved across upserts", statusByURL[u1], ThumbStored)
	}
	if statusByURL[u2] != ThumbPending {
		t.Errorf("u2 ThumbStatus = %d, want ThumbPending (%d)", statusByURL[u2], ThumbPending)
	}
}

func TestThumbCandidatesAndBackfill(t *testing.T) {
	database, err := Init(filepath.Join(t.TempDir(), "thumbs.db"))
	if err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer database.Close()

	now := time.Date(2026, 11, 14, 18, 0, 0, 0, time.UTC)
	insert := func(url string, scrapedAt time.Time, isSold bool) {
		t.Helper()
		c := Car{
			URL: url, Title: "Toyota Hilux 2021", Brand: "Toyota", Model: "Hilux", Year: 2021, Price: 32000,
			ScrapedAt: scrapedAt, LastSeenAt: scrapedAt,
		}
		if err := database.UpsertCar(c); err != nil {
			t.Fatalf("UpsertCar(%s): %v", url, err)
		}
		if isSold {
			if err := database.MarkSold([]string{url}); err != nil {
				t.Fatalf("MarkSold(%s): %v", url, err)
			}
		}
	}

	uPendingNew := "https://crautos.com/autosusados/cardetail.cfm?c=2001"
	uPendingOld := "https://crautos.com/autosusados/cardetail.cfm?c=2002"
	uSoldPending := "https://crautos.com/autosusados/cardetail.cfm?c=2003"
	uStored := "https://crautos.com/autosusados/cardetail.cfm?c=2004"
	uMissing := "https://crautos.com/autosusados/cardetail.cfm?c=2005"
	uFailedCooldown := "https://crautos.com/autosusados/cardetail.cfm?c=2006"
	uFailedReady := "https://crautos.com/autosusados/cardetail.cfm?c=2007"
	uFailedMaxed := "https://crautos.com/autosusados/cardetail.cfm?c=2008"

	insert(uPendingOld, now.Add(-48*time.Hour), false)
	insert(uPendingNew, now.Add(-2*time.Hour), false)
	insert(uSoldPending, now.Add(-1*time.Hour), true)
	insert(uStored, now.Add(-3*time.Hour), false)
	insert(uMissing, now.Add(-4*time.Hour), false)
	insert(uFailedCooldown, now.Add(-5*time.Hour), false)
	insert(uFailedReady, now.Add(-6*time.Hour), false)
	insert(uFailedMaxed, now.Add(-7*time.Hour), false)

	if err := database.SetThumbStatusAt(uStored, ThumbStored, now.Add(-10*time.Hour)); err != nil {
		t.Fatalf("SetThumbStatusAt stored: %v", err)
	}
	if err := database.SetThumbStatusAt(uMissing, ThumbMissing, now.Add(-10*time.Hour)); err != nil {
		t.Fatalf("SetThumbStatusAt missing: %v", err)
	}
	// Checked 23h ago -> still inside 24h cooldown.
	if err := database.SetThumbStatusAt(uFailedCooldown, ThumbFailed, now.Add(-23*time.Hour)); err != nil {
		t.Fatalf("SetThumbStatusAt cooldown: %v", err)
	}
	// Checked 25h ago -> eligible for retry.
	if err := database.SetThumbStatusAt(uFailedReady, ThumbFailed, now.Add(-25*time.Hour)); err != nil {
		t.Fatalf("SetThumbStatusAt ready: %v", err)
	}
	// Checked >24h ago, but hit MaxThumbTries = 5 -> excluded permanently.
	for i := 0; i < MaxThumbTries; i++ {
		if err := database.SetThumbStatusAt(uFailedMaxed, ThumbFailed, now.Add(-48*time.Hour)); err != nil {
			t.Fatalf("SetThumbStatusAt maxed %d: %v", i, err)
		}
	}

	got, err := database.ThumbCandidatesAt(10, now)
	if err != nil {
		t.Fatalf("ThumbCandidatesAt: %v", err)
	}
	want := []string{uPendingNew, uPendingOld, uFailedReady}
	if len(got) != len(want) {
		t.Fatalf("ThumbCandidatesAt got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("ThumbCandidatesAt[%d] = %q, want %q", i, got[i], want[i])
		}
	}

	// Verify limit is respected.
	limited, err := database.ThumbCandidatesAt(2, now)
	if err != nil {
		t.Fatalf("ThumbCandidatesAt(2): %v", err)
	}
	if len(limited) != 2 || limited[0] != uPendingNew || limited[1] != uPendingOld {
		t.Errorf("ThumbCandidatesAt(2) = %v, want [%s %s]", limited, uPendingNew, uPendingOld)
	}

	// Verify backfill includes pending active first, then pending sold, excluding stored/missing/failed.
	backfill, err := database.ThumbBackfillCandidates(10)
	if err != nil {
		t.Fatalf("ThumbBackfillCandidates: %v", err)
	}
	wantBackfill := []string{uPendingNew, uPendingOld, uSoldPending}
	if len(backfill) != len(wantBackfill) {
		t.Fatalf("ThumbBackfillCandidates got %v, want %v", backfill, wantBackfill)
	}
	for i := range wantBackfill {
		if backfill[i] != wantBackfill[i] {
			t.Errorf("ThumbBackfillCandidates[%d] = %q, want %q", i, backfill[i], wantBackfill[i])
		}
	}
}
