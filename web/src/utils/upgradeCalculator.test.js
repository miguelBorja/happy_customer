import { describe, it, expect } from 'vitest';
import { calculateMonthlyLoan, estimateTransferCostUSD } from './crCostEstimator';
import {
  calculateLoanPrincipalFromMonthly,
  maxStickerForTurnkeyBudget,
  calculateUpgradeBudget,
} from './upgradeCalculator';

describe('calculateLoanPrincipalFromMonthly', () => {
  it('inverts calculateMonthlyLoan accurately at standard rates', () => {
    const monthly = calculateMonthlyLoan(15000, 9.5, 72);
    const recovered = calculateLoanPrincipalFromMonthly(monthly, 9.5, 72);
    expect(recovered).toBeCloseTo(15000, 5);
  });

  it('handles 0% financing and non-positive payments', () => {
    expect(calculateLoanPrincipalFromMonthly(250, 0, 48)).toBe(12000);
    expect(calculateLoanPrincipalFromMonthly(0, 9.5, 72)).toBe(0);
    expect(calculateLoanPrincipalFromMonthly(-100, 9.5, 72)).toBe(0);
  });
});

describe('maxStickerForTurnkeyBudget', () => {
  it('guarantees sticker + CR traspaso fits inside total budget', () => {
    const budget = 22000;
    const maxSticker = maxStickerForTurnkeyBudget(budget);
    expect(maxSticker).toBeGreaterThan(20000);
    expect(maxSticker + estimateTransferCostUSD(maxSticker)).toBeLessThanOrEqual(budget);
    expect(maxSticker + 1 + estimateTransferCostUSD(maxSticker + 1)).toBeGreaterThan(budget);
  });

  it('returns 0 when budget cannot cover minimum transfer fees', () => {
    expect(maxStickerForTurnkeyBudget(200)).toBe(0);
    expect(maxStickerForTurnkeyBudget(250)).toBe(0);
  });
});

describe('calculateUpgradeBudget', () => {
  it('computes cash upgrade capacity after debt payoff and transfer fees', () => {
    const res = calculateUpgradeBudget({
      currentValueUSD: 18000,
      debtUSD: 4000,
      fundingMode: 'cash',
      extraCashUSD: 6000,
      saleMode: 'direct',
    });

    expect(res.netEquityUSD).toBe(14000);
    expect(res.underwaterUSD).toBe(0);
    expect(res.totalAllInUSD).toBe(20000);
    expect(res.maxCarPriceUSD + res.estimatedTransferUSD).toBeLessThanOrEqual(20000);
    expect(res.minSuggestedPriceUSD).toBeLessThan(res.comfortPriceUSD);
    expect(res.comfortPriceUSD).toBeLessThanOrEqual(res.maxCarPriceUSD);
  });

  it('handles underwater trade-in debt without inflating buying power', () => {
    const res = calculateUpgradeBudget({
      currentValueUSD: 10000,
      debtUSD: 12000,
      fundingMode: 'monthly',
      targetMonthlyUSD: 350,
      annualRatePct: 9.5,
      termMonths: 72,
    });

    expect(res.netEquityUSD).toBe(0);
    expect(res.underwaterUSD).toBe(2000);
    expect(res.totalAllInUSD).toBe(res.loanPrincipalUSD - 2000);
    expect(res.maxCarPriceUSD + res.estimatedTransferUSD).toBeLessThanOrEqual(res.totalAllInUSD);
  });
});
