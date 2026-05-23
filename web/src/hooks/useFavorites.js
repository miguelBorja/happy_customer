import { useState, useCallback } from 'react';

const FAVORITES_KEY = 'crautosdb_favorites';

const loadFavorites = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveFavorites = (favSet) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favSet]));
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState(loadFavorites);

  const isFavorite = useCallback((url) => favorites.has(url), [favorites]);

  const toggleFavorite = useCallback((url) => {
    setFavorites(prev => {
      const updated = new Set(prev);
      if (updated.has(url)) {
        updated.delete(url);
      } else {
        updated.add(url);
      }
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const favCount = favorites.size;

  const getAllUrls = useCallback(() => [...favorites], [favorites]);

  return { isFavorite, toggleFavorite, favCount, getAllUrls };
};
