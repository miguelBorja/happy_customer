import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SavedSearchesContext } from '../hooks/useSavedSearches';
import { fetchSearchesDigest } from '../api/client';
import { buildUrlSearch } from '../utils/urlState';
import { formatUSD } from '../utils/marketDeal';

const STORAGE_KEY = 'crautosdb_saved_searches_v1';
const MAX_SAVED_SEARCHES = 15;

const loadSavedSearches = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.query === 'string')
      .slice(0, MAX_SAVED_SEARCHES);
  } catch {
    return [];
  }
};

const persistSavedSearches = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage write errors
  }
};

const buildCanonicalQuery = (filters, clientSort) => (
  buildUrlSearch({ tab: 'browse', filters, clientSort, carUrl: null }).replace(/^\?/, '')
);

const buildSearchLabel = (filters = {}, clientSort = null) => {
  const parts = [];
  const brands = Array.isArray(filters.brands) && filters.brands.length > 0
    ? filters.brands
    : (filters.brand ? [filters.brand] : []);
  if (brands.length > 0) parts.push(brands.slice(0, 2).join(', ') + (brands.length > 2 ? ` +${brands.length - 2}` : ''));

  const models = Array.isArray(filters.models) ? filters.models : [];
  if (models.length > 0) parts.push(models.slice(0, 2).join(', ') + (models.length > 2 ? ` +${models.length - 2}` : ''));

  if (filters.title) parts.push(`"${filters.title}"`);
  if (filters.estilo) parts.push(filters.estilo);
  if (filters.yearMin && filters.yearMax) parts.push(`${filters.yearMin}–${filters.yearMax}`);
  else if (filters.yearMin) parts.push(`${filters.yearMin}+`);
  else if (filters.yearMax) parts.push(`≤${filters.yearMax}`);

  if (filters.priceMax) parts.push(`≤${formatUSD(Number(filters.priceMax))}`);
  else if (filters.priceMin) parts.push(`≥${formatUSD(Number(filters.priceMin))}`);

  if (filters.kmMax) parts.push(`≤${Math.round(Number(filters.kmMax) / 1000)}k km`);
  if (filters.transmision) parts.push(filters.transmision);
  if (filters.combustible) parts.push(filters.combustible);
  if (filters.sellerName) parts.push(filters.sellerName);
  if (filters.deal === 'good') parts.push('Buen precio');
  if (filters.priceDrop === 'true') parts.push('Rebajas');
  if (clientSort === 'bestDeal' && filters.deal !== 'good') parts.push('Mejor oferta');

  return parts.length > 0 ? parts.slice(0, 4).join(' · ') : 'Búsqueda personalizada';
};

export const SavedSearchesProvider = ({ children }) => {
  const [savedSearches, setSavedSearches] = useState(loadSavedSearches);
  const [rawDigests, setRawDigests] = useState({});
  const savedSearchesRef = useRef(savedSearches);

  useEffect(() => {
    savedSearchesRef.current = savedSearches;
  }, [savedSearches]);

  useEffect(() => {
    if (savedSearches.length === 0) return undefined;
    const controller = new AbortController();
    const payload = savedSearches.map((item) => ({
      id: item.id,
      query: item.query,
      since: item.lastCheckedAt || item.createdAt || new Date().toISOString(),
    }));

    fetchSearchesDigest(payload, controller.signal)
      .then((res) => {
        if (controller.signal.aborted || !res || !Array.isArray(res.results)) return;
        const map = {};
        res.results.forEach((entry) => {
          if (entry && entry.id) {
            map[entry.id] = {
              totalCount: entry.totalCount || 0,
              newCount: entry.newCount || 0,
              dropCount: entry.dropCount || 0,
            };
          }
        });
        setRawDigests(map);
      })
      .catch(() => {
        // Keep last known digests on network failure
      });

    return () => controller.abort();
  }, [savedSearches]);

  const digests = useMemo(
    () => (savedSearches.length === 0 ? {} : rawDigests),
    [savedSearches.length, rawDigests]
  );

  const totalAlerts = useMemo(
    () =>
      savedSearches.reduce((sum, item) => {
        const d = digests[item.id];
        return d ? sum + (d.newCount || 0) + (d.dropCount || 0) : sum;
      }, 0),
    [savedSearches, digests]
  );

  const isSearchSaved = useCallback(
    (filters, clientSort) => {
      const query = buildCanonicalQuery(filters, clientSort);
      if (!query) return false;
      return savedSearches.some((item) => item.query === query);
    },
    [savedSearches]
  );

  const saveSearch = useCallback(({ name, filters, clientSort }) => {
    const query = buildCanonicalQuery(filters, clientSort);
    if (!query) return null;

    const prev = savedSearchesRef.current;
    const existing = prev.find((item) => item.query === query);
    if (existing) return existing;

    const now = new Date().toISOString();
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const created = {
      id,
      name: (name && name.trim()) || buildSearchLabel(filters, clientSort),
      query,
      filters,
      clientSort: clientSort || null,
      createdAt: now,
      lastCheckedAt: now,
    };
    const next = [created, ...prev].slice(0, MAX_SAVED_SEARCHES);
    savedSearchesRef.current = next;
    persistSavedSearches(next);
    setSavedSearches(next);
    return created;
  }, []);

  const removeSearch = useCallback((id) => {
    const next = savedSearchesRef.current.filter((item) => item.id !== id);
    savedSearchesRef.current = next;
    persistSavedSearches(next);
    setSavedSearches(next);
  }, []);

  const markSearchChecked = useCallback((id) => {
    const now = new Date().toISOString();
    const next = savedSearchesRef.current.map((item) =>
      item.id === id ? { ...item, lastCheckedAt: now } : item
    );
    savedSearchesRef.current = next;
    persistSavedSearches(next);
    setSavedSearches(next);
    setRawDigests((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return {
        ...prev,
        [id]: { ...existing, newCount: 0, dropCount: 0 },
      };
    });
  }, []);

  return (
    <SavedSearchesContext.Provider
      value={{
        savedSearches,
        digests,
        totalAlerts,
        isSearchSaved,
        saveSearch,
        removeSearch,
        markSearchChecked,
      }}
    >
      {children}
    </SavedSearchesContext.Provider>
  );
};
