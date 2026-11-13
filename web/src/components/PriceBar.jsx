import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';

const DEFAULT_MAX_PRICE = 100000;

const formatPrice = (price) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return '';
};

const getDynamicColors = (percent) => {
  const hue = Math.max(0, Math.min(120, 120 - (percent * 1.2)));
  return {
    text: `hsl(${hue}, var(--bar-table-text-s, 85%), var(--bar-table-text-l, 48%))`,
    fill: `hsla(${hue}, 85%, 48%, var(--bar-table-fill-a, 0.3))`,
    border: `hsla(${hue}, 85%, 48%, var(--bar-table-border-a, 0.25))`,
    bg: `hsla(${hue}, 85%, 48%, var(--bar-table-bg-a, 0.03))`
  };
};

const PriceBar = ({ price, maxPrice, priceText, deal }) => {
  const { t } = useLanguage();
  const displayVal = price > 0 ? formatPrice(price) : priceText;
  if (!displayVal) return null;

  const limit = maxPrice && maxPrice > 0 ? maxPrice : DEFAULT_MAX_PRICE;
  const pct = price > 0 ? Math.min((price / limit) * 100, 100) : 0;
  const colors = getDynamicColors(pct);

  const title = deal
    ? (deal.kmAdjusted
      ? t('priceBarTooltipKm', { raw: formatUSD(deal.rawMedian), count: deal.count, adj: formatUSD(deal.median) })
      : t('priceBarTooltipPlain', { median: formatUSD(deal.median), count: deal.count }))
    : `$${price?.toLocaleString() || 0} / $${limit.toLocaleString()}`;

  const border = deal ? deal.border : colors.border;
  const background = deal ? deal.bg : colors.bg;
  const textColor = deal ? deal.color : colors.text;

  return (
    <div
      className="car-pill"
      title={title}
      style={{ border: `1px solid ${border}`, background }}
    >
      {!deal && (
        <div
          className="car-pill-fill"
          style={{ width: `${pct}%`, background: colors.fill }}
        />
      )}
      <span
        className="car-pill-text car-pill-text--price-bar"
        style={{ color: textColor }}
      >
        {displayVal}
      </span>
    </div>
  );
};

export default PriceBar;
