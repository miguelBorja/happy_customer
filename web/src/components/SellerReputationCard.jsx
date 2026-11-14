import { useState, useEffect } from 'react';
import { fetchSellerSummary } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';
import { CloseIcon, LocationPinIcon, TagIcon } from './icons/AppIcons';

const badgeClassByType = {
  dealer: 'seller-badge-dealer',
  multi: 'seller-badge-multi',
  private: 'seller-badge-private',
};

const badgeKeyByType = {
  dealer: 'sellerRepBadgeDealer',
  multi: 'sellerRepBadgeMulti',
  private: 'sellerRepBadgePrivate',
};

const SellerReputationCard = ({
  sellerName,
  includeSold,
  onToggleIncludeSold,
  onClearSeller,
}) => {
  const { t } = useLanguage();
  const normalizedName = String(sellerName ?? '').trim();

  const [state, setState] = useState({ key: '', data: null, error: false });

  useEffect(() => {
    if (normalizedName.length < 2) return undefined;

    const controller = new AbortController();
    fetchSellerSummary(normalizedName, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ key: normalizedName, data, error: false });
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError' && !controller.signal.aborted) {
          setState({ key: normalizedName, data: null, error: true });
        }
      });

    return () => controller.abort();
  }, [normalizedName]);

  if (normalizedName.length < 2) return null;

  const isLoading = state.key !== normalizedName;
  if (!isLoading && state.error) return null;

  if (isLoading || !state.data) {
    return (
      <div className="seller-rep-card seller-rep-loading" aria-hidden="true">
        <div className="seller-rep-skeleton-bar" />
      </div>
    );
  }

  const summary = state.data;
  const badgeClass = badgeClassByType[summary.sellerType] || 'seller-badge-private';
  const badgeLabel = t(badgeKeyByType[summary.sellerType] || 'sellerRepBadgePrivate');

  let deltaClass = 'seller-delta-neutral';
  let deltaText = t('sellerRepDeltaNA');
  if (summary.avgMarketDeltaPct !== undefined && summary.avgMarketDeltaPct !== null) {
    const val = Number(summary.avgMarketDeltaPct);
    const rounded = Math.round(val * 10) / 10;
    deltaText = `${rounded > 0 ? '+' : ''}${rounded}%`;
    if (rounded <= -3) deltaClass = 'seller-delta-good';
    else if (rounded >= 4) deltaClass = 'seller-delta-high';
  }

  const daysLabel =
    summary.daysMetric === 'sold' ? t('sellerRepStatDaysSold') : t('sellerRepStatDaysActive');
  const daysValue =
    summary.medianExitDays !== undefined && summary.medianExitDays !== null
      ? t('sellerRepDaysUnit', { d: summary.medianExitDays })
      : '—';

  return (
    <section className="seller-rep-card" aria-label={summary.displayName || normalizedName}>
      <div className="seller-rep-header">
        <div className="seller-rep-identity">
          <div className="seller-rep-title-row">
            <h3 className="seller-rep-name">{summary.displayName || normalizedName}</h3>
            <span className={`seller-rep-badge ${badgeClass}`}>{badgeLabel}</span>
            {summary.primaryProvince && (
              <span className="seller-rep-province">
                <LocationPinIcon size={13} />
                {t('sellerRepProvince', { province: summary.primaryProvince })}
              </span>
            )}
          </div>
          {summary.phones?.length > 0 && (
            <div className="seller-rep-phones">{summary.phones.join(' · ')}</div>
          )}
        </div>

        <div className="seller-rep-actions">
          {summary.soldCount > 0 && onToggleIncludeSold && (
            <button
              type="button"
              className={`seller-rep-btn ${includeSold ? 'active' : ''}`.trim()}
              onClick={() => onToggleIncludeSold(!includeSold)}
            >
              {includeSold
                ? t('sellerRepActiveOnlyBtn', { n: summary.activeCount })
                : t('sellerRepIncludeSold', { n: summary.soldCount })}
            </button>
          )}
          {onClearSeller && (
            <button
              type="button"
              className="seller-rep-clear-btn"
              onClick={onClearSeller}
            >
              <CloseIcon size={12} />
              <span>{t('sellerRepClearFilter')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="seller-rep-stats-grid">
        <div className="seller-rep-stat">
          <span className="seller-rep-stat-label">{t('sellerRepStatActive')}</span>
          <strong className="seller-rep-stat-value">{summary.activeCount}</strong>
          {summary.soldCount > 0 && (
            <span className="seller-rep-stat-sub">
              {summary.soldCount} {t('sellerRepStatSold').toLowerCase()}{' '}
              {summary.soldRatePct !== undefined && summary.soldRatePct !== null
                ? t('sellerRepSoldRate', { pct: summary.soldRatePct })
                : ''}
            </span>
          )}
        </div>

        <div className="seller-rep-stat">
          <span className="seller-rep-stat-label">{t('sellerRepStatDelta')}</span>
          <strong className={`seller-rep-stat-value ${deltaClass}`}>{deltaText}</strong>
          {summary.marketSampleCount > 0 && (
            <span className="seller-rep-stat-sub">
              {t('sellerRepDeltaSamples', { n: summary.marketSampleCount })}
            </span>
          )}
        </div>

        <div className="seller-rep-stat">
          <span className="seller-rep-stat-label">{daysLabel}</span>
          <strong className="seller-rep-stat-value">{daysValue}</strong>
        </div>

        <div className="seller-rep-stat">
          <span className="seller-rep-stat-label">{t('sellerRepStatAvgPrice')}</span>
          <strong className="seller-rep-stat-value">
            {summary.avgPriceUSD > 0 ? formatUSD(summary.avgPriceUSD) : '—'}
          </strong>
        </div>
      </div>

      {(summary.tradeInCount > 0 || summary.negotiableCount > 0 || summary.topBrands?.length > 0) && (
        <div className="seller-rep-footer">
          <div className="seller-rep-tags">
            {summary.tradeInCount > 0 && (
              <span className="seller-rep-tag">
                <TagIcon size={12} />
                {t('sellerRepTradeInCount', { n: summary.tradeInCount })}
              </span>
            )}
            {summary.negotiableCount > 0 && (
              <span className="seller-rep-tag">
                {t('sellerRepNegCount', { n: summary.negotiableCount })}
              </span>
            )}
          </div>
          {summary.topBrands?.length > 0 && (
            <div className="seller-rep-brands">
              <span className="seller-rep-brands-label">{t('sellerRepBrandsLabel')}</span>
              {summary.topBrands.map((b) => (
                <span key={b.brand} className="seller-rep-brand-chip">
                  {b.brand} ({b.activeCount > 0 ? b.activeCount : b.totalCount})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default SellerReputationCard;
