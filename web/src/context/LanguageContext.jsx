/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { translate } from '../translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  // Load language from localStorage, defaulting to 'es' (Spanish)
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('happy_customer_lang');
    return saved === 'en' || saved === 'es' ? saved : 'es';
  });

  useEffect(() => {
    localStorage.setItem('happy_customer_lang', language);
  }, [language]);

  const t = useCallback(
    (key, params = {}) => translate(language, key, params),
    [language]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => (prev === 'es' ? 'en' : 'es'));
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
