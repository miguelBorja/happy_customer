import { useState, useEffect, useCallback, useRef } from 'react';
import { CompareContext, MAX_COMPARE_CARS } from '../hooks/useCompare';
import { fetchCarsByUrls } from '../api/client';
import { trackEvent } from '../utils/analytics';

const STORAGE_KEY = 'crautosdb_compare_cars';

const loadCompareCars = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((car) => car && car.URL).slice(0, MAX_COMPARE_CARS);
  } catch {
    return [];
  }
};

const saveCompareCars = (cars) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
  } catch {
    // ignore write errors (private mode, quota, etc.)
  }
};

export const CompareProvider = ({ children }) => {
  const [compareCars, setCompareCars] = useState(loadCompareCars);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  // Mirror of compareCars so callbacks toggling rapidly read the latest list
  // without being re-created on every change.
  const compareCarsRef = useRef(compareCars);

  useEffect(() => {
    compareCarsRef.current = compareCars;
  }, [compareCars]);

  // Refresh the saved cars once on mount: re-fetch their latest data so the
  // comparison never shows stale prices/specs.
  useEffect(() => {
    const initialUrls = compareCarsRef.current.map((car) => car.URL);
    if (initialUrls.length === 0) return;

    fetchCarsByUrls(initialUrls)
      .then((fresh) => {
        if (!Array.isArray(fresh) || fresh.length === 0) return;
        const byUrl = new Map(fresh.map((car) => [car.URL, car]));
        const current = compareCarsRef.current;
        const ordered = current
          .map((car) => byUrl.get(car.URL) || car)
          .filter(Boolean)
          .slice(0, MAX_COMPARE_CARS);
        compareCarsRef.current = ordered;
        saveCompareCars(ordered);
        setCompareCars(ordered);
      })
      .catch(() => {
        // keep the locally stored snapshot if the refresh fails
      });
  }, []);

  const isComparing = useCallback(
    (url) => compareCars.some((car) => car.URL === url),
    [compareCars]
  );

  const toggleCompare = useCallback((car) => {
    if (!car || !car.URL) return;
    const prev = compareCarsRef.current;
    let updated;

    if (prev.some((c) => c.URL === car.URL)) {
      updated = prev.filter((c) => c.URL !== car.URL);
    } else if (prev.length < MAX_COMPARE_CARS) {
      updated = [...prev, car];
    } else {
      updated = [...prev.slice(0, MAX_COMPARE_CARS - 1), car];
    }

    compareCarsRef.current = updated;
    saveCompareCars(updated);
    setCompareCars(updated);
    trackEvent('toggle_compare', 'engagement', car.Title || car.URL);
  }, []);

  const removeCompare = useCallback((url) => {
    const updated = compareCarsRef.current.filter((c) => c.URL !== url);
    compareCarsRef.current = updated;
    saveCompareCars(updated);
    setCompareCars(updated);
  }, []);

  const clearCompare = useCallback(() => {
    compareCarsRef.current = [];
    setCompareCars([]);
    setIsCompareOpen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore remove errors
    }
  }, []);

  const derivedOpen = isCompareOpen && compareCars.length >= 2;

  return (
    <CompareContext.Provider
      value={{
        compareCars,
        isComparing,
        toggleCompare,
        removeCompare,
        clearCompare,
        isCompareOpen: derivedOpen,
        setIsCompareOpen,
        maxCars: MAX_COMPARE_CARS,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
};
