import { estimateTransferCostUSD } from './crCostEstimator';

/**
 * Exact inverse of monthly amortization payment formula: returns max loan principal
 * supported by `monthlyUSD` at `annualRatePct` over `termMonths`.
 */
export const calculateLoanPrincipalFromMonthly = (monthlyUSD, annualRatePct, termMonths) => {
  const m = Math.max(0, Number(monthlyUSD) || 0);
  const n = Math.max(1, Number(termMonths) || 1);
  if (m <= 0) return 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (r <= 0) return m * n;
  const factor = Math.pow(1 + r, n);
  return (m * (factor - 1)) / (r * factor);
};

/**
 * Binary-searches the maximum vehicle sticker price `P` such that `P + estimateTransferCostUSD(P) <= totalBudgetUSD`.
 */
export const maxStickerForTurnkeyBudget = (totalBudgetUSD) => {
  const budget = Math.floor(Number(totalBudgetUSD) || 0);
  if (budget <= 250) return 0;

  let lo = 0;
  let hi = budget;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const needed = mid > 0 ? mid + estimateTransferCostUSD(mid) : 0;
    if (needed <= budget) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
};

/**
 * Computes realistic CR upgrade budget when trading in or selling the user's current car,
 * factoring remaining loan payoff, extra cash or monthly financing capacity, and estimated traspaso.
 */
export const calculateUpgradeBudget = ({
  currentValueUSD,
  debtUSD = 0,
  fundingMode = 'cash',
  extraCashUSD = 0,
  targetMonthlyUSD = 0,
  annualRatePct = 9.5,
  termMonths = 72,
  saleMode = 'tradein',
} = {}) => {
  const grossValueUSD = Math.max(0, Math.round(Number(currentValueUSD) || 0));
  const payoffUSD = Math.max(0, Math.round(Number(debtUSD) || 0));
  const netEquityUSD = Math.max(0, grossValueUSD - payoffUSD);
  const underwaterUSD = Math.max(0, payoffUSD - grossValueUSD);

  const extraCash = Math.max(0, Math.round(Number(extraCashUSD) || 0));
  const loanPrincipalUSD =
    fundingMode === 'monthly'
      ? Math.round(calculateLoanPrincipalFromMonthly(targetMonthlyUSD, annualRatePct, termMonths))
      : 0;

  const addedBuyingPowerUSD = fundingMode === 'monthly' ? loanPrincipalUSD + extraCash : extraCash;
  const totalAllInUSD = Math.max(0, grossValueUSD - payoffUSD + addedBuyingPowerUSD);

  const maxCarPriceUSD = maxStickerForTurnkeyBudget(totalAllInUSD);
  const estimatedTransferUSD = maxCarPriceUSD > 0 ? estimateTransferCostUSD(maxCarPriceUSD) : 0;
  const comfortPriceUSD = maxCarPriceUSD > 0 ? Math.round((maxCarPriceUSD * 0.9) / 500) * 500 : 0;
  const minSuggestedPriceUSD =
    maxCarPriceUSD > 2000 ? Math.min(maxCarPriceUSD - 500, Math.max(0, Math.round((maxCarPriceUSD * 0.72) / 500) * 500)) : 0;

  return {
    saleMode,
    fundingMode,
    grossValueUSD,
    payoffUSD,
    netEquityUSD,
    underwaterUSD,
    extraCashUSD: extraCash,
    loanPrincipalUSD,
    addedBuyingPowerUSD,
    totalAllInUSD,
    maxCarPriceUSD,
    comfortPriceUSD,
    minSuggestedPriceUSD,
    estimatedTransferUSD,
  };
};
