// Listing date helpers.
// `FechaIngreso` is the date the ad was published on Crautos, in Spanish: "28 de Mayo del 2026".
// Falls back to `ScrapedAt` (first time our scraper saw the listing) when it can't be parsed.

const MONTHS_ES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a Date (local midnight) or null. */
export const parseFechaIngreso = (text) => {
  if (!text) return null;
  const m = String(text).toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS_ES[m[2]];
  if (month === undefined) return null;
  const date = new Date(Number(m[3]), month, Number(m[1]));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Best-known publish date for a car: FechaIngreso, else ScrapedAt. */
export const getListingDate = (car) => {
  const fromAd = parseFechaIngreso(car?.FechaIngreso);
  if (fromAd) return fromAd;
  const scraped = Date.parse(car?.ScrapedAt);
  return Number.isNaN(scraped) ? null : new Date(scraped);
};

/** Whole days since the listing date (0 = today), or null. */
export const getListingAgeDays = (car, now = new Date()) => {
  const date = getListingDate(car);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.round((today - day) / DAY_MS));
};

/** "Hoy", "Ayer", "Hace 5 días", "Hace 3 sem.", "Hace 2 meses" (and English equivalents). */
export const formatListingAge = (car, language = 'es', now = new Date()) => {
  const days = getListingAgeDays(car, now);
  if (days === null) return '';
  const es = language === 'es';
  if (days === 0) return es ? 'Hoy' : 'Today';
  if (days === 1) return es ? 'Ayer' : 'Yesterday';
  if (days < 14) return es ? `Hace ${days} días` : `${days} days ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return es ? `Hace ${weeks} sem.` : `${weeks} wk ago`;
  }
  const months = Math.round(days / 30);
  return es ? `Hace ${months} meses` : `${months} mo ago`;
};

/** Full date for tooltips, e.g. "28 may 2026". */
export const formatListingDate = (car, language = 'es') => {
  const date = getListingDate(car);
  if (!date) return '';
  return date.toLocaleDateString(language === 'es' ? 'es-CR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};
