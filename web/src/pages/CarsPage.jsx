import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCars, fetchBrands, fetchCarsByUrls, fetchProvinces } from '../api/client';
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
  setViewMode
}) => {
  const [cars, setCars] = useState([]);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isNew, markSeen, markAllSeen } = useSeenCars();
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const [favCars, setFavCars] = useState([]);
  const { language, t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  useEffect(() => {
    fetchBrands().then(setBrands).catch(console.error);
    fetchProvinces().then(setProvinces).catch(console.error);
  }, []);

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
    if (filters.yearMin || filters.yearMax) {
      let label = '';
      if (filters.yearMin && filters.yearMax) label = `${filters.yearMin} - ${filters.yearMax}`;
      else if (filters.yearMin) label = `≥ ${filters.yearMin}`;
      else label = `≤ ${filters.yearMax}`;
      tags.push({ id: 'year', label: `${t('minYear')}/${t('maxYear')}: ${label}`, clear: () => setFilters(f => ({ ...f, yearMin: '', yearMax: '' })) });
    }
    if (filters.priceMin || filters.priceMax) {
      let label = '';
      if (filters.priceMin && filters.priceMax) label = `$${Number(filters.priceMin).toLocaleString()} - $${Number(filters.priceMax).toLocaleString()}`;
      else if (filters.priceMin) label = `≥ $${Number(filters.priceMin).toLocaleString()}`;
      else label = `≤ $${filters.priceMax ? Number(filters.priceMax).toLocaleString() : ''}`;
      tags.push({ id: 'price', label: `${t('priceHeader').replace(' ($)', '')}: ${label}`, clear: () => setFilters(f => ({ ...f, priceMin: '', priceMax: '' })) });
    }
    if (filters.kmMax) tags.push({ id: 'kmMax', label: `Max km: ${Number(filters.kmMax).toLocaleString()}`, clear: () => setFilters(f => ({ ...f, kmMax: '' })) });
    if (filters.transmision) tags.push({ id: 'transmision', label: `${t('transmission')}: ${t(filters.transmision.toLowerCase()) || filters.transmision}`, clear: () => setFilters(f => ({ ...f, transmision: '' })) });
    if (filters.combustible) tags.push({ id: 'combustible', label: `${t('fuel')}: ${t(filters.combustible.toLowerCase()) || filters.combustible}`, clear: () => setFilters(f => ({ ...f, combustible: '' })) });
    if (filters.scrapedFrom || filters.scrapedTo) {
      let label = '';
      if (filters.scrapedFrom && filters.scrapedTo) label = `${filters.scrapedFrom} to ${filters.scrapedTo}`;
      else if (filters.scrapedFrom) label = `From ${filters.scrapedFrom}`;
      else label = `To ${filters.scrapedTo}`;
      tags.push({ id: 'scrapedDate', label: `Date: ${label}`, clear: () => setFilters(f => ({ ...f, scrapedFrom: '', scrapedTo: '' })) });
    }
    if (filters.limit && filters.limit !== '100') tags.push({ id: 'limit', label: `${t('limit')}: ${filters.limit}`, clear: () => setFilters(f => ({ ...f, limit: '100' })) });
    if (filters.sortTitle && filters.sortTitle !== 'asc') tags.push({ id: 'sortTitle', label: `Sort Title: ${filters.sortTitle}`, clear: () => setFilters(f => ({ ...f, sortTitle: 'asc' })) });
    if (filters.sortYear && filters.sortYear !== 'desc') tags.push({ id: 'sortYear', label: `Sort Year: ${filters.sortYear}`, clear: () => setFilters(f => ({ ...f, sortYear: 'desc' })) });
    if (filters.sortPrice && filters.sortPrice !== 'asc') tags.push({ id: 'sortPrice', label: `Sort Price: ${filters.sortPrice}`, clear: () => setFilters(f => ({ ...f, sortPrice: 'asc' })) });
    if (filters.sortKm && filters.sortKm !== 'asc') tags.push({ id: 'sortKm', label: `Sort Mileage: ${filters.sortKm}`, clear: () => setFilters(f => ({ ...f, sortKm: 'asc' })) });
    if (filters.isSold !== 'false') tags.push({ id: 'isSold', label: t('showSold'), clear: () => setFilters(f => ({ ...f, isSold: 'false' })) });
    if (showFavsOnly) tags.push({ id: 'showFavsOnly', label: t('showFavsOnly'), clear: () => setShowFavsOnly(false) });
    
    (filters.equipments || []).forEach(eq => {
      const eqObj = commonEquipments.find(e => e.id === eq);
      const label = eqObj ? t(eqObj.labelKey) : eq;
      tags.push({
        id: `equip-${eq}`,
        label: label,
        clear: () => setFilters(f => ({ ...f, equipments: f.equipments.filter(e => e !== eq) }))
      });
    });
    
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
                <CarCard key={car.URL} car={car} isNew={isNew(car.URL)} isFav={isFavorite(car.URL)} onToggleFav={toggleFavorite} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} />
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('rank')}</th>
                    <th>{t('title')}</th>
                    <th>{t('brand')}</th>
                    <th>{t('year')}</th>
                    <th>{t('priceHeader')}</th>
                    <th>{t('mileageHeader')}</th>
                    <th>{t('province')}</th>
                    <th>{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCars.map((car, idx) => {
                    const carIsNew = isNew(car.URL);
                    const carIsFav = isFavorite(car.URL);
                    return (
                      <tr key={car.URL} className={`${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}>
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
                        <td style={{ fontWeight: '500' }}>{car.Title}</td>
                        <td>{car.Brand}</td>
                        <td>{car.Year}</td>
                        <td style={{ color: 'var(--success)', fontWeight: '600' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}</span>
                            <PriceBar price={car.Price} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} />
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{car.Kilometraje > 0 ? car.Kilometraje.toLocaleString() : 'N/A'}</span>
                            <MileageBar km={car.Kilometraje} />
                          </div>
                        </td>
                        <td>{car.Provincia}</td>
                        <td>
                          <a 
                            href={car.URL} 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{ color: 'var(--accent)', textDecoration: 'none' }}
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
                  return (
                    <div key={car.URL} className={`top-car-mobile-card ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}>
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
                          <span style={{ marginTop: '0.25rem' }}>{car.Title}</span>
                        </div>
                      </div>

                      <div className="top-car-mobile-price">
                        {car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}
                      </div>

                      <div className="top-car-mobile-details">
                        <div><strong>{t('brand')}:</strong> {car.Brand}</div>
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
