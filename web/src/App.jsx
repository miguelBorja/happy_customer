import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import CarsPage from './pages/CarsPage';
import FavoritesPage from './pages/FavoritesPage';
import StatsPage from './pages/StatsPage';
import AboutPage from './pages/AboutPage';
import BargainsPage from './pages/BargainsPage';
import ValuatePage from './pages/ValuatePage';
import AICopilotWindow from './components/AICopilotWindow';
import CompareWidget from './components/CompareWidget';
import WelcomeBanner from './components/WelcomeBanner';
import { fetchStats, recordVisit } from './api/client';
import { useFavorites } from './hooks/useFavorites';
import { useSavedSearches } from './hooks/useSavedSearches';
import { useLanguage } from './context/LanguageContext';
import { useTheme } from './hooks/useTheme';
import { trackPageView } from './utils/analytics';
import { parseUrlState, buildUrlSearch, sameFilters, createDefaultFilters } from './utils/urlState';
import {
  FlagIcon,
  SunIcon,
  MoonIcon,
  StarIcon,
  TagIcon,
  StatsChartIcon,
  InfoCircleIcon,
  SearchIcon,
  SparkleClusterIcon,
  CalculatorIcon
} from './components/icons/AppIcons';

function App() {
  // Tab, filters, sort and open car are restored from the URL (shareable links + Back button).
  const initialUrlState = useMemo(() => parseUrlState(window.location.search), []);
  // A shared link (car, filters, sort, tab, compare) must never be interrupted by the welcome banner.
  const hasInitialUrlParams = useMemo(() => Boolean(
    initialUrlState.carUrl ||
    initialUrlState.compareUrls.length > 0 ||
    initialUrlState.tab !== 'browse' ||
    initialUrlState.clientSort ||
    !sameFilters(initialUrlState.filters, createDefaultFilters())
  ), [initialUrlState]);
  const [activeTab, setActiveTab] = useState(initialUrlState.tab);
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0, visits: 0 });
  const { favCount } = useFavorites();
  const { totalAlerts } = useSavedSearches();
  const { toggleLanguage, t } = useLanguage();
  const { isLight, toggleTheme } = useTheme();
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

  // Unified Filter States (defaults live in utils/urlState.js)
  const [filters, setFilters] = useState(initialUrlState.filters);
  const [localTitle, setLocalTitle] = useState(initialUrlState.filters.title);
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [clientSort, setClientSort] = useState(initialUrlState.clientSort);
  const [carUrl, setCarUrl] = useState(initialUrlState.carUrl);
  const [valuateParams, setValuateParams] = useState(initialUrlState.valuateParams);
  const [upgradeContext, setUpgradeContext] = useState(null);
  // True while the current history entry was pushed by opening a car, so closing it can go "Back".
  const carPushedRef = useRef(false);
  const prevUrlStateRef = useRef(null);

  // State -> URL. Typing in the search box (or the client sort) only replaces the entry;
  // tab, filter, valuate and car changes add a history step so "Back" undoes them.
  useEffect(() => {
    const search = buildUrlSearch({ tab: activeTab, filters, clientSort, carUrl, valuateParams });
    const prev = prevUrlStateRef.current;
    prevUrlStateRef.current = { tab: activeTab, filters, carUrl, valuateParams };
    if (search === window.location.search) return;

    const url = window.location.pathname + search + window.location.hash;
    const sameValuate =
      prev?.valuateParams?.brand === valuateParams?.brand &&
      prev?.valuateParams?.model === valuateParams?.model &&
      prev?.valuateParams?.year === valuateParams?.year &&
      prev?.valuateParams?.km === valuateParams?.km;
    const minorChange = !prev || (
      prev.tab === activeTab &&
      prev.carUrl === carUrl &&
      sameValuate &&
      sameFilters({ ...prev.filters, title: '' }, { ...filters, title: '' })
    );
    if (minorChange) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
      carPushedRef.current = Boolean(carUrl) && !prev.carUrl;
    }
  }, [activeTab, filters, clientSort, carUrl, valuateParams]);

  // URL -> state when the user presses Back / Forward.
  useEffect(() => {
    const onPopState = () => {
      const s = parseUrlState(window.location.search);
      carPushedRef.current = false;
      setActiveTab(s.tab);
      setFilters(prev => (sameFilters(prev, s.filters) ? prev : s.filters));
      setLocalTitle(s.filters.title);
      setClientSort(s.clientSort);
      setCarUrl(s.carUrl);
      setValuateParams(s.valuateParams);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const goToTab = (tab) => {
    setActiveTab(tab);
    setCarUrl(null);
  };

  const handleOpenCar = useCallback((url) => setCarUrl(url), []);
  const handleCloseCar = useCallback(() => {
    if (carPushedRef.current) {
      carPushedRef.current = false;
      window.history.back(); // popstate clears carUrl
    } else {
      setCarUrl(null);
    }
  }, []);
  
  // AI Copilot State & Attached Cars Context
  const MAX_COPILOT_CARS = 5;
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isCopilotMinimized, setIsCopilotMinimized] = useState(false);
  const [isCopilotExpanded, setIsCopilotExpanded] = useState(false);
  const [attachedCars, setAttachedCars] = useState([]);

  const handleAddCarToCopilot = (car) => {
    setAttachedCars((prev) => {
      const exists = prev.some((c) => c.URL === car.URL);
      if (exists) return prev;
      if (prev.length >= MAX_COPILOT_CARS) {
        // If already at max (5 cars), replace the last one
        return [...prev.slice(0, MAX_COPILOT_CARS - 1), car];
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

  const handleExploreGoodDeals = useCallback(() => {
    setActiveTab('browse');
    setCarUrl(null);
    setShowFavsOnly(false);
    setLocalTitle('');
    setUpgradeContext(null);
    setFilters({ ...createDefaultFilters(), deal: 'good' });
    setClientSort('bestDeal');
  }, []);

  const handleApplySavedSearch = useCallback((saved) => {
    if (!saved) return;
    setActiveTab('browse');
    setCarUrl(null);
    setShowFavsOnly(false);
    setLocalTitle(saved.filters?.title || '');
    setUpgradeContext(null);
    setFilters({ ...createDefaultFilters(), ...(saved.filters || {}) });
    setClientSort(saved.clientSort || null);
  }, []);

  const handleFilterBySeller = useCallback((sellerName) => {
    if (!sellerName) return;
    setActiveTab('browse');
    setCarUrl(null);
    setShowFavsOnly(false);
    setLocalTitle('');
    setClientSort(null);
    setUpgradeContext(null);
    setFilters({ ...createDefaultFilters(), sellerName });
  }, []);

  const handleBrowseFromValuate = useCallback(({ brand, model }) => {
    setActiveTab('browse');
    setCarUrl(null);
    setShowFavsOnly(false);
    setLocalTitle('');
    setClientSort(null);
    setUpgradeContext(null);
    setFilters({
      ...createDefaultFilters(),
      brands: brand ? [brand] : [],
      models: model ? [model] : [],
    });
  }, []);

  const handleBrowseUpgrade = useCallback(({ priceMin, priceMax, seRecibe, context }) => {
    setActiveTab('browse');
    setCarUrl(null);
    setShowFavsOnly(false);
    setLocalTitle('');
    setClientSort('bestDeal');
    setUpgradeContext(context || null);
    setFilters({
      ...createDefaultFilters(),
      priceMin: priceMin || '',
      priceMax: priceMax || '',
      ...(seRecibe ? { seRecibe } : {}),
    });
  }, []);

  const handleExitUpgradeMode = useCallback(() => {
    setUpgradeContext(null);
    setFilters((f) => ({ ...f, priceMin: '', priceMax: '', priceMode: '', seRecibe: '' }));
  }, []);

  const handleAnalyzeWithCopilot = useCallback((carsToAnalyze) => {
    setAttachedCars(carsToAnalyze.slice(0, MAX_COPILOT_CARS));
    setIsCopilotOpen(true);
    setIsCopilotMinimized(false);
  }, []);

  const handleNegotiateWithCopilot = useCallback((car) => {
    if (!car) return;
    setAttachedCars((prev) => {
      const rest = prev.filter((c) => c.URL !== car.URL);
      return [car, ...rest].slice(0, MAX_COPILOT_CARS);
    });
    setIsCopilotOpen(true);
    setIsCopilotMinimized(false);
  }, []);

  const handleOpenValuate = useCallback((preset) => {
    if (preset && typeof preset === 'object' && !preset.nativeEvent && (preset.brand || preset.model || preset.year)) {
      setValuateParams((prev) => ({
        ...prev,
        brand: preset.brand || prev?.brand || '',
        model: preset.model || '',
        year: preset.year ? String(preset.year) : (prev?.year || '2020'),
        km: preset.km != null ? String(preset.km) : '',
      }));
    }
    goToTab('valuate');
  }, []);

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
            onApplySavedSearch={handleApplySavedSearch}
            onFilterBySeller={handleFilterBySeller}
            onNegotiateWithCopilot={handleNegotiateWithCopilot}
          />
        );
      case 'valuate':
        return (
          <ValuatePage
            valuateParams={valuateParams}
            onUpdateParams={setValuateParams}
            onBrowseSimilar={handleBrowseFromValuate}
            onBrowseUpgrade={handleBrowseUpgrade}
            onFilterBySeller={handleFilterBySeller}
            onNegotiateWithCopilot={handleNegotiateWithCopilot}
          />
        );
      case 'stats': return <StatsPage onOpenValuate={handleOpenValuate} />;
      case 'about': return <AboutPage stats={stats} />;
      case 'bargains': 
        return (
          <BargainsPage 
            viewMode={bargainsViewMode} 
            setViewMode={handleSetBargainsViewMode} 
            onNegotiateWithCopilot={handleNegotiateWithCopilot}
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
            clientSort={clientSort}
            setClientSort={setClientSort}
            carUrl={carUrl}
            onOpenCar={handleOpenCar}
            onCloseCar={handleCloseCar}
            onOpenValuate={handleOpenValuate}
            onFilterBySeller={handleFilterBySeller}
            onNegotiateWithCopilot={handleNegotiateWithCopilot}
            upgradeContext={upgradeContext}
            onExitUpgradeMode={handleExitUpgradeMode}
          />
        );
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo" onClick={() => goToTab('browse')}>
          {t('logo')}
        </div>
        
        <div className="navbar-right">
          <div className="navbar-stats">
            <span className="navbar-stats-active">{stats.active}</span>
            <span className="nav-stats-label"> {t('active')}</span>
            <span className="navbar-stats-sep">•</span>
            <span className="navbar-stats-sold">{stats.sold}</span>
            <span className="nav-stats-label"> {t('sold')}</span>
          </div>
          
          <button
            className="nav-theme-btn"
            onClick={toggleTheme}
            title={isLight ? t('switchToDarkTheme') : t('switchToLightTheme')}
            aria-label={isLight ? t('switchToDarkTheme') : t('switchToLightTheme')}
          >
            {isLight ? <MoonIcon size={15} color="currentColor" /> : <SunIcon size={15} color="currentColor" />}
            <span className="nav-theme-text">{isLight ? t('themeDarkLabel') : t('themeLightLabel')}</span>
          </button>

          <button 
            className="nav-lang-btn"
            onClick={toggleLanguage}
            title={t('switchLanguageTitle')}
          >
            <FlagIcon size={15} color="currentColor" />
            <span className="nav-lang-text">{t('switchLanguageLabel')}</span>
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
              onClick={() => goToTab('browse')}
            >
              <SearchIcon size={16} color="currentColor" />
              <span className="nav-link-text">{t('browseCars')}</span>
            </button>
            <button 
              className={activeTab === 'favorites' ? 'active' : ''} 
              onClick={() => goToTab('favorites')}
            >
              <StarIcon size={16} color="var(--icon-gold)" />
              <span className="nav-link-text nav-link-text-secondary">{t('favorites')}</span>
              {favCount > 0 && <span className="nav-fav-count">{favCount}</span>}
              {totalAlerts > 0 && <span className="nav-alert-count">{totalAlerts}</span>}
            </button>
            <button 
              className={activeTab === 'bargains' ? 'active' : ''} 
              onClick={() => goToTab('bargains')}
            >
              <TagIcon size={16} color="var(--icon-gold)" />
              <span className="nav-link-text nav-link-text-secondary">{t('bargainsTab')}</span>
            </button>
            <button 
              className={activeTab === 'valuate' ? 'active' : ''} 
              onClick={() => goToTab('valuate')}
            >
              <CalculatorIcon size={16} color="var(--icon-gold)" />
              <span className="nav-link-text nav-link-text-secondary">{t('navValuate')}</span>
            </button>
            <button 
              className={activeTab === 'stats' ? 'active' : ''} 
              onClick={() => goToTab('stats')}
            >
              <StatsChartIcon size={16} color="var(--icon-gold)" />
              <span className="nav-link-text nav-link-text-secondary">{t('stats')}</span>
            </button>
            <button 
              className={activeTab === 'about' ? 'active' : ''} 
              onClick={() => goToTab('about')}
            >
              <InfoCircleIcon size={16} color="currentColor" />
              <span className="nav-link-text nav-link-text-secondary">{t('about')}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {!hasInitialUrlParams && activeTab === 'browse' && !carUrl && (
          <WelcomeBanner
            stats={stats}
            onExploreGoodDeals={handleExploreGoodDeals}
            onOpenBargains={() => goToTab('bargains')}
            onOpenValuate={() => handleOpenValuate()}
          />
        )}
        {renderPage()}
      </main>

      <nav className="bottom-nav">
        <button 
          className={`bottom-nav-btn ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => goToTab('browse')}
        >
          <span className="bottom-nav-icon">
            <SearchIcon size={20} color="currentColor" />
          </span>
          <span>{t('navBrowse')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => goToTab('favorites')}
        >
          <span className="bottom-nav-icon">
            <StarIcon size={20} color="var(--icon-gold)" />
          </span>
          <span>{t('navFavs')}</span>
          {(favCount > 0 || totalAlerts > 0) && (
            <span className={`bottom-nav-badge ${totalAlerts > 0 ? 'has-alerts' : ''}`}>
              {totalAlerts > 0 ? `${favCount}·+${totalAlerts}` : favCount}
            </span>
          )}
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'bargains' ? 'active' : ''}`}
          onClick={() => goToTab('bargains')}
        >
          <span className="bottom-nav-icon">
            <TagIcon size={20} color="var(--icon-gold)" />
          </span>
          <span>{t('bargainsTab')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${isCopilotOpen ? 'active' : ''}`}
          onClick={handleToggleCopilot}
        >
          <span className="bottom-nav-icon">
            <SparkleClusterIcon size={22} color="var(--icon-sparkle)" />
          </span>
          <span>{t('copilotButton')}</span>
          {attachedCars.length > 0 && <span className="bottom-nav-badge">{attachedCars.length}</span>}
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => goToTab('stats')}
        >
          <span className="bottom-nav-icon">
            <StatsChartIcon size={20} color="var(--icon-gold)" />
          </span>
          <span>{t('stats')}</span>
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => goToTab('about')}
        >
          <span className="bottom-nav-icon">
            <InfoCircleIcon size={20} color="currentColor" />
          </span>
          <span>{t('navAbout')}</span>
        </button>
      </nav>

      <CompareWidget onAnalyzeWithCopilot={handleAnalyzeWithCopilot} />

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
