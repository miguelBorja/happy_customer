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

import { translate } from '../translations';

export const MIN_MARKET_COMPARABLES = 4; // includes the car itself
export const DEAL_GREAT_MAX_PCT = -12; // "Gran precio"
export const DEAL_GOOD_MAX_PCT = -5; // "Buen precio" or better (deal=good)
export const DEAL_HIGH_MIN_PCT = 10; // "Sobre el mercado"

const LEVELS = {
  great: {
    labelKey: 'dealGreat',
    color: 'var(--deal-great-text)',
    bg: 'var(--deal-great-bg)',
    border: 'var(--deal-great-border)',
    icon: '🔥',
  },
  good: {
    labelKey: 'dealGood',
    color: 'var(--deal-good-text)',
    bg: 'var(--deal-good-bg)',
    border: 'var(--deal-good-border)',
    icon: '👍',
  },
  fair: {
    labelKey: 'dealFair',
    color: 'var(--deal-fair-text)',
    bg: 'var(--deal-fair-bg)',
    border: 'var(--deal-fair-border)',
    icon: '⚖️',
  },
  high: {
    labelKey: 'dealHigh',
    color: 'var(--deal-high-text)',
    bg: 'var(--deal-high-bg)',
    border: 'var(--deal-high-border)',
    icon: '▲',
  },
  // The server flagged the price (MarketFlag): likely a typo, damaged car, or partial price.
  check: {
    labelKey: 'dealCheck',
    color: 'var(--deal-check-text)',
    bg: 'var(--deal-check-bg)',
    border: 'var(--deal-check-border)',
    icon: '⚠️',
  },
};

// Why the price needs checking (MarketFlag values from api/deals.go: dealFlag).
const FLAG_REASON_KEYS = {
  typo: 'flagTypoReason',
  outlier: 'flagOutlierReason',
  condition: 'flagConditionReason',
  debt: 'flagDebtReason',
};

export const dealReason = (deal, language) => {
  if (!deal || deal.level !== 'check') return '';
  const reasonKey = FLAG_REASON_KEYS[deal.flag] || FLAG_REASON_KEYS.outlier;
  return translate(language, reasonKey);
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
    label: (language) => translate(language, meta.labelKey),
  };
};

// "12% bajo el mercado" / "8% sobre el mercado" / "En el promedio"
export const formatDealDelta = (deal, language) => {
  if (!deal) return '';
  const abs = Math.round(Math.abs(deal.pct));
  if (abs < 1) return translate(language, 'dealAtAverage');
  if (deal.pct < 0) return translate(language, 'dealBelowMarket', { pct: abs });
  return translate(language, 'dealAboveMarket', { pct: abs });
};

export const formatUSD = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

const formatKm = (km) => `${Math.round(km / 1000).toLocaleString('en-US')}k km`;

// "Mediana de 12 autos Toyota Hilux 2018: $20,000 · ajustada por km: $18,500 (150k km vs. 95k km típico)"
export const formatMarketReference = (deal, subject, language) => {
  if (!deal) return '';
  const base = translate(language, 'marketRefBase', {
    count: deal.count,
    subject,
    rawMedian: formatUSD(deal.rawMedian),
  });
  if (!deal.kmAdjusted) return base;
  const kmNote = deal.km > 0 && deal.medianKm > 0
    ? translate(language, 'marketRefKmNote', { km: formatKm(deal.km), medianKm: formatKm(deal.medianKm) })
    : '';
  return translate(language, 'marketRefAdjusted', {
    base,
    median: formatUSD(deal.median),
    kmNote,
  });
};

// Tooltip text explaining the comparison.
export const dealTooltip = (car, deal, language) => {
  if (!deal) return '';
  const subject = [car.Brand, car.Model, car.Year].filter(Boolean).join(' ') || car.Title;
  const base = `${formatMarketReference(deal, subject, language)} · ${formatDealDelta(deal, language)}`;
  return deal.level === 'check' ? `${base} · ⚠️ ${dealReason(deal, language)}` : base;
};
