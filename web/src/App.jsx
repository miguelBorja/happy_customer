import React, { useState, useEffect } from 'react';
import CarsPage from './pages/CarsPage';
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
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('happy_customer_view_mode') || 'cards';
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('happy_customer_view_mode', mode);
  };

  // Unified Filter States
  const [filters, setFilters] = useState({
    title: '',
    brand: '',
    provincia: '',
    yearMin: '',
    yearMax: '',
    priceMin: '',
    priceMax: '',
    kmMax: '',
    transmision: '',
    combustible: '',
    isSold: 'false',
    equipments: [],
    scrapedFrom: '',
    scrapedTo: '',
    limit: '100',
    sortTitle: 'asc',
    sortYear: 'desc',
    sortPrice: 'asc',
    sortKm: 'asc',
  });
  const [localTitle, setLocalTitle] = useState('');
  const [showFavsOnly, setShowFavsOnly] = useState(false);

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
      case 'favorites': return <FavoritesPage viewMode={viewMode} setViewMode={handleSetViewMode} />;
      case 'about': return <AboutPage />;
      default: 
        return (
          <CarsPage 
            filters={filters}
            setFilters={setFilters}
            localTitle={localTitle}
            setLocalTitle={setLocalTitle}
            showFavsOnly={showFavsOnly}
            setShowFavsOnly={setShowFavsOnly}
            viewMode={viewMode}
            setViewMode={handleSetViewMode}
          />
        );
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo" onClick={() => setActiveTab('browse')}>
          {t('logo')}
        </div>
        
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--success)' }}>{stats.active}</span>
            <span className="nav-stats-label"> {t('active')}</span>
            <span style={{ margin: '0 0.4rem' }}>•</span>
            <span style={{ color: 'var(--danger)' }}>{stats.sold}</span>
            <span className="nav-stats-label"> {t('sold')}</span>
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

      <nav className="bottom-nav">
        <button 
          className={`bottom-nav-btn ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          <span className="bottom-nav-icon">🔍</span>
          <span>{t('navBrowse')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          <span className="bottom-nav-icon">★</span>
          <span>{t('navFavs')}</span>
          {favCount > 0 && <span className="bottom-nav-badge">{favCount}</span>}
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <span className="bottom-nav-icon">ℹ️</span>
          <span>{t('navAbout')}</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
