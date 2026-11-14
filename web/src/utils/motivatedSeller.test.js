import { describe, it, expect } from 'vitest';
import {
  MIN_MOTIVATED_DAYS,
  MIN_MOTIVATED_DROPS,
  getMotivatedSellerInfo,
} from './motivatedSeller';

const NOW = new Date('2026-11-14T12:00:00Z');
const daysAgoIso = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();

describe('getMotivatedSellerInfo', () => {
  it('exposes the shared thresholds matching backend constants', () => {
    expect(MIN_MOTIVATED_DAYS).toBe(45);
    expect(MIN_MOTIVATED_DROPS).toBe(2);
  });

  it('qualifies when active listing reaches at least MIN_MOTIVATED_DAYS', () => {
    const info = getMotivatedSellerInfo(
      { URL: 'https://crautos.com/1', ScrapedAt: daysAgoIso(45), PriceDrops: 0 },
      NOW
    );
    expect(info).toEqual({
      days: 45,
      drops: 0,
      isStale: true,
      hasMultipleDrops: false,
    });
  });

  it('qualifies when listing has at least MIN_MOTIVATED_DROPS clean price drops', () => {
    const info = getMotivatedSellerInfo(
      { URL: 'https://crautos.com/2', ScrapedAt: daysAgoIso(5), PriceDrops: 2 },
      NOW
    );
    expect(info).toEqual({
      days: 5,
      drops: 2,
      isStale: false,
      hasMultipleDrops: true,
    });
  });

  it('combines both stale age and multiple drops', () => {
    const info = getMotivatedSellerInfo(
      { URL: 'https://crautos.com/3', ScrapedAt: daysAgoIso(62), PriceDrops: 3 },
      NOW
    );
    expect(info).toEqual({
      days: 62,
      drops: 3,
      isStale: true,
      hasMultipleDrops: true,
    });
  });

  it('returns null below both thresholds even with a single fallback drop', () => {
    const info = getMotivatedSellerInfo(
      {
        URL: 'https://crautos.com/4',
        ScrapedAt: daysAgoIso(20),
        Price: 18000,
        PricePrevious: 19500,
      },
      NOW
    );
    expect(info).toBeNull();
  });

  it('returns null for sold, typo, and suspicious cars', () => {
    expect(
      getMotivatedSellerInfo({ IsSold: true, ScrapedAt: daysAgoIso(90), PriceDrops: 3 }, NOW)
    ).toBeNull();
    expect(
      getMotivatedSellerInfo({ MarketFlag: 'typo', ScrapedAt: daysAgoIso(90), PriceDrops: 3 }, NOW)
    ).toBeNull();
    expect(
      getMotivatedSellerInfo({ MarketFlag: 'suspicious', ScrapedAt: daysAgoIso(90), PriceDrops: 3 }, NOW)
    ).toBeNull();
    expect(getMotivatedSellerInfo(null, NOW)).toBeNull();
  });
});
