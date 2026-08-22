import React, { useState, useEffect } from 'react';
import CarsPage from './pages/CarsPage';
import FavoritesPage from './pages/FavoritesPage';
import StatsPage from './pages/StatsPage';
import AboutPage from './pages/AboutPage';
import BargainsPage from './pages/BargainsPage';
import AICopilotWindow from './components/AICopilotWindow';
import { fetchStats, recordVisit } from './api/client';
import { useFavorites } from './hooks/useFavorites';
import { useLanguage } from './context/LanguageContext';
import { trackPageView } from './utils/analytics';
import {
  FlagIcon,
  StarIcon,
  TagIcon,
  StatsChartIcon,
  InfoCircleIcon,
  SearchIcon,
  SparkleClusterIcon
} from './components/icons/AppIcons';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0, visits: 0 });
  const { favCount } = useFavorites();
  const { language, toggleLanguage, t } = useLanguage();
  const [browseViewMode, setBrowseViewMode] = useState(() => {
    return localStorage.getItem('happy_customer_browse_view_mode') || 'cards';
  });
  const [favsViewMode, setFavsViewMode] = useState(() => {
    return localStorage.getItem('happy_customer_favs_view_mode') || 'cards';
  });
  const [bargainsViewMode, setBargainsViewMode] = useState(() => {
    return localStorage.getItem('happy_customer_bargains_view_mode') || 'cards';
  });

  const handleSetBrowseViewMode = (mode) => {
    setBrowseViewMode(mode);
    localStorage.setItem('happy_customer_browse_view_mode', mode);
  };
  const handleSetFavsViewMode = (mode) => {
    setFavsViewMode(mode);
    localStorage.setItem('happy_customer_favs_view_mode', mode);
  };
  const handleSetBargainsViewMode = (mode) => {
    setBargainsViewMode(mode);
    localStorage.setItem('happy_customer_bargains_view_mode', mode);
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
    priceMode: '',
    kmMax: '',
    kmMode: '',
    transmision: '',
    combustible: '',
    sellerName: '',
    sellerMode: '',
    isSold: 'false',
    equipments: [],
    scrapedFrom: '',
    scrapedTo: '',
    scrapedPeriod: '',
    limit: '100',
    sortTitle: 'asc',
    sortYear: 'desc',
    sortPrice: 'asc',
    sortKm: 'asc',
  });
  const [localTitle, setLocalTitle] = useState('');
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  
  // AI Copilot State & Attached Cars Context
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isCopilotMinimized, setIsCopilotMinimized] = useState(false);
  const [isCopilotExpanded, setIsCopilotExpanded] = useState(false);
  const [attachedCars, setAttachedCars] = useState([]);

  const handleAddCarToCopilot = (car) => {
    setAttachedCars((prev) => {
      const exists = prev.some((c) => c.URL === car.URL);
      if (exists) return prev;
      if (prev.length >= 2) {
        // If already 2 cars, replace the 2nd one
        return [prev[0], car];
      }
      return [...prev, car];
    });
    setIsCopilotOpen(true);
    setIsCopilotMinimized(false);
  };

  const handleRemoveCarFromCopilot = (url) => {
    setAttachedCars((prev) => prev.filter((c) => c.URL !== url));
  };

  const handleClearCopilotCars = () => {
    setAttachedCars([]);
  };

  const handleToggleCopilot = () => {
    if (!isCopilotOpen) {
      setIsCopilotOpen(true);
      setIsCopilotMinimized(false);
    } else if (isCopilotMinimized) {
      setIsCopilotMinimized(false);
    } else {
      setIsCopilotOpen(false);
    }
  };

  useEffect(() => {
    recordVisit('/').catch(console.error);
    fetchStats().then(setStats).catch(console.error);
    
    // Poll stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Track page view in GA4 on tab change
  useEffect(() => {
    trackPageView(`/${activeTab}`, activeTab);
  }, [activeTab]);

  const renderPage = () => {
    switch (activeTab) {
      case 'favorites': 
        return (
          <FavoritesPage 
            viewMode={favsViewMode} 
            setViewMode={handleSetFavsViewMode} 
          />
        );
      case 'stats': return <StatsPage />;
      case 'about': return <AboutPage stats={stats} />;
      case 'bargains': 
        return (
          <BargainsPage 
            viewMode={bargainsViewMode} 
            setViewMode={handleSetBargainsViewMode} 
          />
        );
      default: 
        return (
          <CarsPage 
            filters={filters}
            setFilters={setFilters}
            localTitle={localTitle}
            setLocalTitle={setLocalTitle}
            showFavsOnly={showFavsOnly}
            setShowFavsOnly={setShowFavsOnly}
            viewMode={browseViewMode}
            setViewMode={handleSetBrowseViewMode}
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
              gap: '0.45rem',
              transition: 'var(--transition)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
          >
            <FlagIcon size={15} color="#cbd5e1" />
            <span>{language === 'es' ? 'English' : 'Español'}</span>
          </button>

          {/* AI Copilot Toolbar Button - Styled after custom kit (1) */}
          <button
            className={`nav-ai-copilot-btn ${isCopilotOpen ? 'active' : ''}`}
            onClick={handleToggleCopilot}
            title={t('copilotTitle')}
          >
            <span className="nav-ai-icon">
              <SparkleClusterIcon size={18} color="#fef08a" />
            </span>
            <span className="nav-ai-label">{t('copilotButton')}</span>
            {attachedCars.length > 0 && (
              <span className="nav-ai-badge">{attachedCars.length}</span>
            )}
          </button>
          
          <div className="nav-links">
            <button 
              className={activeTab === 'browse' ? 'active' : ''} 
              onClick={() => setActiveTab('browse')}
            >
              {t('browseCars')}
            </button>
            <button 
              className={activeTab === 'favorites' ? 'active' : ''} 
              onClick={() => setActiveTab('favorites')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <StarIcon size={16} color="#fbbf24" />
              <span>{t('favorites')}</span>
              {favCount > 0 && <span className="nav-fav-count">{favCount}</span>}
            </button>
            <button 
              className={activeTab === 'bargains' ? 'active' : ''} 
              onClick={() => setActiveTab('bargains')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <TagIcon size={16} color="#fbbf24" />
              <span>{language === 'es' ? 'Gangas' : 'Bargains'}</span>
            </button>
            <button 
              className={activeTab === 'stats' ? 'active' : ''} 
              onClick={() => setActiveTab('stats')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <StatsChartIcon size={16} color="#fbbf24" />
              <span>{t('stats')}</span>
            </button>
            <button 
              className={activeTab === 'about' ? 'active' : ''} 
              onClick={() => setActiveTab('about')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <InfoCircleIcon size={16} color="#cbd5e1" />
              <span>{t('about')}</span>
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
          <span className="bottom-nav-icon">
            <SearchIcon size={20} color="currentColor" />
          </span>
          <span>{t('navBrowse')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          <span className="bottom-nav-icon">
            <StarIcon size={20} color="#fbbf24" />
          </span>
          <span>{t('navFavs')}</span>
          {favCount > 0 && <span className="bottom-nav-badge">{favCount}</span>}
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'bargains' ? 'active' : ''}`}
          onClick={() => setActiveTab('bargains')}
        >
          <span className="bottom-nav-icon">
            <TagIcon size={20} color="#fbbf24" />
          </span>
          <span>{language === 'es' ? 'Gangas' : 'Bargains'}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${isCopilotOpen ? 'active' : ''}`}
          onClick={handleToggleCopilot}
        >
          <span className="bottom-nav-icon">
            <SparkleClusterIcon size={22} color="#fef08a" />
          </span>
          <span>{t('copilotButton')}</span>
          {attachedCars.length > 0 && <span className="bottom-nav-badge">{attachedCars.length}</span>}
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <span className="bottom-nav-icon">
            <StatsChartIcon size={20} color="#fbbf24" />
          </span>
          <span>{t('stats')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <span className="bottom-nav-icon">
            <InfoCircleIcon size={20} color="#cbd5e1" />
          </span>
          <span>{t('navAbout')}</span>
        </button>
      </nav>

      <AICopilotWindow 
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        attachedCars={attachedCars}
        onAddCar={handleAddCarToCopilot}
        onRemoveCar={handleRemoveCarFromCopilot}
        onClearCars={handleClearCopilotCars}
        onSetAttachedCars={setAttachedCars}
        isMinimized={isCopilotMinimized}
        onToggleMinimize={() => setIsCopilotMinimized(prev => !prev)}
        isExpanded={isCopilotExpanded}
        onToggleExpand={() => setIsCopilotExpanded(prev => !prev)}
      />
    </div>
  );
}

export default App;
