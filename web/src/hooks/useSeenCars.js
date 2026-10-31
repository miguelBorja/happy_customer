import { useState, useCallback } from 'react';

const SEEN_CARS_KEY = 'crautosdb_seen_cars';

// Load seen car URLs from localStorage
const loadSeenCars = () => {
  try {
    const stored = localStorage.getItem(SEEN_CARS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

// Save seen car URLs to localStorage
const saveSeenCars = (seenSet) => {
  localStorage.setItem(SEEN_CARS_KEY, JSON.stringify([...seenSet]));
};

// "New" baseline: only cars first scraped after the user's first visit can be "new".
// On a first-ever visit the baseline is "now", so the initial catalog is not flagged as new.
// Users that already have a seen-list keep the previous behavior (baseline 0).
const NEW_BASELINE_KEY = 'crautosdb_new_baseline';

const loadBaseline = () => {
  try {
    const stored = localStorage.getItem(NEW_BASELINE_KEY);
    if (stored !== null) return Number(stored) || 0;
    const baseline = localStorage.getItem(SEEN_CARS_KEY) ? 0 : Date.now();
    localStorage.setItem(NEW_BASELINE_KEY, String(baseline));
    return baseline;
  } catch {
    return 0;
  }
};

const NEW_BASELINE = loadBaseline();

export const useSeenCars = () => {
  const [seenCars, setSeenCars] = useState(loadSeenCars);

  // Accepts a car object (preferred, uses ScrapedAt against the baseline) or a plain URL.
  const isNew = useCallback((carOrUrl) => {
    if (carOrUrl && typeof carOrUrl === 'object') {
      if (seenCars.has(carOrUrl.URL)) return false;
      const scrapedAt = Date.parse(carOrUrl.ScrapedAt);
      return Number.isNaN(scrapedAt) ? NEW_BASELINE === 0 : scrapedAt > NEW_BASELINE;
    }
    return !seenCars.has(carOrUrl);
  }, [seenCars]);

  const markSeen = useCallback((url) => {
    setSeenCars(prev => {
      if (prev.has(url)) return prev;
      const updated = new Set(prev);
      updated.add(url);
      saveSeenCars(updated);
      return updated;
    });
  }, []);

  const markAllSeen = useCallback((urls) => {
    setSeenCars(prev => {
      const updated = new Set(prev);
      urls.forEach(url => updated.add(url));
      saveSeenCars(updated);
      return updated;
    });
  }, []);

  const countNew = useCallback((urls) => {
    return urls.filter(url => !seenCars.has(url)).length;
  }, [seenCars]);

  return { isNew, markSeen, markAllSeen, countNew };
};
