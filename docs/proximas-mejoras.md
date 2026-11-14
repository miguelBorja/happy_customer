# CrautosDB – Próximas mejoras y evolución del producto

Backlog estratégico de nuevas funcionalidades y diferenciadores para continuar evolucionando **CrautosDB** una vez completado el roadmap base ([ux-improvements.md](./ux-improvements.md)) y la arquitectura/CI ([improvements.md](./improvements.md)).

**Cómo usarlo:** las iniciativas están priorizadas por **ganancia ÷ esfuerzo** (de arriba hacia abajo). Al completar cada mejora se marca `[x]` y se registra fecha y detalles técnicos en la tabla **Hecho**.

Esfuerzo: 🟢 bajo (≤ ½ día) · 🟡 medio (1–2 días) · 🔴 alto (3+ días o infraestructura nueva)

Última actualización: 2026-11-14

Leyenda: `[ ]` pendiente · `[~]` parcial · `[x]` hecho

---

## 📌 Orden sugerido de ejecución

1. **~~Fase 1 (#1–#4) y Fase 2 local (#6–#8) completadas (2026-11-14)~~:** curva de depreciación, Copilot Negociador CR, vendedores motivados, PWA instalable, calculadora "Cambiar mi carro", TCO 3 años y ficha de reputación por vendedor ya están implementados y verificados localmente.
2. **Tráfico orgánico inmediato:** **#9 Landing dinámica SEO + `sitemap.xml` + `JSON-LD`**.
3. **Retención recurrente e infraestructura:** **#5 Alertas guardadas — Etapa 2 (Telegram / Email)** y **#10 Fotos Fase 2 en Cloud Storage** (sujeto al Paso 0).

---

## 🥇 Fase 1 — Alto impacto con la infraestructura actual (`🟢`–`🟡`, cero servicios externos) — ✅ Completa

| ✓ | Mejora | Qué ganamos y cómo implementarla | Esfuerzo |
|---|---|---|---|
| [x] | **1. Curva de depreciación por modelo y "año dulce" de compra** | En `ValuatePage.jsx` y `StatsPage.jsx`, mostrar cómo evoluciona la mediana y la banda P25–P75 de un modelo año tras año (ej. *Toyota RAV4 2016 → 2025*), la caída porcentual anual y qué año ofrece el mayor salto precio/antigüedad. **Backend:** nuevo endpoint `GET /api/depreciation?brand=&model=` leyendo directo del `MarketIndex` en memoria (0 consultas SQL extra por request). Ver Hecho (2026-11-14). | 🟢–🟡 |
| [x] | **2. Copilot Negociador CR + mensajes de oferta por WhatsApp** | Pasar automáticamente al contexto del LLM (`/api/ai/compare` y `AICopilotWindow.jsx`) las señales reales que ya calcula CrautosDB: mediana ajustada `MarketExpected`, percentiles `P25`/`P75`, días publicado (`FechaIngreso`/`ScrapedAt`), historial de rebajas (`PriceInitial` → `Price`), `SellerActiveCount`, `MarketFlag` y estimación CR (llave en mano, marchamo, `PagoImpuestos`). Sumar chips de prompt en 1 clic: *"Oferta de contado"*, *"Qué revisar"* y *"WhatsApp oferta"*. Ver Hecho (2026-11-14). | 🟢–🟡 |
| [x] | **3. Filtro de "Vendedores motivados / anuncios estancados"** | Detectar oportunidades reales de negociación: vehículos activos con ≥ 45 días publicados y/o ≥ 2 rebajas registradas en `price_history`. Agregar un chip rápido en `CarsPage.jsx`, filtro opcional en `FiltersModal.jsx` + `db/queries.go` y badge sutil en `CarCard.jsx` (`📅 60d · 2 rebajas`). Ver Hecho (2026-11-14). | 🟢 |
| [x] | **4. PWA instalable en celular (`manifest.webmanifest`)** | Permitir instalar CrautosDB en la pantalla de inicio en Android y iOS (`display: standalone`, íconos adaptables/maskable, tema dark/light). Service Worker mínimo que cachea únicamente los bundles estáticos con hash de Vite (`dist/assets/*`) y deja siempre en vivo los requests `/api/*` y `/index.html` para nunca mostrar precios desactualizados. Ver Hecho (2026-11-14). | 🟢 |

---

## 🥈 Fase 2 — Retención recurrente y diferenciadores únicos CR (`🟡`–`🔴`)

| ✓ | Mejora | Qué ganamos y cómo implementarla | Esfuerzo |
|---|---|---|---|
| [ ] | **5. Alertas guardadas — Etapa 2: Bot de Telegram (y/o Email con link mágico)** | Completa la Prioridad 2 de [ux-improvements.md](./ux-improvements.md). Suscripción sin crear cuenta mediante deep-link en 1 clic (`t.me/<bot>?start=<search_token>`) desde `CarsPage.jsx`, `FiltersModal.jsx` o `FavoritesPage.jsx`. **Backend/Job:** nueva tabla `alert_subscriptions` (`channel`, `target`, `query`, `last_notified_at`, `unsubscribe_token`) evaluada al final del job diario `crautosdb-scrape-daily` usando la misma lógica de `HandleSearchesDigest` para enviar avisos de autos nuevos y rebajas. | 🔴 |
| [x] | **6. Calculadora "Cambiar mi carro" (Upgrade / Parte de pago)** | Flujo para quien vende su auto actual y busca darlo en parte de pago o financiar la diferencia: cruza el valor del carro actual en el Tasador (`P25` entrega rápida en agencia vs. `Mediana` venta directa) con el efectivo adicional o cuota mensual deseada, y filtra en `/api/cars` vehículos activos con `SeRecibe` disponible dentro del diferencial real (incluyendo traspaso estimado). Ver Hecho (2026-11-14). | 🟡 |
| [x] | **7. Costo Total de Propiedad a 3 años (TCO CR: Gasolina vs. Híbrido vs. Eléctrico)** | Extender `CostEstimatorCard.jsx` y `CompareWidget.jsx` con un simulador opcional de uso mensual (km/mes) para proyectar el gasto total a 36 meses en Costa Rica: energía (tarifa residencial CNFL/ICE estimada vs. consumo promedio por segmento/cilindrada), marchamo anual proyectado, traspaso inicial y depreciación esperada por año según los datos históricos reales de CrautosDB. Ver Hecho (2026-11-14). | 🟡 |
| [x] | **8. Ficha de reputación e inventario por vendedor o agencia** | Al filtrar por un vendedor con múltiples anuncios (`SellerActiveCount >= 2` desde `CarDetailsModal.jsx`), mostrar un resumen superior en `CarsPage.jsx` (`GET /api/sellers/summary?name=...`): inventario activo, vehículos vendidos históricos, diferencia promedio frente al precio justo de mercado del catálogo y tiempo mediano que tardan sus anuncios en salir. Ver Hecho (2026-11-14). | 🟡 |

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
| 2026-11-14 | **8. Ficha de reputación e inventario por vendedor** | `db/seller_summary.go` (`GetSellerListings`), `GET /api/sellers/summary` en `api/sellers.go` + `api/sellers_test.go` (clasificación agencia/recurrente/particular, inventario activo/vendido, rotación %, diferencia promedio vs mercado excluyendo flags, días medianos y top marcas) y `SellerReputationCard.jsx` integrado en `CarsPage.jsx` con toggle para ver vendidos. |
| 2026-11-14 | **7. Costo Total de Propiedad a 3 años (TCO CR)** | `estimateCrTco3Yr`, `classifyPowertrain` y `estimateConsumptionPer100Km` en `crCostEstimator.js` (tarifas RECOPE/CNFL, 3 períodos de marchamo, traspaso y depreciación por `/api/depreciation` o segmento), simulador desplegable en `CostEstimatorCard.jsx` y comparativa + selector km/mes en `CompareWidget.jsx`. |
| 2026-11-14 | **6. Calculadora "Cambiar mi carro"** | `upgradeCalculator.js` (patrimonio P25 agencia vs mediana venta directa, resta deuda pendiente, efectivo extra o principal inverso de cuota mensual menos traspaso CR), `UpgradeCalculatorCard.jsx` en `ValuatePage.jsx` y banner contextual `.upgrade-mode-banner` en `CarsPage.jsx`. |
| 2026-11-14 | **4. PWA instalable en celular** | `web/public/manifest.webmanifest`, íconos `192/512/180` generados desde `favicon.png`, `web/public/sw.js` (cache-first exclusivo en `/assets/*` e íconos, `/api/*` y HTML siempre en vivo), registro en producción en `web/src/main.jsx` y headers `Cache-Control` / `Content-Type` en `main.go`. |
| 2026-11-14 | **3. Filtro de "Vendedores motivados / anuncios estancados"** | `db/listing_age.go` (`ParseFechaIngreso`, `ListingAgeDays`), conteo de `Drops` en `db/price_history.go`, filtro y orden `motivated=true` (`>=45d` y/o `>=2` rebajas) en `api/deals.go`, `/api/cars`, `/api/searches/digest`, `opengraph.go`, `motivatedSeller.js` + parity test, `MotivatedBadge.jsx`, chip rápido y checkbox en `FiltersModal.jsx`. |
| 2026-11-14 | **2. Copilot Negociador CR + WhatsApp** | `api/negotiation.go` + `HandleAICompare` enriquecidos con bandas `P25/Expected/P75`, días publicado, rebajas, perfil de vendedor, traspaso/marchamo Ley 10390 y banda sugerida de oferta; `AICopilotWindow.jsx` con barra de chips (*Oferta de contado*, *Qué revisar*, *WhatsApp oferta*) y tarjetas ` ```whatsapp``` ` con envío/copiado en 1 clic, más botón `Negociar con Copilot` en `CarDetailsModal.jsx`. |
| 2026-11-14 | **1. Curva de depreciación y año dulce** | `GET /api/depreciation` en `api/depreciation.go` (0 SQL queries extra sobre `MarketIndex`), `DepreciationCurveCard.jsx` (banda SVG P25–P75, mediana, nodos interactivos, KPIs y banner *año dulce*), integrado en `ValuatePage.jsx` y sub-pestaña **Depreciación** de `StatsPage.jsx`. |
| 2026-11-13 | **11. Tests unitarios de frontend (`Vitest`) + `golangci-lint` en CI** | 4 suites `Vitest` (119 tests: `crCostEstimator`, `urlState`, `marketDeal`, `priceHistory`/`crVehicleInfo`), `.golangci.yml` v2 (`bodyclose`, `errorlint`) y gates `npm test` + `golangci-lint run` en `Dockerfile`. |
