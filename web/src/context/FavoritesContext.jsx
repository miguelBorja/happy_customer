import { useState, useCallback, useRef, useEffect } from 'react';
import { FavoritesContext } from '../hooks/useFavorites';
import { trackEvent } from '../utils/analytics';

const FAVORITES_KEY = 'crautosdb_favorites';
const FAVORITES_META_KEY = 'crautosdb_favorites_meta_v1';

const loadFavorites = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveFavorites = (favSet) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favSet]));
  } catch {
    // Ignore storage errors
  }
};

const loadFavoriteMeta = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_META_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const saveFavoriteMeta = (meta) => {
  try {
    localStorage.setItem(FAVORITES_META_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage errors
  }
};

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState(loadFavorites);
  const [favMeta, setFavMeta] = useState(loadFavoriteMeta);
  const favoritesRef = useRef(favorites);
  const favMetaRef = useRef(favMeta);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    favMetaRef.current = favMeta;
  }, [favMeta]);

  const isFavorite = useCallback((url) => favorites.has(url), [favorites]);

  const toggleFavorite = useCallback((url, currentPrice = null) => {
    if (!url) return;
    const updated = new Set(favoritesRef.current);
    const isAdding = !updated.has(url);
    if (isAdding) {
      updated.add(url);
    } else {
      updated.delete(url);
    }
    favoritesRef.current = updated;
    saveFavorites(updated);
    setFavorites(updated);

    const nextMeta = { ...favMetaRef.current };
    if (isAdding) {
      const priceNum = Number(currentPrice);
      if (Number.isFinite(priceNum) && priceNum > 0) {
        nextMeta[url] = { savedPrice: priceNum, savedAt: new Date().toISOString() };
      }
    } else {
      delete nextMeta[url];
    }
    favMetaRef.current = nextMeta;
    saveFavoriteMeta(nextMeta);
    setFavMeta(nextMeta);

    trackEvent(
      isAdding ? 'add_to_favorites' : 'remove_from_favorites',
      'engagement',
      url
    );
  }, []);

  const syncFavoritePrices = useCallback((carsList) => {
    if (!Array.isArray(carsList) || carsList.length === 0) return;
    const prevMeta = favMetaRef.current;
    let changed = false;
    const nextMeta = { ...prevMeta };
    const now = new Date().toISOString();

    carsList.forEach((car) => {
      if (!car || !car.URL || !favoritesRef.current.has(car.URL)) return;
      const existing = prevMeta[car.URL];
      const priceNum = Number(car.Price);
      if ((!existing || !(existing.savedPrice > 0)) && Number.isFinite(priceNum) && priceNum > 0) {
        nextMeta[car.URL] = { savedPrice: priceNum, savedAt: now };
        changed = true;
      }
    });

    if (changed) {
      favMetaRef.current = nextMeta;
      saveFavoriteMeta(nextMeta);
      setFavMeta(nextMeta);
    }
  }, []);

  const getFavoriteMeta = useCallback((url) => favMeta[url] || null, [favMeta]);

  const favCount = favorites.size;

  const getAllUrls = useCallback(() => [...favorites], [favorites]);

  return (
    <FavoritesContext.Provider
      value={{
        isFavorite,
        toggleFavorite,
        favCount,
        getAllUrls,
        getFavoriteMeta,
        syncFavoritePrices,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};
