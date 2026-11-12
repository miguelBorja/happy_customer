import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/photos.css'
import './styles/components.css'
import './styles/pages.css'
import App from './App.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { FavoritesProvider } from './context/FavoritesContext.jsx'
import { CompareProvider } from './context/CompareContext.jsx'
import { initGA } from './utils/analytics'

// Initialize Google Analytics 4
initGA();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <FavoritesProvider>
        <CompareProvider>
          <App />
        </CompareProvider>
      </FavoritesProvider>
    </LanguageProvider>
  </StrictMode>,
)
