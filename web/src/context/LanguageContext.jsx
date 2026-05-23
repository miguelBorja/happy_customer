import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../translations';

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

  // Translate function: gets the string from translations map
  // and dynamically replaces placeholder params like {count}
  const t = (key, params = {}) => {
    const langTranslations = translations[language] || translations.es;
    let text = langTranslations[key] || translations.es[key] || key;

    // Replace dynamic placeholders, e.g. {count} or {visible}
    Object.entries(params).forEach(([paramKey, paramVal]) => {
      text = text.replace(`{${paramKey}}`, paramVal);
    });

    return text;
  };

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'es' ? 'en' : 'es'));
  };

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
