// Market price comparison.
// The API enriches each car with MarketMedian / MarketCount: the median price of all listings
// (active + sold) with the same brand, model and year. We classify the car's price against it.
//
// Thresholds calibrated on the local dataset (active cars, deviation vs median):
//   p10 ≈ -13%, p25 ≈ -6%, p50 = 0%, p75 ≈ +7%, p90 ≈ +16%

export const MIN_MARKET_COMPARABLES = 4; // includes the car itself

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
};

/**
 * Returns null when there is not enough market data, otherwise:
 * { level: 'great'|'good'|'fair'|'high', pct, median, count, color, bg, border, icon, label(language) }
 * pct is the signed deviation from the median (e.g. -12.4 means 12.4% below market).
 */
export const getMarketDeal = (car) => {
  if (!car) return null;
  const price = Number(car.Price) || 0;
  const median = Number(car.MarketMedian) || 0;
  const count = Number(car.MarketCount) || 0;
  if (price <= 0 || median <= 0 || count < MIN_MARKET_COMPARABLES) return null;

  const pct = ((price - median) / median) * 100;
  let level = 'fair';
  if (pct <= -12) level = 'great';
  else if (pct <= -5) level = 'good';
  else if (pct >= 10) level = 'high';

  const meta = LEVELS[level];
  return {
    level,
    pct,
    median,
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

// Tooltip text explaining the comparison.
export const dealTooltip = (car, deal, language) => {
  if (!deal) return '';
  const subject = [car.Brand, car.Model, car.Year].filter(Boolean).join(' ') || car.Title;
  return language === 'es'
    ? `Mediana de ${deal.count} autos ${subject}: ${formatUSD(deal.median)} · ${formatDealDelta(deal, language)}`
    : `Median of ${deal.count} ${subject} listings: ${formatUSD(deal.median)} · ${formatDealDelta(deal, language)}`;
};
