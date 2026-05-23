import React, { useState, useEffect } from 'react';
import CarsPage from './pages/CarsPage';
import TopCarsPage from './pages/TopCarsPage';
import FavoritesPage from './pages/FavoritesPage';
import AboutPage from './pages/AboutPage';
import { fetchStats } from './api/client';
import { useFavorites } from './hooks/useFavorites';
import { useLanguage } from './context/LanguageContext';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0 });
  const { favCount } = useFavorites();
  const { language, toggleLanguage, t } = useLanguage();

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
    
    // Poll stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case 'top': return <TopCarsPage />;
      case 'favorites': return <FavoritesPage />;
      case 'about': return <AboutPage />;
      default: return <CarsPage />;
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo" onClick={() => setActiveTab('browse')}>
          {t('logo')}
        </div>
        
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--success)' }}>{stats.active}</span> {t('active')}
            <span style={{ margin: '0 0.5rem' }}>•</span>
            <span style={{ color: 'var(--danger)' }}>{stats.sold}</span> {t('sold')}
          </div>
          
          <button 
            onClick={toggleLanguage}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'var(--transition)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
          >
            🌐 {language === 'es' ? 'English' : 'Español'}
          </button>
          
          <div className="nav-links">
            <button 
              className={activeTab === 'browse' ? 'active' : ''} 
              onClick={() => setActiveTab('browse')}
            >
              {t('browseCars')}
            </button>
            <button 
              className={activeTab === 'top' ? 'active' : ''} 
              onClick={() => setActiveTab('top')}
            >
              {t('topCars')}
            </button>
            <button 
              className={`${activeTab === 'favorites' ? 'active' : ''} nav-fav-btn`}
              onClick={() => setActiveTab('favorites')}
            >
              <span style={{ color: '#fbbf24' }}>★</span> {t('favorites')}
              {favCount > 0 && <span className="nav-fav-count">{favCount}</span>}
            </button>
            <button 
              className={activeTab === 'about' ? 'active' : ''} 
              onClick={() => setActiveTab('about')}
            >
              {t('about')}
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
