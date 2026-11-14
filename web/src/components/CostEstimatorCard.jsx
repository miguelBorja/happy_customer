import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';
import {
  DEFAULT_FX_RATE,
  estimateCrCosts,
  estimateCrTco3Yr,
  formatCRC,
  getStoredFxRate,
  getStoredMonthlyKm,
  setStoredFxRate,
  setStoredMonthlyKm,
} from '../utils/crCostEstimator';
import { fetchDepreciation } from '../api/client';
import { ChevronDownIcon, ChevronUpIcon } from './icons/AppIcons';

const TERM_OPTIONS = [36, 48, 60, 72, 84];
const KM_PRESETS = [600, 1200, 2000];

const powertrainLabelKey = {
  gasoline: 'tcoPowertrainGas',
  diesel: 'tcoPowertrainDiesel',
  hybrid: 'tcoPowertrainHybrid',
  ev: 'tcoPowertrainEv',
};

const CostEstTcoSection = ({ car, fxRate }) => {
  const { t } = useLanguage();
  const [tcoOpen, setTcoOpen] = useState(false);
  const [monthlyKm, setMonthlyKm] = useState(getStoredMonthlyKm);
  const [depState, setDepState] = useState({ key: '', data: null });

  const depKey = tcoOpen && car?.Brand && car?.Model ? `${car.Brand}|${car.Model}` : '';

  useEffect(() => {
    if (!depKey) return undefined;

    const controller = new AbortController();
    fetchDepreciation({ brand: car.Brand, model: car.Model }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDepState({ key: depKey, data });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDepState({ key: depKey, data: null });
        }
      });

    return () => controller.abort();
  }, [depKey, car?.Brand, car?.Model]);

  const depCurve = depState.key === depKey ? depState.data : null;

  const tco = useMemo(
    () => estimateCrTco3Yr(car, { fxRate, monthlyKm, depCurve }),
    [car, fxRate, monthlyKm, depCurve],
  );

  if (tco.netTco3YrUSD <= 0) return null;

  const handleKmChange = (val) => {
    const saved = setStoredMonthlyKm(val);
    setMonthlyKm(saved);
  };

  return (
    <div className="cost-est-tco-section">
      <button
        type="button"
        className="cost-est-tco-toggle"
        onClick={() => setTcoOpen((prev) => !prev)}
        aria-expanded={tcoOpen}
      >
        <span className="cost-est-tco-toggle-label">
          {tcoOpen ? t('tcoHideBtn') : t('tcoShowBtn')}
        </span>
        <span className="cost-est-tco-toggle-meta">
          <strong>~{formatUSD(tco.netTco3YrUSD)}</strong>
          {tcoOpen ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
        </span>
      </button>

      {tcoOpen && (
        <div className="cost-est-tco-body">
          <div className="cost-est-tco-headline">
            <div>
              <div className="cost-est-tco-kicker">{t('tcoHeadlineLabel')}</div>
              <div className="cost-est-tco-total">
                <strong>~{formatUSD(tco.netTco3YrUSD)}</strong>
                <span className="cost-est-tco-sub">
                  ~{formatCRC(tco.netTco3YrCRC)} · {t('tcoPerMonth', { usd: formatUSD(tco.netMonthlyTcoUSD) })}
                </span>
              </div>
            </div>
            <span className={`cost-est-tco-pill powertrain-${tco.powertrain}`}>
              {t(powertrainLabelKey[tco.powertrain] || 'tcoPowertrainGas')} · {tco.consumption.value} {tco.consumption.unit}
            </span>
          </div>

          <div className="cost-est-tco-usage">
            <div className="cost-est-tco-usage-head">
              <span>{t('tcoUsageLabel')}</span>
              <strong>{monthlyKm.toLocaleString()} {t('tcoKmUnit')}</strong>
            </div>
            <div className="cost-est-tco-usage-controls">
              <input
                type="range"
                min="300"
                max="3500"
                step="100"
                value={monthlyKm}
                onChange={(e) => handleKmChange(e.target.value)}
                aria-label={t('tcoUsageLabel')}
              />
              <div className="cost-est-tco-presets">
                {KM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`cost-est-tco-preset ${monthlyKm === preset ? 'active' : ''}`.trim()}
                    onClick={() => handleKmChange(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="cost-est-tco-rows">
            <div className="cost-est-tco-row">
              <span>{t('tcoRowTransfer')}</span>
              <strong>~{formatUSD(tco.transferUSD)}</strong>
            </div>
            <div className="cost-est-tco-row">
              <span>{t('tcoRowMarchamo')}</span>
              <strong>~{formatUSD(tco.marchamo3YrUSD)}</strong>
            </div>
            <div className="cost-est-tco-row">
              <span>{t('tcoRowEnergy')}</span>
              <strong>~{formatUSD(tco.energy3YrUSD)}</strong>
            </div>
            <div className="cost-est-tco-row">
              <span>
                {t('tcoRowDepreciation')}{' '}
                <em className="cost-est-tco-source">
                  ({tco.depreciationSource === 'curve' ? t('tcoSourceCurve') : t('tcoSourceBenchmark')})
                </em>
              </span>
              <strong>~{formatUSD(tco.depreciationUSD)}</strong>
            </div>
          </div>

          <p className="cost-est-tco-note">
            {t('tcoResaleHint', {
              resale: formatUSD(tco.estimatedResaleUSD),
              pct: tco.depreciationPct,
            })}{' '}
            {t('tcoFormulaNote')}
          </p>
        </div>
      )}
    </div>
  );
};

const CostEstimatorCard = ({ car }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [fxRate, setFxRate] = useState(getStoredFxRate);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [termMonths, setTermMonths] = useState(72);
  const [annualRatePct, setAnnualRatePct] = useState(9.5);

  if (!car || !car.Price || car.Price <= 0) return null;

  const est = estimateCrCosts(car, {
    fxRate,
    downPaymentPct,
    termMonths,
    annualRatePct,
  });

  const handleFxChange = (e) => {
    const raw = Number(e.target.value);
    if (Number.isNaN(raw)) return;
    setFxRate(raw);
    if (raw >= 350 && raw <= 850) {
      setStoredFxRate(raw);
    }
  };

  const handleFxBlur = () => {
    if (!Number.isFinite(fxRate) || fxRate < 350 || fxRate > 850) {
      setFxRate(DEFAULT_FX_RATE);
      setStoredFxRate(DEFAULT_FX_RATE);
    }
  };

  return (
    <div className="cost-estimator-card">
      <div className="cost-estimator-header">
        <span className="cost-estimator-title">{t('costEstTitle')}</span>
        <button
          type="button"
          className="cost-estimator-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? t('costEstHideAdjust') : t('costEstAdjust')}
        </button>
      </div>

      <div className="cost-estimator-grid">
        <div className="cost-est-metric cost-est-metric-primary">
          <span className="cost-est-label">{t('costEstTurnkey')}</span>
          <span className="cost-est-value">{formatUSD(est.turnkeyUSD)}</span>
          <span className="cost-est-sub">{formatCRC(est.turnkeyCRC)}</span>
        </div>

        <div className="cost-est-metric">
          <span className="cost-est-label">{t('costEstTransfer')}</span>
          <span className="cost-est-value">~{formatUSD(est.transferUSD)}</span>
          <span className="cost-est-sub">{formatCRC(est.transferCRC)}</span>
        </div>

        <div className="cost-est-metric">
          <span className="cost-est-label">{t('costEstMarchamo')}</span>
          <span className="cost-est-value">~{formatCRC(est.marchamoCRC)}</span>
          <span className="cost-est-sub">~{formatUSD(est.marchamoUSD)}</span>
        </div>

        <div className="cost-est-metric">
          <span className="cost-est-label">{t('costEstMonthly')}</span>
          <span className="cost-est-value">{formatUSD(est.monthlyUSD)}</span>
          <span className="cost-est-sub">{formatCRC(est.monthlyCRC)}</span>
        </div>
      </div>

      {est.unpaidTaxes && (
        <div className="cost-est-tax-note">{t('costEstTaxesUnpaidExtra')}</div>
      )}

      <CostEstTcoSection car={car} fxRate={fxRate} />

      {expanded && (
        <div className="cost-estimator-controls">
          <div className="cost-control-row">
            <label className="cost-control-field">
              <span>{t('costEstFxRate')}</span>
              <input
                type="number"
                min="350"
                max="850"
                step="1"
                value={fxRate}
                onChange={handleFxChange}
                onBlur={handleFxBlur}
              />
            </label>

            <label className="cost-control-field">
              <span>{t('costEstDownPayment')}: {downPaymentPct}%</span>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={downPaymentPct}
                onChange={(e) => setDownPaymentPct(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="cost-control-row">
            <label className="cost-control-field">
              <span>{t('costEstTerm')}</span>
              <select
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value))}
              >
                {TERM_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {t('costEstTermMonths', { months: m })}
                  </option>
                ))}
              </select>
            </label>

            <label className="cost-control-field">
              <span>{t('costEstRate')}</span>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={annualRatePct}
                onChange={(e) => setAnnualRatePct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
              />
            </label>
          </div>

          <div className="cost-estimator-summary-line">
            <span>{t('costEstPrincipal')}: <strong>{formatUSD(est.initialOutlayUSD)}</strong></span>
            <span>{t('costEstLoanAmount')}: <strong>{formatUSD(est.loanAmountUSD)}</strong></span>
          </div>

          <div className="cost-estimator-disclaimer">
            {est.unpaidTaxes ? t('costEstTaxesUnpaidExtra') : t('costEstTaxesPaidNote')} {t('costEstDisclaimer')}
          </div>
        </div>
      )}
    </div>
  );
};

export default CostEstimatorCard;
