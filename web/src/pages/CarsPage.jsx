import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCars, fetchBrands, fetchCarsByUrls, fetchProvinces, fetchTopSellers, fetchFilteredBrands } from '../api/client';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';
import { useLanguage } from '../context/LanguageContext';
import FiltersModal, { commonEquipments } from '../components/FiltersModal';

const CarsPage = ({
  filters,
  setFilters,
  localTitle,
  setLocalTitle,
  showFavsOnly,
  setShowFavsOnly,
  viewMode,
  setViewMode,
  selectedCars = [],
  toggleSelectCar
}) => {
  const [cars, setCars] = useState([]);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isNew, markSeen, markAllSeen } = useSeenCars();
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const [favCars, setFavCars] = useState([]);
  const { language, t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(console.error);
    fetchTopSellers().then(setSellers).catch(console.error);
  }, []);

  // Dynamically load brands matching all other filters
  useEffect(() => {
    const filtersForBrands = { ...filters };
    delete filtersForBrands.brand;
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
    try {
      const data = await fetchCars(filters);
      setCars(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

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
    if (!showFavsOnly) return cars;
    return favCars.filter(c => isFavorite(c.URL));
  }, [cars, favCars, showFavsOnly, isFavorite]);

  const newCarsCountVisible = cars.filter(c => isNew(c.URL)).length;

  const handleResetFilters = () => {
    setFilters({
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
    setLocalTitle('');
    setShowFavsOnly(false);
  };

  const handleResetSort = () => {
    setFilters(f => ({
      ...f,
      sortTitle: 'asc',
      sortYear: 'desc',
      sortPrice: 'asc',
      sortKm: 'asc',
    }));
  };

  const getActiveFilterTags = () => {
    const tags = [];
    if (filters.brand) tags.push({ id: 'brand', label: `${t('brand')}: ${filters.brand}`, clear: () => setFilters(f => ({ ...f, brand: '' })) });
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
    if (filters.transmision) tags.push({ id: 'transmision', label: `${t('transmission')}: ${t(filters.transmision.toLowerCase()) || filters.transmision}`, clear: () => setFilters(f => ({ ...f, transmision: '' })) });
    if (filters.combustible) tags.push({ id: 'combustible', label: `${t('fuel')}: ${t(filters.combustible.toLowerCase()) || filters.combustible}`, clear: () => setFilters(f => ({ ...f, combustible: '' })) });
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
    if (filters.sortTitle && filters.sortTitle !== 'asc') tags.push({ id: 'sortTitle', label: `Sort Title: ${filters.sortTitle}`, clear: () => setFilters(f => ({ ...f, sortTitle: 'asc' })) });
    if (filters.sortYear && filters.sortYear !== 'desc') tags.push({ id: 'sortYear', label: `Sort Year: ${filters.sortYear}`, clear: () => setFilters(f => ({ ...f, sortYear: 'desc' })) });
    if (filters.sortPrice && filters.sortPrice !== 'asc') tags.push({ id: 'sortPrice', label: `Sort Price: ${filters.sortPrice}`, clear: () => setFilters(f => ({ ...f, sortPrice: 'asc' })) });
    if (filters.sortKm && filters.sortKm !== 'asc') tags.push({ id: 'sortKm', label: `Sort Mileage: ${filters.sortKm}`, clear: () => setFilters(f => ({ ...f, sortKm: 'asc' })) });
    if (filters.isSold !== 'false') tags.push({ id: 'isSold', label: t('showSold'), clear: () => setFilters(f => ({ ...f, isSold: 'false' })) });
    if (showFavsOnly) tags.push({ id: 'showFavsOnly', label: t('showFavsOnly'), clear: () => setShowFavsOnly(false) });
    

    
    return tags;
  };

  const activeTags = getActiveFilterTags();
  const hasActiveFilters = activeTags.length > 0;
  const hasActiveSort = !!(
    (filters.sortTitle && filters.sortTitle !== 'asc') || 
    (filters.sortYear && filters.sortYear !== 'desc') || 
    (filters.sortPrice && filters.sortPrice !== 'asc') || 
    (filters.sortKm && filters.sortKm !== 'asc')
  );

  return (
    <div className="browse-page">
      {/* Top Search & Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <span className="search-input-icon">🔍</span>
          <input 
            type="text" 
            name="title" 
            className="input-field" 
            placeholder={t('searchPlaceholder')} 
            value={localTitle} 
            onChange={(e) => setLocalTitle(e.target.value)} 
          />
        </div>
        <button 
          className={`btn-all-filters ${hasActiveSort ? 'active' : ''}`}
          onClick={() => setIsSortOpen(true)}
        >
          ⇅ {language === 'es' ? 'Ordenar' : 'Sort'}
        </button>
        <button 
          className={`btn-all-filters ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setIsFiltersOpen(true)}
        >
          🎛️ {t('allFilters')}
        </button>
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

      {/* Dedicated Sorting Modal */}
      <div className={`sort-modal-overlay ${isSortOpen ? 'open' : ''}`} onClick={() => setIsSortOpen(false)}>
        <div className="sort-modal" onClick={(e) => e.stopPropagation()}>
          <div className="sort-modal-header">
            <h3>{language === 'es' ? 'Opciones de ordenamiento' : 'Sorting Options'}</h3>
            <button className="sort-modal-close" onClick={() => setIsSortOpen(false)}>×</button>
          </div>
          
          <div className="sort-modal-content">
            {/* Title Sort */}
            <div className="filter-group">
              <label>{t('titleSort')}</label>
              <select 
                name="sortTitle" 
                className="select-field" 
                value={filters.sortTitle || ''} 
                onChange={(e) => setFilters(f => ({ ...f, sortTitle: e.target.value }))}
              >
                <option value="">{t('none')}</option>
                <option value="asc">{t('aToZ')}</option>
                <option value="desc">{t('zToA')}</option>
              </select>
            </div>

            {/* Year Sort */}
            <div className="filter-group">
              <label>{t('yearSort')}</label>
              <select 
                name="sortYear" 
                className="select-field" 
                value={filters.sortYear || ''} 
                onChange={(e) => setFilters(f => ({ ...f, sortYear: e.target.value }))}
              >
                <option value="">{t('none')}</option>
                <option value="asc">{t('oldToNew')}</option>
                <option value="desc">{t('newToOld')}</option>
              </select>
            </div>

            {/* Price Sort */}
            <div className="filter-group">
              <label>{t('priceSort')}</label>
              <select 
                name="sortPrice" 
                className="select-field" 
                value={filters.sortPrice || ''} 
                onChange={(e) => setFilters(f => ({ ...f, sortPrice: e.target.value }))}
              >
                <option value="">{t('none')}</option>
                <option value="asc">{t('lowToHigh')}</option>
                <option value="desc">{t('highToLow')}</option>
              </select>
            </div>

            {/* Mileage Sort */}
            <div className="filter-group">
              <label>{t('mileageSort')}</label>
              <select 
                name="sortKm" 
                className="select-field" 
                value={filters.sortKm || ''} 
                onChange={(e) => setFilters(f => ({ ...f, sortKm: e.target.value }))}
              >
                <option value="">{t('none')}</option>
                <option value="asc">{t('lowToHigh')}</option>
                <option value="desc">{t('highToLow')}</option>
              </select>
            </div>
          </div>
          
          <div className="sort-modal-footer">
            <button className="btn-reset-filters" onClick={handleResetSort}>
              {t('resetFilters')}
            </button>
            <button className="btn-primary" onClick={() => setIsSortOpen(false)}>
              {language === 'es' ? 'Aplicar' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

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
              >
                {t('viewCards')}
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                {t('viewTable')}
              </button>
            </div>
          </div>
        </div>

        {!loading && newCarsCountVisible > 0 && (
          <div className="new-cars-bar" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="new-badge-pulse">{t('newBadge')}</span>
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
        {!loading && displayCars.length > 0 && (
          viewMode === 'cards' ? (
            <div className="results-grid">
              {displayCars.map(car => (
                <CarCard
                  key={car.URL}
                  car={car}
                  isNew={isNew(car.URL)}
                  isFav={isFavorite(car.URL)}
                  onToggleFav={toggleFavorite}
                  maxPrice={filters.priceMax ? Number(filters.priceMax) : 0}
                  maxMileage={filters.kmMax ? Number(filters.kmMax) : 0}
                  isSelected={selectedCars.some(c => c.URL === car.URL)}
                  onToggleSelect={toggleSelectCar}
                />
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th></th>
                    <th>{t('rank')}</th>
                    <th>{t('title')}</th>
                    <th>{t('year')}</th>
                    <th>{t('priceHeader')}</th>
                    <th>{t('mileageHeader')}</th>
                    <th>{t('province')}</th>
                    <th className="text-right">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCars.map((car, idx) => {
                    const carIsNew = isNew(car.URL);
                    const carIsFav = isFavorite(car.URL);
                    const carIsSelected = selectedCars.some(c => c.URL === car.URL);
                    return (
                      <tr key={car.URL} className={`${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''} ${carIsSelected ? 'selected' : ''}`}>
                        <td>
                          {toggleSelectCar && (
                            <button
                              className={`car-select-btn-table ${carIsSelected ? 'selected' : ''}`}
                              onClick={() => toggleSelectCar(car)}
                              title={carIsSelected ? t('deselectCar') : t('selectToCompare')}
                            >
                              {carIsSelected ? '☑' : '☐'}
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            className={`fav-btn-table ${carIsFav ? 'active' : ''}`}
                            onClick={() => toggleFavorite(car.URL)}
                            title={carIsFav ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {carIsFav ? '★' : '☆'}
                          </button>
                        </td>
                        <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            #{idx + 1}
                            {carIsNew && <span className="new-badge-inline">{t('newBadge')}</span>}
                          </span>
                        </td>
                        <td style={{ fontWeight: '500' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {car.Title}
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
                          <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} priceText={car.PriceText} />
                        </td>
                        <td>
                          <MileageBar km={car.Kilometraje} maxMileage={filters.kmMax ? Number(filters.kmMax) : 0} />
                        </td>
                        <td>{car.Provincia}</td>
                        <td className="text-right">
                          <a 
                            href={car.URL} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="btn-table-action"
                            onClick={() => markSeen(car.URL)}
                          >
                            {t('view')}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="top-car-mobile-list">
                {displayCars.map((car, idx) => {
                  const carIsNew = isNew(car.URL);
                  const carIsFav = isFavorite(car.URL);
                  const carIsSelected = selectedCars.some(c => c.URL === car.URL);
                  return (
                    <div key={car.URL} className={`top-car-mobile-card ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''} ${carIsSelected ? 'selected' : ''}`}>
                      {toggleSelectCar && (
                        <button
                          className={`car-select-btn-mobile ${carIsSelected ? 'selected' : ''}`}
                          onClick={() => toggleSelectCar(car)}
                          title={carIsSelected ? t('deselectCar') : t('selectToCompare')}
                        >
                          {carIsSelected ? '☑' : '☐'}
                        </button>
                      )}
                      <button
                        className={`top-car-mobile-fav-btn ${carIsFav ? 'active' : ''}`}
                        onClick={() => toggleFavorite(car.URL)}
                        title={carIsFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {carIsFav ? '★' : '☆'}
                      </button>
                      
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

                      <div className="top-car-mobile-price">
                        {car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}
                      </div>

                      <div className="top-car-mobile-details">
                        <div><strong>{t('year')}:</strong> {car.Year}</div>
                        <div><strong>{t('province')}:</strong> {car.Provincia}</div>
                        <div>
                          <strong>{t('mileageHeader').replace(' (km)', '')}:</strong> {car.Kilometraje > 0 ? `${car.Kilometraje.toLocaleString()} km` : 'N/A'}
                        </div>
                      </div>

                      <div className="top-car-mobile-footer">
                        <div style={{ display: 'flex', gap: '0.25rem', flex: 1, marginRight: '1rem' }}>
                          <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} />
                          <MileageBar km={car.Kilometraje} />
                        </div>
                        <a 
                          href={car.URL} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem' }}
                          onClick={() => markSeen(car.URL)}
                        >
                          {t('view')} →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default CarsPage;
