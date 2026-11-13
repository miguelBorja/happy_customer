import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_FX_RATE,
  getStoredFxRate,
  setStoredFxRate,
  formatCRC,
  estimateTransferCostUSD,
  estimateMarchamoUSD,
  calculateMonthlyLoan,
  estimateCrCosts,
} from './crCostEstimator';

const FX_RATE_KEY = 'crautosdb_fx_rate';

const stubStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  const localStorageMock = {
    getItem: vi.fn((k) => (store.has(k) ? store.get(k) : null)),
    setItem: vi.fn((k, v) => {
      store.set(k, String(v));
    }),
    removeItem: vi.fn((k) => {
      store.delete(k);
    }),
    clear: vi.fn(() => store.clear()),
  };
  vi.stubGlobal('localStorage', localStorageMock);
  return { store, localStorageMock };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStoredFxRate / setStoredFxRate', () => {
  it('exposes the default rate of 510', () => {
    expect(DEFAULT_FX_RATE).toBe(510);
  });

  it('falls back to the default when nothing is stored', () => {
    stubStorage();
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
  });

  it('falls back for invalid stored values', () => {
    stubStorage({ [FX_RATE_KEY]: 'abc' });
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
  });

  it('falls back for out-of-range stored values', () => {
    stubStorage({ [FX_RATE_KEY]: '300' });
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
    stubStorage({ [FX_RATE_KEY]: '900' });
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
  });

  it('reads valid stored rates within range', () => {
    stubStorage({ [FX_RATE_KEY]: '520' });
    expect(getStoredFxRate()).toBe(520);
  });

  it('stores and reads back rounded valid rates', () => {
    const { store } = stubStorage();
    setStoredFxRate(520.6);
    expect(store.get(FX_RATE_KEY)).toBe('521');
    expect(getStoredFxRate()).toBe(521);

    setStoredFxRate(350);
    expect(getStoredFxRate()).toBe(350);

    setStoredFxRate(850);
    expect(getStoredFxRate()).toBe(850);
  });

  it('ignores out-of-range or non-numeric rates when storing', () => {
    const { localStorageMock } = stubStorage();
    setStoredFxRate(300);
    setStoredFxRate(900);
    setStoredFxRate('abc');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
  });

  it('handles localStorage.getItem throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    expect(getStoredFxRate()).toBe(DEFAULT_FX_RATE);
  });

  it('handles localStorage.setItem throwing', () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    expect(() => setStoredFxRate(500)).not.toThrow();
  });
});

describe('formatCRC', () => {
  it('returns an em dash for missing or non-finite values', () => {
    expect(formatCRC(null)).toBe('—');
    expect(formatCRC(undefined)).toBe('—');
    expect(formatCRC(NaN)).toBe('—');
    expect(formatCRC(Infinity)).toBe('—');
  });

  it('formats zero', () => {
    expect(formatCRC(0)).toBe('₡0');
  });

  it('rounds and formats positive numbers', () => {
    expect(formatCRC(1000)).toBe('₡1,000');
    expect(formatCRC(1234.7)).toBe(`₡${Math.round(1234.7).toLocaleString('en-US')}`);
    expect(formatCRC(1234.7)).toBe('₡1,235');
  });
});

describe('estimateTransferCostUSD', () => {
  it('returns 0 for non-positive or null prices', () => {
    expect(estimateTransferCostUSD(0)).toBe(0);
    expect(estimateTransferCostUSD(-500)).toBe(0);
    expect(estimateTransferCostUSD(null)).toBe(0);
  });

  it('applies the $250 minimum floor', () => {
    expect(estimateTransferCostUSD(3000)).toBe(250);
  });

  it('uses the percentage formula above the floor', () => {
    expect(estimateTransferCostUSD(20000)).toBe(890);
  });
});

describe('estimateMarchamoUSD', () => {
  it('returns 0 for non-positive prices', () => {
    expect(estimateMarchamoUSD({ Price: 0 })).toBe(0);
    expect(estimateMarchamoUSD({})).toBe(0);
  });

  it('applies the 30,000 CRC property tax floor plus 36,000 CRC SOA/stamps', () => {
    // fiscalCRC = 1000 * 510 * 0.85 = 433,500 -> below 7M bracket, floored to 30,000
    // (30,000 + 36,000) / 510 = 129.41 -> 129
    expect(estimateMarchamoUSD({ Price: 1000 })).toBe(129);
  });

  it('computes the 7M-15M progressive bracket', () => {
    // fiscalCRC = 20000 * 510 * 0.85 = 8,670,000
    // tax = 7M*0.015 + 1,670,000*0.021 = 105,000 + 35,070 = 140,070
    // (140,070 + 36,000) / 510 = 345.23 -> 345
    expect(estimateMarchamoUSD({ Price: 20000 })).toBe(345);
  });

  it('computes the 15M-30M progressive bracket', () => {
    // fiscalCRC = 40000 * 510 * 0.85 = 17,340,000
    // tax = 105,000 + 8M*0.021 + 2,340,000*0.028 = 105,000 + 168,000 + 65,520 = 338,520
    // (338,520 + 36,000) / 510 = 734.35 -> 734
    expect(estimateMarchamoUSD({ Price: 40000 })).toBe(734);
  });

  it('computes the > 30M progressive bracket', () => {
    // fiscalCRC = 80000 * 510 * 0.85 = 34,680,000
    // tax = 105,000 + 168,000 + 15M*0.028 + 4,680,000*0.032
    //     = 105,000 + 168,000 + 420,000 + 149,760 = 842,760
    // (842,760 + 36,000) / 510 = 1723.06 -> 1723
    expect(estimateMarchamoUSD({ Price: 80000 })).toBe(1723);
  });

  it('applies 40% property tax relief to electric vehicles via Combustible', () => {
    // 140,070 * 0.6 = 84,042; (84,042 + 36,000) / 510 = 235.38 -> 235
    expect(estimateMarchamoUSD({ Price: 20000, Combustible: 'Eléctrico' })).toBe(235);
  });

  it('applies 40% property tax relief to electric vehicles via FuelType', () => {
    expect(estimateMarchamoUSD({ Price: 20000, FuelType: 'Electric' })).toBe(235);
  });

  it('falls back to DEFAULT_FX_RATE for an invalid fxRate', () => {
    expect(estimateMarchamoUSD({ Price: 20000 }, 'abc')).toBe(345);
    expect(estimateMarchamoUSD({ Price: 20000 }, 0)).toBe(345);
    expect(estimateMarchamoUSD({ Price: 20000 }, -10)).toBe(345);
  });
});

describe('calculateMonthlyLoan', () => {
  it('returns 0 for a zero principal', () => {
    expect(calculateMonthlyLoan(0, 9.5, 72)).toBe(0);
  });

  it('divides principal by term at 0% interest', () => {
    expect(calculateMonthlyLoan(16000, 0, 72)).toBeCloseTo(16000 / 72, 10);
  });

  it('computes a standard amortization payment', () => {
    expect(calculateMonthlyLoan(16000, 9.5, 72)).toBeCloseTo(292.4, 0);
  });

  it('clamps non-positive termMonths to 1', () => {
    expect(calculateMonthlyLoan(12000, 0, 0)).toBe(12000);
    expect(calculateMonthlyLoan(12000, 0, -5)).toBe(12000);
  });
});

describe('estimateCrCosts', () => {
  const car = { Price: 20000, PagoImpuestos: 'NO' };
  const costs = estimateCrCosts(car, {
    fxRate: 510,
    downPaymentPct: 20,
    termMonths: 72,
    annualRatePct: 9.5,
  });

  it('derives transfer and turnkey totals', () => {
    expect(costs.transferUSD).toBe(890);
    expect(costs.turnkeyUSD).toBe(20890);
    expect(costs.turnkeyCRC).toBe(20890 * 510);
  });

  it('derives marchamo estimates', () => {
    expect(costs.marchamoUSD).toBe(345);
    expect(costs.marchamoCRC).toBe(345 * 510);
  });

  it('derives down payment, loan and monthly values', () => {
    expect(costs.downPaymentPct).toBe(20);
    expect(costs.downPaymentUSD).toBe(4000);
    expect(costs.initialOutlayUSD).toBe(4890);
    expect(costs.loanAmountUSD).toBe(16000);
    expect(costs.monthlyUSD).toBe(292);
    expect(costs.monthlyCRC).toBe(292 * 510);
  });

  it('converts prices to CRC', () => {
    expect(costs.priceUSD).toBe(20000);
    expect(costs.priceCRC).toBe(20000 * 510);
    expect(costs.transferCRC).toBe(890 * 510);
    expect(costs.fxRate).toBe(510);
  });

  it('flags unpaid import taxes', () => {
    expect(costs.unpaidTaxes).toBe(true);
    const paid = estimateCrCosts({ Price: 20000, PagoImpuestos: 'SI' }, { fxRate: 510 });
    expect(paid.unpaidTaxes).toBe(false);
  });
});
