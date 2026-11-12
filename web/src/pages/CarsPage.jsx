import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchCars, fetchCarsPage, fetchCarsByUrls, fetchProvinces, fetchTopSellers, fetchFilteredBrands } from '../api/client';
import { trackEvent } from '../utils/analytics';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';
import '../styles/quick-searches.css';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import MarketBadge from '../components/MarketBadge';
import PriceDropBadge from '../components/PriceDropBadge';
import { getMarketDeal } from '../utils/marketDeal';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';
import { useLanguage } from '../context/LanguageContext';
import FiltersModal from '../components/FiltersModal';
import {
  SearchIcon,
  FilterFunnelIcon,
  CardsGridIcon,
  TableListIcon,
  NewBadgeIcon
} from '../components/icons/AppIcons';
import { CarThumb } from '../components/CarPhoto';
import CarDetailsModal from '../components/CarDetailsModal';
import { ResultsSkeleton } from '../components/LoadingSkeletons';
import { useTableDensity } from '../hooks/useTableDensity';
import { useCompare } from '../hooks/useCompare';
import { createDefaultFilters } from '../utils/urlState';

const RENDER_STEP = 20;

const CarsPage = ({
  filters,
  setFilters,
  localTitle,
  setLocalTitle,
  showFavsOnly,
  setShowFavsOnly,
  clientSort,
  setClientSort,
  carUrl,
  onOpenCar,
  onCloseCar,
  viewMode,
  setViewMode
}) => {
  const [cars, setCars] = useState([]);
  const [visibleCount, setVisibleCount] = useState(RENDER_STEP);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const sentinelRef = useRef(null);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const { isNew, markSeen, markAllSeen } = useSeenCars();
  const { isFavorite, toggleFavorite, getAllUrls } = useFavorites();
  const [favCars, setFavCars] = useState([]);
  const { language, t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const { density, setDensity, showPhotos } = useTableDensity();
  const { isComparing, toggleCompare } = useCompare();
  const [selectedCar, setSelectedCar] = useState(null);

  // The open car is driven by carUrl (App keeps it in the URL as ?car=...).
  // selectedCar only caches the last clicked/fetched car; openCar is derived from the URL.
  const handleOpenCar = useCallback((car) => {
    setSelectedCar(car);
    markSeen(car.URL);
    onOpenCar(car.URL);
  }, [onOpenCar, markSeen]);

  const openCar = useMemo(() => {
    if (!carUrl) return null;
    if (selectedCar?.URL === carUrl) return selectedCar;
    return cars.find(c => c.URL === carUrl) || favCars.find(c => c.URL === carUrl) || null;
  }, [carUrl, selectedCar, cars, favCars]);

  // Shared link: the car may not be in the loaded results, so fetch it once.
  const needsFetch = Boolean(carUrl) && !openCar && !loading;
  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    fetchCarsByUrls([carUrl])
      .then(data => {
        if (!cancelled && Array.isArray(data) && data[0]) setSelectedCar(data[0]);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [needsFetch, carUrl]);

  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(console.error);
    fetchTopSellers().then(setSellers).catch(console.error);
  }, []);

  // Dynamically load brands matching all other filters
  useEffect(() => {
    const filtersForBrands = {
      title: filters.title,
      provincia: filters.provincia,
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      kmMin: filters.kmMin,
      kmMax: filters.kmMax,
      estilo: filters.estilo,
      transmision: filters.transmision,
      combustible: filters.combustible,
      sellerName: filters.sellerName,
      isSold: filters.isSold,
      equipments: filters.equipments,
      scrapedFrom: filters.scrapedFrom,
      scrapedTo: filters.scrapedTo,
      deal: filters.deal,
    };

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
    filters.kmMin,
    filters.kmMax,
    filters.estilo,
    filters.transmision,
    filters.combustible,
    filters.sellerName,
    filters.isSold,
    filters.equipments,
    filters.scrapedFrom,
    filters.scrapedTo,
    filters.deal,
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
  }, [localTitle, setFilters]);

  // "Best deal" ordering is resolved by the server over the whole catalog (not just loaded cars).
  const serverDealParams = useMemo(
    () => (clientSort === 'bestDeal' ? { sortDeal: 'best' } : {}),
    [clientSort]
  );

  const [prevCatalogDeps, setPrevCatalogDeps] = useState({ filters, serverDealParams });
  if (prevCatalogDeps.filters !== filters || prevCatalogDeps.serverDealParams !== serverDealParams) {
    setPrevCatalogDeps({ filters, serverDealParams });
    setCatalogLoading(true);
    setVisibleCount(RENDER_STEP);
  }

  const [prevViewDeps, setPrevViewDeps] = useState({ showFavsOnly, clientSort });
  if (prevViewDeps.showFavsOnly !== showFavsOnly || prevViewDeps.clientSort !== clientSort) {
    setPrevViewDeps({ showFavsOnly, clientSort });
    setVisibleCount(RENDER_STEP);
  }

  useEffect(() => {
    let cancelled = false;
    const batchLimit = Number(filters.limit) || 100;
    fetchCarsPage({ ...filters, ...serverDealParams, offset: 0 })
      .then(({ cars: data, total }) => {
        if (cancelled) return;
        setCars(data);
        setTotalCount(total);
        const allowInfiniteServer = !filters.limit || Number(filters.limit) >= 100;
        setHasMoreServer(allowInfiniteServer && data.length >= batchLimit);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setHasMoreServer(false);
        setTotalCount(null);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, serverDealParams]);

  const favUrlsKey = showFavsOnly ? getAllUrls().join('\n') : '';
  const [loadedFavsKey, setLoadedFavsKey] = useState('');
  const favsLoading = showFavsOnly && favUrlsKey !== '' && loadedFavsKey !== favUrlsKey;

  // Load favorites from API when the favorites filter is toggled on
  useEffect(() => {
    if (!favUrlsKey) return;
    let cancelled = false;
    const urls = favUrlsKey.split('\n');
    fetchCarsByUrls(urls)
      .then((data) => {
        if (!cancelled) setFavCars(data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadedFavsKey(favUrlsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [favUrlsKey]);

  const loading = showFavsOnly ? favsLoading : catalogLoading;

  const loadMoreFromServer = useCallback(async () => {
    if (loading || loadingMore || !hasMoreServer || showFavsOnly) return;
    setLoadingMore(true);
    try {
      const batchLimit = Number(filters.limit) || 100;
      const nextBatch = await fetchCars({ ...filters, ...serverDealParams, offset: cars.length });
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
  }, [loading, loadingMore, hasMoreServer, showFavsOnly, filters, serverDealParams, cars]);

  const displayCars = useMemo(() => {
    const base = !showFavsOnly ? cars : (favUrlsKey === '' ? [] : favCars.filter(c => isFavorite(c.URL)));
    // Server already ordered the catalog; only favorites (loaded locally) are sorted here.
    if (clientSort === 'bestDeal' && showFavsOnly) {
      const withDeals = base.map((car, index) => ({ car, deal: getMarketDeal(car), index }));
      withDeals.sort((a, b) => {
        // Flagged prices ('check') are not deals: they go with the cars without market data.
        const hasA = a.deal !== null && a.deal.level !== 'check';
        const hasB = b.deal !== null && b.deal.level !== 'check';
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
  }, [cars, favCars, showFavsOnly, favUrlsKey, isFavorite, clientSort]);

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
    setFilters(createDefaultFilters());
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
      let label;
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
    if (filters.deal === 'good') tags.push({ id: 'deal', label: t('goodPricesOnly'), clear: () => setFilters(f => ({ ...f, deal: '' })) });
    if (showFavsOnly) tags.push({ id: 'showFavsOnly', label: t('showFavsOnly'), clear: () => setShowFavsOnly(false) });
    
    return tags;
  };

  const activeTags = getActiveFilterTags();
  const hasActiveFilters = activeTags.length > 0;

  const quickSearches = [
    {
      id: 'optimalSort',
      label: t('sortOptimalChip'),
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
      label: t('quickGoodDeals'),
      // Filter "good prices only" (server-side, whole catalog) + order by best deal.
      isActive: filters.deal === 'good',
      apply: () => {
        setClientSort('bestDeal');
        setFilters(f => ({
          ...f,
          deal: 'good',
          sortTitle: '',
          sortYear: '',
          sortPrice: '',
          sortKm: '',
        }));
      },
      remove: () => {
        setClientSort(null);
        setFilters(f => ({ ...f, deal: '' }));
      },
    },
    {
      id: 'under15k',
      label: t('quickUnder15k'),
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
      label: t('quickElectric'),
      isActive: ['eléctrico', 'electrico'].includes((filters.combustible || '').toLowerCase()),
      apply: () => setFilters(f => ({ ...f, combustible: 'Eléctrico' })),
      remove: () => setFilters(f => ({ ...f, combustible: '' })),
    },
    {
      id: 'hybrid',
      label: t('quickHybrid'),
      isActive: ['híbrido', 'hibrido'].includes((filters.combustible || '').toLowerCase()),
      apply: () => setFilters(f => ({ ...f, combustible: 'Híbrido' })),
      remove: () => setFilters(f => ({ ...f, combustible: '' })),
    },
    {
      id: 'auto2020',
      label: t('quickAuto2020'),
      isActive: ['automática/dual', 'automatica/dual', 'automática', 'automatica'].includes((filters.transmision || '').toLowerCase()) && filters.yearMin === '2020',
      apply: () => setFilters(f => ({ ...f, transmision: 'Automática/Dual', yearMin: '2020' })),
      remove: () => setFilters(f => ({ ...f, transmision: '', yearMin: '' })),
    },
    {
      id: 'under50kKm',
      label: t('quickUnder50kKm'),
      isActive: filters.kmMax === '50000',
      apply: () => setFilters(f => ({ ...f, kmMax: '50000' })),
      remove: () => setFilters(f => ({ ...f, kmMax: '' })),
    },
  ];

  // Real number of matches from the server (X-Total-Count); favorites and fallbacks use what is loaded.
  const resultsCount = !showFavsOnly && totalCount !== null
    ? Math.max(totalCount, displayCars.length)
    : displayCars.length;

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
          aria-label={t('sortByLabel')}
          value={currentSortPreset}
          onChange={(e) => handleSortPresetChange(e.target.value)}
        >
          <option value="recent">{t('sortPresetRecent')}</option>
          <option value="optimal">{t('sortPresetOptimal')}</option>
          <option value="bestDeal">{t('sortPresetBestDeal')}</option>
          <option value="priceAsc">{t('sortPresetPriceAsc')}</option>
          <option value="priceDesc">{t('sortPresetPriceDesc')}</option>
          <option value="kmAsc">{t('sortPresetKmAsc')}</option>
          <option value="kmDesc">{t('sortPresetKmDesc')}</option>
          <option value="yearDesc">{t('sortPresetYearDesc')}</option>
          <option value="yearAsc">{t('sortPresetYearAsc')}</option>
          <option value="titleAsc">{t('sortPresetTitleAsc')}</option>
        </select>
        <button 
          className={`btn-all-filters ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setIsFiltersOpen(true)}
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
        resultsCount={resultsCount}
        onReset={handleResetFilters}
        brands={brands}
        provinces={provinces}
        sellers={sellers}
      />

      {/* Results Container */}
      <div className="results-container">
        <div className="results-header">
          <h2>
            {loading && cars.length === 0
              ? t('searchingCars')
              : t('carsFound', { count: resultsCount.toLocaleString(t('locale')) })}
            {showFavsOnly && <span className="favs-only-filter-tag">{t('favoritesOnlyLabel')}</span>}
          </h2>
          
          <div className="results-header-actions">
            {loading && <div className="loader"></div>}
            
            <div className="view-mode-toggle">
              <button 
                className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
              >
                <CardsGridIcon size={14} color="currentColor" />
                <span>{t('viewCards')}</span>
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
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
                  {t('viewWithPhotos')}
                </button>
                <button
                  className={`btn-view-toggle ${density === 'compact' ? 'active' : ''}`}
                  onClick={() => setDensity('compact')}
                >
                  {t('viewCompact')}
                </button>
              </div>
            )}
          </div>
        </div>

        {!loading && newCarsCountVisible > 0 && (
          <div className="new-cars-bar">
            <div className="new-cars-content">
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

        {loading && (
          <ResultsSkeleton viewMode={viewMode} count={6} />
        )}

        {!loading && displayCars.length === 0 && (() => {
          let suggestion = null;
          if (showFavsOnly) {
            suggestion = { label: t('showFavsOnly'), clear: () => setShowFavsOnly(false) };
          } else if ((localTitle || filters.title)?.trim()) {
            const term = (localTitle || filters.title).trim();
            suggestion = {
              label: t('searchSuggestionLabel', { term }),
              clear: () => { setLocalTitle(''); setFilters(f => ({ ...f, title: '' })); }
            };
          } else {
            const priorityOrder = ['sellerName', 'eq-', 'deal', 'scrapedPeriod', 'scrapedDate', 'price', 'kmMax', 'year', 'combustible', 'estilo', 'transmision', 'provincia', 'brand-', 'isSold'];
            for (const prefix of priorityOrder) {
              const tag = activeTags.find(tg => tg.id === prefix || tg.id.startsWith(prefix));
              if (tag) { suggestion = { label: tag.label, clear: tag.clear }; break; }
            }
          }
          const hasAnyActive = activeTags.length + ((localTitle || filters.title)?.trim() ? 1 : 0);
          return (
            <div className="empty-results-state">
              <h3>{hasAnyActive > 0 ? t('emptyFilteredTitle') : t('noCarsFound')}</h3>
              {suggestion && (
                <p>{t('emptyFilteredHint')}</p>
              )}
              <div className="empty-results-actions">
                {suggestion && (
                  <button className="btn-empty-primary" onClick={suggestion.clear}>
                    {t('removeFilterSuggestion', { label: suggestion.label })}
                  </button>
                )}
                {hasAnyActive > 1 && (
                  <button className="btn-empty-secondary" onClick={handleResetFilters}>
                    {t('clearAll')}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

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
                  onOpenDetails={handleOpenCar}
                />
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-fav"></th>
                    {showPhotos ? <th className="col-photo"></th> : <th className="col-rank">{t('rank')}</th>}
                    <th className="col-title">{t('title')}</th>
                    <th className="sortable col-year" onClick={() => handleSortHeader('year')}>
                      {t('year')}{!clientSort && filters.sortYear === 'asc' ? ' ▲' : !clientSort && filters.sortYear === 'desc' ? ' ▼' : ''}
                    </th>
                    <th className="sortable col-price" onClick={() => handleSortHeader('price')}>
                      {t('priceHeader')}{!clientSort && filters.sortPrice === 'asc' ? ' ▲' : !clientSort && filters.sortPrice === 'desc' ? ' ▼' : ''}
                    </th>
                    <th className="sortable col-km" onClick={() => handleSortHeader('km')}>
                      {t('mileageHeader')}{!clientSort && filters.sortKm === 'asc' ? ' ▲' : !clientSort && filters.sortKm === 'desc' ? ' ▼' : ''}
                    </th>
                    <th className="col-province">{t('province')}</th>
                    <th className="col-listed">{t('listedHeader')}</th>
                    <th className="text-right col-action">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCars.map((car, idx) => {
                    const carIsNew = isNew(car);
                    const carIsFav = isFavorite(car.URL);
                    const waPhone = getWhatsAppPhone(car.SellerPhone);
                    const inCompare = isComparing(car.URL);
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
                          handleOpenCar(car);
                        }}
                      >
                        <td className="col-fav">
                          <button
                            className={`fav-btn-table ${carIsFav ? 'active' : ''}`}
                            onClick={() => toggleFavorite(car.URL)}
                            title={carIsFav ? t('removeFromFavorites') : t('addToFavorites')}
                          >
                            {carIsFav ? '★' : '☆'}
                          </button>
                        </td>
                        {showPhotos ? (
                          <td className="photo-cell">
                            <CarThumb car={car} variant="table" hoverPreview />
                          </td>
                        ) : (
                          <td className="col-rank">
                            <span className="col-rank-inner">
                              #{idx + 1}
                              {carIsNew && <span className="new-badge-inline">{t('newBadge')}</span>}
                            </span>
                          </td>
                        )}
                        <td className="col-title">
                          <span className="col-title-inner">
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
                        <td className="col-year">{car.Year}</td>
                        <td className="col-price">
                          <div className="col-price-badges">
                            <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} priceText={car.PriceText} deal={getMarketDeal(car)} />
                            <MarketBadge car={car} variant="compact" />
                            <PriceDropBadge car={car} variant="compact" />
                          </div>
                        </td>
                        <td className="col-km">
                          <MileageBar km={car.Kilometraje} maxMileage={filters.kmMax ? Number(filters.kmMax) : 0} />
                        </td>
                        <td className="col-province">{car.Provincia}</td>
                        <td className="col-listed">
                          <span title={formatListingDate(car, language)} className="col-date-text">
                            {formatListingAge(car, language)}
                          </span>
                        </td>
                        <td className="text-right col-action">
                          <div className="col-action-inner">
                            <button
                              type="button"
                              className={`btn-compare-table ${inCompare ? 'active' : ''}`}
                              onClick={() => toggleCompare(car)}
                              title={inCompare ? t('removeFromComparator') : t('compareAction')}
                              aria-pressed={inCompare}
                            >
                              ⇄
                            </button>
                            {waPhone && (
                              <a
                                href={buildWhatsAppLink(waPhone, car, language)}
                                target="_blank"
                                rel="noreferrer"
                                title={`WhatsApp ${waPhone.display}`}
                                className="btn-action-icon--whatsapp"
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
                        handleOpenCar(car);
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

                      <div className="top-car-mobile-col">
                        <div className="top-car-mobile-header">
                          <div className="top-car-mobile-title">
                            <span className="top-car-mobile-rank">#{idx + 1}</span>
                            {carIsNew && <span className="badge-inline new">{t('newBadge')}</span>}
                            <span className="top-car-mobile-title-text">
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

                        <div className="top-car-mobile-price">
                          <span>{car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}</span>
                          <MarketBadge car={car} variant="compact" />
                          <PriceDropBadge car={car} variant="compact" />
                        </div>

                        <div className="top-car-mobile-details">
                          <div><strong>{t('year')}:</strong> {car.Year}</div>
                          <div><strong>{t('province')}:</strong> {car.Provincia}</div>
                          <div>
                            <strong>{t('mileageHeader').replace(' (km)', '')}:</strong> {car.Kilometraje > 0 ? `${car.Kilometraje.toLocaleString()} km` : 'N/A'}
                          </div>
                          <div>
                            <strong>{t('listedColon')}</strong> {formatListingAge(car, language)}
                          </div>
                        </div>

                        <div className="top-car-mobile-footer">
                          <div className="top-car-mobile-bars">
                            <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} deal={getMarketDeal(car)} />
                            <MileageBar km={car.Kilometraje} />
                          </div>
                          <a 
                            href={car.URL} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="top-car-mobile-link"
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
            className="infinite-sentinel"
          >
            {loadingMore && <div className="loader"></div>}
          </div>
        )}
      </div>

      {openCar && (
        <CarDetailsModal
          isOpen
          onClose={onCloseCar}
          car={openCar}
        />
      )}
    </div>
  );
};

export default CarsPage;
