package db

import "testing"

func TestDetectTextFlag(t *testing.T) {
	cases := map[string]string{
		"Se mueve bien pero consume mucho aceite nnecesita reparar motor.": TextFlagCondition,
		"Detalle en la tercera. Por eso el precio. El anda perfectamente":  TextFlagCondition,
		"Se vende para repuestos, motor fundido":                           TextFlagCondition,
		"CHOCADO de la parte trasera":                                      TextFlagCondition,
		"No enciende, batería muerta":                                      TextFlagCondition,
		"Como nuevo impecable, cedo deuda paga ciento ochenta mil al mes.": TextFlagDebt,
		"El vehículo cuenta con un gravamen actualmente.":                  TextFlagDebt,

		// New condition phrase families (positive).
		"Detalles de pintura, doble tracción":                      TextFlagCondition,
		"DETALLES ESTETICOS MOTOR NISSAN":                          TextFlagCondition,
		"Detalles menores en carrocería por eso el valor del auto": TextFlagCondition,
		"Algunos golpes en la carroceria":                          TextFlagCondition,
		"Solo necesita arreglos en carroceria":                     TextFlagCondition,
		"tiene problemas con la turbina de la transmisión":         TextFlagCondition,
		"La caja patina en subida":                                 TextFlagCondition,
		"Vehículo a revisar por mecánico":                          TextFlagCondition,
		"Tiene el block del motor dañado":                          TextFlagCondition,
		"Para proyecto, no camina":                                 TextFlagCondition,
		"Reparar un golpe en el bumper":                            TextFlagCondition,

		// New debt phrase families (positive).
		"Tiene prenda con financiera":          TextFlagDebt,
		"Se vende con embargo":                 TextFlagDebt,
		"Debe marchamos 2025 y 2026":           TextFlagDebt,
		"Para seguir pagando mensualidad baja": TextFlagDebt,

		// Negations and look-alikes must not flag.
		"Nunca chocado, al día, llanta de repuesto nueva": "",
		"Sin gravamen, papeles al día":                    "",
		"No chocado. Excelente estado":                    "",
		"Incluye repuestos originales y mantenimiento":    "",
		"Excelente estado llame y negociamos":             "",
		"Sin detalles de pintura, impecable":              "",
		"Cero golpes en la carrocería":                    "",
		"No tiene problemas de caja":                      "",
		"No presenta detalles estéticos":                  "",
		"Sin ningún detalle mecánico":                     "",
		"Caja recién reparada con garantía":               "",
		"Libre de prenda y sin embargo":                   "",
		"No debe marchamo, todo al día":                   "",
		"Exento de gravamen":                              "",
		"Sin problemas con la turbina":                    "",
		"Vehículo revisado en agencia, no a revisar":      "",
		"": "",
	}
	for comment, want := range cases {
		if got := DetectTextFlag(comment); got != want {
			t.Errorf("DetectTextFlag(%q) = %q, want %q", comment, got, want)
		}
	}
}

func TestIsTypoPrice(t *testing.T) {
	cases := []struct {
		name     string
		price    int
		expected int
		want     bool
	}{
		{"missing zero", 3940, 30290, true},
		{"extra zero", 250000, 20000, true},
		{"low non-10x outlier", 4348, 13845, false},
		{"normal deal", 7000, 10000, false},
		{"zero price", 0, 10000, false},
	}
	for _, c := range cases {
		if got := IsTypoPrice(c.price, c.expected); got != c.want {
			t.Errorf("IsTypoPrice(%d, %d) [%s] = %v, want %v", c.price, c.expected, c.name, got, c.want)
		}
	}
}
