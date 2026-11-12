// Market price comparison.
// The API enriches each car with:
//   MarketMedian / MarketCount: median price of all listings (active + sold) with the same brand,
//     model and year.
//   MarketExpected: that median adjusted to the car's mileage (db/market.go: a catalog-wide
//     km-depreciation slope applied to the distance from the group's typical mileage).
//   MarketMedianKm: the group's typical (median) mileage.
// We classify the car's price against MarketExpected (falls back to MarketMedian).
//
// Thresholds calibrated on the local dataset (active cars, deviation vs median):
//   p10 ≈ -13%, p25 ≈ -6%, p50 = 0%, p75 ≈ +7%, p90 ≈ +16%
// The backend (api/deals.go: deal=good, sortDeal=best) uses the same values;
// TestDealThresholdsMatchFrontend reads these exports, so keep them as plain numeric literals.

export const MIN_MARKET_COMPARABLES = 4; // includes the car itself
export const DEAL_GREAT_MAX_PCT = -12; // "Gran precio"
export const DEAL_GOOD_MAX_PCT = -5; // "Buen precio"
export const DEAL_HIGH_MIN_PCT = 10; // "Sobre el mercado"

const LEVELS = {
  great: {
    es: 'Gran precio', en: 'Great price',
    color: '#34d399', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.45)', icon: '🔥',
  },
  good: {
    es: 'Buen precio', en: 'Good price',
    color: '#86efac', bg: 'rgba(34, 197, 94, 0.10)', border: 'rgba(34, 197, 94, 0.35)', icon: '👍',
  },
  fair: {
    es: 'Precio justo', en: 'Fair price',
    color: '#93c5fd', bg: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.30)', icon: '⚖️',
  },
  high: {
    es: 'Sobre el mercado', en: 'Above market',
    color: '#fdba74', bg: 'rgba(249, 115, 22, 0.10)', border: 'rgba(249, 115, 22, 0.35)', icon: '▲',
  },
  // The server flagged the price (MarketFlag): likely a typo, damaged car, or partial price.
  check: {
    es: 'Verificar precio', en: 'Check price',
    color: '#fcd34d', bg: 'rgba(234, 179, 8, 0.10)', border: 'rgba(234, 179, 8, 0.40)', icon: '⚠️',
  },
};

// Why the price needs checking (MarketFlag values from api/deals.go: dealFlag).
const FLAG_REASONS = {
  typo: { es: '¿le falta o le sobra un cero?', en: 'missing or extra zero?' },
  outlier: { es: 'demasiado bajo para el mercado', en: 'unusually low for the market' },
  condition: { es: 'el anuncio menciona daños o reparaciones', en: 'listing mentions damage or repairs' },
  debt: { es: 'el precio parece incluir deuda o gravamen', en: 'price may involve a loan or lien' },
};

export const dealReason = (deal, language) => {
  if (!deal || deal.level !== 'check') return '';
  const reason = FLAG_REASONS[deal.flag] || FLAG_REASONS.outlier;
  return language === 'es' ? reason.es : reason.en;
};

/**
 * Returns null when there is not enough market data, otherwise:
 * { level: 'great'|'good'|'fair'|'high'|'check', flag, pct, median, rawMedian, kmAdjusted, medianKm, km, count,
 *   color, bg, border, icon, label(language) }
 * level 'check' means the server flagged the price (MarketFlag: typo|outlier|condition|debt);
 * it is not a deal, see dealReason().
 * median is the reference price (adjusted to the car's mileage when possible); rawMedian is the
 * plain brand/model/year median. pct is the signed deviation from median (e.g. -12.4 means 12.4%
 * below market).
 */
export const getMarketDeal = (car) => {
  if (!car) return null;
  const price = Number(car.Price) || 0;
  const rawMedian = Number(car.MarketMedian) || 0;
  const expected = Number(car.MarketExpected) || 0;
  const median = expected > 0 ? expected : rawMedian;
  const count = Number(car.MarketCount) || 0;
  if (price <= 0 || median <= 0 || count < MIN_MARKET_COMPARABLES) return null;

  const pct = ((price - median) / median) * 100;
  const flag = car.MarketFlag || '';
  let level = 'fair';
  if (flag) level = 'check';
  else if (pct <= DEAL_GREAT_MAX_PCT) level = 'great';
  else if (pct <= DEAL_GOOD_MAX_PCT) level = 'good';
  else if (pct >= DEAL_HIGH_MIN_PCT) level = 'high';

  const meta = LEVELS[level];
  return {
    level,
    flag,
    pct,
    median,
    rawMedian: rawMedian || median,
    kmAdjusted: expected > 0 && rawMedian > 0 && expected !== rawMedian,
    medianKm: Number(car.MarketMedianKm) || 0,
    km: Number(car.Kilometraje) || 0,
    count,
    color: meta.color,
    bg: meta.bg,
    border: meta.border,
    icon: meta.icon,
    label: (language) => (language === 'es' ? meta.es : meta.en),
  };
};

// "12% bajo el mercado" / "8% sobre el mercado" / "En el promedio"
export const formatDealDelta = (deal, language) => {
  if (!deal) return '';
  const abs = Math.round(Math.abs(deal.pct));
  if (abs < 1) return language === 'es' ? 'En el promedio' : 'At market average';
  if (deal.pct < 0) return language === 'es' ? `${abs}% bajo el mercado` : `${abs}% below market`;
  return language === 'es' ? `${abs}% sobre el mercado` : `${abs}% above market`;
};

export const formatUSD = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

const formatKm = (km) => `${Math.round(km / 1000).toLocaleString('en-US')}k km`;

// "Mediana de 12 autos Toyota Hilux 2018: $20,000 · ajustada por km: $18,500 (150k km vs. 95k km típico)"
export const formatMarketReference = (deal, subject, language) => {
  if (!deal) return '';
  const base = language === 'es'
    ? `Mediana de ${deal.count} autos ${subject}: ${formatUSD(deal.rawMedian)}`
    : `Median of ${deal.count} ${subject} listings: ${formatUSD(deal.rawMedian)}`;
  if (!deal.kmAdjusted) return base;
  const kmNote = deal.km > 0 && deal.medianKm > 0
    ? (language === 'es'
      ? ` (${formatKm(deal.km)} vs. ${formatKm(deal.medianKm)} típico)`
      : ` (${formatKm(deal.km)} vs. typical ${formatKm(deal.medianKm)})`)
    : '';
  return language === 'es'
    ? `${base} · ajustada por km: ${formatUSD(deal.median)}${kmNote}`
    : `${base} · mileage-adjusted: ${formatUSD(deal.median)}${kmNote}`;
};

// Tooltip text explaining the comparison.
export const dealTooltip = (car, deal, language) => {
  if (!deal) return '';
  const subject = [car.Brand, car.Model, car.Year].filter(Boolean).join(' ') || car.Title;
  const base = `${formatMarketReference(deal, subject, language)} · ${formatDealDelta(deal, language)}`;
  return deal.level === 'check' ? `${base} · ⚠️ ${dealReason(deal, language)}` : base;
};
