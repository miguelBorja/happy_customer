import { createContext, useContext } from 'react';

export const MAX_COMPARE_CARS = 4;
export const CompareContext = createContext(null);

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
};
