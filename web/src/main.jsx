import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { FavoritesProvider } from './context/FavoritesContext.jsx'
import { initGA } from './utils/analytics'

// Initialize Google Analytics 4
initGA();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <FavoritesProvider>
        <App />
      </FavoritesProvider>
    </LanguageProvider>
  </StrictMode>,
)
