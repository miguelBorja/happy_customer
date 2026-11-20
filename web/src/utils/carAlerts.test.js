import { describe, it, expect } from 'vitest';
import {
  MAX_CAR_ALERT_URLS,
  MAX_CAR_ALERT_QUERY_LEN,
  buildCarAlertQuery,
  isCarAlertQuery,
  formatCarAlertLabel,
} from './carAlerts';

describe('buildCarAlertQuery', () => {
  it('builds a query from a single URL string', () => {
    const { query, count } = buildCarAlertQuery('https://crautos.com/car/1');
    expect(query).toBe(`car=${encodeURIComponent('https://crautos.com/car/1')}`);
    expect(count).toBe(1);
  });

  it('builds a query from a single-element array', () => {
    const { query, count } = buildCarAlertQuery(['https://crautos.com/car/1']);
    expect(count).toBe(1);
    const params = new URLSearchParams(query);
    expect(params.getAll('car')).toEqual(['https://crautos.com/car/1']);
  });

  it('builds a query from multiple URLs preserving order', () => {
    const urls = ['https://a.com/1', 'https://a.com/2', 'https://a.com/3'];
    const { query, count } = buildCarAlertQuery(urls);
    expect(count).toBe(3);
    const params = new URLSearchParams(query);
    expect(params.getAll('car')).toEqual(urls);
  });

  it('trims and de-duplicates URLs preserving order', () => {
    const urls = ['  https://a.com/1  ', 'https://a.com/1', 'https://a.com/2', '', '   '];
    const { query, count } = buildCarAlertQuery(urls);
    expect(count).toBe(2);
    const params = new URLSearchParams(query);
    expect(params.getAll('car')).toEqual(['https://a.com/1', 'https://a.com/2']);
  });

  it('caps the number of URLs at MAX_CAR_ALERT_URLS', () => {
    const urls = Array.from({ length: MAX_CAR_ALERT_URLS + 10 }, (_, i) => `https://a.com/${i}`);
    const { count } = buildCarAlertQuery(urls);
    expect(count).toBe(MAX_CAR_ALERT_URLS);
  });

  it('stops before exceeding MAX_CAR_ALERT_QUERY_LEN', () => {
    const long = 'https://a.com/' + 'x'.repeat(500);
    const urls = Array.from({ length: 30 }, (_, i) => `${long}/${i}`);
    const { query, count } = buildCarAlertQuery(urls);
    expect(query.length).toBeLessThanOrEqual(MAX_CAR_ALERT_QUERY_LEN);
    expect(count).toBeLessThan(urls.length);
    expect(count).toBeGreaterThan(0);
  });

  it('returns an empty query and zero count for empty input', () => {
    expect(buildCarAlertQuery([])).toEqual({ query: '', count: 0 });
    expect(buildCarAlertQuery('')).toEqual({ query: '', count: 0 });
    expect(buildCarAlertQuery(null)).toEqual({ query: '', count: 0 });
  });
});

describe('isCarAlertQuery', () => {
  it('returns true for a car=<url> query', () => {
    expect(isCarAlertQuery(`car=${encodeURIComponent('https://a.com/1')}`)).toBe(true);
  });

  it('returns true for a leading-question-mark car query', () => {
    expect(isCarAlertQuery('?car=https%3A%2F%2Fa.com%2F1')).toBe(true);
  });

  it('returns true for carUrl and urls params', () => {
    expect(isCarAlertQuery('carUrl=https%3A%2F%2Fa.com%2F1')).toBe(true);
    expect(isCarAlertQuery('urls=https%3A%2F%2Fa.com%2F1')).toBe(true);
  });

  it('returns false for a saved-search query', () => {
    expect(isCarAlertQuery('brand=Toyota')).toBe(false);
  });

  it('returns false for falsy input', () => {
    expect(isCarAlertQuery('')).toBe(false);
    expect(isCarAlertQuery(null)).toBe(false);
    expect(isCarAlertQuery(undefined)).toBe(false);
  });

  it('returns false when the car param is empty', () => {
    expect(isCarAlertQuery('car=')).toBe(false);
  });
});

describe('formatCarAlertLabel', () => {
  it('appends the year to a title without one', () => {
    expect(formatCarAlertLabel({ Title: 'Toyota Corolla', Year: 2019 })).toBe('Toyota Corolla (2019)');
  });

  it('does not duplicate a year already in the title', () => {
    expect(formatCarAlertLabel({ Title: 'Toyota Corolla 2019', Year: 2019 })).toBe('Toyota Corolla 2019');
  });

  it('returns the title unchanged when there is no year', () => {
    expect(formatCarAlertLabel({ Title: 'Toyota Corolla', Year: 0 })).toBe('Toyota Corolla');
  });

  it('falls back to brand/model/year when there is no title', () => {
    expect(formatCarAlertLabel({ Brand: 'Toyota', Model: 'Corolla', Year: 2020 })).toBe('Toyota Corolla 2020');
  });

  it('returns an empty string for a null car', () => {
    expect(formatCarAlertLabel(null)).toBe('');
  });
});
