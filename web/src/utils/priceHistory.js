import { translate } from '../translations';
import { formatUSD } from './marketDeal';

export const MIN_BADGE_DROP_USD = 100;
export const MIN_BADGE_DROP_PCT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export const parseHistoryDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
};

export const formatChangeAge = (value, language = 'es', now = new Date()) => {
  const date = parseHistoryDate(value);
  if (!date) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.max(0, Math.round((today - day) / DAY_MS));
  if (days === 0) return translate(language, 'todayLower');
  if (days === 1) return translate(language, 'yesterdayLower');
  if (days < 14) return translate(language, 'daysAgoLower', { days });
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return translate(language, 'weeksAgoLower', { weeks });
  }
  const months = Math.round(days / 30);
  return translate(language, 'monthsAgoLower', { months });
};

export const formatHistoryDate = (value, language = 'es') => {
  const date = parseHistoryDate(value);
  if (!date) return '';
  return date.toLocaleDateString(translate(language, 'locale'), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const getCarPriceDrop = (car) => {
  if (!car || car.MarketFlag) return null;
  const price = Number(car.Price) || 0;
  const prev = Number(car.PricePrevious) || 0;
  const initial = Number(car.PriceInitial) || prev;
  if (price <= 0 || prev <= price) return null;

  const drop = prev - price;
  const dropPct = (drop / prev) * 100;
  if (drop < MIN_BADGE_DROP_USD || dropPct < MIN_BADGE_DROP_PCT) return null;

  return {
    drop,
    dropPct,
    previousPrice: prev,
    initialPrice: initial,
    currentPrice: price,
    changedAt: car.PriceChangedAt || null,
    changes: Number(car.PriceChanges) || 1,
  };
};

export const formatPriceDropBadgeText = (dropInfo, language = 'es', now = new Date()) => {
  if (!dropInfo) return '';
  const amount = formatUSD(dropInfo.drop);
  const age = formatChangeAge(dropInfo.changedAt, language, now);
  if (!age) return translate(language, 'priceDroppedPlain', { amount });
  const isRecent = age === translate(language, 'todayLower') || age === translate(language, 'yesterdayLower');
  return translate(language, isRecent ? 'priceDroppedRecent' : 'priceDroppedAge', { amount, age });
};

export const formatPriceDropTooltip = (dropInfo, language = 'es') => {
  if (!dropInfo) return '';
  const pct = dropInfo.dropPct.toFixed(1);
  const dateStr = formatHistoryDate(dropInfo.changedAt, language);
  const datePart = dateStr ? ` · ${dateStr}` : '';
  const base = translate(language, 'priceDropTooltipBase', {
    prev: formatUSD(dropInfo.previousPrice),
    curr: formatUSD(dropInfo.currentPrice),
    pct,
    datePart,
  });
  return dropInfo.initialPrice > dropInfo.previousPrice
    ? `${base}${translate(language, 'priceDropTooltipInitial', { initial: formatUSD(dropInfo.initialPrice) })}`
    : base;
};

export const summarizePriceHistory = (points) => {
  if (!Array.isArray(points)) return null;
  const valid = points
    .map((p) => ({
      price: Number(p?.price) || 0,
      seenAt: p?.seenAt || null,
    }))
    .filter((p) => p.price > 0);
  if (valid.length < 2) return null;

  const steps = valid.map((p, idx) => {
    const prev = idx > 0 ? valid[idx - 1].price : p.price;
    const delta = idx > 0 ? p.price - prev : 0;
    const pct = idx > 0 && prev > 0 ? (delta / prev) * 100 : 0;
    return { price: p.price, seenAt: p.seenAt, delta, pct };
  });

  const first = steps[0];
  const prev = steps[steps.length - 2];
  const last = steps[steps.length - 1];
  const latestDelta = last.price - prev.price;
  const latestPct = prev.price > 0 ? (latestDelta / prev.price) * 100 : 0;
  const netDelta = last.price - first.price;
  const netPct = first.price > 0 ? (netDelta / first.price) * 100 : 0;
  const prices = steps.map((s) => s.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return {
    steps,
    first,
    prev,
    last,
    latestDelta,
    latestPct,
    netDelta,
    netPct,
    minPrice,
    maxPrice,
  };
};

export const formatHeadlineChange = (summary, language = 'es', now = new Date()) => {
  if (!summary || summary.latestDelta === 0) return '';
  const amount = formatUSD(Math.abs(summary.latestDelta));
  const age = formatChangeAge(summary.last?.seenAt, language, now);
  const isRecent = age === translate(language, 'todayLower') || age === translate(language, 'yesterdayLower');
  if (summary.latestDelta < 0) {
    if (!age) return `📉 ${translate(language, 'priceDroppedPlain', { amount })}`;
    return `📉 ${translate(language, isRecent ? 'priceDroppedRecent' : 'priceDroppedAge', { amount, age })}`;
  }
  if (!age) return `↑ ${translate(language, 'priceRosePlain', { amount })}`;
  return `↑ ${translate(language, isRecent ? 'priceRoseRecent' : 'priceRoseAge', { amount, age })}`;
};
