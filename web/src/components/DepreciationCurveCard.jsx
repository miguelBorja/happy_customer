import { useState, useEffect, useMemo } from 'react';
import { fetchDepreciation } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';

const SVG_WIDTH = 640;
const SVG_HEIGHT = 236;
const PAD = { left: 56, right: 24, top: 22, bottom: 36 };

const formatShortK = (value) => {
  const n = Number(value) || 0;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
};

const computeFiveYearRetention = (points, avgAnnualDropPct) => {
  if (!Array.isArray(points) || points.length === 0) return null;
  const reliable = points.filter((p) => !p.lowSample && p.median > 0);
  const pool = reliable.length >= 2 ? reliable : points.filter((p) => p.median > 0);
  if (pool.length === 0) return null;

  const newest = pool[pool.length - 1];
  const targetYear = newest.year - 5;
  let bestOlder = null;
  let bestDist = Infinity;

  for (const pt of pool) {
    if (pt.year >= newest.year - 2) continue;
    const dist = Math.abs(pt.year - targetYear);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      bestOlder = pt;
    }
  }

  if (bestOlder && newest.median > 0) {
    const yearsApart = Math.max(1, newest.year - bestOlder.year);
    const ratio = bestOlder.median / newest.median;
    const projected5 = yearsApart === 5 ? ratio : Math.pow(ratio, 5 / yearsApart);
    return Math.max(5, Math.min(99, Math.round(projected5 * 100)));
  }

  if (avgAnnualDropPct > 0 && avgAnnualDropPct < 50) {
    const pct = Math.pow(1 - avgAnnualDropPct / 100, 5) * 100;
    return Math.max(5, Math.min(99, Math.round(pct)));
  }

  return null;
};

const DepreciationCurveCard = ({
  brand,
  model,
  selectedYear,
  onSelectYear,
  onOpenValuate,
}) => {
  const { t } = useLanguage();
  const [state, setState] = useState({ key: null, data: null, error: null });

  const queryKey = brand && model ? `${brand}|${model}` : null;

  useEffect(() => {
    if (!queryKey) return undefined;
    const controller = new AbortController();
    fetchDepreciation({ brand, model }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setState({ key: queryKey, data: res, error: null });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setState({ key: queryKey, data: null, error: err?.message || 'error' });
        }
      });
    return () => controller.abort();
  }, [queryKey, brand, model]);

  const loading = Boolean(queryKey) && state.key !== queryKey;
  const activeData = state.key === queryKey ? state.data : null;
  const activeError = state.key === queryKey ? state.error : null;

  const chart = useMemo(() => {
    const rawPoints = Array.isArray(activeData?.points) ? activeData.points : [];
    const points = rawPoints.filter((p) => p && p.year > 0 && p.median > 0);
    if (points.length < 2) return null;

    const minYear = points[0].year;
    const maxYear = points[points.length - 1].year;
    const yearSpan = Math.max(1, maxYear - minYear);

    const priceValues = [];
    for (const p of points) {
      priceValues.push(p.median);
      if (p.p25 > 0) priceValues.push(p.p25);
      if (p.p75 > 0) priceValues.push(p.p75);
    }
    const rawMin = Math.min(...priceValues);
    const rawMax = Math.max(...priceValues);
    const priceSpan = Math.max(2000, rawMax - rawMin);
    const yMin = Math.max(0, rawMin - priceSpan * 0.12);
    const yMax = rawMax + priceSpan * 0.1;

    const plotW = SVG_WIDTH - PAD.left - PAD.right;
    const plotH = SVG_HEIGHT - PAD.top - PAD.bottom;

    const xOf = (yr) => PAD.left + ((yr - minYear) / yearSpan) * plotW;
    const yOf = (val) => PAD.top + (1 - (val - yMin) / Math.max(1, yMax - yMin)) * plotH;

    const mapped = points.map((pt) => {
      const topVal = pt.p75 > 0 ? pt.p75 : pt.median;
      const botVal = pt.p25 > 0 ? pt.p25 : pt.median;
      return {
        ...pt,
        x: xOf(pt.year),
        y: yOf(pt.median),
        yTop: yOf(topVal),
        yBot: yOf(botVal),
      };
    });

    const bandPolygon = [
      ...mapped.map((p) => `${p.x.toFixed(1)},${p.yTop.toFixed(1)}`),
      ...[...mapped].reverse().map((p) => `${p.x.toFixed(1)},${p.yBot.toFixed(1)}`),
    ].join(' ');

    const medianLine = mapped
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');

    const yTicks = [0, 0.33, 0.67, 1].map((tFrac) => {
      const val = yMin + tFrac * (yMax - yMin);
      return { val, y: yOf(val) };
    });

    return { mapped, bandPolygon, medianLine, yTicks };
  }, [activeData]);

  if (!queryKey) return null;

  if (loading) {
    return (
      <div className="depreciation-curve-card is-loading">
        <div className="depreciation-header">
          <div>
            <h3>{t('depreciationTitle')}</h3>
            <p>{t('depreciationLoading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeError) {
    return (
      <div className="depreciation-curve-card is-error">
        <h3>{t('depreciationTitle')}</h3>
        <p className="depreciation-empty-msg">{t('depreciationError')}</p>
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="depreciation-curve-card is-empty">
        <h3>{t('depreciationTitle')}</h3>
        <p className="depreciation-empty-msg">
          {t('depreciationEmpty', { brand, model })}
        </p>
      </div>
    );
  }

  const sweetSpot = activeData?.sweetSpot || null;
  const selectedNum = Number(selectedYear) || 0;
  const fiveYearRetention = computeFiveYearRetention(chart.mapped, activeData?.avgAnnualDropPct);
  const labelStep = Math.max(1, Math.ceil(chart.mapped.length / 8));
  const targetValuateYear =
    selectedNum ||
    sweetSpot?.year ||
    chart.mapped[chart.mapped.length - 1]?.year;

  return (
    <div className="depreciation-curve-card">
      <div className="depreciation-header">
        <div>
          <h3>📉 {t('depreciationTitle')}</h3>
          <p>{t('depreciationSubtitle', { brand, model })}</p>
        </div>
        <div className="depreciation-kpis">
          <div className="depreciation-kpi">
            <span className="depreciation-kpi-label">{t('depreciationAvgDrop')}</span>
            <strong className="depreciation-kpi-value">
              {activeData?.avgAnnualDropPct > 0
                ? `${Number(activeData.avgAnnualDropPct).toFixed(1)}%`
                : '—'}
            </strong>
          </div>
          <div className="depreciation-kpi">
            <span className="depreciation-kpi-label">{t('depreciationRetention5yr')}</span>
            <strong className="depreciation-kpi-value">
              {fiveYearRetention !== null ? `${fiveYearRetention}%` : '—'}
            </strong>
          </div>
          <div className="depreciation-kpi">
            <span className="depreciation-kpi-label">
              {t('depreciationSampleNote', { count: activeData?.totalSamples || 0 })}
            </span>
          </div>
        </div>
      </div>

      {sweetSpot && (
        <div
          className="depreciation-sweetspot-banner"
          role={onSelectYear ? 'button' : undefined}
          tabIndex={onSelectYear ? 0 : undefined}
          onClick={() => onSelectYear?.(sweetSpot.year)}
          onKeyDown={(e) => {
            if (onSelectYear && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectYear(sweetSpot.year);
            }
          }}
        >
          <span className="depreciation-sweetspot-icon">🎯</span>
          <div className="depreciation-sweetspot-copy">
            <strong>{t('depreciationSweetSpotTitle', { year: sweetSpot.year })}</strong>
            <span>
              {t('depreciationSweetSpotBody', {
                prevYear: sweetSpot.comparedToYear,
                year: sweetSpot.year,
                pct: Number(sweetSpot.savingsPct || 0).toFixed(1),
                usd: formatUSD(sweetSpot.savingsUSD),
              })}
            </span>
          </div>
        </div>
      )}

      <div className="depreciation-svg-wrap">
        <svg
          className="depreciation-svg"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={t('depreciationTitle')}
        >
          {chart.yTicks.map((tk, idx) => (
            <g key={idx}>
              <line
                x1={PAD.left}
                y1={tk.y}
                x2={SVG_WIDTH - PAD.right}
                y2={tk.y}
                className="depreciation-grid-line"
              />
              <text
                x={PAD.left - 8}
                y={tk.y + 4}
                textAnchor="end"
                className="depreciation-axis-label"
              >
                {formatShortK(tk.val)}
              </text>
            </g>
          ))}

          <polygon points={chart.bandPolygon} className="depreciation-band" />
          <polyline points={chart.medianLine} className="depreciation-median-line" />

          {chart.mapped.map((pt, idx) => {
            const isSelected = selectedNum === pt.year;
            const isSweet = sweetSpot?.year === pt.year;
            const showLabel =
              idx === 0 ||
              idx === chart.mapped.length - 1 ||
              idx % labelStep === 0 ||
              isSelected ||
              isSweet;

            const r = isSelected || isSweet ? 6 : 4;
            const nodeClass = [
              'depreciation-node',
              pt.lowSample ? 'is-low-sample' : '',
              isSweet ? 'is-sweet-spot' : '',
              isSelected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <g key={pt.year}>
                {showLabel && (
                  <text
                    x={pt.x}
                    y={SVG_HEIGHT - 10}
                    textAnchor="middle"
                    className={`depreciation-year-label${isSelected ? ' is-selected' : ''}${isSweet ? ' is-sweet-spot' : ''}`}
                  >
                    {pt.year}
                  </text>
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  className={nodeClass}
                  style={{ cursor: onSelectYear ? 'pointer' : 'default' }}
                  tabIndex={onSelectYear ? 0 : undefined}
                  role={onSelectYear ? 'button' : undefined}
                  aria-label={`${pt.year}: ${formatUSD(pt.median)}`}
                  onClick={() => onSelectYear?.(pt.year)}
                  onKeyDown={(e) => {
                    if (onSelectYear && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectYear(pt.year);
                    }
                  }}
                >
                  <title>{`${pt.year} · ${formatUSD(pt.median)} (${pt.count})`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="depreciation-footer">
        <div className="depreciation-legend">
          <span className="depreciation-legend-item">
            <span className="depreciation-swatch is-median" />
            {t('depreciationMedianLegend')}
          </span>
          <span className="depreciation-legend-item">
            <span className="depreciation-swatch is-band" />
            {t('depreciationBandLegend')}
          </span>
          {sweetSpot && (
            <span className="depreciation-legend-item">
              <span className="depreciation-swatch is-sweet" />
              {t('depreciationSweetSpotLegend')} ({sweetSpot.year})
            </span>
          )}
        </div>

        <div className="depreciation-footer-actions">
          {onSelectYear && (
            <span className="depreciation-hint">{t('depreciationClickYearHint')}</span>
          )}
          {onOpenValuate && targetValuateYear > 0 && (
            <button
              type="button"
              className="btn-depreciation-valuate"
              onClick={() => onOpenValuate({ brand, model, year: targetValuateYear })}
            >
              {t('depreciationOpenValuate', {
                brand,
                model,
                year: targetValuateYear,
              })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepreciationCurveCard;
