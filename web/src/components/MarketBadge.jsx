import { useLanguage } from '../context/LanguageContext';
import { getMarketDeal, formatDealDelta, dealTooltip, dealReason } from '../utils/marketDeal';

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
        border: `1px solid ${deal.border}`,
        background: deal.bg,
        color: deal.color,
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
            <span className="market-badge__delta"> · {deal.level === 'check' ? dealReason(deal, language) : formatDealDelta(deal, language)}</span>
          )}
        </span>
      )}
    </span>
  );
};

export default MarketBadge;
