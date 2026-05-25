package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

type Car struct {
	URL                 string
	Title               string
	Brand               string
	Model               string
	Year                int
	Price               int
	PriceText           string
	Pasajeros           string
	Puertas             string
	Cilindrada          string
	ColorExterior       string
	ColorInterior       string
	Combustible         string
	Estado              string
	Estilo              string
	FechaIngreso        string
	Kilometraje         int
	Placa               string
	PrecioNegociable    string
	Provincia           string
	SeRecibe            string
	Transmision         string
	PagoImpuestos       string
	SellerName          string
	SellerPhone         string
	SellerAddress       string
	Comment             string
	Equipments          map[string]bool
	IsSold              bool
	ScrapedAt           time.Time
	LastSeenAt          time.Time
	SoldAt              *time.Time
}

func (d *DB) UpsertCar(car Car) error {
	q := `
	INSERT INTO cars (
		url, title, brand, model, year, price, price_text, pasajeros, puertas, cilindrada,
		color_exterior, color_interior, combustible, estado, estilo, fecha_ingreso,
		kilometraje, placa, precio_negociable, provincia, se_recibe, transmision, pago_impuestos,
		equip_aire_ac, equip_aire_climatizado, equip_alarma, equip_android_auto, equip_apple_carplay,
		equip_aros_lujo, equip_asiento_memoria, equip_asientos_electricos, equip_bluetooth,
		equip_bolsa_aire, equip_caja_dual, equip_cierre_central, equip_computadora, equip_control_crucero,
		equip_control_descenso, equip_radio_volante, equip_estabilidad, equip_camara_360,
		equip_camara_retroceso, equip_desempanador, equip_direccion, equip_espejos_electricos,
		equip_frenos_abs, equip_halogenos, equip_llave_inteligente, equip_xenon, equip_radio_usb,
		equip_retrovisores, equip_revision_tecnica, equip_sensor_lluvia, equip_sensores_retroceso,
		equip_sensores_frontales, equip_sunroof, equip_tapiceria_cuero, equip_turbo,
		equip_vidrios_electricos, equip_vidrios_tintados, equip_volante_ajustable, equip_volante_multifuncional,
		seller_name, seller_phone, seller_address, comment,
		scraped_at, last_seen_at
	) VALUES (
		?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?
	)
	ON CONFLICT(url) DO UPDATE SET
		title=excluded.title,
		brand=excluded.brand,
		model=excluded.model,
		year=excluded.year,
		price=excluded.price,
		price_text=excluded.price_text,
		pasajeros=excluded.pasajeros,
		puertas=excluded.puertas,
		cilindrada=excluded.cilindrada,
		color_exterior=excluded.color_exterior,
		color_interior=excluded.color_interior,
		combustible=excluded.combustible,
		estado=excluded.estado,
		estilo=excluded.estilo,
		fecha_ingreso=excluded.fecha_ingreso,
		kilometraje=excluded.kilometraje,
		placa=excluded.placa,
		precio_negociable=excluded.precio_negociable,
		provincia=excluded.provincia,
		se_recibe=excluded.se_recibe,
		transmision=excluded.transmision,
		pago_impuestos=excluded.pago_impuestos,
		seller_name=excluded.seller_name,
		seller_phone=excluded.seller_phone,
		seller_address=excluded.seller_address,
		comment=excluded.comment,
		is_sold=0,
		last_seen_at=excluded.last_seen_at,
		sold_at=NULL;
	`
	
	car.Title = cleanString(car.Title)
	car.Brand = cleanString(car.Brand)
	car.Model = cleanString(car.Model)
	car.Comment = CleanComment(car.Comment)

	e := func(key string) int {
		if car.Equipments[key] {
			return 1
		}
		return 0
	}

	_, err := d.Exec(d.queryFormat(q),
		car.URL, car.Title, car.Brand, car.Model, car.Year, car.Price, car.PriceText, car.Pasajeros, car.Puertas, car.Cilindrada,
		car.ColorExterior, car.ColorInterior, car.Combustible, car.Estado, car.Estilo, car.FechaIngreso,
		car.Kilometraje, car.Placa, car.PrecioNegociable, car.Provincia, car.SeRecibe, car.Transmision, car.PagoImpuestos,
		e("Aire acondicionado"), e("Aire acondicionado climatizado"), e("Alarma"), e("Android Auto"), e("Apple CarPlay"),
		e("Aros de lujo"), e("Asiento con memoria"), e("Asientos eléctricos"), e("Bluetooth"),
		e("Bolsa de aire"), e("Caja de cambios dual"), e("Cierre central"), e("Computadora de viaje"), e("Control crucero"),
		e("Control de descenso"), e("Control de radio en el volante"), e("Control electrónico de estabilidad"), e("Cámara 360"),
		e("Cámara de retroceso"), e("Desempañador Trasero"), e("Dirección Hidráulica/Electroasistida"), e("Espejos eléctricos"),
		e("Frenos ABS"), e("Halógenos"), e("Llave inteligente/botón de arranque"), e("Luces de Xenón/Bixenón"), e("Radio con USB/AUX"),
		e("Retrovisores auto-retractibles"), e("Revisión Técnica al día"), e("Sensor de lluvia"), e("Sensores de retroceso"),
		e("Sensores frontales"), e("Sunroof/techo panorámico"), e("Tapicería de cuero"), e("Turbo"),
		e("Vidrios eléctricos"), e("Vidrios tintados"), e("Volante ajustable"), e("Volante multifuncional"),
		car.SellerName, car.SellerPhone, car.SellerAddress, car.Comment,
		car.ScrapedAt, car.LastSeenAt,
	)
	return err
}

func (d *DB) MarkSold(urls []string) error {
	if len(urls) == 0 {
		return nil
	}
	
	now := time.Now()
	
	// Create placeholders ?, ?, ?
	placeholders := make([]string, len(urls))
	args := make([]interface{}, len(urls)+1)
	args[0] = now
	for i, u := range urls {
		placeholders[i] = "?"
		args[i+1] = u
	}
	
	q := fmt.Sprintf(`UPDATE cars SET is_sold=1, sold_at=? WHERE url IN (%s)`, strings.Join(placeholders, ","))
	_, err := d.Exec(d.queryFormat(q), args...)
	return err
}

func (d *DB) GetActiveURLs(brand string) ([]string, error) {
	q := `SELECT url FROM cars WHERE LOWER(brand)=LOWER(?) AND is_sold=0`
	rows, err := d.Query(d.queryFormat(q), brand)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, nil
}

func (d *DB) GetActiveURLsByFuel(fuel string) ([]string, error) {
	q := `SELECT url FROM cars WHERE LOWER(combustible) LIKE '%' || LOWER(?) || '%' AND is_sold=0`
	rows, err := d.Query(d.queryFormat(q), fuel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, nil
}

func (d *DB) GetURLsWithoutSeller() ([]string, error) {
	q := `SELECT url FROM cars WHERE is_sold=0 AND (seller_name='' OR seller_name IS NULL)`
	rows, err := d.Query(d.queryFormat(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, nil
}

func (d *DB) GetURLsWithoutComment() ([]string, error) {
	q := `SELECT url FROM cars WHERE is_sold=0 AND (comment='' OR comment IS NULL)`
	rows, err := d.Query(d.queryFormat(q))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, nil
}


func (d *DB) UpdateSeller(url, name, phone, address string) error {
	q := `UPDATE cars SET seller_name=?, seller_phone=?, seller_address=? WHERE url=?`
	_, err := d.Exec(d.queryFormat(q), name, phone, address, url)
	return err
}

func (d *DB) UpdateComment(url, comment string) error {
	cleaned := CleanComment(comment)
	q := `UPDATE cars SET comment=? WHERE url=?`
	_, err := d.Exec(d.queryFormat(q), cleaned, url)
	return err
}

type FilterParams struct {
	Brand        string
	YearMin      int
	YearMax      int
	KmMin        int
	KmMax        int
	PriceMin     int
	PriceMax     int
	Estilo       string
	Transmision  string
	Combustible  string
	Provincia    string
	IsSold       *bool
	Equipments   []string
	Limit        int
	Offset       int
	SortBy       string
	SortDesc     bool
	SortTitle    string
	SortYear     string
	SortPrice    string
	SortKm       string
	TitleQuery   string
	ScrapedFrom  string
	ScrapedTo    string
}

func (d *DB) GetCars(f FilterParams) ([]Car, error) {
	q := `SELECT url, title, brand, model, year, price, price_text, pasajeros, puertas, cilindrada,
		color_exterior, color_interior, combustible, estado, estilo, fecha_ingreso,
		kilometraje, placa, precio_negociable, provincia, se_recibe, transmision, pago_impuestos,
		equip_aire_ac, equip_aire_climatizado, equip_alarma, equip_android_auto, equip_apple_carplay,
		equip_aros_lujo, equip_asiento_memoria, equip_asientos_electricos, equip_bluetooth,
		equip_bolsa_aire, equip_caja_dual, equip_cierre_central, equip_computadora, equip_control_crucero,
		equip_control_descenso, equip_radio_volante, equip_estabilidad, equip_camara_360,
		equip_camara_retroceso, equip_desempanador, equip_direccion, equip_espejos_electricos,
		equip_frenos_abs, equip_halogenos, equip_llave_inteligente, equip_xenon, equip_radio_usb,
		equip_retrovisores, equip_revision_tecnica, equip_sensor_lluvia, equip_sensores_retroceso,
		equip_sensores_frontales, equip_sunroof, equip_tapiceria_cuero, equip_turbo,
		equip_vidrios_electricos, equip_vidrios_tintados, equip_volante_ajustable, equip_volante_multifuncional,
		seller_name, seller_phone, seller_address, comment,
		is_sold, scraped_at, last_seen_at, sold_at FROM cars WHERE 1=1`
	
	var args []interface{}
	
	if f.TitleQuery != "" {
		q += " AND (LOWER(title) LIKE ? OR LOWER(brand) LIKE ?)"
		
		// Convert * to % and ? to _
		query := strings.ReplaceAll(f.TitleQuery, "*", "%")
		query = strings.ReplaceAll(query, "?", "_")
		
		// If no wildcards are provided, default to a "contains" search
		if !strings.Contains(query, "%") && !strings.Contains(query, "_") {
			query = "%" + query + "%"
		}
		
		query = strings.ToLower(query)
		args = append(args, query, query)
	}
	
	if f.Brand != "" {
		q += " AND brand = ?"
		args = append(args, f.Brand)
	}
	if f.YearMin > 0 {
		q += " AND year >= ?"
		args = append(args, f.YearMin)
	}
	if f.YearMax > 0 {
		q += " AND year <= ?"
		args = append(args, f.YearMax)
	}
	if f.KmMin > 0 {
		q += " AND kilometraje >= ?"
		args = append(args, f.KmMin)
	}
	if f.KmMax > 0 {
		q += " AND kilometraje <= ?"
		args = append(args, f.KmMax)
	}
	if f.PriceMin > 0 {
		q += " AND price >= ?"
		args = append(args, f.PriceMin)
	}
	if f.PriceMax > 0 {
		q += " AND price <= ?"
		args = append(args, f.PriceMax)
	}
	if f.Estilo != "" {
		q += " AND estilo = ?"
		args = append(args, f.Estilo)
	}
	if f.Transmision != "" {
		q += " AND transmision = ?"
		args = append(args, f.Transmision)
	}
	if f.Combustible != "" {
		q += " AND combustible = ?"
		args = append(args, f.Combustible)
	}
	if f.Provincia != "" {
		q += " AND provincia = ?"
		args = append(args, f.Provincia)
	}
	if f.IsSold != nil {
		q += " AND is_sold = ?"
		if *f.IsSold {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	if f.ScrapedFrom != "" {
		q += " AND scraped_at >= ?"
		args = append(args, f.ScrapedFrom)
	}
	if f.ScrapedTo != "" {
		q += " AND scraped_at <= ?"
		args = append(args, f.ScrapedTo+" 23:59:59")
	}
	
	// Handle equipments map mapping to DB column
	equipMap := map[string]string{
		"Aire acondicionado": "equip_aire_ac",
		"Aire acondicionado climatizado": "equip_aire_climatizado",
		"Alarma": "equip_alarma",
		"Android Auto": "equip_android_auto",
		"Apple CarPlay": "equip_apple_carplay",
		"Aros de lujo": "equip_aros_lujo",
		"Asiento con memoria": "equip_asiento_memoria",
		"Asientos eléctricos": "equip_asientos_electricos",
		"Bluetooth": "equip_bluetooth",
		"Bolsa de aire": "equip_bolsa_aire",
		"Caja de cambios dual": "equip_caja_dual",
		"Cierre central": "equip_cierre_central",
		"Computadora de viaje": "equip_computadora",
		"Control crucero": "equip_control_crucero",
		"Control de descenso": "equip_control_descenso",
		"Control de radio en el volante": "equip_radio_volante",
		"Control electrónico de estabilidad": "equip_estabilidad",
		"Cámara 360": "equip_camara_360",
		"Cámara de retroceso": "equip_camara_retroceso",
		"Desempañador Trasero": "equip_desempanador",
		"Dirección Hidráulica/Electroasistida": "equip_direccion",
		"Espejos eléctricos": "equip_espejos_electricos",
		"Frenos ABS": "equip_frenos_abs",
		"Halógenos": "equip_halogenos",
		"Llave inteligente/botón de arranque": "equip_llave_inteligente",
		"Luces de Xenón/Bixenón": "equip_xenon",
		"Radio con USB/AUX": "equip_radio_usb",
		"Retrovisores auto-retractibles": "equip_retrovisores",
		"Revisión Técnica al día": "equip_revision_tecnica",
		"Sensor de lluvia": "equip_sensor_lluvia",
		"Sensores de retroceso": "equip_sensores_retroceso",
		"Sensores frontales": "equip_sensores_frontales",
		"Sunroof/techo panorámico": "equip_sunroof",
		"Tapicería de cuero": "equip_tapiceria_cuero",
		"Turbo": "equip_turbo",
		"Vidrios eléctricos": "equip_vidrios_electricos",
		"Vidrios tintados": "equip_vidrios_tintados",
		"Volante ajustable": "equip_volante_ajustable",
		"Volante multifuncional": "equip_volante_multifuncional",
	}

	for _, eq := range f.Equipments {
		if col, ok := equipMap[eq]; ok {
			q += fmt.Sprintf(" AND %s = 1", col)
		}
	}

	if f.SortTitle == "" && f.SortYear == "" && f.SortPrice == "" && f.SortKm == "" {
		sortCol := "scraped_at"
		switch f.SortBy {
		case "year": sortCol = "year"
		case "price": sortCol = "price"
		case "kilometraje": sortCol = "kilometraje"
		case "brand": sortCol = "brand"
		}

		dir := "DESC"
		if !f.SortDesc {
			dir = "ASC"
		}
		q += fmt.Sprintf(" ORDER BY %s %s", sortCol, dir)
	} else {
		var sortParts []string
		if f.SortTitle == "asc" || f.SortTitle == "desc" {
			sortParts = append(sortParts, "title "+strings.ToUpper(f.SortTitle))
		}
		if f.SortYear == "asc" || f.SortYear == "desc" {
			sortParts = append(sortParts, "year "+strings.ToUpper(f.SortYear))
		}
		if f.SortPrice == "asc" || f.SortPrice == "desc" {
			sortParts = append(sortParts, "price "+strings.ToUpper(f.SortPrice))
		}
		if f.SortKm == "asc" || f.SortKm == "desc" {
			sortParts = append(sortParts, "kilometraje "+strings.ToUpper(f.SortKm))
		}
		if len(sortParts) > 0 {
			q += " ORDER BY " + strings.Join(sortParts, ", ")
		}
	}
	
	if f.Limit > 0 {
		q += " LIMIT ?"
		args = append(args, f.Limit)
		if f.Offset > 0 {
			q += " OFFSET ?"
			args = append(args, f.Offset)
		}
	}

	log.Printf("[DB] GetCars SQL: %s | args: %v", d.queryFormat(q), args)
	rows, err := d.Query(d.queryFormat(q), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cars []Car
	for rows.Next() {
		var c Car
		var isSold int
		var soldAt sql.NullTime
		
		eMap := make(map[string]bool)
		var e_aire_ac, e_aire_climatizado, e_alarma, e_android_auto, e_apple_carplay, e_aros_lujo, e_asiento_memoria, e_asientos_electricos, e_bluetooth, e_bolsa_aire, e_caja_dual, e_cierre_central, e_computadora, e_control_crucero, e_control_descenso, e_radio_volante, e_estabilidad, e_camara_360, e_camara_retroceso, e_desempanador, e_direccion, e_espejos_electricos, e_frenos_abs, e_halogenos, e_llave_inteligente, e_xenon, e_radio_usb, e_retrovisores, e_revision_tecnica, e_sensor_lluvia, e_sensores_retroceso, e_sensores_frontales, e_sunroof, e_tapiceria_cuero, e_turbo, e_vidrios_electricos, e_vidrios_tintados, e_volante_ajustable, e_volante_multifuncional int
		
		if err := rows.Scan(
			&c.URL, &c.Title, &c.Brand, &c.Model, &c.Year, &c.Price, &c.PriceText, &c.Pasajeros, &c.Puertas, &c.Cilindrada,
			&c.ColorExterior, &c.ColorInterior, &c.Combustible, &c.Estado, &c.Estilo, &c.FechaIngreso,
			&c.Kilometraje, &c.Placa, &c.PrecioNegociable, &c.Provincia, &c.SeRecibe, &c.Transmision, &c.PagoImpuestos,
			&e_aire_ac, &e_aire_climatizado, &e_alarma, &e_android_auto, &e_apple_carplay, &e_aros_lujo, &e_asiento_memoria, &e_asientos_electricos, &e_bluetooth, &e_bolsa_aire, &e_caja_dual, &e_cierre_central, &e_computadora, &e_control_crucero, &e_control_descenso, &e_radio_volante, &e_estabilidad, &e_camara_360, &e_camara_retroceso, &e_desempanador, &e_direccion, &e_espejos_electricos, &e_frenos_abs, &e_halogenos, &e_llave_inteligente, &e_xenon, &e_radio_usb, &e_retrovisores, &e_revision_tecnica, &e_sensor_lluvia, &e_sensores_retroceso, &e_sensores_frontales, &e_sunroof, &e_tapiceria_cuero, &e_turbo, &e_vidrios_electricos, &e_vidrios_tintados, &e_volante_ajustable, &e_volante_multifuncional,
			&c.SellerName, &c.SellerPhone, &c.SellerAddress, &c.Comment,
			&isSold, &c.ScrapedAt, &c.LastSeenAt, &soldAt,
		); err != nil {
			return nil, err
		}
		
		c.IsSold = isSold == 1
		if soldAt.Valid {
			c.SoldAt = &soldAt.Time
		}
		if c.Comment == "-" {
			c.Comment = ""
		}
		
		if e_aire_ac == 1 { eMap["Aire acondicionado"] = true }
		if e_aire_climatizado == 1 { eMap["Aire acondicionado climatizado"] = true }
		if e_alarma == 1 { eMap["Alarma"] = true }
		if e_android_auto == 1 { eMap["Android Auto"] = true }
		if e_apple_carplay == 1 { eMap["Apple CarPlay"] = true }
		if e_aros_lujo == 1 { eMap["Aros de lujo"] = true }
		if e_asiento_memoria == 1 { eMap["Asiento con memoria"] = true }
		if e_asientos_electricos == 1 { eMap["Asientos eléctricos"] = true }
		if e_bluetooth == 1 { eMap["Bluetooth"] = true }
		if e_bolsa_aire == 1 { eMap["Bolsa de aire"] = true }
		if e_caja_dual == 1 { eMap["Caja de cambios dual"] = true }
		if e_cierre_central == 1 { eMap["Cierre central"] = true }
		if e_computadora == 1 { eMap["Computadora de viaje"] = true }
		if e_control_crucero == 1 { eMap["Control crucero"] = true }
		if e_control_descenso == 1 { eMap["Control de descenso"] = true }
		if e_radio_volante == 1 { eMap["Control de radio en el volante"] = true }
		if e_estabilidad == 1 { eMap["Control electrónico de estabilidad"] = true }
		if e_camara_360 == 1 { eMap["Cámara 360"] = true }
		if e_camara_retroceso == 1 { eMap["Cámara de retroceso"] = true }
		if e_desempanador == 1 { eMap["Desempañador Trasero"] = true }
		if e_direccion == 1 { eMap["Dirección Hidráulica/Electroasistida"] = true }
		if e_espejos_electricos == 1 { eMap["Espejos eléctricos"] = true }
		if e_frenos_abs == 1 { eMap["Frenos ABS"] = true }
		if e_halogenos == 1 { eMap["Halógenos"] = true }
		if e_llave_inteligente == 1 { eMap["Llave inteligente/botón de arranque"] = true }
		if e_xenon == 1 { eMap["Luces de Xenón/Bixenón"] = true }
		if e_radio_usb == 1 { eMap["Radio con USB/AUX"] = true }
		if e_retrovisores == 1 { eMap["Retrovisores auto-retractibles"] = true }
		if e_revision_tecnica == 1 { eMap["Revisión Técnica al día"] = true }
		if e_sensor_lluvia == 1 { eMap["Sensor de lluvia"] = true }
		if e_sensores_retroceso == 1 { eMap["Sensores de retroceso"] = true }
		if e_sensores_frontales == 1 { eMap["Sensores frontales"] = true }
		if e_sunroof == 1 { eMap["Sunroof/techo panorámico"] = true }
		if e_tapiceria_cuero == 1 { eMap["Tapicería de cuero"] = true }
		if e_turbo == 1 { eMap["Turbo"] = true }
		if e_vidrios_electricos == 1 { eMap["Vidrios eléctricos"] = true }
		if e_vidrios_tintados == 1 { eMap["Vidrios tintados"] = true }
		if e_volante_ajustable == 1 { eMap["Volante ajustable"] = true }
		if e_volante_multifuncional == 1 { eMap["Volante multifuncional"] = true }

		c.Equipments = eMap
		cars = append(cars, c)
	}

	return cars, nil
}

func (d *DB) GetFilteredBrands(f FilterParams) ([]string, error) {
	q := `SELECT DISTINCT brand FROM cars WHERE brand != ''`
	var args []interface{}

	if f.TitleQuery != "" {
		q += " AND (LOWER(title) LIKE ? OR LOWER(brand) LIKE ?)"
		query := strings.ReplaceAll(f.TitleQuery, "*", "%")
		query = strings.ReplaceAll(query, "?", "_")
		if !strings.Contains(query, "%") && !strings.Contains(query, "_") {
			query = "%" + query + "%"
		}
		query = strings.ToLower(query)
		args = append(args, query, query)
	}
	if f.KmMax > 0 {
		q += " AND kilometraje <= ?"
		args = append(args, f.KmMax)
	}
	if f.KmMin > 0 {
		q += " AND kilometraje >= ?"
		args = append(args, f.KmMin)
	}
	if f.PriceMax > 0 {
		q += " AND price <= ?"
		args = append(args, f.PriceMax)
	}
	if f.PriceMin > 0 {
		q += " AND price >= ?"
		args = append(args, f.PriceMin)
	}
	if f.IsSold != nil {
		q += " AND is_sold = ?"
		if *f.IsSold {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	if f.Provincia != "" {
		q += " AND provincia = ?"
		args = append(args, f.Provincia)
	}
	if f.ScrapedFrom != "" {
		q += " AND scraped_at >= ?"
		args = append(args, f.ScrapedFrom)
	}
	if f.ScrapedTo != "" {
		q += " AND scraped_at <= ?"
		args = append(args, f.ScrapedTo+" 23:59:59")
	}

	q += " ORDER BY brand ASC"

	rows, err := d.Query(d.queryFormat(q), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var brands []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err == nil {
			brands = append(brands, b)
		}
	}
	return brands, nil
}

func (d *DB) GetCarsByURLs(urls []string) ([]Car, error) {
	if len(urls) == 0 {
		return []Car{}, nil
	}

	placeholders := make([]string, len(urls))
	args := make([]interface{}, len(urls))
	for i, u := range urls {
		placeholders[i] = "?"
		args[i] = u
	}

	q := fmt.Sprintf(`SELECT url, title, brand, model, year, price, price_text, pasajeros, puertas, cilindrada,
		color_exterior, color_interior, combustible, estado, estilo, fecha_ingreso,
		kilometraje, placa, precio_negociable, provincia, se_recibe, transmision, pago_impuestos,
		equip_aire_ac, equip_aire_climatizado, equip_alarma, equip_android_auto, equip_apple_carplay,
		equip_aros_lujo, equip_asiento_memoria, equip_asientos_electricos, equip_bluetooth,
		equip_bolsa_aire, equip_caja_dual, equip_cierre_central, equip_computadora, equip_control_crucero,
		equip_control_descenso, equip_radio_volante, equip_estabilidad, equip_camara_360,
		equip_camara_retroceso, equip_desempanador, equip_direccion, equip_espejos_electricos,
		equip_frenos_abs, equip_halogenos, equip_llave_inteligente, equip_xenon, equip_radio_usb,
		equip_retrovisores, equip_revision_tecnica, equip_sensor_lluvia, equip_sensores_retroceso,
		equip_sensores_frontales, equip_sunroof, equip_tapiceria_cuero, equip_turbo,
		equip_vidrios_electricos, equip_vidrios_tintados, equip_volante_ajustable, equip_volante_multifuncional,
		seller_name, seller_phone, seller_address, comment,
		is_sold, scraped_at, last_seen_at, sold_at FROM cars WHERE url IN (%s)
		ORDER BY year DESC, price ASC`, strings.Join(placeholders, ","))

	rows, err := d.Query(d.queryFormat(q), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cars []Car
	for rows.Next() {
		var c Car
		var isSold int
		var soldAt sql.NullTime

		eMap := make(map[string]bool)
		var e_aire_ac, e_aire_climatizado, e_alarma, e_android_auto, e_apple_carplay, e_aros_lujo, e_asiento_memoria, e_asientos_electricos, e_bluetooth, e_bolsa_aire, e_caja_dual, e_cierre_central, e_computadora, e_control_crucero, e_control_descenso, e_radio_volante, e_estabilidad, e_camara_360, e_camara_retroceso, e_desempanador, e_direccion, e_espejos_electricos, e_frenos_abs, e_halogenos, e_llave_inteligente, e_xenon, e_radio_usb, e_retrovisores, e_revision_tecnica, e_sensor_lluvia, e_sensores_retroceso, e_sensores_frontales, e_sunroof, e_tapiceria_cuero, e_turbo, e_vidrios_electricos, e_vidrios_tintados, e_volante_ajustable, e_volante_multifuncional int

		if err := rows.Scan(
			&c.URL, &c.Title, &c.Brand, &c.Model, &c.Year, &c.Price, &c.PriceText, &c.Pasajeros, &c.Puertas, &c.Cilindrada,
			&c.ColorExterior, &c.ColorInterior, &c.Combustible, &c.Estado, &c.Estilo, &c.FechaIngreso,
			&c.Kilometraje, &c.Placa, &c.PrecioNegociable, &c.Provincia, &c.SeRecibe, &c.Transmision, &c.PagoImpuestos,
			&e_aire_ac, &e_aire_climatizado, &e_alarma, &e_android_auto, &e_apple_carplay, &e_aros_lujo, &e_asiento_memoria, &e_asientos_electricos, &e_bluetooth, &e_bolsa_aire, &e_caja_dual, &e_cierre_central, &e_computadora, &e_control_crucero, &e_control_descenso, &e_radio_volante, &e_estabilidad, &e_camara_360, &e_camara_retroceso, &e_desempanador, &e_direccion, &e_espejos_electricos, &e_frenos_abs, &e_halogenos, &e_llave_inteligente, &e_xenon, &e_radio_usb, &e_retrovisores, &e_revision_tecnica, &e_sensor_lluvia, &e_sensores_retroceso, &e_sensores_frontales, &e_sunroof, &e_tapiceria_cuero, &e_turbo, &e_vidrios_electricos, &e_vidrios_tintados, &e_volante_ajustable, &e_volante_multifuncional,
			&c.SellerName, &c.SellerPhone, &c.SellerAddress, &c.Comment,
			&isSold, &c.ScrapedAt, &c.LastSeenAt, &soldAt,
		); err != nil {
			return nil, err
		}

		c.IsSold = isSold == 1
		if soldAt.Valid {
			c.SoldAt = &soldAt.Time
		}
		if c.Comment == "-" {
			c.Comment = ""
		}

		if e_aire_ac == 1 { eMap["Aire acondicionado"] = true }
		if e_aire_climatizado == 1 { eMap["Aire acondicionado climatizado"] = true }
		if e_alarma == 1 { eMap["Alarma"] = true }
		if e_android_auto == 1 { eMap["Android Auto"] = true }
		if e_apple_carplay == 1 { eMap["Apple CarPlay"] = true }
		if e_aros_lujo == 1 { eMap["Aros de lujo"] = true }
		if e_asiento_memoria == 1 { eMap["Asiento con memoria"] = true }
		if e_asientos_electricos == 1 { eMap["Asientos eléctricos"] = true }
		if e_bluetooth == 1 { eMap["Bluetooth"] = true }
		if e_bolsa_aire == 1 { eMap["Bolsa de aire"] = true }
		if e_caja_dual == 1 { eMap["Caja de cambios dual"] = true }
		if e_cierre_central == 1 { eMap["Cierre central"] = true }
		if e_computadora == 1 { eMap["Computadora de viaje"] = true }
		if e_control_crucero == 1 { eMap["Control crucero"] = true }
		if e_control_descenso == 1 { eMap["Control de descenso"] = true }
		if e_radio_volante == 1 { eMap["Control de radio en el volante"] = true }
		if e_estabilidad == 1 { eMap["Control electrónico de estabilidad"] = true }
		if e_camara_360 == 1 { eMap["Cámara 360"] = true }
		if e_camara_retroceso == 1 { eMap["Cámara de retroceso"] = true }
		if e_desempanador == 1 { eMap["Desempañador Trasero"] = true }
		if e_direccion == 1 { eMap["Dirección Hidráulica/Electroasistida"] = true }
		if e_espejos_electricos == 1 { eMap["Espejos eléctricos"] = true }
		if e_frenos_abs == 1 { eMap["Frenos ABS"] = true }
		if e_halogenos == 1 { eMap["Halógenos"] = true }
		if e_llave_inteligente == 1 { eMap["Llave inteligente/botón de arranque"] = true }
		if e_xenon == 1 { eMap["Luces de Xenón/Bixenón"] = true }
		if e_radio_usb == 1 { eMap["Radio con USB/AUX"] = true }
		if e_retrovisores == 1 { eMap["Retrovisores auto-retractibles"] = true }
		if e_revision_tecnica == 1 { eMap["Revisión Técnica al día"] = true }
		if e_sensor_lluvia == 1 { eMap["Sensor de lluvia"] = true }
		if e_sensores_retroceso == 1 { eMap["Sensores de retroceso"] = true }
		if e_sensores_frontales == 1 { eMap["Sensores frontales"] = true }
		if e_sunroof == 1 { eMap["Sunroof/techo panorámico"] = true }
		if e_tapiceria_cuero == 1 { eMap["Tapicería de cuero"] = true }
		if e_turbo == 1 { eMap["Turbo"] = true }
		if e_vidrios_electricos == 1 { eMap["Vidrios eléctricos"] = true }
		if e_vidrios_tintados == 1 { eMap["Vidrios tintados"] = true }
		if e_volante_ajustable == 1 { eMap["Volante ajustable"] = true }
		if e_volante_multifuncional == 1 { eMap["Volante multifuncional"] = true }

		c.Equipments = eMap
		cars = append(cars, c)
	}

	return cars, nil
}
