import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCars, fetchBrands, fetchCarsByUrls, fetchProvinces } from '../api/client';
import CarCard from '../components/CarCard';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';

const commonEquipments = [
  "Tapicería de cuero",
  "Cámara de retroceso",
  "Bluetooth",
  "Aros de lujo",
  "Sunroof/techo panorámico",
  "Control de radio en el volante",
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

  return (
    <div className="browse-page">
      <aside className="filter-panel">
        <h3>Filters</h3>
        
        <div className="filter-group">
          <label>Brand</label>
          <select name="brand" className="select-field" value={filters.brand} onChange={handleFilterChange}>
            <option value="">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Province</label>
          <select name="provincia" className="select-field" value={filters.provincia} onChange={handleFilterChange}>
            <option value="">All Provinces</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>Min Year</label>
            <input type="number" name="yearMin" className="input-field" placeholder="2010" value={filters.yearMin} onChange={handleFilterChange} />
          </div>
          <div>
            <label>Max Year</label>
            <input type="number" name="yearMax" className="input-field" placeholder="2025" value={filters.yearMax} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>Min Price ($)</label>
            <input type="number" name="priceMin" className="input-field" placeholder="0" value={filters.priceMin} onChange={handleFilterChange} />
          </div>
          <div>
            <label>Max Price ($)</label>
            <input type="number" name="priceMax" className="input-field" placeholder="100000" value={filters.priceMax} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group">
          <label>Max Mileage (km)</label>
          <input type="number" name="kmMax" className="input-field" placeholder="150000" value={filters.kmMax} onChange={handleFilterChange} />
        </div>

        <div className="filter-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label>Scraped From</label>
            <input type="date" name="scrapedFrom" className="input-field" value={filters.scrapedFrom} onChange={handleFilterChange} />
          </div>
          <div>
            <label>Scraped To</label>
            <input type="date" name="scrapedTo" className="input-field" value={filters.scrapedTo} onChange={handleFilterChange} />
          </div>
        </div>

        <div className="filter-group">
          <label>Transmission</label>
          <select name="transmision" className="select-field" value={filters.transmision} onChange={handleFilterChange}>
            <option value="">Any</option>
            <option value="Manual">Manual</option>
            <option value="Automática">Automática</option>
            <option value="Dual">Dual</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Fuel</label>
          <select name="combustible" className="select-field" value={filters.combustible} onChange={handleFilterChange}>
            <option value="">Any</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Diesel">Diesel</option>
            <option value="Eléctrico">Eléctrico</option>
            <option value="Híbrido">Híbrido</option>
          </select>
        </div>

        <div className="filter-group" style={{ marginTop: '1rem' }}>
          <label>Equipment</label>
          {commonEquipments.map(eq => (
            <label key={eq} className="checkbox-group">
              <input type="checkbox" name={eq} checked={filters.equipments.includes(eq)} onChange={handleFilterChange} />
              <span>{eq}</span>
            </label>
          ))}
        </div>

        <div className="filter-group" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <label className="checkbox-group">
            <input type="checkbox" name="isSold" checked={filters.isSold !== 'false'} onChange={handleFilterChange} />
            <span>Show sold cars</span>
          </label>
        </div>

        <div className="filter-group">
          <label className="checkbox-group fav-filter-label">
            <input type="checkbox" checked={showFavsOnly} onChange={(e) => setShowFavsOnly(e.target.checked)} />
            <span>★ Show only favorites</span>
          </label>
          {favCount > 0 && (
            <span className="fav-hint">{displayCars.filter(c => isFavorite(c.URL)).length} of {favCount} favorites in view</span>
          )}
        </div>
      </aside>

      <div className="results-container">
        <div className="results-header">
          <h2>{displayCars.length} Cars Found {showFavsOnly && <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>(favorites only)</span>}</h2>
          {loading && <div className="loader"></div>}
        </div>

        {!loading && cars.filter(c => isNew(c.URL)).length > 0 && (
          <div className="new-cars-bar" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="new-badge-pulse">NEW</span>
              <span>{cars.filter(c => isNew(c.URL)).length} new car{cars.filter(c => isNew(c.URL)).length !== 1 ? 's' : ''} since your last visit</span>
            </div>
            <button className="btn-mark-seen" onClick={() => markAllSeen(cars.map(c => c.URL))}>
              ✓ Mark All as Seen
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
            No cars found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default CarsPage;
