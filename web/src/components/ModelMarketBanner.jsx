import { useState, useEffect, useMemo } from 'react';
import { fetchDepreciation } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';

const ModelMarketBanner = ({ brand, model, onSelectYear, onOpenValuate }) => {
  const { t } = useLanguage();
  const [state, setState] = useState({ key: null, data: null });

  const queryKey = brand && model ? `${brand}|${model}` : null;

  useEffect(() => {
    if (!queryKey) return undefined;
    const controller = new AbortController();
    fetchDepreciation({ brand, model }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setState({ key: queryKey, data: res });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ key: queryKey, data: null });
        }
      });
    return () => controller.abort();
  }, [queryKey, brand, model]);

  const data = queryKey && state.key === queryKey ? state.data : null;

  const summary = useMemo(() => {
    const raw = Array.isArray(data?.points) ? data.points : [];
    const points = raw.filter((p) => p && p.year > 0 && p.median > 0);
    if (points.length === 0) return null;

    const minYear = points[0].year;
    const maxYear = points[points.length - 1].year;
    const medians = points.map((p) => p.median);
    const minMedian = Math.min(...medians);
    const maxMedian = Math.max(...medians);

    return {
      minYear,
      maxYear,
      minMedian,
      maxMedian,
      totalSamples: data?.totalSamples || 0,
      avgAnnualDropPct: data?.avgAnnualDropPct > 0 ? Number(data.avgAnnualDropPct).toFixed(1) : null,
      sweetSpot: data?.sweetSpot || null,
    };
  }, [data]);

  if (!summary) return null;

  const yearLabel =
    summary.minYear === summary.maxYear
      ? String(summary.minYear)
      : `${summary.minYear}–${summary.maxYear}`;

  return (
    <section className="model-seo-banner" aria-label={`${brand} ${model}`}>
      <div className="model-seo-banner-info">
        <div className="model-seo-banner-head">
          <h3 className="model-seo-banner-title">
            {brand} {model}
          </h3>
          <span className="model-seo-banner-meta">
            {yearLabel} · {t('modelSeoComparables', { count: summary.totalSamples })}
          </span>
        </div>
        <div className="model-seo-banner-stats">
          <span>
            {t('modelSeoRange', {
              min: formatUSD(summary.minMedian),
              max: formatUSD(summary.maxMedian),
            })}
          </span>
          {summary.avgAnnualDropPct && (
            <span className="model-seo-banner-drop">
              {t('modelSeoAnnualDrop', { pct: summary.avgAnnualDropPct })}
            </span>
          )}
        </div>
      </div>

      <div className="model-seo-banner-actions">
        {summary.sweetSpot && onSelectYear && (
          <button
            type="button"
            className="model-seo-sweetspot-btn"
            onClick={() => onSelectYear(summary.sweetSpot.year)}
          >
            ⭐ {t('modelSeoSweetSpotBtn', { year: summary.sweetSpot.year })}
          </button>
        )}
        {onOpenValuate && (
          <button
            type="button"
            className="model-seo-valuate-btn"
            onClick={() =>
              onOpenValuate({
                brand,
                model,
                year: summary.sweetSpot?.year ? String(summary.sweetSpot.year) : '',
              })
            }
          >
            {t('modelSeoValuateBtn')} →
          </button>
        )}
      </div>
    </section>
  );
};

export default ModelMarketBanner;
