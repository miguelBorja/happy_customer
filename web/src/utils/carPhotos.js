// Crautos photo URLs are deterministic, derived from the listing id (`c=` query param):
//   thumbnail: https://crautos.com/clasificados/usados/{id}-t.jpg  (150x113, ~4.5 KB)
//   full size: https://crautos.com/clasificados/usados/{id}-{n}.jpg (750x565, ~60 KB), n = 1..N
// Missing photos respond 200 with text/html, so <img onError> fires and callers must fall back.

const PHOTO_BASE = 'https://crautos.com/clasificados/usados';

// Upper bound when probing a gallery sequentially (-1, -2, ... until one fails).
export const MAX_GALLERY_PHOTOS = 20;

export const getCarId = (url) => {
  if (!url) return null;
  const match = String(url).match(/[?&]c=(\d+)/);
  return match ? match[1] : null;
};

export const getThumbUrl = (carOrUrl) => {
  if (carOrUrl && typeof carOrUrl === 'object') {
    if (carOrUrl.ThumbURL) return carOrUrl.ThumbURL;
    const id = getCarId(carOrUrl.URL);
    return id ? `${PHOTO_BASE}/${id}-t.jpg` : null;
  }
  const id = getCarId(carOrUrl);
  return id ? `${PHOTO_BASE}/${id}-t.jpg` : null;
};

export const getThumbCandidates = (car, variant = 'table') => {
  if (!car) return [];
  if (car.IsSold) {
    return car.ThumbURL ? [car.ThumbURL] : [];
  }
  const id = getCarId(car.URL);
  const crautosThumb = id ? `${PHOTO_BASE}/${id}-t.jpg` : null;
  const raw = variant === 'card'
    ? [getPhotoUrl(car.URL, 1), car.ThumbURL, crautosThumb]
    : [car.ThumbURL, crautosThumb];
  const seen = new Set();
  const candidates = [];
  for (const src of raw) {
    if (src && !seen.has(src)) {
      seen.add(src);
      candidates.push(src);
    }
  }
  return candidates;
};

export const getPhotoUrl = (url, n = 1) => {
  const id = getCarId(url);
  return id ? `${PHOTO_BASE}/${id}-${n}.jpg` : null;
};

// Maps the `Estilo` field (e.g. "SUV 4WD/AWD", "Sedán", "Pick Up 2WD") to a silhouette type.
export const getBodyType = (estilo) => {
  const s = String(estilo || '').toLowerCase();
  if (s.includes('pick')) return 'pickup';
  if (s.includes('suv')) return 'suv';
  if (s.includes('hatch')) return 'hatchback';
  if (s.includes('micro') || s.includes('van') || s.includes('nel') || s.includes('cami')) return 'van';
  if (s.includes('wagon')) return 'wagon';
  return 'sedan';
};
