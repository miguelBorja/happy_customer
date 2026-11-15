import { describe, expect, it } from 'vitest';
import { getCarId, getThumbUrl, getThumbCandidates, getPhotoUrl, getBodyType } from './carPhotos';

describe('carPhotos utilities', () => {
  const activeUrl = 'https://crautos.com/autosusados/cardetail.cfm?c=9876543';
  const storedThumb = 'https://storage.googleapis.com/happy-customer-cars-thumbs/thumbs/9876543.jpg';

  it('extracts car ID from Crautos URLs', () => {
    expect(getCarId(activeUrl)).toBe('9876543');
    expect(getCarId('https://crautos.com/autosusados/cardetail.cfm?x=1&c=12345&y=2')).toBe('12345');
    expect(getCarId('https://crautos.com/autosusados/cardetail.cfm')).toBeNull();
    expect(getCarId(null)).toBeNull();
  });

  it('supports string URLs and car objects in getThumbUrl', () => {
    expect(getThumbUrl(activeUrl)).toBe('https://crautos.com/clasificados/usados/9876543-t.jpg');
    expect(getThumbUrl({ URL: activeUrl })).toBe('https://crautos.com/clasificados/usados/9876543-t.jpg');
    expect(getThumbUrl({ URL: activeUrl, ThumbURL: storedThumb })).toBe(storedThumb);
    expect(getThumbUrl({ URL: '', ThumbURL: storedThumb })).toBe(storedThumb);
  });

  it('builds fallback chain for active cars across variants', () => {
    const withStored = { URL: activeUrl, ThumbURL: storedThumb, IsSold: false };
    expect(getThumbCandidates(withStored, 'table')).toEqual([
      storedThumb,
      'https://crautos.com/clasificados/usados/9876543-t.jpg',
    ]);
    expect(getThumbCandidates(withStored, 'mobile')).toEqual([
      storedThumb,
      'https://crautos.com/clasificados/usados/9876543-t.jpg',
    ]);
    expect(getThumbCandidates(withStored, 'card')).toEqual([
      'https://crautos.com/clasificados/usados/9876543-1.jpg',
      storedThumb,
      'https://crautos.com/clasificados/usados/9876543-t.jpg',
    ]);

    const withoutStored = { URL: activeUrl, IsSold: false };
    expect(getThumbCandidates(withoutStored, 'table')).toEqual([
      'https://crautos.com/clasificados/usados/9876543-t.jpg',
    ]);
    expect(getThumbCandidates(withoutStored, 'card')).toEqual([
      'https://crautos.com/clasificados/usados/9876543-1.jpg',
      'https://crautos.com/clasificados/usados/9876543-t.jpg',
    ]);
  });

  it('skips Crautos URLs for sold cars', () => {
    expect(getThumbCandidates({ URL: activeUrl, ThumbURL: storedThumb, IsSold: true }, 'table')).toEqual([storedThumb]);
    expect(getThumbCandidates({ URL: activeUrl, ThumbURL: storedThumb, IsSold: true }, 'card')).toEqual([storedThumb]);
    expect(getThumbCandidates({ URL: activeUrl, IsSold: true }, 'table')).toEqual([]);
    expect(getThumbCandidates({ URL: activeUrl, IsSold: true }, 'card')).toEqual([]);
  });

  it('computes gallery URLs and maps body types', () => {
    expect(getPhotoUrl(activeUrl, 2)).toBe('https://crautos.com/clasificados/usados/9876543-2.jpg');
    expect(getBodyType('SUV 4WD/AWD')).toBe('suv');
    expect(getBodyType('Pick Up 4x4')).toBe('pickup');
    expect(getBodyType('Sedán')).toBe('sedan');
  });
});
