import { useLanguage } from '../context/LanguageContext';
import { getMotivatedSellerInfo } from '../utils/motivatedSeller';

/**
 * Displays a compact indicator when an active unflagged listing has been
 * listed for 45+ days and/or received 2+ clean price drops.
 */
const MotivatedBadge = ({ car, variant = 'full', style }) => {
  const { t } = useLanguage();
  const info = getMotivatedSellerInfo(car);
  if (!info) return null;

  const { days, drops, isStale, hasMultipleDrops } = info;
  let text;
  let detail;

  if (isStale && hasMultipleDrops) {
    text = t('motivatedBadgeBoth', { days, drops });
    detail = t('motivatedDetailBoth', { days, drops });
  } else if (isStale) {
    text = t('motivatedBadgeDays', { days });
    detail = t('motivatedDetailDays', { days });
  } else {
    text = t('motivatedBadgeDrops', { drops });
    detail = t('motivatedDetailDrops', { drops });
  }

  return (
    <span
      className={`motivated-badge motivated-badge--${variant}`}
      title={t('motivatedTooltip', { detail })}
      style={style}
    >
      📅 {text}
    </span>
  );
};

export default MotivatedBadge;
