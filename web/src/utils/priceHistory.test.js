import { describe, it, expect } from 'vitest';
import {
  getCarPriceDrop,
  summarizePriceHistory,
  formatChangeAge,
  formatPriceDropBadgeText,
  formatHeadlineChange,
} from './priceHistory';
import { cleanSpecText, formatYesNo, parsePlateInfo } from './crVehicleInfo';

const NOW = new Date(2026, 10, 13, 12, 0, 0); // Nov 13, 2026

describe('getCarPriceDrop', () => {
  it('returns null when the listing is flagged', () => {
    expect(getCarPriceDrop({ MarketFlag: 'typo', Price: 9000, PricePrevious: 10000 })).toBeNull();
  });

  it('returns null when the price did not drop', () => {
    expect(getCarPriceDrop({ Price: 10000, PricePrevious: 10000 })).toBeNull();
    expect(getCarPriceDrop({ Price: 11000, PricePrevious: 10000 })).toBeNull();
  });

  it('returns null when the drop is below $100', () => {
    expect(getCarPriceDrop({ Price: 9950, PricePrevious: 10000 })).toBeNull();
  });

  it('returns null when the drop is below 1%', () => {
    expect(getCarPriceDrop({ Price: 19850, PricePrevious: 20000 })).toBeNull();
  });

  it('returns the drop details when it is at least $100 and 1%', () => {
    const drop = getCarPriceDrop({
      Price: 9000,
      PricePrevious: 10000,
      PriceChangedAt: '2026-11-10',
      PriceChanges: 2,
    });
    expect(drop).not.toBeNull();
    expect(drop.drop).toBe(1000);
    expect(drop.dropPct).toBeCloseTo(10, 5);
    expect(drop.previousPrice).toBe(10000);
    expect(drop.currentPrice).toBe(9000);
    expect(drop.initialPrice).toBe(10000);
    expect(drop.changedAt).toBe('2026-11-10');
    expect(drop.changes).toBe(2);
  });

  it('uses PriceInitial when available and falls back to a single change', () => {
    const drop = getCarPriceDrop({ Price: 9000, PricePrevious: 9500, PriceInitial: 12000 });
    expect(drop.initialPrice).toBe(12000);
    expect(drop.changes).toBe(1);
    expect(drop.changedAt).toBeNull();
  });
});

describe('summarizePriceHistory', () => {
  it('returns null for missing or short histories', () => {
    expect(summarizePriceHistory(null)).toBeNull();
    expect(summarizePriceHistory([])).toBeNull();
    expect(summarizePriceHistory([{ price: 10000, seenAt: 'a' }])).toBeNull();
    expect(summarizePriceHistory([
      { price: 10000, seenAt: 'a' },
      { price: 0, seenAt: 'b' },
    ])).toBeNull();
  });

  it('computes steps and aggregate deltas on a multi-point history', () => {
    const summary = summarizePriceHistory([
      { price: 10000, seenAt: 'a' },
      { price: 9000, seenAt: 'b' },
      { price: 9500, seenAt: 'c' },
    ]);

    expect(summary.steps).toHaveLength(3);
    expect(summary.first.price).toBe(10000);
    expect(summary.prev.price).toBe(9000);
    expect(summary.last.price).toBe(9500);
    expect(summary.latestDelta).toBe(500);
    expect(summary.latestPct).toBeCloseTo((500 / 9000) * 100, 5);
    expect(summary.netDelta).toBe(-500);
    expect(summary.netPct).toBeCloseTo(-5, 5);
    expect(summary.minPrice).toBe(9000);
    expect(summary.maxPrice).toBe(10000);
  });
});

describe('formatChangeAge', () => {
  it('formats today and yesterday', () => {
    expect(formatChangeAge(new Date(2026, 10, 13), 'es', NOW)).toBe('hoy');
    expect(formatChangeAge(new Date(2026, 10, 13), 'en', NOW)).toBe('today');
    expect(formatChangeAge(new Date(2026, 10, 12), 'es', NOW)).toBe('ayer');
    expect(formatChangeAge(new Date(2026, 10, 12), 'en', NOW)).toBe('yesterday');
  });

  it('formats days, weeks and months ago', () => {
    expect(formatChangeAge(new Date(2026, 10, 8), 'es', NOW)).toBe('hace 5 días');
    expect(formatChangeAge(new Date(2026, 10, 8), 'en', NOW)).toBe('5 days ago');
    expect(formatChangeAge(new Date(2026, 9, 23), 'es', NOW)).toBe('hace 3 sem.');
    expect(formatChangeAge(new Date(2026, 9, 23), 'en', NOW)).toBe('3 wk ago');
    expect(formatChangeAge(new Date(2026, 7, 15), 'es', NOW)).toBe('hace 3 meses');
    expect(formatChangeAge(new Date(2026, 7, 15), 'en', NOW)).toBe('3 mo ago');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatChangeAge(null, 'es', NOW)).toBe('');
    expect(formatChangeAge('not-a-date', 'es', NOW)).toBe('');
  });
});

describe('formatPriceDropBadgeText', () => {
  it('uses the recent wording for today', () => {
    expect(formatPriceDropBadgeText({ drop: 500, changedAt: new Date(2026, 10, 13) }, 'es', NOW))
      .toBe('Bajó $500 hoy');
    expect(formatPriceDropBadgeText({ drop: 500, changedAt: new Date(2026, 10, 13) }, 'en', NOW))
      .toBe('Dropped $500 today');
  });

  it('uses the aged wording for older changes', () => {
    expect(formatPriceDropBadgeText({ drop: 500, changedAt: new Date(2026, 10, 8) }, 'es', NOW))
      .toBe('Bajó $500 hace 5 días');
  });

  it('uses the plain wording without a date', () => {
    expect(formatPriceDropBadgeText({ drop: 500, changedAt: null }, 'es', NOW)).toBe('Bajó $500');
    expect(formatPriceDropBadgeText(null, 'es', NOW)).toBe('');
  });
});

describe('formatHeadlineChange', () => {
  it('formats a recent price drop', () => {
    const summary = { latestDelta: -500, last: { seenAt: new Date(2026, 10, 13) } };
    expect(formatHeadlineChange(summary, 'es', NOW)).toBe('📉 Bajó $500 hoy');
    expect(formatHeadlineChange(summary, 'en', NOW)).toBe('📉 Dropped $500 today');
  });

  it('formats a recent price rise', () => {
    const summary = { latestDelta: 500, last: { seenAt: new Date(2026, 10, 13) } };
    expect(formatHeadlineChange(summary, 'es', NOW)).toBe('↑ Subió $500 hoy');
    expect(formatHeadlineChange(summary, 'en', NOW)).toBe('↑ Rose $500 today');
  });

  it('formats an aged price drop', () => {
    const summary = { latestDelta: -500, last: { seenAt: new Date(2026, 10, 8) } };
    expect(formatHeadlineChange(summary, 'es', NOW)).toBe('📉 Bajó $500 hace 5 días');
  });

  it('returns an empty string when there is no change', () => {
    expect(formatHeadlineChange({ latestDelta: 0, last: { seenAt: NOW } }, 'es', NOW)).toBe('');
    expect(formatHeadlineChange(null, 'es', NOW)).toBe('');
  });
});

describe('cleanSpecText', () => {
  it('rejects placeholders and empty values', () => {
    expect(cleanSpecText(null)).toBeNull();
    expect(cleanSpecText(undefined)).toBeNull();
    expect(cleanSpecText('')).toBeNull();
    expect(cleanSpecText('   ')).toBeNull();
    expect(cleanSpecText('-')).toBeNull();
    expect(cleanSpecText('ND')).toBeNull();
    expect(cleanSpecText('n/a')).toBeNull();
    expect(cleanSpecText('no indica')).toBeNull();
  });

  it('trims and keeps real values', () => {
    expect(cleanSpecText('  ABS  ')).toBe('ABS');
    expect(cleanSpecText('4x4')).toBe('4x4');
  });
});

describe('formatYesNo', () => {
  const t = (key) => ({ yesValue: 'Sí', noValue: 'No' }[key] ?? key);

  it('translates yes/no values', () => {
    expect(formatYesNo('SI', t)).toBe('Sí');
    expect(formatYesNo('SÍ', t)).toBe('Sí');
    expect(formatYesNo('NO', t)).toBe('No');
  });

  it('passes through other cleaned values and rejects placeholders', () => {
    expect(formatYesNo('Parcial', t)).toBe('Parcial');
    expect(formatYesNo('-', t)).toBeNull();
    expect(formatYesNo(null, t)).toBeNull();
  });
});

describe('parsePlateInfo', () => {
  it.each([
    ['1', 'restrMonday', 'monthJan'],
    ['2', 'restrMonday', 'monthFeb'],
    ['3', 'restrTuesday', 'monthMar'],
    ['4', 'restrTuesday', 'monthApr'],
    ['5', 'restrWednesday', 'monthMay'],
    ['6', 'restrWednesday', 'monthJun'],
    ['7', 'restrThursday', 'monthJul'],
    ['8', 'restrThursday', 'monthAug'],
    ['9', 'restrFriday', 'monthSep'],
    ['0', 'restrFriday', 'monthOct'],
  ])('maps trailing digit %s to its restriction and DEKRA month', (digit, restrictionKey, dekraMonthKey) => {
    const info = parsePlateInfo(`ABC-${digit}`, 'Gasolina');
    expect(info).not.toBeNull();
    expect(info.digit).toBe(digit);
    expect(info.restrictionKey).toBe(restrictionKey);
    expect(info.dekraMonthKey).toBe(dekraMonthKey);
    expect(info.isElectric).toBe(false);
  });

  it('exempts electric cars from the restriction but keeps the DEKRA month', () => {
    const info = parsePlateInfo('123456-7', 'Eléctrico');
    expect(info).not.toBeNull();
    expect(info.isElectric).toBe(true);
    expect(info.restrictionKey).toBe('restrExemptElectric');
    expect(info.dekraMonthKey).toBe('monthJul');
  });

  it('rejects placeholder plates', () => {
    expect(parsePlateInfo('-')).toBeNull();
    expect(parsePlateInfo('ND')).toBeNull();
    expect(parsePlateInfo('termina en -')).toBeNull();
    expect(parsePlateInfo('')).toBeNull();
  });

  it('handles plates without a trailing digit', () => {
    const info = parsePlateInfo('SINPLACA', 'Gasolina');
    expect(info).not.toBeNull();
    expect(info.digit).toBeNull();
    expect(info.restrictionKey).toBeNull();
    expect(info.dekraMonthKey).toBeNull();
    expect(info.isElectric).toBe(false);
  });
});
