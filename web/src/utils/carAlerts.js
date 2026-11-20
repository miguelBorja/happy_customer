export const MAX_CAR_ALERT_URLS = 50;
export const MAX_CAR_ALERT_QUERY_LEN = 3900;

// Build a saved-search query string (car=<url>&car=<url>...) from one or many
// car listing URLs. URLs are trimmed, de-duplicated (order preserved), and the
// result is capped by both count and serialized length.
export const buildCarAlertQuery = (urls) => {
  const list = Array.isArray(urls) ? urls : [urls];
  const seen = new Set();
  const clean = [];

  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    clean.push(url);
  }

  const params = new URLSearchParams();
  let count = 0;

  for (const url of clean) {
    if (count >= MAX_CAR_ALERT_URLS) break;
    const next = new URLSearchParams(params);
    next.append('car', url);
    if (next.toString().length > MAX_CAR_ALERT_QUERY_LEN) break;
    params.append('car', url);
    count += 1;
  }

  return { query: params.toString(), count };
};

// Returns true when the query string belongs to a per-car alert (one or more
// car URL params) rather than a regular saved search (e.g. brand=Toyota).
export const isCarAlertQuery = (query) => {
  if (!query) return false;
  const raw = typeof query === 'string' ? query : String(query);
  const cleaned = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(cleaned);
  const keys = ['car', 'carUrl', 'urls'];
  return keys.some((key) =>
    params.getAll(key).some((value) => typeof value === 'string' && value.trim() !== '')
  );
};

// Human-readable label for a car alert, e.g. "Toyota Corolla (2019)".
export const formatCarAlertLabel = (car) => {
  if (!car) return '';
  const title = (car.Title || '').trim();
  const year = Number(car.Year) || 0;

  if (title) {
    if (year > 0 && !title.includes(String(year))) {
      return `${title} (${year})`;
    }
    return title;
  }

  return [car.Brand, car.Model, year > 0 ? String(year) : '']
    .filter(Boolean)
    .join(' ')
    .trim();
};
