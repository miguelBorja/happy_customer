import { createContext, useContext } from 'react';

export const SavedSearchesContext = createContext(null);

export const useSavedSearches = () => {
  const context = useContext(SavedSearchesContext);
  if (!context) {
    throw new Error('useSavedSearches must be used within a SavedSearchesProvider');
  }
  return context;
};
