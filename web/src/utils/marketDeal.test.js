import { describe, it, expect } from 'vitest';
import {
  MIN_MARKET_COMPARABLES,
  DEAL_GREAT_MAX_PCT,
  DEAL_GOOD_MAX_PCT,
  DEAL_HIGH_MIN_PCT,
  getMarketDeal,
  dealReason,
  formatDealDelta,
  formatUSD,
  formatMarketReference,
  dealTooltip,
} from './marketDeal';

const makeCar = (overrides = {}) => ({
  Brand: 'Toyota',
  Model: 'Hilux',
  Year: 2018,
  Price: 10000,
  MarketMedian: 10000,
  MarketCount: 5,
  ...overrides,
});

describe('marketDeal threshold constants', () => {
  it('exposes the calibration thresholds as plain numbers', () => {
    expect(MIN_MARKET_COMPARABLES).toBe(4);
    expect(DEAL_GREAT_MAX_PCT).toBe(-12);
    expect(DEAL_GOOD_MAX_PCT).toBe(-5);
    expect(DEAL_HIGH_MIN_PCT).toBe(10);
  });
});

describe('getMarketDeal', () => {
  it('returns null when the car is missing', () => {
    expect(getMarketDeal(null)).toBeNull();
    expect(getMarketDeal(undefined)).toBeNull();
  });

  it('returns null when there is no usable price or median', () => {
    expect(getMarketDeal(makeCar({ Price: 0 }))).toBeNull();
    expect(getMarketDeal(makeCar({ Price: -100 }))).toBeNull();
    expect(getMarketDeal(makeCar({ MarketMedian: 0, MarketExpected: 0 }))).toBeNull();
  });

  it('returns null when there are not enough comparables', () => {
    expect(getMarketDeal(makeCar({ MarketCount: 3 }))).toBeNull();
    expect(getMarketDeal(makeCar({ MarketCount: 0 }))).toBeNull();
    expect(getMarketDeal(makeCar({ MarketCount: undefined }))).toBeNull();
  });

  it('classifies a great deal at or below -12%', () => {
    const deal = getMarketDeal(makeCar({ Price: 8800, MarketMedian: 10000 }));
    expect(deal.level).toBe('great');
    expect(deal.pct).toBeCloseTo(-12, 5);
  });

  it('classifies a good deal between -11.9% and -5%', () => {
    expect(getMarketDeal(makeCar({ Price: 8810 })).level).toBe('good');
    expect(getMarketDeal(makeCar({ Price: 9500 })).level).toBe('good');
  });

  it('classifies a fair deal between -4.9% and +9.9%', () => {
    expect(getMarketDeal(makeCar({ Price: 9510 })).level).toBe('fair');
    expect(getMarketDeal(makeCar({ Price: 10000 })).level).toBe('fair');
    expect(getMarketDeal(makeCar({ Price: 10990 })).level).toBe('fair');
  });

  it('classifies a high price at or above +10%', () => {
    const deal = getMarketDeal(makeCar({ Price: 11000 }));
    expect(deal.level).toBe('high');
    expect(deal.pct).toBeCloseTo(10, 5);
  });

  it.each(['typo', 'outlier', 'condition', 'debt'])('overrides the level with check for MarketFlag %s', (flag) => {
    const deal = getMarketDeal(makeCar({ MarketFlag: flag }));
    expect(deal.level).toBe('check');
    expect(deal.flag).toBe(flag);
  });

  it('prefers MarketExpected over MarketMedian and flags the km adjustment', () => {
    const deal = getMarketDeal(makeCar({
      Price: 11000,
      MarketMedian: 10000,
      MarketExpected: 12000,
      MarketMedianKm: 95000,
      Kilometraje: 150000,
    }));

    expect(deal.median).toBe(12000);
    expect(deal.rawMedian).toBe(10000);
    expect(deal.kmAdjusted).toBe(true);
    expect(deal.medianKm).toBe(95000);
    expect(deal.km).toBe(150000);
    expect(deal.pct).toBeCloseTo(((11000 - 12000) / 12000) * 100, 5);
    expect(deal.level).toBe('good');
  });

  it('does not mark the deal as km-adjusted when MarketExpected is absent or equal', () => {
    const fallback = getMarketDeal(makeCar({ MarketExpected: 0 }));
    expect(fallback.median).toBe(10000);
    expect(fallback.kmAdjusted).toBe(false);

    const equal = getMarketDeal(makeCar({ MarketExpected: 10000 }));
    expect(equal.median).toBe(10000);
    expect(equal.kmAdjusted).toBe(false);
  });

  it('returns translated labels via deal.label', () => {
    const great = getMarketDeal(makeCar({ Price: 8000 }));
    expect(great.label('es')).toBe('Gran precio');
    expect(great.label('en')).toBe('Great price');

    const fair = getMarketDeal(makeCar({ Price: 10000 }));
    expect(fair.label('es')).toBe('Precio justo');
    expect(fair.label('en')).toBe('Fair price');
  });
});

describe('dealReason', () => {
  it('returns the matching reason for flagged prices', () => {
    expect(dealReason({ level: 'check', flag: 'typo' }, 'es')).toBe('¿le falta o le sobra un cero?');
    expect(dealReason({ level: 'check', flag: 'typo' }, 'en')).toBe('missing or extra zero?');
    expect(dealReason({ level: 'check', flag: 'condition' }, 'es')).toBe('el anuncio menciona daños o reparaciones');
    expect(dealReason({ level: 'check', flag: 'debt' }, 'en')).toBe('price may involve a loan or lien');
  });

  it('falls back to the outlier reason for unknown flags', () => {
    expect(dealReason({ level: 'check', flag: 'unknown' }, 'es')).toBe('demasiado bajo para el mercado');
  });

  it('returns an empty string when there is no flagged deal', () => {
    expect(dealReason(null, 'es')).toBe('');
    expect(dealReason({ level: 'good', flag: '' }, 'es')).toBe('');
  });
});

describe('formatDealDelta', () => {
  it('uses the average label below 1%', () => {
    expect(formatDealDelta({ pct: 0.4 }, 'es')).toBe('En el promedio');
    expect(formatDealDelta({ pct: -0.4 }, 'en')).toBe('At market average');
    expect(formatDealDelta(null, 'es')).toBe('');
  });

  it('formats below and above market deviations', () => {
    expect(formatDealDelta({ pct: -12.4 }, 'es')).toBe('12% bajo el mercado');
    expect(formatDealDelta({ pct: -12.4 }, 'en')).toBe('12% below market');
    expect(formatDealDelta({ pct: 8.2 }, 'es')).toBe('8% sobre el mercado');
    expect(formatDealDelta({ pct: 8.2 }, 'en')).toBe('8% above market');
  });
});

describe('formatUSD', () => {
  it('formats whole dollars with no decimals', () => {
    expect(formatUSD(20000)).toBe('$20,000');
    expect(formatUSD(0)).toBe('$0');
    expect(formatUSD(undefined)).toBe('$0');
  });
});

describe('formatMarketReference', () => {
  it('returns the plain median reference when the price is not km-adjusted', () => {
    const deal = { count: 5, rawMedian: 10000, median: 10000, kmAdjusted: false, km: 0, medianKm: 0 };
    expect(formatMarketReference(deal, 'Toyota Corolla 2020', 'es')).toBe(
      'Mediana de 5 autos Toyota Corolla 2020: $10,000',
    );
    expect(formatMarketReference(deal, 'Toyota Corolla 2020', 'en')).toBe(
      'Median of 5 Toyota Corolla 2020 listings: $10,000',
    );
  });

  it('adds the mileage-adjusted value and km note', () => {
    const deal = {
      count: 12,
      rawMedian: 20000,
      median: 18500,
      kmAdjusted: true,
      km: 150000,
      medianKm: 95000,
    };
    expect(formatMarketReference(deal, 'Toyota Hilux 2018', 'es')).toBe(
      'Mediana de 12 autos Toyota Hilux 2018: $20,000 · ajustada por km: $18,500 (150k km vs. 95k km típico)',
    );
    expect(formatMarketReference(deal, 'Toyota Hilux 2018', 'en')).toBe(
      'Median of 12 Toyota Hilux 2018 listings: $20,000 · mileage-adjusted: $18,500 (150k km vs. typical 95k km)',
    );
  });

  it('omits the km note when km data is missing', () => {
    const deal = { count: 6, rawMedian: 12000, median: 11000, kmAdjusted: true, km: 0, medianKm: 0 };
    expect(formatMarketReference(deal, 'Honda Civic 2019', 'es')).toBe(
      'Mediana de 6 autos Honda Civic 2019: $12,000 · ajustada por km: $11,000',
    );
  });

  it('returns an empty string without a deal', () => {
    expect(formatMarketReference(null, 'Toyota', 'es')).toBe('');
  });
});

describe('dealTooltip', () => {
  it('combines the reference and the deviation', () => {
    const car = makeCar({ Price: 8800 });
    const deal = getMarketDeal(car);
    expect(dealTooltip(car, deal, 'es')).toBe(
      'Mediana de 5 autos Toyota Hilux 2018: $10,000 · 12% bajo el mercado',
    );
  });

  it('appends the flag reason for flagged prices', () => {
    const car = makeCar({ MarketFlag: 'condition' });
    const deal = getMarketDeal(car);
    expect(dealTooltip(car, deal, 'es')).toBe(
      'Mediana de 5 autos Toyota Hilux 2018: $10,000 · En el promedio · ⚠️ el anuncio menciona daños o reparaciones',
    );
  });

  it('returns an empty string without a deal', () => {
    expect(dealTooltip(makeCar(), null, 'es')).toBe('');
  });
});
