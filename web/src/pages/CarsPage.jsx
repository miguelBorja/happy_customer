import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCars, fetchBrands, fetchCarsByUrls, fetchProvinces } from '../api/client';
import CarCard from '../components/CarCard';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';
import { useLanguage } from '../context/LanguageContext';

const commonEquipments = [
  { id: "Tapicería de cuero", labelKey: "equipLeather" },
  { id: "Cámara de retroceso", labelKey: "equipCamera" },
  { id: "Bluetooth", labelKey: "equipBluetooth" },
  { id: "Aros de lujo", labelKey: "equipRims" },
  { id: "Sunroof/techo panorámico", labelKey: "equipSunroof" },
  { id: "Control de radio en el volante", labelKey: "equipSteering" },
];

const CarsPage = () => {
  const [cars, setCars] = useState([]);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isNew, markSeen, markAllSeen } = useSeenCars();
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [favCars, setFavCars] = useState([]);
  const { t } = useLanguage();
  
  const [filters, setFilters] = useState({
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
  });

  useEffect(() => {
    fetchBrands().then(setBrands).catch(console.error);
    fetchProvinces().then(setProvinces).catch(console.error);
  }, []);

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

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      if (name === 'isSold') {
        setFilters(f => ({ ...f, isSold: checked ? '' : 'false' })); // empty means show all, false means only active
      } else {
        // Equipment checkboxes
        setFilters(f => ({
          ...f,
          equipments: checked 
            ? [...f.equipments, name]
            : f.equipments.filter(eq => eq !== name)
        }));
      }
    } else {
      setFilters(f => ({ ...f, [name]: value }));
    }
  };

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

  return (
    <div className="browse-page">
      <aside className="filter-panel">
        <h3>{t('filtersHeader')}</h3>
        
        <div className="filter-group">
          <label>{t('brand')}</label>
          <select name="brand" className="select-field" value={filters.brand} onChange={handleFilterChange}>
            <option value="">{t('allBrands')}</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>{t('province')}</label>
          <select name="provincia" className="select-field" value={filters.provincia} onChange={handleFilterChange}>
            <option value="">{t('allProvinces')}</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>{t('minYear')}</label>
            <input type="number" name="yearMin" className="input-field" placeholder="2010" value={filters.yearMin} onChange={handleFilterChange} />
          </div>
          <div>
            <label>{t('maxYear')}</label>
            <input type="number" name="yearMax" className="input-field" placeholder="2025" value={filters.yearMax} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>{t('minPrice')}</label>
            <input type="number" name="priceMin" className="input-field" placeholder="0" value={filters.priceMin} onChange={handleFilterChange} />
          </div>
          <div>
            <label>{t('maxPrice')}</label>
            <input type="number" name="priceMax" className="input-field" placeholder="100000" value={filters.priceMax} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group">
          <label>{t('maxMileage')}</label>
          <input type="number" name="kmMax" className="input-field" placeholder="150000" value={filters.kmMax} onChange={handleFilterChange} />
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>{t('scrapedFrom')}</label>
            <input type="date" name="scrapedFrom" className="input-field" value={filters.scrapedFrom} onChange={handleFilterChange} />
          </div>
          <div>
            <label>{t('scrapedTo')}</label>
            <input type="date" name="scrapedTo" className="input-field" value={filters.scrapedTo} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group">
          <label>{t('transmission')}</label>
          <select name="transmision" className="select-field" value={filters.transmision} onChange={handleFilterChange}>
            <option value="">{t('any')}</option>
            <option value="Manual">{t('manual')}</option>
            <option value="Automática">{t('automatic')}</option>
            <option value="Dual">{t('dual')}</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>{t('fuel')}</label>
          <select name="combustible" className="select-field" value={filters.combustible} onChange={handleFilterChange}>
            <option value="">{t('any')}</option>
            <option value="Gasolina">{t('gasoline')}</option>
            <option value="Diesel">{t('diesel')}</option>
            <option value="Eléctrico">{t('electric')}</option>
            <option value="Híbrido">{t('hybrid')}</option>
          </select>
        </div>

        <div className="filter-group" style={{ marginTop: '1rem' }}>
          <label>{t('equipment')}</label>
          {commonEquipments.map(eq => (
            <label key={eq.id} className="checkbox-group">
              <input type="checkbox" name={eq.id} checked={filters.equipments.includes(eq.id)} onChange={handleFilterChange} />
              <span>{t(eq.labelKey)}</span>
            </label>
          ))}
        </div>

        <div className="filter-group" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <label className="checkbox-group">
            <input type="checkbox" name="isSold" checked={filters.isSold !== 'false'} onChange={handleFilterChange} />
            <span>{t('showSold')}</span>
          </label>
        </div>

        <div className="filter-group">
          <label className="checkbox-group fav-filter-label">
            <input type="checkbox" checked={showFavsOnly} onChange={(e) => setShowFavsOnly(e.target.checked)} />
            <span>{t('showFavsOnly')}</span>
          </label>
          {favCount > 0 && (
            <span className="fav-hint">
              {t('favsInView', { visible: displayCars.filter(c => isFavorite(c.URL)).length, total: favCount })}
            </span>
          )}
        </div>
      </aside>

      <div className="results-container">
        <div className="results-header">
          <h2>
            {t('carsFound', { count: displayCars.length })}
            {showFavsOnly && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{t('favoritesOnlyLabel')}</span>}
          </h2>
          {loading && <div className="loader"></div>}
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
        
        <div className="results-grid">
          {displayCars.map(car => (
            <CarCard key={car.URL} car={car} isNew={isNew(car.URL)} isFav={isFavorite(car.URL)} onToggleFav={toggleFavorite} maxPrice={filters.priceMax ? Number(filters.priceMax) : 0} />
          ))}
        </div>
        
        {!loading && cars.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {t('noCarsFound')}
          </div>
        )}
      </div>
    </div>
  );
};

export default CarsPage;
