# CrautosDB – Próximas mejoras y evolución del producto

Backlog estratégico de nuevas funcionalidades y diferenciadores para continuar evolucionando **CrautosDB** una vez completado el roadmap base ([ux-improvements.md](./ux-improvements.md)) y la arquitectura/CI ([improvements.md](./improvements.md)).

**Cómo usarlo:** las iniciativas están priorizadas por **ganancia ÷ esfuerzo** (de arriba hacia abajo). Al completar cada mejora se marca `[x]` y se registra fecha y detalles técnicos en la tabla **Hecho**.

Esfuerzo: 🟢 bajo (≤ ½ día) · 🟡 medio (1–2 días) · 🔴 alto (3+ días o infraestructura nueva)

Última actualización: 2026-11-13

Leyenda: `[ ]` pendiente · `[~]` parcial · `[x]` hecho

---

## 📌 Orden sugerido de ejecución

1. **Próxima tanda rápida (sin infraestructura nueva):** implementar juntos **#1 Curva de depreciación**, **#2 Copilot Negociador CR** y **#3 Filtro de anuncios estancados / #4 PWA**. Reutilizan los cálculos y datos ya presentes en memoria (`MarketIndex`, `price_history`, estimador CR).
2. **Siguiente salto de retención:** **#5 Alertas guardadas — Etapa 2 (Bot de Telegram / Email)** para que los usuarios regresen de forma automática cuando entra el carro que buscan.
3. **Diferenciadores exclusivos CR + tráfico orgánico:** **#6 Calculadora "Cambiar mi carro"**, **#7 TCO 3 años** y **#9 Landing SEO + `sitemap.xml`**.

---

## 🥇 Fase 1 — Alto impacto con la infraestructura actual (`🟢`–`🟡`, cero servicios externos)

| ✓ | Mejora | Qué ganamos y cómo implementarla | Esfuerzo |
|---|---|---|---|
| [ ] | **1. Curva de depreciación por modelo y "año dulce" de compra** | En `ValuatePage.jsx` y `StatsPage.jsx`, mostrar cómo evoluciona la mediana y la banda P25–P75 de un modelo año tras año (ej. *Toyota RAV4 2016 → 2025*), la caída porcentual anual y qué año ofrece el mayor salto precio/antigüedad. **Backend:** nuevo endpoint `GET /api/depreciation?brand=&model=` leyendo directo del `MarketIndex` en memoria (0 consultas SQL extra por request). | 🟢–🟡 |
| [ ] | **2. Copilot Negociador CR + mensajes de oferta por WhatsApp** | Pasar automáticamente al contexto del LLM (`/api/ai/compare` y `AICopilotWindow.jsx`) las señales reales que ya calcula CrautosDB: mediana ajustada `MarketExpected`, percentiles `P25`/`P75`, días publicado (`FechaIngreso`/`ScrapedAt`), historial de rebajas (`PriceInitial` → `Price`), `SellerActiveCount`, `MarketFlag` y estimación CR (llave en mano, marchamo, `PagoImpuestos`). Sumar chips de prompt en 1 clic: *"¿Cuánto ofertar de contado?"*, *"Checklist mecánico de este modelo"* y *"Redactar mensaje de oferta para WhatsApp"*. | 🟢–🟡 |
| [ ] | **3. Filtro de "Vendedores motivados / anuncios estancados"** | Detectar oportunidades reales de negociación: vehículos activos con ≥ 45 días publicados y/o ≥ 2 rebajas registradas en `price_history`. Agregar un chip rápido en `CarsPage.jsx`, filtro opcional en `FiltersModal.jsx` + `db/queries.go` y badge sutil en `CarCard.jsx` (`📅 60+ días · 2 rebajas`). | 🟢 |
| [ ] | **4. PWA instalable en celular (`manifest.webmanifest`)** | Permitir instalar CrautosDB en la pantalla de inicio en Android y iOS (`display: standalone`, íconos adaptables/maskable, tema dark/light). Service Worker mínimo que cachea únicamente los bundles estáticos con hash de Vite (`dist/assets/*`) y deja siempre en vivo los requests `/api/*` y `/index.html` para nunca mostrar precios desactualizados. | 🟢 |

---

## 🥈 Fase 2 — Retención recurrente y diferenciadores únicos CR (`🟡`–`🔴`)

| ✓ | Mejora | Qué ganamos y cómo implementarla | Esfuerzo |
|---|---|---|---|
| [ ] | **5. Alertas guardadas — Etapa 2: Bot de Telegram (y/o Email con link mágico)** | Completa la Prioridad 2 de [ux-improvements.md](./ux-improvements.md). Suscripción sin crear cuenta mediante deep-link en 1 clic (`t.me/<bot>?start=<search_token>`) desde `CarsPage.jsx`, `FiltersModal.jsx` o `FavoritesPage.jsx`. **Backend/Job:** nueva tabla `alert_subscriptions` (`channel`, `target`, `query`, `last_notified_at`, `unsubscribe_token`) evaluada al final del job diario `crautosdb-scrape-daily` usando la misma lógica de `HandleSearchesDigest` para enviar avisos de autos nuevos y rebajas. | 🔴 |
| [ ] | **6. Calculadora "Cambiar mi carro" (Upgrade / Parte de pago)** | Flujo para quien vende su auto actual y busca darlo en parte de pago o financiar la diferencia: cruza el valor del carro actual en el Tasador (`P25` entrega rápida en agencia vs. `Mediana` venta directa) con el efectivo adicional o cuota mensual deseada, y filtra en `/api/cars` vehículos activos con `SeRecibe` disponible dentro del diferencial real (incluyendo traspaso estimado). | 🟡 |
| [ ] | **7. Costo Total de Propiedad a 3 años (TCO CR: Gasolina vs. Híbrido vs. Eléctrico)** | Extender `CostEstimatorCard.jsx` y `CompareWidget.jsx` con un simulador opcional de uso mensual (km/mes) para proyectar el gasto total a 36 meses en Costa Rica: energía (tarifa residencial CNFL/ICE estimada vs. consumo promedio por segmento/cilindrada), marchamo anual proyectado, traspaso inicial y depreciación esperada por año según los datos históricos reales de CrautosDB. | 🟡 |
| [ ] | **8. Ficha de reputación e inventario por vendedor o agencia** | Al filtrar por un vendedor con múltiples anuncios (`SellerActiveCount >= 2` desde `CarDetailsModal.jsx`), mostrar un resumen superior en `CarsPage.jsx` (`GET /api/sellers/summary?name=...`): inventario activo, vehículos vendidos históricos, diferencia promedio frente al precio justo de mercado del catálogo y tiempo mediano que tardan sus anuncios en salir. | 🟡 |

---

## 🥉 Fase 3 — Adquisición orgánica (SEO) y blindaje técnico (`🟢`–`🟡`)

| ✓ | Mejora | Qué ganamos y cómo implementarla | Esfuerzo |
|---|---|---|---|
| [ ] | **9. Landing dinámica SEO + `sitemap.xml` y datos estructurados (`JSON-LD`)** | Capturar búsquedas orgánicas de Google (*"precio Toyota RAV4 usado Costa Rica"*, *"cuánto vale un Suzuki Jimny 2022"*). Servir `sitemap.xml` dinámico por marca/modelo desde Go y enriquecer `api/opengraph.go` (`RenderIndexHTML`) cuando llegan parámetros `?tab=valuate&brand=...&model=...` o filtros por marca/modelo con meta descripciones con rangos reales y bloques `application/ld+json` (`AggregateOffer`). | 🟡 |
| [ ] | **10. Fotos — Fase 2: Miniaturas persistentes en Cloud Storage** | Preservar miniaturas (`-t.jpg`) en GCS para vendidos, historial y favoritos antiguos y acelerar la carga repetida. **Plan técnico completo:** [fotos-miniaturas-cloud-storage.md](./fotos-miniaturas-cloud-storage.md) (**requiere completar primero el Paso 0** de términos de uso y permiso). | 🟡 |
| [x] | **11. Tests unitarios de frontend (`Vitest`) + `golangci-lint` en CI** | Agregar suite `Vitest` para cubrir `crCostEstimator.js`, `marketDeal.js`, `priceHistory.js` y `urlState.js` dentro de la etapa de build del `Dockerfile`, y evaluar sumar `golangci-lint` junto a `gofmt`, `go vet` y `go test -count=1` (ver [improvements.md](./improvements.md#L103-L106)). Ver Hecho (2026-11-13). | 🟢 |

---

## ✅ Hecho

| Fecha | Mejora | Notas |
|---|---|---|
| 2026-11-13 | **11. Tests unitarios de frontend (`Vitest`) + `golangci-lint` en CI** | 4 suites `Vitest` (119 tests: `crCostEstimator`, `urlState`, `marketDeal`, `priceHistory`/`crVehicleInfo`), `.golangci.yml` v2 (`bodyclose`, `errorlint`) y gates `npm test` + `golangci-lint run` en `Dockerfile`. |
