// Shareable URL state: tab, filters, client-side sort and open car live in the query string,
// so links shared by WhatsApp reopen the same search and the browser "Back" button works.
// Only values that differ from the defaults are written, keeping links short.

export const DEFAULT_FILTERS = Object.freeze({
  title: '',
  brand: '',
  brands: [],
  provincia: '',
  yearMin: '',
  yearMax: '',
  priceMin: '',
  priceMax: '',
  priceMode: '',
  kmMax: '',
  kmMode: '',
  estilo: '',
  transmision: '',
  combustible: '',
  sellerName: '',
  sellerMode: '',
  isSold: 'false',
  equipments: [],
  scrapedFrom: '',
  scrapedTo: '',
  scrapedPeriod: '',
  limit: '100',
  // 'good' => only cars at least 5% below the market median (resolved by the server)
  deal: '',
  // Empty sort fields => backend default ORDER BY scraped_at DESC ("most recent")
  sortTitle: '',
  sortYear: '',
  sortPrice: '',
  sortKm: '',
});

export const createDefaultFilters = () => ({ ...DEFAULT_FILTERS, brands: [], equipments: [] });

const TABS = ['browse', 'favorites', 'bargains', 'stats', 'about'];
const CLIENT_SORTS = ['bestDeal'];

/** Parses a location.search string into { tab, filters, clientSort, carUrl }. */
export const parseUrlState = (search) => {
  const params = new URLSearchParams(search);
  const filters = createDefaultFilters();
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    filters[key] = Array.isArray(DEFAULT_FILTERS[key])
      ? raw.split(',').map(s => s.trim()).filter(Boolean)
      : raw;
  }
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'browse';
  const clientSort = CLIENT_SORTS.includes(params.get('sort')) ? params.get('sort') : null;
  const carUrl = tab === 'browse' ? (params.get('car') || null) : null;
  return { tab, filters, clientSort, carUrl };
};

/** Builds the canonical query string ("" or "?a=b") for the given state. */
export const buildUrlSearch = ({ tab, filters, clientSort, carUrl }) => {
  const params = new URLSearchParams();
  if (tab && tab !== 'browse') params.set('tab', tab);
  if (tab === 'browse' || !tab) {
    for (const key of Object.keys(DEFAULT_FILTERS)) {
      const value = filters?.[key];
      const def = DEFAULT_FILTERS[key];
      if (Array.isArray(def)) {
        if (Array.isArray(value) && value.length > 0) params.set(key, value.join(','));
      } else if (value !== undefined && value !== null && String(value) !== def) {
        params.set(key, String(value));
      }
    }
    if (clientSort && CLIENT_SORTS.includes(clientSort)) params.set('sort', clientSort);
    if (carUrl) params.set('car', carUrl);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

/** Shallow comparison of two filter objects (arrays compared by content). */
export const sameFilters = (a, b) => {
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    const x = a?.[key];
    const y = b?.[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xa = Array.isArray(x) ? x : [];
      const ya = Array.isArray(y) ? y : [];
      if (xa.length !== ya.length || xa.some((v, i) => v !== ya[i])) return false;
    } else if ((x ?? '') !== (y ?? '')) {
      return false;
    }
  }
  return true;
};
