import React, { createContext, useState, useContext, useCallback } from 'react';
import { trackEvent } from '../utils/analytics';

export const FavoritesContext = createContext();

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

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState(loadFavorites);

  const isFavorite = useCallback((url) => favorites.has(url), [favorites]);

  const toggleFavorite = useCallback((url) => {
    setFavorites(prev => {
      const updated = new Set(prev);
      const isAdding = !updated.has(url);
      if (updated.has(url)) {
        updated.delete(url);
      } else {
        updated.add(url);
      }
      saveFavorites(updated);
      
      // Track favorite event in GA4
      trackEvent(
        isAdding ? 'add_to_favorites' : 'remove_from_favorites',
        'engagement',
        url
      );

      return updated;
    });
  }, []);

  const favCount = favorites.size;

  const getAllUrls = useCallback(() => [...favorites], [favorites]);

  return (
    <FavoritesContext.Provider value={{ isFavorite, toggleFavorite, favCount, getAllUrls }}>
      {children}
    </FavoritesContext.Provider>
  );
};
