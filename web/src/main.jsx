import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/photos.css'
import './styles/components.css'
import './styles/pages.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { FavoritesProvider } from './context/FavoritesContext.jsx'
import { SavedSearchesProvider } from './context/SavedSearchesContext.jsx'
import { CompareProvider } from './context/CompareContext.jsx'
import { initGA } from './utils/analytics'

// Initialize Google Analytics 4
initGA();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <FavoritesProvider>
          <SavedSearchesProvider>
            <CompareProvider>
              <App />
            </CompareProvider>
          </SavedSearchesProvider>
        </FavoritesProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)
