import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';
import {
  DEFAULT_FX_RATE,
  estimateCrCosts,
  formatCRC,
  getStoredFxRate,
  setStoredFxRate,
} from '../utils/crCostEstimator';

const TERM_OPTIONS = [36, 48, 60, 72, 84];

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
