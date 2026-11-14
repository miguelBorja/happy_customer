import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchBrands, fetchFilteredModels, fetchValuation } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';
import { formatUSD } from '../utils/marketDeal';
import { formatCRC, getStoredFxRate } from '../utils/crCostEstimator';
import { trackEvent } from '../utils/analytics';
import CarCard from '../components/CarCard';
import CarDetailsModal from '../components/CarDetailsModal';
import DepreciationCurveCard from '../components/DepreciationCurveCard';
import UpgradeCalculatorCard from '../components/UpgradeCalculatorCard';
import { CalculatorIcon } from '../components/icons/AppIcons';

const YEARS = Array.from({ length: 38 }, (_, i) => 2027 - i);

const CONFIDENCE_KEY_MAP = {
  high: 'valuateConfidenceHigh',
  medium: 'valuateConfidenceMedium',
  low: 'valuateConfidenceLow',
  none: 'valuateConfidenceNone',
};

const ValuatePage = ({
  valuateParams,
  onUpdateParams,
  onBrowseSimilar,
  onBrowseUpgrade,
  onFilterBySeller,
  onNegotiateWithCopilot,
}) => {
  const { t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isNew } = useSeenCars();
  const [fxRate] = useState(getStoredFxRate);

  const [brands, setBrands] = useState([]);
  const [modelsState, setModelsState] = useState({ brand: '', list: [] });
  const [selectedCar, setSelectedCar] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const copyTimerRef = useRef(null);

  const paramsKey = `${valuateParams?.brand || ''}|${valuateParams?.model || ''}|${valuateParams?.year || ''}|${valuateParams?.km || ''}`;
  const [prevParamsKey, setPrevParamsKey] = useState(paramsKey);
  const [draft, setDraft] = useState(() => ({
    brand: valuateParams?.brand || '',
    model: valuateParams?.model || '',
    year: valuateParams?.year || '2020',
    km: valuateParams?.km || '',
  }));

  if (prevParamsKey !== paramsKey) {
    setPrevParamsKey(paramsKey);
    if (valuateParams?.brand || valuateParams?.model || valuateParams?.year || valuateParams?.km) {
      setDraft({
        brand: valuateParams.brand || '',
        model: valuateParams.model || '',
        year: valuateParams.year || '2020',
        km: valuateParams.km || '',
      });
    }
  }

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    fetchBrands()
      .then((data) => {
        if (Array.isArray(data)) setBrands(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!draft.brand) return undefined;
    let cancelled = false;
    fetchFilteredModels({ brand: draft.brand })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setModelsState({ brand: draft.brand, list: data });
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [draft.brand]);

  const models = draft.brand && modelsState.brand === draft.brand ? modelsState.list : [];

  const activeQueryKey =
    valuateParams?.brand && valuateParams?.model && valuateParams?.year
      ? paramsKey
      : null;

  const [valState, setValState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!activeQueryKey) return undefined;
    const controller = new AbortController();
    fetchValuation(valuateParams, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setValState({ key: activeQueryKey, data, error: null });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setValState({ key: activeQueryKey, data: null, error: err.message || 'error' });
        }
      });
    return () => controller.abort();
  }, [activeQueryKey, valuateParams]);

  const loading = Boolean(activeQueryKey) && valState.key !== activeQueryKey;
  const result = activeQueryKey && valState.key === activeQueryKey ? valState.data : null;
  const error = activeQueryKey && valState.key === activeQueryKey ? valState.error : null;

  const rangeMetrics = useMemo(() => {
    if (!result || result.confidence === 'none' || !result.maxPrice || result.maxPrice <= result.minPrice) {
      return null;
    }
    const span = result.maxPrice - result.minPrice;
    const clampPct = (val) => Math.max(0, Math.min(100, ((val - result.minPrice) / span) * 100));
    const qPct = clampPct(result.quickSalePrice);
    const fPct = clampPct(result.fairPrice);
    const oPct = clampPct(result.optimisticPrice);
    return {
      quickPct: qPct,
      fairPct: fPct,
      optPct: oPct,
      iqrLeft: Math.min(qPct, oPct),
      iqrWidth: Math.max(4, Math.abs(oPct - qPct)),
    };
  }, [result]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!draft.brand || !draft.model || !draft.year) return;
    trackEvent('valuate_submit', 'engagement', `${draft.brand} ${draft.model} ${draft.year}`);
    onUpdateParams && onUpdateParams({
      brand: draft.brand,
      model: draft.model,
      year: String(draft.year),
      km: draft.km ? String(draft.km).trim() : '',
    });
  };

  const handleShare = () => {
    const shareUrl = window.location.href;
    const p = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(shareUrl)
      : Promise.reject();
    p.then(() => {
      setCopiedShare(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedShare(false), 2000);
    }).catch(() => {
      window.prompt(t('valuateShareBtn'), shareUrl);
    });
  };

  const seoSubject = valuateParams?.brand && valuateParams?.model
    ? `${valuateParams.brand} ${valuateParams.model}${valuateParams.year ? ` ${valuateParams.year}` : ''}`
    : '';

  return (
    <div className="valuate-page">
      <section className="valuate-hero">
        <div className="valuate-hero-header">
          <span className="valuate-kicker">
            <CalculatorIcon size={15} color="currentColor" />
            <span>{t('navValuate')}</span>
          </span>
          <h1 className="valuate-title">
            {seoSubject ? t('valuateSeoHeading', { subject: seoSubject }) : t('valuateTitle')}
          </h1>
          <p className="valuate-subtitle">{t('valuateSubtitle')}</p>
        </div>

        <form className="valuate-form" onSubmit={handleSubmit}>
          <div className="valuate-field">
            <label htmlFor="val-brand">{t('valuateBrand')}</label>
            <select
              id="val-brand"
              value={draft.brand}
              required
              onChange={(e) => setDraft((prev) => ({ ...prev, brand: e.target.value, model: '' }))}
            >
              <option value="">{t('valuateBrandPlaceholder')}</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="valuate-field">
            <label htmlFor="val-model">{t('valuateModel')}</label>
            <select
              id="val-model"
              value={draft.model}
              required
              disabled={!draft.brand}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
            >
              <option value="">{draft.brand ? t('valuateModelPlaceholder') : t('selectBrandFirst')}</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="valuate-field valuate-field--compact">
            <label htmlFor="val-year">{t('valuateYear')}</label>
            <select
              id="val-year"
              value={draft.year}
              required
              onChange={(e) => setDraft((prev) => ({ ...prev, year: e.target.value }))}
            >
              {YEARS.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          <div className="valuate-field valuate-field--compact">
            <label htmlFor="val-km">{t('valuateKm')}</label>
            <input
              id="val-km"
              type="number"
              min="0"
              max="999999"
              step="1000"
              placeholder={t('valuateKmPlaceholder')}
              value={draft.km}
              onChange={(e) => setDraft((prev) => ({ ...prev, km: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            className="btn-valuate-submit"
            disabled={!draft.brand || !draft.model || !draft.year || loading}
          >
            {loading ? t('valuateLoading') : t('valuateSubmit')}
          </button>
        </form>
      </section>

      {!activeQueryKey && !loading && valuateParams?.brand && valuateParams?.model && (
        <div className="valuate-results">
          <div className="valuate-results-topbar">
            <div className="valuate-results-heading">
              <h2>{valuateParams.brand} {valuateParams.model}</h2>
            </div>
            <div className="valuate-results-actions">
              {onBrowseSimilar && (
                <button
                  type="button"
                  className="btn-valuate-browse"
                  onClick={() => onBrowseSimilar({ brand: valuateParams.brand, model: valuateParams.model })}
                >
                  {t('valuateBrowseSimilar')} →
                </button>
              )}
            </div>
          </div>
          <DepreciationCurveCard
            brand={valuateParams.brand}
            model={valuateParams.model}
            selectedYear=""
            onSelectYear={(yr) =>
              onUpdateParams({
                ...valuateParams,
                brand: valuateParams.brand,
                model: valuateParams.model,
                year: String(yr),
              })
            }
          />
        </div>
      )}

      {!activeQueryKey && !loading && !(valuateParams?.brand && valuateParams?.model) && (
        <div className="valuate-empty-hint">
          <CalculatorIcon size={28} color="var(--accent)" />
          <p>{t('valuateEmptyHint')}</p>
        </div>
      )}

      {loading && (
        <div className="valuate-loading-box">
          <div className="loader"></div>
          <p>{t('valuateLoading')}</p>
        </div>
      )}

      {!loading && error && (
        <div className="valuate-error-box">{t('valuateError')}</div>
      )}

      {!loading && !error && result && (
        <div className="valuate-results">
          <div className="valuate-results-topbar">
            <div className="valuate-results-heading">
              <h2>{result.brand} {result.model} {result.year}</h2>
              <span className={`valuate-confidence-badge valuate-confidence-badge--${result.confidence}`}>
                {t(CONFIDENCE_KEY_MAP[result.confidence] || 'valuateConfidenceNone', { count: result.sampleCount || 0 })}
              </span>
            </div>
            <div className="valuate-results-actions">
              <button type="button" className="btn-valuate-share" onClick={handleShare}>
                {copiedShare ? t('valuateShareCopied') : `🔗 ${t('valuateShareBtn')}`}
              </button>
              {onBrowseSimilar && (
                <button
                  type="button"
                  className="btn-valuate-browse"
                  onClick={() => onBrowseSimilar({ brand: result.brand, model: result.model })}
                >
                  {t('valuateBrowseSimilar')} →
                </button>
              )}
            </div>
          </div>

          {(result.yearWindow > 0 || (result.km > 0 && result.medianKm > 0 && Math.abs(result.kmAdjustmentPct) >= 0.5)) && (
            <div className="valuate-notes">
              {result.yearWindow > 0 && <span>ℹ️ {t('valuateYearWindowNote')}</span>}
              {result.km > 0 && result.medianKm > 0 && Math.abs(result.kmAdjustmentPct) >= 0.5 && (
                <span>
                  📏 {t('valuateKmAdjNote', {
                    pct: `${result.kmAdjustmentPct > 0 ? '+' : ''}${result.kmAdjustmentPct.toFixed(1)}`,
                    medianKm: `${result.medianKm.toLocaleString()} km`,
                  })}
                </span>
              )}
            </div>
          )}

          {result.confidence === 'none' ? (
            <div className="valuate-no-data">
              <p>{t('valuateNoDataDesc')}</p>
              {onBrowseSimilar && (
                <button
                  type="button"
                  className="btn-valuate-browse"
                  onClick={() => onBrowseSimilar({ brand: result.brand })}
                >
                  {t('valuateBrowseSimilar')} →
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="valuate-bands-grid">
                <div className="valuate-band-card valuate-band-card--quick">
                  <div className="valuate-band-label">{t('valuateQuickSale')}</div>
                  <div className="valuate-band-usd">{formatUSD(result.quickSalePrice)}</div>
                  <div className="valuate-band-crc">{formatCRC(result.quickSalePrice * fxRate)}</div>
                  <div className="valuate-band-hint">{t('valuateQuickSaleHint')}</div>
                </div>

                <div className="valuate-band-card valuate-band-card--fair">
                  <div className="valuate-band-label">{t('valuateFairPrice')}</div>
                  <div className="valuate-band-usd">{formatUSD(result.fairPrice)}</div>
                  <div className="valuate-band-crc">{formatCRC(result.fairPrice * fxRate)}</div>
                  <div className="valuate-band-hint">{t('valuateFairPriceHint')}</div>
                </div>

                <div className="valuate-band-card valuate-band-card--optimistic">
                  <div className="valuate-band-label">{t('valuateOptimistic')}</div>
                  <div className="valuate-band-usd">{formatUSD(result.optimisticPrice)}</div>
                  <div className="valuate-band-crc">{formatCRC(result.optimisticPrice * fxRate)}</div>
                  <div className="valuate-band-hint">{t('valuateOptimisticHint')}</div>
                </div>
              </div>

              {rangeMetrics && (
                <div className="valuate-range-card">
                  <div className="valuate-range-track">
                    <div
                      className="valuate-range-iqr"
                      style={{ left: `${rangeMetrics.iqrLeft}%`, width: `${rangeMetrics.iqrWidth}%` }}
                    />
                    <div
                      className="valuate-range-dot valuate-range-dot--fair"
                      style={{ left: `${rangeMetrics.fairPct}%` }}
                    />
                  </div>
                  <div className="valuate-range-labels">
                    <span>{t('valuateRangeMin', { price: formatUSD(result.minPrice) })}</span>
                    <span>{t('valuateRangeMax', { price: formatUSD(result.maxPrice) })}</span>
                  </div>
                </div>
              )}

              <div className="valuate-liquidity-section">
                <h3>{t('valuateLiquidityTitle')}</h3>
                <div className="valuate-liquidity-grid">
                  <div className="valuate-liq-kpi">
                    <span className="valuate-liq-label">{t('valuateActiveCompetitors')}</span>
                    <span className="valuate-liq-value">{result.activeCount}</span>
                  </div>
                  <div className="valuate-liq-kpi">
                    <span className="valuate-liq-label">{t('valuateSoldCount')}</span>
                    <span className="valuate-liq-value">{result.soldCount}</span>
                  </div>
                  <div className="valuate-liq-kpi">
                    <span className="valuate-liq-label">{t('valuateSoldRate')}</span>
                    <span className="valuate-liq-value">{Number(result.soldRate || 0).toFixed(0)}%</span>
                  </div>
                  <div className="valuate-liq-kpi">
                    <span className="valuate-liq-label">{t('valuateMedianDays')}</span>
                    <span className="valuate-liq-value">
                      {result.medianDaysListed > 0
                        ? t('valuateDaysUnit', { days: result.medianDaysListed })
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <UpgradeCalculatorCard
                brand={result.brand || valuateParams?.brand || ''}
                model={result.model || valuateParams?.model || ''}
                year={result.year || valuateParams?.year || ''}
                valuationResult={result}
                onBrowseUpgrade={onBrowseUpgrade}
              />

              {Array.isArray(result.comparables) && result.comparables.length > 0 && (
                <div className="valuate-comparables-section">
                  <h3>{t('valuateComparablesTitle')}</h3>
                  <div className="results-grid active-view">
                    {result.comparables.map((car) => (
                      <CarCard
                        key={car.URL}
                        car={car}
                        isNew={isNew(car)}
                        isFav={isFavorite(car.URL)}
                        onToggleFav={toggleFavorite}
                        onOpenDetails={setSelectedCar}
                        onNegotiateWithCopilot={onNegotiateWithCopilot}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <DepreciationCurveCard
            brand={result.brand || valuateParams.brand}
            model={result.model || valuateParams.model}
            selectedYear={result.year || valuateParams.year}
            onSelectYear={(yr) =>
              onUpdateParams({
                ...valuateParams,
                brand: result.brand || valuateParams.brand,
                model: result.model || valuateParams.model,
                year: String(yr),
              })
            }
          />
        </div>
      )}

      {selectedCar && (
        <CarDetailsModal
          isOpen
          onClose={() => setSelectedCar(null)}
          car={selectedCar}
          onFilterBySeller={onFilterBySeller}
          onNegotiateWithCopilot={onNegotiateWithCopilot}
        />
      )}
    </div>
  );
};

export default ValuatePage;
