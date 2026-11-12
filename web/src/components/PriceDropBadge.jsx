import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';
import {
  getCarPriceDrop,
  formatPriceDropBadgeText,
  formatPriceDropTooltip,
} from '../utils/priceHistory';

/**
 * Price drop badge.
 * - variant 'full'    (cards):      "📉 Bajó $1,500 hace 5 días"
 * - variant 'compact' (tables/cmp): "↓ $1,500" with full detail in tooltip
 * Renders nothing when there is no qualifying price drop.
 */
const PriceDropBadge = ({ car, variant = 'full', style }) => {
  const { language } = useLanguage();
  const dropInfo = getCarPriceDrop(car);
  if (!dropInfo) return null;

  const tooltip = formatPriceDropTooltip(dropInfo, language);
  const label = variant === 'compact'
    ? `↓ ${formatUSD(dropInfo.drop)}`
    : `📉 ${formatPriceDropBadgeText(dropInfo, language)}`;

  return (
    <span
      className={`price-drop-badge price-drop-badge--${variant}`}
      title={tooltip}
      style={style}
    >
      {label}
    </span>
  );
};

export default PriceDropBadge;
