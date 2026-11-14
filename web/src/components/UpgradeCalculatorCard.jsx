import { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatUSD } from '../utils/marketDeal';
import { calculateUpgradeBudget } from '../utils/upgradeCalculator';
import { SearchIcon, SparkleIcon } from './icons/AppIcons';

const UpgradeCalculatorCard = ({ brand, model, year, valuationResult, onBrowseUpgrade }) => {
  const { t } = useLanguage();
  const [saleMode, setSaleMode] = useState('tradein');
  const [debtInput, setDebtInput] = useState('0');
  const [fundingMode, setFundingMode] = useState('cash');
  const [extraCashInput, setExtraCashInput] = useState('4000');
  const [monthlyInput, setMonthlyInput] = useState('350');
  const [rateInput, setRateInput] = useState('9.5');
  const [termMonths, setTermMonths] = useState(72);
  const [onlySeRecibe, setOnlySeRecibe] = useState(false);

  const tradeInValue = valuationResult?.quickSalePrice || valuationResult?.fairPrice || 0;
  const directValue = valuationResult?.fairPrice || valuationResult?.quickSalePrice || 0;
  const currentValueUSD = saleMode === 'tradein' ? tradeInValue : directValue;

  const budget = useMemo(
    () =>
      calculateUpgradeBudget({
        currentValueUSD,
        debtUSD: Number(debtInput) || 0,
        fundingMode,
        extraCashUSD: Number(extraCashInput) || 0,
        targetMonthlyUSD: Number(monthlyInput) || 0,
        annualRatePct: Number(rateInput) || 0,
        termMonths,
        saleMode,
      }),
    [currentValueUSD, debtInput, fundingMode, extraCashInput, monthlyInput, rateInput, termMonths, saleMode],
  );

  if (!valuationResult || valuationResult.confidence === 'none' || currentValueUSD <= 0) {
    return null;
  }

  const handleBrowse = () => {
    if (!onBrowseUpgrade || budget.maxCarPriceUSD <= 0) return;
    onBrowseUpgrade({
      priceMin: budget.minSuggestedPriceUSD > 0 ? String(budget.minSuggestedPriceUSD) : '',
      priceMax: String(budget.maxCarPriceUSD),
      seRecibe: onlySeRecibe ? 'Sí' : '',
      context: {
        currentCarLabel: `${brand} ${model} ${year}`.trim(),
        saleMode,
        grossValueUSD: budget.grossValueUSD,
        debtUSD: budget.payoffUSD,
        minPriceUSD: budget.minSuggestedPriceUSD,
        maxPriceUSD: budget.maxCarPriceUSD,
      },
    });
  };

  return (
    <section className="upgrade-calc-card" aria-label={t('upgradeTitle')}>
      <div className="upgrade-calc-header">
        <div>
          <h3 className="upgrade-calc-title">
            <SparkleIcon size={16} />
            <span>{t('upgradeTitle')}</span>
          </h3>
          <p className="upgrade-calc-subtitle">{t('upgradeSubtitle')}</p>
        </div>
      </div>

      <div className="upgrade-calc-grid">
        <div className="upgrade-calc-controls">
          <div className="upgrade-field">
            <span className="upgrade-label">{t('upgradeSaleModeLabel')}</span>
            <div className="upgrade-segmented">
              <button
                type="button"
                className={`upgrade-seg-btn ${saleMode === 'tradein' ? 'active' : ''}`.trim()}
                onClick={() => setSaleMode('tradein')}
              >
                <span>{t('upgradeModeTradeIn')}</span>
                <strong>{formatUSD(tradeInValue)}</strong>
              </button>
              <button
                type="button"
                className={`upgrade-seg-btn ${saleMode === 'direct' ? 'active' : ''}`.trim()}
                onClick={() => setSaleMode('direct')}
              >
                <span>{t('upgradeModeDirect')}</span>
                <strong>{formatUSD(directValue)}</strong>
              </button>
            </div>
          </div>

          <div className="upgrade-inputs-row">
            <label className="upgrade-field">
              <span className="upgrade-label">{t('upgradeDebtLabel')}</span>
              <input
                type="number"
                min="0"
                step="500"
                className="upgrade-input"
                value={debtInput}
                onChange={(e) => setDebtInput(e.target.value)}
              />
            </label>

            <div className="upgrade-field">
              <span className="upgrade-label">{t('upgradeFundingLabel')}</span>
              <div className="upgrade-segmented compact">
                <button
                  type="button"
                  className={`upgrade-seg-btn ${fundingMode === 'cash' ? 'active' : ''}`.trim()}
                  onClick={() => setFundingMode('cash')}
                >
                  {t('upgradeFundingCash')}
                </button>
                <button
                  type="button"
                  className={`upgrade-seg-btn ${fundingMode === 'monthly' ? 'active' : ''}`.trim()}
                  onClick={() => setFundingMode('monthly')}
                >
                  {t('upgradeFundingMonthly')}
                </button>
              </div>
            </div>
          </div>

          {fundingMode === 'cash' ? (
            <label className="upgrade-field">
              <span className="upgrade-label">{t('upgradeExtraCashLabel')}</span>
              <input
                type="number"
                min="0"
                step="500"
                className="upgrade-input"
                value={extraCashInput}
                onChange={(e) => setExtraCashInput(e.target.value)}
              />
            </label>
          ) : (
            <div className="upgrade-inputs-row three-col">
              <label className="upgrade-field">
                <span className="upgrade-label">{t('upgradeMonthlyLabel')}</span>
                <input
                  type="number"
                  min="50"
                  step="25"
                  className="upgrade-input"
                  value={monthlyInput}
                  onChange={(e) => setMonthlyInput(e.target.value)}
                />
              </label>
              <label className="upgrade-field">
                <span className="upgrade-label">{t('upgradeRateLabel')}</span>
                <input
                  type="number"
                  min="0"
                  max="35"
                  step="0.5"
                  className="upgrade-input"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                />
              </label>
              <label className="upgrade-field">
                <span className="upgrade-label">{t('upgradeTermLabel')}</span>
                <select
                  className="upgrade-input"
                  value={termMonths}
                  onChange={(e) => setTermMonths(Number(e.target.value))}
                >
                  {[48, 60, 72, 84].map((m) => (
                    <option key={m} value={m}>
                      {t('upgradeTermMonths', { n: m })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="upgrade-checkbox-row">
            <input
              type="checkbox"
              checked={onlySeRecibe}
              onChange={(e) => setOnlySeRecibe(e.target.checked)}
            />
            <span>{t('upgradeOnlySeRecibe')}</span>
          </label>
        </div>

        <div className="upgrade-result-panel">
          <div className="upgrade-breakdown">
            <div className="upgrade-breakdown-row">
              <span>{t('upgradeCarValueLabel')}</span>
              <span>{formatUSD(budget.grossValueUSD)}</span>
            </div>
            {budget.payoffUSD > 0 && (
              <div className="upgrade-breakdown-row">
                <span>{t('upgradeDebtLabel')}</span>
                <span>−{formatUSD(budget.payoffUSD)}</span>
              </div>
            )}
            <div className="upgrade-breakdown-row">
              <span>{t('upgradeEquityLabel')}</span>
              <strong>{formatUSD(budget.netEquityUSD)}</strong>
            </div>
            {fundingMode === 'monthly' ? (
              <div className="upgrade-breakdown-row">
                <span>{t('upgradeLoanPowerLabel')}</span>
                <span>+{formatUSD(budget.loanPrincipalUSD)}</span>
              </div>
            ) : (
              <div className="upgrade-breakdown-row">
                <span>{t('upgradeExtraCashLabel')}</span>
                <span>+{formatUSD(budget.extraCashUSD)}</span>
              </div>
            )}
          </div>

          {budget.underwaterUSD > 0 && (
            <div className="upgrade-underwater-warn">
              {t('upgradeUnderwaterWarn', { amount: formatUSD(budget.underwaterUSD) })}
            </div>
          )}

          <div className="upgrade-target-box">
            <span className="upgrade-target-label">{t('upgradeMaxCarLabel')}</span>
            <strong className="upgrade-target-price">{formatUSD(budget.maxCarPriceUSD)}</strong>
            <span className="upgrade-target-hint">
              {t('upgradeComfortRange', {
                min: formatUSD(budget.minSuggestedPriceUSD),
                max: formatUSD(budget.maxCarPriceUSD),
                transfer: formatUSD(budget.estimatedTransferUSD),
              })}
            </span>
          </div>

          <button
            type="button"
            className="upgrade-browse-btn"
            disabled={budget.maxCarPriceUSD <= 0}
            onClick={handleBrowse}
          >
            <SearchIcon size={15} />
            <span>{t('upgradeBrowseBtn', { max: formatUSD(budget.maxCarPriceUSD) })}</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default UpgradeCalculatorCard;
