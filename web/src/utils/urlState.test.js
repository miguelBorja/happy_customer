import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  createDefaultFilters,
  parseCompareUrlsParam,
  parseUrlState,
  buildUrlSearch,
  sameFilters,
} from './urlState';

describe('createDefaultFilters', () => {
  it('returns the default scalar values', () => {
    const filters = createDefaultFilters();
    expect(filters.title).toBe('');
    expect(filters.isSold).toBe('false');
    expect(filters.limit).toBe('100');
  });

  it('returns independent arrays without mutating DEFAULT_FILTERS', () => {
    const a = createDefaultFilters();
    const b = createDefaultFilters();
    a.brands.push('Toyota');
    a.models.push('Corolla');
    a.equipments.push('AC');
    expect(b.brands).toEqual([]);
    expect(b.models).toEqual([]);
    expect(b.equipments).toEqual([]);
    expect(DEFAULT_FILTERS.brands).toEqual([]);
    expect(DEFAULT_FILTERS.models).toEqual([]);
    expect(DEFAULT_FILTERS.equipments).toEqual([]);
  });
});

describe('parseCompareUrlsParam', () => {
  it('returns an empty array for missing values', () => {
    expect(parseCompareUrlsParam(null)).toEqual([]);
    expect(parseCompareUrlsParam(undefined)).toEqual([]);
    expect(parseCompareUrlsParam('')).toEqual([]);
  });

  it('trims CSV items and rejects non-http(s) URLs', () => {
    expect(parseCompareUrlsParam(' http://a.com , https://b.com , ftp://c.com ')).toEqual([
      'http://a.com',
      'https://b.com',
    ]);
  });

  it('caps the result at 4 URLs while preserving order', () => {
    const raw = 'http://a.com,http://b.com,http://c.com,http://d.com,http://e.com';
    expect(parseCompareUrlsParam(raw)).toEqual([
      'http://a.com',
      'http://b.com',
      'http://c.com',
      'http://d.com',
    ]);
  });
});

describe('parseUrlState', () => {
  it('returns defaults for an empty query string', () => {
    const state = parseUrlState('');
    expect(state.tab).toBe('browse');
    expect(state.clientSort).toBeNull();
    expect(state.carUrl).toBeNull();
    expect(state.compareUrls).toEqual([]);
    expect(state.valuateParams).toEqual({ brand: '', model: '', year: '', km: '' });
    expect(sameFilters(state.filters, createDefaultFilters())).toBe(true);
  });

  it('falls back to browse for an invalid tab', () => {
    expect(parseUrlState('?tab=nope').tab).toBe('browse');
  });

  it('parses scalar and CSV array filters', () => {
    const state = parseUrlState(
      '?brand=Toyota&brands=Toyota,Honda&models=Corolla,Civic&equipments=AC,Sound&yearMin=2010'
    );
    expect(state.filters.brand).toBe('Toyota');
    expect(state.filters.brands).toEqual(['Toyota', 'Honda']);
    expect(state.filters.models).toEqual(['Corolla', 'Civic']);
    expect(state.filters.equipments).toEqual(['AC', 'Sound']);
    expect(state.filters.yearMin).toBe('2010');
  });

  it('parses a known client sort and rejects unknown sorts', () => {
    expect(parseUrlState('?sort=bestDeal').clientSort).toBe('bestDeal');
    expect(parseUrlState('?sort=unknown').clientSort).toBeNull();
  });

  it('keeps car only on the browse tab', () => {
    expect(parseUrlState('?car=http://a.com').carUrl).toBe('http://a.com');
    expect(parseUrlState('?tab=browse&car=http://a.com').carUrl).toBe('http://a.com');
    expect(parseUrlState('?tab=favorites&car=http://a.com').carUrl).toBeNull();
  });

  it('parses compare URLs across tabs', () => {
    const state = parseUrlState('?tab=stats&compare=http://a.com,http://b.com');
    expect(state.tab).toBe('stats');
    expect(state.compareUrls).toEqual(['http://a.com', 'http://b.com']);
  });

  it('populates valuateParams only on the valuate tab', () => {
    const valuate = parseUrlState('?tab=valuate&brand=Toyota&model=Corolla&year=2020&km=50000');
    expect(valuate.valuateParams).toEqual({
      brand: 'Toyota',
      model: 'Corolla',
      year: '2020',
      km: '50000',
    });
    const browse = parseUrlState('?brand=Toyota&model=Corolla&year=2020&km=50000');
    expect(browse.valuateParams).toEqual({ brand: '', model: '', year: '', km: '' });
    expect(browse.filters.brand).toBe('Toyota');
  });
});

describe('buildUrlSearch', () => {
  it('returns an empty string for the default browse state', () => {
    expect(
      buildUrlSearch({
        tab: 'browse',
        filters: createDefaultFilters(),
        clientSort: null,
        carUrl: null,
        valuateParams: { brand: '', model: '', year: '', km: '' },
      })
    ).toBe('');
  });

  it('omits default filter values', () => {
    const filters = createDefaultFilters();
    filters.limit = '100';
    filters.isSold = 'false';
    expect(
      buildUrlSearch({ tab: 'browse', filters, clientSort: null, carUrl: null })
    ).toBe('');
  });

  it('serializes non-default filters, arrays, sort and car on browse', () => {
    const filters = createDefaultFilters();
    filters.brand = 'Toyota';
    filters.brands = ['Toyota', 'Honda'];
    const qs = buildUrlSearch({
      tab: 'browse',
      filters,
      clientSort: 'bestDeal',
      carUrl: 'http://a.com',
    });
    const params = new URLSearchParams(qs);
    expect(params.get('brand')).toBe('Toyota');
    expect(params.get('brands')).toBe('Toyota,Honda');
    expect(params.get('sort')).toBe('bestDeal');
    expect(params.get('car')).toBe('http://a.com');
  });

  it('omits browse filters and car on other tabs', () => {
    const filters = createDefaultFilters();
    filters.brand = 'Toyota';
    expect(
      buildUrlSearch({ tab: 'bargains', filters, clientSort: null, carUrl: 'http://a.com' })
    ).toBe('?tab=bargains');
  });

  it('serializes valuateParams on the valuate tab', () => {
    const qs = buildUrlSearch({
      tab: 'valuate',
      filters: createDefaultFilters(),
      valuateParams: { brand: 'Toyota', model: 'Corolla', year: '2020', km: '50000' },
    });
    expect(qs).toBe('?tab=valuate&brand=Toyota&model=Corolla&year=2020&km=50000');
  });
});

describe('round trip buildUrlSearch -> parseUrlState', () => {
  it('preserves browse filters, sort and car', () => {
    const filters = createDefaultFilters();
    filters.brand = 'Toyota';
    filters.brands = ['Toyota', 'Honda'];
    filters.models = ['Corolla'];
    filters.equipments = ['AC', 'Sound'];
    filters.yearMin = '2010';
    filters.motivated = 'true';

    const qs = buildUrlSearch({
      tab: 'browse',
      filters,
      clientSort: 'bestDeal',
      carUrl: 'http://a.com',
    });
    const parsed = parseUrlState(qs);
    expect(parsed.tab).toBe('browse');
    expect(sameFilters(parsed.filters, filters)).toBe(true);
    expect(parsed.clientSort).toBe('bestDeal');
    expect(parsed.carUrl).toBe('http://a.com');
  });

  it('normalizes motivated filter query params and omits falsey values', () => {
    expect(parseUrlState('?motivated=true').filters.motivated).toBe('true');
    expect(parseUrlState('?motivated=false').filters.motivated).toBe('');
    expect(buildUrlSearch({ tab: 'browse', filters: { ...createDefaultFilters(), motivated: 'true' } })).toBe('?motivated=true');
    expect(buildUrlSearch({ tab: 'browse', filters: { ...createDefaultFilters(), motivated: 'false' } })).toBe('');
  });

  it('preserves the valuate tab parameters', () => {
    const qs = buildUrlSearch({
      tab: 'valuate',
      filters: createDefaultFilters(),
      valuateParams: { brand: 'Toyota', model: 'Corolla', year: '2020', km: '50000' },
    });
    const parsed = parseUrlState(qs);
    expect(parsed.tab).toBe('valuate');
    expect(parsed.valuateParams).toEqual({
      brand: 'Toyota',
      model: 'Corolla',
      year: '2020',
      km: '50000',
    });
  });
});

describe('sameFilters', () => {
  it('matches identical scalar filters', () => {
    expect(sameFilters({ brand: 'Toyota' }, { brand: 'Toyota' })).toBe(true);
  });

  it('matches arrays by content', () => {
    expect(sameFilters({ brands: ['a', 'b'] }, { brands: ['a', 'b'] })).toBe(true);
  });

  it('detects array length mismatches', () => {
    expect(sameFilters({ brands: ['a', 'b'] }, { brands: ['a'] })).toBe(false);
  });

  it('detects array item mismatches', () => {
    expect(sameFilters({ brands: ['a', 'c'] }, { brands: ['a', 'b'] })).toBe(false);
  });

  it('treats null and undefined as equal to an empty string', () => {
    expect(sameFilters({ brand: null }, { brand: undefined })).toBe(true);
    expect(sameFilters({ brand: null }, { brand: '' })).toBe(true);
    expect(sameFilters({}, { brand: '' })).toBe(true);
  });
});
