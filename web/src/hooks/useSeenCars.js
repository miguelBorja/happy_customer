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

export const useSeenCars = () => {
  const [seenCars, setSeenCars] = useState(loadSeenCars);

  const isNew = useCallback((url) => !seenCars.has(url), [seenCars]);

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
