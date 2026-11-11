# Happy Customer – Roadmap de mejoras (UX y producto)

Backlog priorizado del frontend (`web/`) y lo que necesita en backend o scraper.
Complementa [improvements.md](./improvements.md), que cubre arquitectura y rendimiento del backend.

**Cómo usarlo:** las mejoras están ordenadas por **ganancia ÷ esfuerzo**. Se trabaja de arriba hacia abajo, una tanda a la vez; al terminar cada ítem se marca `[x]` y se mueve a la sección **Hecho** con una nota corta.

Esfuerzo: 🟢 bajo (≤ ½ día) · 🟡 medio (1–2 días) · 🔴 alto (3+ días o infraestructura nueva)

Última actualización: 2026-11-11

Leyenda: `[x]` hecho · `[~]` parcial · `[ ]` pendiente

---

## 🥇 Prioridad 1 – Mucha ganancia, esfuerzo bajo o medio

| ✓ | Mejora | Qué ganamos | Esfuerzo |
|---|---|---|---|
| [x] | **Botón de WhatsApp al vendedor** (modal y tabla) | Pasar de "lo vi" a "lo contacto" en un clic. En CR los autos se negocian por WhatsApp, así que es la acción más valiosa para el usuario. | 🟢 |
| [x] | **Búsquedas rápidas** (chips bajo el buscador) | El usuario nuevo encuentra algo interesante en un clic, sin abrir filtros; luce el precio de mercado ("Buenos precios"). | 🟢 |
| [x] | **"Publicado hace X días"** y encabezados ordenables en la tabla | Mejora directa en la vista más usada: saber qué es reciente y ordenar con un clic. | 🟢 |
| [x] | **Links compartibles y botón "Atrás"** (filtros y pestaña en la URL) | Cada búsqueda o auto compartido por WhatsApp abre lo mismo; "Atrás" deshace filtros y cierra el detalle. Ver Hecho (2026-11-11). | 🟡 (solo frontend) |
| [x] | **Paginación y total real** ("Cargar más") | Se ve el catálogo completo y el título muestra el total real. Ver Hecho (2026-11-01 y 2026-11-11). | 🟡 |
| [x] | **"Mejor oferta" en el servidor + filtro "Solo buenos precios"** | El diferenciador (precio de mercado) funciona sobre todo el catálogo, no solo sobre los resultados cargados. Ver Hecho (2026-11-11). | 🟡 |

## 🥈 Prioridad 2 – Retención (que la gente vuelva)

| ✓ | Mejora | Qué ganamos | Esfuerzo |
|---|---|---|---|
| [~] | **Historial de precio** ("bajó $1,500 hace 5 días") | Confianza y urgencia para comprar. **Paso 1 hecho (2026-11-11):** tabla `price_history` que ya acumula datos (ver Hecho). **Falta Paso 2:** endpoint en el API (`db.GetPriceHistory` ya existe) y mostrarlo en el modal. Conviene esperar unas semanas de datos. | 🟡 |
| [ ] | **Alertas guardadas** ("avísenme cuando salga una Hilux 2018+ bajo $25k") | Es lo que más hace volver a la gente: el sitio los busca a ellos. El scraper ya detecta anuncios nuevos. | 🔴 (identificar al usuario y un canal: email, Telegram o push) |
| [ ] | **Precio de mercado ajustado por kilometraje** | Badges más precisos: hoy un auto con muchos km puede salir como "Gran precio" justamente por eso. Evita perder credibilidad. | 🟡 |

## 🥉 Prioridad 3 – Pulido (poca ganancia por ítem, juntos mejoran la impresión)

| ✓ | Mejora | Qué ganamos | Esfuerzo |
|---|---|---|---|
| [ ] | **Equipamiento destacado** (CarPlay, cámara, sunroof antes que "Aire acondicionado") | Tarjetas más informativas. | 🟢 |
| [ ] | **Tarjeta completa clickeable** (un solo llamado a la acción en vez de 3) | Menos ruido visual. | 🟢 |
| [ ] | **Esqueletos de carga + mensaje útil cuando no hay resultados** | El sitio se siente más rápido y nadie queda en una página vacía (sugerir quitar el filtro más restrictivo). | 🟢 |
| [ ] | **Tabla en tablet (~1024 px)** | Títulos que se parten y la columna "Acción" recortada: se arregla para iPad y laptops chicas. | 🟢 |
| [ ] | **Comparador lado a lado** (2–4 autos) | Útil, aunque el Copilot ya cubre parte (`attachedCars`). | 🟡 |
| [ ] | **Página de bienvenida** para la primera visita | Explicar el valor del sitio; aporta poco a quien ya lo usa. | 🟡 |

## ⚙️ Prioridad 4 – Técnico (no se ve, pero facilita lo demás)

| ✓ | Mejora | Qué ganamos | Esfuerzo |
|---|---|---|---|
| [ ] | **Unificar Gangas con el precio de mercado** | Que los dos números coincidan (hoy Gangas usa el promedio de vendidos; los badges, la mediana). | 🟢 |
| [ ] | **Estilos inline → CSS** (`CarCard`, `App`, páginas) | Cambios futuros más rápidos; hover y foco consistentes. | 🟡 |
| [ ] | **Textos a `translations.js`** (hay muchos `language === 'es' ? … : …` inline) | Traducciones centralizadas. | 🟡 |
| [ ] | **Contraste de textos grises** (`--text-muted` en tamaños chicos) | Accesibilidad (WCAG). | 🟢 |
| [ ] | **Tema claro** (`prefers-color-scheme`) | Opcional, poca demanda. | 🟡 |

## 📷 Fotos – Fase 2 (persistencia): pendiente aparte

**Problema:** las fotos se cargan directo desde `crautos.com/clasificados/usados/{id}-t.jpg` y `{id}-{n}.jpg`.
- Si Crautos borra el anuncio, se pierde la foto (afecta Vendidos, Estadísticas y Gangas).
- Crautos responde `Cache-Control: no-cache`, así que la carga es más lenta.
- Si Crautos activa la protección contra el uso desde otros sitios, las fotos dejan de verse. **Esa decisión se respeta**: se usa la silueta de respaldo o esta fase, nunca se intenta saltar el bloqueo.

**Propuesta:**
1. El scraper descarga **solo la miniatura** (`-t.jpg`, 150×113, ~4.5 KB) y la sube a Cloud Storage (`gs://<bucket>/thumbs/{id}.jpg`) con `Cache-Control: public, max-age=31536000`. Unos 10k autos ≈ **45 MB**.
2. Columna `thumb_url` (o `has_thumb`) en `cars`, expuesta por el API.
3. Opcional: `photo_count` (sondear `-1..-N` con HEAD; las fotos que no existen responden 200 con `text/html`, hay que validar el `Content-Type`).
4. Frontend: `getThumbUrl()` usa `car.ThumbURL` si existe; si no, vuelve a la URL de Crautos.
5. Script de backfill para los autos activos, con concurrencia baja.

**Alternativas:** proxy con caché en el backend (`/api/img/{id}/{n}`), más flexible pero con más carga y egress en Cloud Run; descargar todas las fotos grandes (~3 GB), excesivo.

> ⚠️ **Derechos:** las fotos son de los vendedores o de Crautos. Revisar términos o pedir permiso antes de guardarlas; mantener siempre "Ver en Crautos" y no quitar marcas de agua.

---

## ✅ Hecho

| Fecha | Mejora | Notas |
|---|---|---|
| 2026-10-31 | Fotos – Fase 1 | Miniatura en tablas (vista previa al pasar el mouse), foto en tarjetas, galería en el modal, silueta de respaldo según `Estilo`, interruptor "Con fotos / Compacta". URLs calculadas desde el ID del anuncio (`web/src/utils/carPhotos.js`). |
| 2026-10-31 | Arreglos rápidos | Desborde en móvil, menú de arriba en una línea, "NUEVO" ya no marca todo en la primera visita (`useSeenCars.js`), orden por defecto "Más recientes" con un solo selector, íconos duplicados, placeholder de comentario vacío, `lang="es"` + meta / Open Graph. |
| 2026-10-31 | Precio vs mercado | El API agrega `MarketMedian` y `MarketCount` (mediana por marca, modelo y año, activos y vendidos, caché 15 min: `db/market.go`, `api/market.go`). Badges Gran precio (≤ −12%), Buen precio (≤ −5%), Precio justo, Sobre el mercado (≥ +10%) en tarjetas, tablas y modal (`web/src/utils/marketDeal.js`), y orden "Mejor oferta" (en el cliente). Mínimo 4 comparables. |
| 2026-10-31 | WhatsApp al vendedor | Botón en el modal (primer celular del anuncio, mensaje prellenado) y otros números como enlaces; ícono de WhatsApp en las tablas. Los fijos (2xxx) se ofrecen como "Llamar". `web/src/utils/phone.js`. |
| 2026-10-31 | Búsquedas rápidas | Chips: Buenos precios, Bajo $15k, SUV 4x4, Pick-up 4x4, Eléctricos, Híbridos, Automáticos 2020+, Menos de 50k km. Se agregó el filtro `estilo`. |
| 2026-10-31 | "Publicado hace X días" + orden por encabezados | Columna "Publicado" (de `FechaIngreso`, o `ScrapedAt` si falta) en tablas, tarjetas y modal (`web/src/utils/listingDate.js`); Año, Precio y Km ordenables con clic. |
| 2026-11-01 | Scroll infinito + correcciones (commit `f4340e2`) | Carga por lotes con `offset` e `IntersectionObserver` en `CarsPage.jsx`. Orden "⭐ Óptimo" (modelo, año, precio, km). Filtros de combustible y transmisión tolerantes a variantes (`appendCombustibleFilter`, `appendTransmisionFilter` en `db/queries.go`). Protección en el scraper para marcas de varias palabras al marcar vendidos. |
| 2026-11-11 | Historial de precio – Paso 1 (datos) | Tabla `price_history(url, price, seen_at)` (`db/db.go`). Se llena en `UpsertCar` y `UpsertCarBatch` con una sola consulta por lote, antes de sobrescribir el precio: solo autos nuevos o con precio distinto (`recordPriceChanges` en `db/queries.go`). Al crear la tabla se siembra con el precio actual de cada auto. Lectura: `GetPriceHistory(url)`. Test: `db/price_history_test.go`. |
| 2026-11-11 | Total real de resultados | `buildCarFilters` (filtros compartidos) + `CountCars` en `db/queries.go`. `/api/cars` envía el header `X-Total-Count` solo en la primera página y solo hace el `COUNT` si la página vino llena; el body sigue siendo un array. Frontend: `fetchCarsPage` en `api/client.js`; el título "N autos encontrados" y el botón del modal de filtros usan el total (con separador de miles). Favoritos sigue contando lo cargado. Test: `db/count_cars_test.go`. |
| 2026-11-11 | Links compartibles + botón "Atrás" | Query string, sin router ni cambios en el servidor: `?tab=`, filtros con su mismo nombre (solo los distintos al valor por defecto), `sort=bestDeal` y `car=<url del anuncio>` (`web/src/utils/urlState.js`, valores por defecto centralizados ahí). `App.jsx`: estado inicial desde la URL; los cambios de pestaña, filtros o auto agregan un paso al historial, y escribir en el buscador o cambiar el orden en el cliente solo lo reemplaza; `popstate` restaura todo. El orden en el cliente (`clientSort`) pasó de `CarsPage` a `App`. Abrir un auto en Explorar (tabla o tarjeta, vía el nuevo prop `onOpenDetails` de `CarCard`) pone `?car=`; cerrar hace "Atrás" si lo abrió este historial. Un link con un auto que no está cargado lo busca con `fetchCarsByUrls`. Favoritos y Gangas mantienen su modal propio. |
| 2026-11-11 | "Mejor oferta" en el servidor + "Solo buenos precios" | `/api/cars` acepta `sortDeal=best` (orden por desviación vs. la mediana; sin datos de mercado al final) y `deal=good` (≤ −5%, mínimo 4 comparables, mismos umbrales que `marketDeal.js`). Se resuelve sobre todo el catálogo: `GetCarPriceKeys` (consulta liviana con los mismos filtros) + mediana en caché → ordenar/filtrar en Go → cargar solo la página con `GetCarsByURLs`; siempre envía `X-Total-Count` (`api/deals.go`, test `api/deals_test.go`). Frontend: el orden "Mejor oferta" ya no se calcula en el cliente (salvo en "Solo favoritos"); el chip "🔥 Buenos precios" activa el filtro `deal=good` + ese orden, con su etiqueta removible; `deal` va en la URL. El reset de filtros usa `createDefaultFilters()`. |
