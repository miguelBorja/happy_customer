import { useState, useCallback, useEffect } from 'react';

const TABLE_DENSITY_KEY = 'happy_customer_table_density';
const DENSITY_EVENT = 'happy_customer_table_density_change';

// 'photos' (default) shows a thumbnail column in data tables; 'compact' hides it.
// Shared across all tables (browse, favorites, bargains) and persisted in localStorage.
export const useTableDensity = () => {
  const [density, setDensityState] = useState(() => localStorage.getItem(TABLE_DENSITY_KEY) || 'photos');

  useEffect(() => {
    const sync = () => setDensityState(localStorage.getItem(TABLE_DENSITY_KEY) || 'photos');
    window.addEventListener(DENSITY_EVENT, sync);
    return () => window.removeEventListener(DENSITY_EVENT, sync);
  }, []);

  const setDensity = useCallback((mode) => {
    localStorage.setItem(TABLE_DENSITY_KEY, mode);
    setDensityState(mode);
    window.dispatchEvent(new Event(DENSITY_EVENT));
  }, []);

  return { density, setDensity, showPhotos: density === 'photos' };
};
