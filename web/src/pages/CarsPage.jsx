import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchCars, fetchBrands, fetchCarsByUrls, fetchProvinces, fetchTopSellers, fetchFilteredBrands } from '../api/client';
import { trackEvent } from '../utils/analytics';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';
import '../styles/quick-searches.css';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import MarketBadge from '../components/MarketBadge';
import { getMarketDeal } from '../utils/marketDeal';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';
import { useLanguage } from '../context/LanguageContext';
import FiltersModal, { commonEquipments } from '../components/FiltersModal';
import {
  SearchIcon,
  FilterFunnelIcon,
  CardsGridIcon,
  TableListIcon,
  NewBadgeIcon
} from '../components/icons/AppIcons';
import { CarThumb } from '../components/CarPhoto';
import CarDetailsModal from '../components/CarDetailsModal';
import { useTableDensity } from '../hooks/useTableDensity';

const RENDER_STEP = 20;

const CarsPage = ({
  filters,
  setFilters,
  localTitle,
  setLocalTitle,
  showFavsOnly,
  setShowFavsOnly,
  viewMode,
  setViewMode
}) => {
  const [cars, setCars] = useState([]);
  const [visibleCount, setVisibleCount] = useState(RENDER_STEP);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const sentinelRef = useRef(null);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isNew, markSeen, markAllSeen } = useSeenCars();
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const [favCars, setFavCars] = useState([]);
  const { language, t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const { density, setDensity, showPhotos } = useTableDensity();
  const [selectedCar, setSelectedCar] = useState(null);
  const [clientSort, setClientSort] = useState(null);

  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(console.error);
    fetchTopSellers().then(setSellers).catch(console.error);
  }, []);

  // Dynamically load brands matching all other filters
  useEffect(() => {
    const filtersForBrands = { ...filters };
    delete filtersForBrands.brand;
    delete filtersForBrands.brands;
    delete filtersForBrands.limit;
    delete filtersForBrands.sortTitle;
    delete filtersForBrands.sortYear;
    delete filtersForBrands.sortPrice;
    delete filtersForBrands.sortKm;

    fetchFilteredBrands(filtersForBrands)
      .then(setBrands)
      .catch(console.error);
  }, [
    filters.title,
    filters.provincia,
    filters.yearMin,
    filters.yearMax,
    filters.priceMin,
    filters.priceMax,
    filters.kmMax,
    filters.estilo,
    filters.transmision,
    filters.combustible,
    filters.sellerName,
    filters.isSold,
    filters.equipments,
    filters.scrapedFrom,
    filters.scrapedTo,
  ]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(f => {
        if (f.title === localTitle) return f;
        return { ...f, title: localTitle };
      });
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [localTitle]);

  const loadCars = useCallback(async () => {
    setLoading(true);
    setVisibleCount(RENDER_STEP);
    try {
      const batchLimit = Number(filters.limit) || 100;
      const data = await fetchCars({ ...filters, offset: 0 });
      setCars(data);
      const allowInfiniteServer = !filters.limit || Number(filters.limit) >= 100;
      setHasMoreServer(allowInfiniteServer && data.length >= batchLimit);
    } catch (err) {
      console.error(err);
      setHasMoreServer(false);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setVisibleCount(RENDER_STEP);
  }, [showFavsOnly, clientSort]);

  const loadMoreFromServer = useCallback(async () => {
    if (loading || loadingMore || !hasMoreServer || showFavsOnly) return;
    setLoadingMore(true);
    try {
      const batchLimit = Number(filters.limit) || 100;
      const nextBatch = await fetchCars({ ...filters, offset: cars.length });
      if (nextBatch.length > 0) {
        const existingUrls = new Set(cars.map(c => c.URL));
        const uniqueNew = nextBatch.filter(c => !existingUrls.has(c.URL));
        if (uniqueNew.length > 0) {
          setCars(prev => [...prev, ...uniqueNew]);
          setVisibleCount(prev => prev + RENDER_STEP);
        }
        setHasMoreServer(nextBatch.length >= batchLimit && uniqueNew.length > 0);
      } else {
        setHasMoreServer(false);
      }
    } catch (err) {
      console.error(err);
      setHasMoreServer(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMoreServer, showFavsOnly, filters, cars.length]);

  useEffect(() => {
    loadCars();
  }, [loadCars]);

  // Load favorites from API when filter is toggled on
  useEffect(() => {
    if (showFavsOnly) {
      const urls = getAllUrls();
      if (urls.length > 0) {
        setLoading(true);
        fetchCarsByUrls(urls)
          .then(data => setFavCars(data))
          .catch(console.error)
          .finally(() => setLoading(false));
      } else {
        setFavCars([]);
      }
    }
  }, [showFavsOnly, getAllUrls]);

  const displayCars = useMemo(() => {
    const base = !showFavsOnly ? cars : favCars.filter(c => isFavorite(c.URL));
    if (clientSort === 'bestDeal') {
      const withDeals = base.map((car, index) => ({ car, deal: getMarketDeal(car), index }));
      withDeals.sort((a, b) => {
        const hasA = a.deal !== null;
        const hasB = b.deal !== null;
        if (hasA && hasB) {
          if (a.deal.pct !== b.deal.pct) {
            return a.deal.pct - b.deal.pct;
          }
          return a.index - b.index;
        }
        if (hasA) return -1;
        if (hasB) return 1;
        return a.index - b.index;
      });
      return withDeals.map(item => item.car);
    }
    return base;
  }, [cars, favCars, showFavsOnly, isFavorite, clientSort]);

  const visibleCars = useMemo(() => {
    return displayCars.slice(0, visibleCount);
  }, [displayCars, visibleCount]);

  useEffect(() => {
    const sentinelEl = sentinelRef.current;
    if (!sentinelEl) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        if (visibleCount < displayCars.length) {
          setVisibleCount(prev => Math.min(prev + RENDER_STEP, displayCars.length));
        } else if (!showFavsOnly && hasMoreServer && !loading && !loadingMore) {
          loadMoreFromServer();
        }
      }
    }, { root: null, rootMargin: '400px', threshold: 0 });

    observer.observe(sentinelEl);
    return () => {
      observer.disconnect();
    };
  }, [visibleCount, displayCars.length, showFavsOnly, hasMoreServer, loading, loadingMore, loadMoreFromServer]);

  const newCarsCountVisible = cars.filter(c => isNew(c)).length;

  const currentSortPreset = useMemo(() => {
    if (clientSort) return clientSort;
    if (
      filters.sortTitle === 'asc' &&
      filters.sortYear === 'desc' &&
      filters.sortPrice === 'asc' &&
      filters.sortKm === 'asc'
    ) {
      return 'optimal';
    }
    if (filters.sortPrice === 'asc') return 'priceAsc';
    if (filters.sortPrice === 'desc') return 'priceDesc';
    if (filters.sortKm === 'asc') return 'kmAsc';
    if (filters.sortKm === 'desc') return 'kmDesc';
    if (filters.sortYear === 'desc') return 'yearDesc';
    if (filters.sortYear === 'asc') return 'yearAsc';
    if (filters.sortTitle === 'asc') return 'titleAsc';
    return 'recent';
  }, [clientSort, filters.sortPrice, filters.sortKm, filters.sortYear, filters.sortTitle]);

  const handleSortPresetChange = (preset) => {
    if (preset === 'bestDeal') {
      setClientSort('bestDeal');
      setFilters(f => ({
        ...f,
        sortTitle: '',
        sortYear: '',
        sortPrice: '',
        sortKm: '',
      }));
      return;
    }
    setClientSort(null);
    const sortPresets = {
      recent: { sortTitle: '', sortYear: '', sortPrice: '', sortKm: '' },
      optimal: { sortTitle: 'asc', sortYear: 'desc', sortPrice: 'asc', sortKm: 'asc' },
      priceAsc: { sortTitle: '', sortYear: '', sortPrice: 'asc', sortKm: '' },
      priceDesc: { sortTitle: '', sortYear: '', sortPrice: 'desc', sortKm: '' },
      kmAsc: { sortTitle: '', sortYear: '', sortPrice: '', sortKm: 'asc' },
      kmDesc: { sortTitle: '', sortYear: '', sortPrice: '', sortKm: 'desc' },
      yearDesc: { sortTitle: '', sortYear: 'desc', sortPrice: '', sortKm: '' },
      yearAsc: { sortTitle: '', sortYear: 'asc', sortPrice: '', sortKm: '' },
      titleAsc: { sortTitle: 'asc', sortYear: '', sortPrice: '', sortKm: '' },
    };
    const update = sortPresets[preset] || sortPresets.recent;
    setFilters(f => ({
      ...f,
      ...update,
    }));
  };

  const handleSortHeader = (field) => {
    setClientSort(null);
    if (field === 'year') {
      const next = filters.sortYear === 'desc' ? 'asc' : 'desc';
      setFilters(f => ({
        ...f,
        sortYear: next,
        sortPrice: '',
        sortKm: '',
        sortTitle: '',
      }));
    } else if (field === 'price') {
      const next = filters.sortPrice === 'asc' ? 'desc' : 'asc';
      setFilters(f => ({
        ...f,
        sortPrice: next,
        sortYear: '',
        sortKm: '',
        sortTitle: '',
      }));
    } else if (field === 'km') {
      const next = filters.sortKm === 'asc' ? 'desc' : 'asc';
      setFilters(f => ({
        ...f,
        sortKm: next,
        sortYear: '',
        sortPrice: '',
        sortTitle: '',
      }));
    }
  };

  const handleResetFilters = () => {
    setClientSort(null);
    setFilters({
      title: '',
      brand: '',
      brands: [],
      provincia: '',
      yearMin: '',
      yearMax: '',
      priceMin: '',
      priceMax: '',
      priceMode: '',
      kmMax: '',
      kmMode: '',
      estilo: '',
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
      sortTitle: '',
      sortYear: '',
      sortPrice: '',
      sortKm: '',
    });
    setLocalTitle('');
    setShowFavsOnly(false);
  };

  const getCombustibleLabel = (val) => {
    if (!val) return '';
    const lower = val.toLowerCase();
    if (['eléctrico', 'electrico', 'electric'].includes(lower)) return t('electric');
    if (['híbrido', 'hibrido', 'hybrid'].includes(lower)) return t('hybrid');
    if (['gasolina', 'gasoline'].includes(lower)) return t('gasoline');
    if (['diesel', 'diésel'].includes(lower)) return t('diesel');
    return val;
  };

  const getTransmisionLabel = (val) => {
    if (!val) return '';
    const lower = val.toLowerCase();
    if (['automática/dual', 'automatica/dual', 'automática', 'automatica'].includes(lower)) return t('automatic');
    if (lower === 'dual') return t('dual');
    if (lower === 'manual') return t('manual');
    return val;
  };

  const getActiveFilterTags = () => {
    const tags = [];
    const activeBrands = Array.isArray(filters.brands)
      ? filters.brands
      : (filters.brand ? filters.brand.split(',').map(s => s.trim()).filter(Boolean) : []);

    if (activeBrands.length > 0) {
      activeBrands.forEach(b => {
        tags.push({
          id: `brand-${b}`,
          label: `${t('brand')}: ${b}`,
          clear: () => setFilters(f => {
            const current = Array.isArray(f.brands)
              ? f.brands
              : (f.brand ? f.brand.split(',').map(s => s.trim()).filter(Boolean) : []);
            const updated = current.filter(brandItem => brandItem !== b);
            return {
              ...f,
              brands: updated,
              brand: updated.join(','),
            };
          })
        });
      });
    }
    if (filters.provincia) tags.push({ id: 'provincia', label: `${t('province')}: ${filters.provincia}`, clear: () => setFilters(f => ({ ...f, provincia: '' })) });
    if ((filters.yearMin && filters.yearMin !== '2010') || (filters.yearMax && filters.yearMax !== '2027')) {
      const minVal = Number(filters.yearMin) || 2010;
      const maxVal = Number(filters.yearMax) || 2027;
      let label = '';
      if (minVal > 2010 && maxVal === 2027) {
        label = `≥ ${minVal}`;
      } else if (minVal === 2010 && maxVal < 2027) {
        label = `≤ ${maxVal}`;
      } else if (minVal > 2010 && maxVal < 2027) {
        label = `${minVal} - ${maxVal}`;
      }
      
      if (label) {
        tags.push({
          id: 'year',
          label: `${t('year')}: ${label}`,
          clear: () => setFilters(f => ({ ...f, yearMin: '', yearMax: '' }))
        });
      }
    }
    if (filters.priceMin || filters.priceMax) {
      const minVal = Number(filters.priceMin) || 0;
      const maxVal = Number(filters.priceMax) || 100000;
      let label = '';
      if (minVal > 0 && maxVal === 100000) {
        label = `≥ $${minVal.toLocaleString()}`;
      } else if (minVal === 0 && maxVal < 100000) {
        label = `≤ $${maxVal.toLocaleString()}`;
      } else if (minVal > 0 && maxVal < 100000) {
        label = `$${minVal.toLocaleString()} - $${maxVal.toLocaleString()}`;
      }
      
      if (label) {
        tags.push({
          id: 'price',
          label: `${t('priceHeader').replace(' ($)', '')}: ${label}`,
          clear: () => setFilters(f => ({ ...f, priceMin: '', priceMax: '', priceMode: '' }))
        });
      }
    }
    if (filters.kmMax) tags.push({ id: 'kmMax', label: `Max km: ${Number(filters.kmMax).toLocaleString()}`, clear: () => setFilters(f => ({ ...f, kmMax: '', kmMode: '' })) });
    if (filters.estilo) tags.push({ id: 'estilo', label: `Estilo: ${filters.estilo}`, clear: () => setFilters(f => ({ ...f, estilo: '' })) });
    if (filters.transmision) tags.push({ id: 'transmision', label: `${t('transmission')}: ${getTransmisionLabel(filters.transmision)}`, clear: () => setFilters(f => ({ ...f, transmision: '' })) });
    if (filters.combustible) tags.push({ id: 'combustible', label: `${t('fuel')}: ${getCombustibleLabel(filters.combustible)}`, clear: () => setFilters(f => ({ ...f, combustible: '' })) });
    if (filters.sellerName) tags.push({ id: 'sellerName', label: `${t('sellerName') || 'Seller'}: ${filters.sellerName}`, clear: () => setFilters(f => ({ ...f, sellerName: '', sellerMode: '' })) });
    if (filters.scrapedPeriod) {
      let label = '';
      if (filters.scrapedPeriod === 'today') label = t('today');
      else if (filters.scrapedPeriod === 'yesterday') label = t('yesterday');
      else if (filters.scrapedPeriod === 'week') label = t('thisWeek');
      else if (filters.scrapedPeriod === 'month') label = t('lastMonth');
      
      tags.push({
        id: 'scrapedPeriod',
        label: `${t('scrapedDate') || 'Date'}: ${label}`,
        clear: () => setFilters(f => ({ ...f, scrapedPeriod: '', scrapedFrom: '', scrapedTo: '' }))
      });
    } else if (filters.scrapedFrom || filters.scrapedTo) {
      let label = '';
      if (filters.scrapedFrom && filters.scrapedTo) label = `${filters.scrapedFrom} to ${filters.scrapedTo}`;
      else if (filters.scrapedFrom) label = `From ${filters.scrapedFrom}`;
      else label = `To ${filters.scrapedTo}`;
      tags.push({
        id: 'scrapedDate',
        label: `${t('scrapedDate') || 'Date'}: ${label}`,
        clear: () => setFilters(f => ({ ...f, scrapedFrom: '', scrapedTo: '' }))
      });
    }
    if (filters.limit && filters.limit !== '100') tags.push({ id: 'limit', label: `${t('limit')}: ${filters.limit}`, clear: () => setFilters(f => ({ ...f, limit: '100' })) });
    if (filters.equipments && filters.equipments.length > 0) {
      filters.equipments.forEach(eq => {
        tags.push({
          id: `eq-${eq}`,
          label: t(eq),
          clear: () => setFilters(f => ({ ...f, equipments: f.equipments.filter(e => e !== eq) }))
        });
      });
    }
    if (filters.isSold !== 'false') tags.push({ id: 'isSold', label: t('showSold'), clear: () => setFilters(f => ({ ...f, isSold: 'false' })) });
    if (showFavsOnly) tags.push({ id: 'showFavsOnly', label: t('showFavsOnly'), clear: () => setShowFavsOnly(false) });
    
    return tags;
  };

  const activeTags = getActiveFilterTags();
  const hasActiveFilters = activeTags.length > 0;

  const quickSearches = [
    {
      id: 'optimalSort',
      label: language === 'es' ? '⭐ Óptimo' : '⭐ Optimal',
      isActive:
        !clientSort &&
        filters.sortTitle === 'asc' &&
        filters.sortYear === 'desc' &&
        filters.sortPrice === 'asc' &&
        filters.sortKm === 'asc',
      apply: () => {
        setClientSort(null);
        setFilters(f => ({
          ...f,
          sortTitle: 'asc',
          sortYear: 'desc',
          sortPrice: 'asc',
          sortKm: 'asc',
        }));
      },
      remove: () =>
        setFilters(f => ({
          ...f,
          sortTitle: '',
          sortYear: '',
          sortPrice: '',
          sortKm: '',
        })),
    },
    {
      id: 'goodDeals',
      label: language === 'es' ? '🔥 Buenos precios' : '🔥 Good deals',
      isActive: clientSort === 'bestDeal',
      apply: () => {
        setClientSort('bestDeal');
        setFilters(f => ({
          ...f,
          sortTitle: '',
          sortYear: '',
          sortPrice: '',
          sortKm: '',
        }));
      },
      remove: () => setClientSort(null),
    },
    {
      id: 'under15k',
      label: language === 'es' ? '💰 Bajo $15k' : '💰 Under $15k',
      isActive: filters.priceMax === '15000',
      apply: () => setFilters(f => ({ ...f, priceMax: '15000' })),
      remove: () => setFilters(f => ({ ...f, priceMax: '' })),
    },
    {
      id: 'suv4x4',
      label: '🚙 SUV 4x4',
      isActive: filters.estilo === 'SUV 4WD/AWD',
      apply: () => setFilters(f => ({ ...f, estilo: 'SUV 4WD/AWD' })),
      remove: () => setFilters(f => ({ ...f, estilo: '' })),
    },
    {
      id: 'pickup4x4',
      label: '🛻 Pick-up 4x4',
      isActive: filters.estilo === 'Pick Up 4WD',
      apply: () => setFilters(f => ({ ...f, estilo: 'Pick Up 4WD' })),
      remove: () => setFilters(f => ({ ...f, estilo: '' })),
    },
    {
      id: 'electric',
      label: language === 'es' ? '⚡ Eléctricos' : '⚡ Electric',
      isActive: ['eléctrico', 'electrico'].includes((filters.combustible || '').toLowerCase()),
      apply: () => setFilters(f => ({ ...f, combustible: 'Eléctrico' })),
      remove: () => setFilters(f => ({ ...f, combustible: '' })),
    },
    {
      id: 'hybrid',
      label: language === 'es' ? '🌿 Híbridos' : '🌿 Hybrid',
      isActive: ['híbrido', 'hibrido'].includes((filters.combustible || '').toLowerCase()),
      apply: () => setFilters(f => ({ ...f, combustible: 'Híbrido' })),
      remove: () => setFilters(f => ({ ...f, combustible: '' })),
    },
    {
      id: 'auto2020',
      label: language === 'es' ? '⚙️ Automáticos 2020+' : '⚙️ Automatic 2020+',
      isActive: ['automática/dual', 'automatica/dual', 'automática', 'automatica'].includes((filters.transmision || '').toLowerCase()) && filters.yearMin === '2020',
      apply: () => setFilters(f => ({ ...f, transmision: 'Automática/Dual', yearMin: '2020' })),
      remove: () => setFilters(f => ({ ...f, transmision: '', yearMin: '' })),
    },
    {
      id: 'under50kKm',
      label: language === 'es' ? '📉 Menos de 50k km' : '📉 Under 50k km',
      isActive: filters.kmMax === '50000',
      apply: () => setFilters(f => ({ ...f, kmMax: '50000' })),
      remove: () => setFilters(f => ({ ...f, kmMax: '' })),
    },
  ];

  const handleQuickChipClick = (chip) => {
    if (chip.isActive) {
      chip.remove();
    } else {
      chip.apply();
      trackEvent('quick_search', 'engagement', chip.id);
    }
  };

  return (
    <div className="browse-page">
      {/* Top Search & Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <SearchIcon size={16} color="var(--text-muted)" className="search-input-icon" />
          <input 
            type="text" 
            name="title" 
            className="input-field" 
            placeholder={t('searchPlaceholder')} 
            value={localTitle} 
            onChange={(e) => setLocalTitle(e.target.value)} 
          />
        </div>
        <select 
          className="select-field sort-preset-select"
          aria-label={language === 'es' ? 'Ordenar por' : 'Sort by'}
          value={currentSortPreset}
          onChange={(e) => handleSortPresetChange(e.target.value)}
          style={{ width: 'auto', minWidth: '170px' }}
        >
          <option value="recent">{language === 'es' ? 'Más recientes' : 'Most recent'}</option>
          <option value="optimal">{language === 'es' ? 'Óptimo (Modelo, Año, Precio, Km)' : 'Optimal (Model, Year, Price, Km)'}</option>
          <option value="bestDeal">{language === 'es' ? 'Mejor oferta' : 'Best deal'}</option>
          <option value="priceAsc">{language === 'es' ? 'Menor precio' : 'Lowest price'}</option>
          <option value="priceDesc">{language === 'es' ? 'Mayor precio' : 'Highest price'}</option>
          <option value="kmAsc">{language === 'es' ? 'Menor kilometraje' : 'Lowest mileage'}</option>
          <option value="kmDesc">{language === 'es' ? 'Mayor kilometraje' : 'Highest mileage'}</option>
          <option value="yearDesc">{language === 'es' ? 'Más nuevos (año)' : 'Newest year'}</option>
          <option value="yearAsc">{language === 'es' ? 'Más antiguos (año)' : 'Oldest year'}</option>
          <option value="titleAsc">{language === 'es' ? 'Nombre A-Z' : 'Name A-Z'}</option>
        </select>
        <button 
          className={`btn-all-filters ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setIsFiltersOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <FilterFunnelIcon size={15} color="currentColor" />
          <span>{t('allFilters')}</span>
        </button>
      </div>

      {/* Quick Searches */}
      <div className="quick-searches">
        {quickSearches.map(chip => (
          <button
            key={chip.id}
            type="button"
            className={`quick-chip ${chip.isActive ? 'active' : ''}`}
            onClick={() => handleQuickChipClick(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="active-filters-tags">
          {activeTags.map(tag => (
            <span key={tag.id} className="filter-tag">
              {tag.label}
              <button className="filter-tag-close" onClick={tag.clear}>×</button>
            </span>
          ))}
          <button className="btn-clear-all-tags" onClick={handleResetFilters}>
            {t('clearAll')}
          </button>
        </div>
      )}

      {/* Shared Unified Filters Modal */}
      <FiltersModal 
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        showFavsOnly={showFavsOnly}
        setShowFavsOnly={setShowFavsOnly}
        resultsCount={displayCars.length}
        onReset={handleResetFilters}
        brands={brands}
        provinces={provinces}
        sellers={sellers}
      />

      {/* Results Container */}
      <div className="results-container">
        <div className="results-header">
          <h2>
            {t('carsFound', { count: displayCars.length })}
            {showFavsOnly && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{t('favoritesOnlyLabel')}</span>}
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {loading && <div className="loader"></div>}
            
            <div className="view-mode-toggle">
              <button 
                className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <CardsGridIcon size={14} color="currentColor" />
                <span>{t('viewCards')}</span>
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <TableListIcon size={14} color="currentColor" />
                <span>{t('viewTable')}</span>
              </button>
            </div>

            {viewMode === 'table' && (
              <div className="table-density-toggle">
                <button
                  className={`btn-view-toggle ${density === 'photos' ? 'active' : ''}`}
                  onClick={() => setDensity('photos')}
                >
                  {language === 'es' ? 'Con fotos' : 'Photos'}
                </button>
                <button
                  className={`btn-view-toggle ${density === 'compact' ? 'active' : ''}`}
                  onClick={() => setDensity('compact')}
                >
                  {language === 'es' ? 'Compacta' : 'Compact'}
                </button>
              </div>
            )}
          </div>
        </div>

        {!loading && newCarsCountVisible > 0 && (
          <div className="new-cars-bar" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <NewBadgeIcon size={22} />
              <span>
                {newCarsCountVisible === 1 
                  ? t('newCarsCount', { count: newCarsCountVisible }) 
                  : t('newCarsCountPlural', { count: newCarsCountVisible })}
              </span>
            </div>
            <button className="btn-mark-seen" onClick={() => markAllSeen(cars.map(c => c.URL))}>
              {t('markAllSeen')}
            </button>
          </div>
        )}

        {!loading && cars.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {t('noCarsFound')}
          </div>
        )}

        {/* Dynamic Presentation Views */}
        {/* Dynamic Presentation Views */}
        {!loading && displayCars.length > 0 && (
          viewMode === 'cards' ? (
            <div className="results-grid">
              {visibleCars.map(car => (
                <CarCard
                  key={car.URL}
                  car={car}
                  isNew={isNew(car)}
                  isFav={isFavorite(car.URL)}
                  onToggleFav={toggleFavorite}
                  maxPrice={filters.priceMax ? Number(filters.priceMax) : 0}
                  maxMileage={filters.kmMax ? Number(filters.kmMax) : 0}
                />
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    {showPhotos ? <th></th> : <th>{t('rank')}</th>}
                    <th>{t('title')}</th>
                    <th className="sortable" onClick={() => handleSortHeader('year')}>
                      {t('year')}{!clientSort && filters.sortYear === 'asc' ? ' ▲' : !clientSort && filters.sortYear === 'desc' ? ' ▼' : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSortHeader('price')}>
                      {t('priceHeader')}{!clientSort && filters.sortPrice === 'asc' ? ' ▲' : !clientSort && filters.sortPrice === 'desc' ? ' ▼' : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSortHeader('km')}>
                      {t('mileageHeader')}{!clientSort && filters.sortKm === 'asc' ? ' ▲' : !clientSort && filters.sortKm === 'desc' ? ' ▼' : ''}
                    </th>
                    <th>{t('province')}</th>
                    <th>{language === 'es' ? 'Publicado' : 'Listed'}</th>
                    <th className="text-right">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCars.map((car, idx) => {
                    const carIsNew = isNew(car);
                    const carIsFav = isFavorite(car.URL);
                    const waPhone = getWhatsAppPhone(car.SellerPhone);
                    return (
                      <tr 
                        key={car.URL} 
                        className={`draggable-car-row clickable-row ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify(car));
                          e.dataTransfer.setData('text/plain', JSON.stringify(car));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={(e) => {
                          if (e.target.closest('a, button, .tooltip-container')) return;
                          markSeen(car.URL);
                          setSelectedCar(car);
                        }}
                      >
                        <td>
                          <button
                            className={`fav-btn-table ${carIsFav ? 'active' : ''}`}
                            onClick={() => toggleFavorite(car.URL)}
                            title={carIsFav ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {carIsFav ? '★' : '☆'}
                          </button>
                        </td>
                        {showPhotos ? (
                          <td className="photo-cell">
                            <CarThumb car={car} variant="table" hoverPreview />
                          </td>
                        ) : (
                          <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              #{idx + 1}
                              {carIsNew && <span className="new-badge-inline">{t('newBadge')}</span>}
                            </span>
                          </td>
                        )}
                        <td style={{ fontWeight: '500' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {car.Title}
                            {showPhotos && carIsNew && <span className="new-badge-inline">{t('newBadge')}</span>}
                            {car.Comment && (
                              <span className="tooltip-container" tabIndex={0}>
                                💬
                                <span className="tooltip-text">"{car.Comment}"</span>
                              </span>
                            )}
                          </span>
                        </td>
                        <td>{car.Year}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                            <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} priceText={car.PriceText} deal={getMarketDeal(car)} />
                            <MarketBadge car={car} variant="compact" />
                          </div>
                        </td>
                        <td>
                          <MileageBar km={car.Kilometraje} maxMileage={filters.kmMax ? Number(filters.kmMax) : 0} />
                        </td>
                        <td>{car.Provincia}</td>
                        <td>
                          <span title={formatListingDate(car, language)} style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {formatListingAge(car, language)}
                          </span>
                        </td>
                        <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            {waPhone && (
                              <a
                                href={buildWhatsAppLink(waPhone, car, language)}
                                target="_blank"
                                rel="noreferrer"
                                title={`WhatsApp ${waPhone.display}`}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}
                                onClick={() => trackEvent('contact_whatsapp', 'outbound', car.Title || car.URL)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              </a>
                            )}
                            <a 
                              href={car.URL} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="btn-table-action"
                              onClick={() => {
                                markSeen(car.URL);
                                trackEvent('view_external_car', 'outbound', car.Title || car.URL);
                              }}
                            >
                              {t('view')}
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="top-car-mobile-list">
                {visibleCars.map((car, idx) => {
                  const carIsNew = isNew(car);
                  const carIsFav = isFavorite(car.URL);
                  return (
                    <div 
                      key={car.URL} 
                      className={`top-car-mobile-card with-photo draggable-car-card ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify(car));
                        e.dataTransfer.setData('text/plain', JSON.stringify(car));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={(e) => {
                        if (e.target.closest('a, button, .tooltip-container')) return;
                        markSeen(car.URL);
                        setSelectedCar(car);
                      }}
                    >
                      <button
                        className={`top-car-mobile-fav-btn ${carIsFav ? 'active' : ''}`}
                        onClick={() => toggleFavorite(car.URL)}
                        title={carIsFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {carIsFav ? '★' : '☆'}
                      </button>

                      <CarThumb car={car} variant="mobile" />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="top-car-mobile-header">
                          <div className="top-car-mobile-title">
                            <span className="top-car-mobile-rank">#{idx + 1}</span>
                            {carIsNew && <span className="badge-inline new" style={{ marginLeft: '0.5rem' }}>{t('newBadge')}</span>}
                            <span style={{ marginTop: '0.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              {car.Title}
                              {car.Comment && (
                                <span className="tooltip-container" tabIndex={0}>
                                  💬
                                  <span className="tooltip-text">"{car.Comment}"</span>
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="top-car-mobile-price" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>{car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}</span>
                          <MarketBadge car={car} variant="compact" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }} />
                        </div>

                        <div className="top-car-mobile-details">
                          <div><strong>{t('year')}:</strong> {car.Year}</div>
                          <div><strong>{t('province')}:</strong> {car.Provincia}</div>
                          <div>
                            <strong>{t('mileageHeader').replace(' (km)', '')}:</strong> {car.Kilometraje > 0 ? `${car.Kilometraje.toLocaleString()} km` : 'N/A'}
                          </div>
                          <div>
                            <strong>{language === 'es' ? 'Publicado' : 'Listed'}:</strong> {formatListingAge(car, language)}
                          </div>
                        </div>

                        <div className="top-car-mobile-footer">
                          <div style={{ display: 'flex', gap: '0.25rem', flex: 1, marginRight: '1rem' }}>
                            <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} deal={getMarketDeal(car)} />
                            <MileageBar km={car.Kilometraje} />
                          </div>
                          <a 
                            href={car.URL} 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem' }}
                            onClick={() => {
                              markSeen(car.URL);
                              trackEvent('view_external_car', 'outbound', car.Title || car.URL);
                            }}
                          >
                            {t('view')} →
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {!loading && displayCars.length > 0 && (visibleCount < displayCars.length || (!showFavsOnly && hasMoreServer)) && (
          <div
            ref={sentinelRef}
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem 0', minHeight: '40px' }}
          >
            {loadingMore && <div className="loader"></div>}
          </div>
        )}
      </div>

      {selectedCar && (
        <CarDetailsModal
          isOpen
          onClose={() => setSelectedCar(null)}
          car={selectedCar}
        />
      )}
    </div>
  );
};

export default CarsPage;
