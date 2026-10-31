import { useLanguage } from '../context/LanguageContext';
import { getMarketDeal, formatDealDelta, dealTooltip } from '../utils/marketDeal';

/**
 * Market price badge.
 * - variant 'full'    (cards, modal): "🔥 Gran precio · 12% bajo el mercado"
 * - variant 'compact' (tables):       "🔥 −12%" with the explanation in the tooltip
 * Renders nothing when there is not enough market data for the car.
 */
const MarketBadge = ({ car, variant = 'full', style }) => {
  const { language } = useLanguage();
  const deal = getMarketDeal(car);
  if (!deal) return null;

  const roundedPct = Math.round(deal.pct);
  const compactText = roundedPct === 0 ? '±0%' : `${roundedPct > 0 ? '+' : '−'}${Math.abs(roundedPct)}%`;

  return (
    <span
      className={`market-badge market-badge--${deal.level} market-badge--${variant}`}
      title={dealTooltip(car, deal, language)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: variant === 'compact' ? '0.15rem 0.45rem' : '0.25rem 0.6rem',
        borderRadius: '999px',
        border: `1px solid ${deal.border}`,
        background: deal.bg,
        color: deal.color,
        fontSize: variant === 'compact' ? '0.72rem' : '0.78rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        ...style,
      }}
    >
      <span aria-hidden="true">{deal.icon}</span>
      {variant === 'compact' ? (
        <span>{compactText}</span>
      ) : (
        <span>
          {deal.label(language)}
          {deal.level !== 'fair' && (
            <span style={{ fontWeight: 500, opacity: 0.85 }}> · {formatDealDelta(deal, language)}</span>
          )}
        </span>
      )}
    </span>
  );
};

export default MarketBadge;
