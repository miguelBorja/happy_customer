import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCars, fetchFilteredBrands, fetchCarsByUrls, fetchProvinces } from '../api/client';
import { useSeenCars } from '../hooks/useSeenCars';
import { useFavorites } from '../hooks/useFavorites';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';

const TopCarsPage = () => {
  const [cars, setCars] = useState([]);
  const [brands, setBrands] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isNew, markSeen, markAllSeen, countNew } = useSeenCars();
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [favCars, setFavCars] = useState([]);
  
  const [topParams, setTopParams] = useState({
    limit: '10',
    sortTitle: '',
    sortYear: 'desc',
    sortPrice: 'asc',
    sortKm: 'asc',
    brand: '',
    title: '',
    provincia: '',
    kmMax: '100000',
    priceMax: '',
    isSold: 'false',
    scrapedFrom: '',
    scrapedTo: '',
  });

  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(console.error);
  }, []);

  // Dynamically load only brands that have cars matching the non-brand filters
  useEffect(() => {
    const brandFilters = {
      title: topParams.title,
      kmMax: topParams.kmMax,
      priceMax: topParams.priceMax,
      isSold: topParams.isSold,
      scrapedFrom: topParams.scrapedFrom,
      scrapedTo: topParams.scrapedTo,
      provincia: topParams.provincia,
    };
    fetchFilteredBrands(brandFilters)
      .then(filtered => {
        setBrands(filtered);
        // If the currently selected brand is no longer in the filtered list, reset it
        if (topParams.brand && !filtered.includes(topParams.brand)) {
          setTopParams(p => ({ ...p, brand: '' }));
        }
      })
      .catch(console.error);
  }, [topParams.title, topParams.kmMax, topParams.priceMax, topParams.isSold, topParams.scrapedFrom, topParams.scrapedTo, topParams.provincia]);

  const loadCars = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCars(topParams);
      setCars(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [topParams]);

  useEffect(() => {
    loadCars();
  }, [loadCars]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTopParams(p => ({ ...p, [name]: value }));
  };

  // Determine which cars are new (not in the seen set)
  const newCarUrls = useMemo(() => {
    return new Set(cars.filter(car => isNew(car.URL)).map(car => car.URL));
  }, [cars, isNew]);

  const newCount = newCarUrls.size;

  // Mark all currently visible cars as seen
  const handleMarkAllSeen = () => {
    markAllSeen(cars.map(car => car.URL));
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

  // Filter by favorites if enabled
  const displayCars = useMemo(() => {
    if (!showFavsOnly) return cars;
    return favCars.filter(car => isFavorite(car.URL));
  }, [cars, favCars, showFavsOnly, isFavorite]);

  return (
    <div className="top-cars-page" style={{ paddingBottom: '4rem' }}>
      {/* Search & Filters Card */}
      <div className="top-cars-filters">
        {/* Row 1: Brand, Province, Model / Title */}
        <div className="filters-row-primary">
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Brand</label>
            <select name="brand" className="select-field" style={{ height: '42px' }} value={topParams.brand} onChange={handleChange}>
              <option value="">All Brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Province</label>
            <select name="provincia" className="select-field" style={{ height: '42px' }} value={topParams.provincia} onChange={handleChange}>
              <option value="">All Provinces</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Model / Title</label>
            <input type="text" name="title" className="input-field" style={{ height: '42px' }} placeholder="Search e.g. Hilux, Accent, Civic..." value={topParams.title} onChange={handleChange} />
          </div>
        </div>

        {/* Row 2: Max km, Max Price, Dates, Limit */}
        <div className="filters-row-secondary">
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Max km</label>
            <input type="number" name="kmMax" className="input-field" value={topParams.kmMax} onChange={handleChange} />
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Max Price ($)</label>
            <input type="number" name="priceMax" className="input-field" placeholder="Any Price" value={topParams.priceMax} onChange={handleChange} />
          </div>

          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Scraped From</label>
            <input type="date" name="scrapedFrom" className="input-field" value={topParams.scrapedFrom} onChange={handleChange} />
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Scraped To</label>
            <input type="date" name="scrapedTo" className="input-field" value={topParams.scrapedTo} onChange={handleChange} />
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Limit</label>
            <select name="limit" className="select-field" value={topParams.limit} onChange={handleChange}>
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </div>
        </div>
        
        {/* Row 3: Sorting Options */}
        <div className="filters-row-tertiary">
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Title Sort</label>
            <select name="sortTitle" className="select-field" value={topParams.sortTitle} onChange={handleChange}>
              <option value="">None</option>
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
          </div>

          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Year Sort</label>
            <select name="sortYear" className="select-field" value={topParams.sortYear} onChange={handleChange}>
              <option value="">None</option>
              <option value="asc">Ascending (Old to New)</option>
              <option value="desc">Descending (New to Old)</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Price Sort</label>
            <select name="sortPrice" className="select-field" value={topParams.sortPrice} onChange={handleChange}>
              <option value="">None</option>
              <option value="asc">Ascending (Low to High)</option>
              <option value="desc">Descending (High to Low)</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Mileage Sort</label>
            <select name="sortKm" className="select-field" value={topParams.sortKm} onChange={handleChange}>
              <option value="">None</option>
              <option value="asc">Ascending (Low to High)</option>
              <option value="desc">Descending (High to Low)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Favorites filter toggle */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label className="checkbox-group fav-filter-label">
          <input type="checkbox" checked={showFavsOnly} onChange={(e) => setShowFavsOnly(e.target.checked)} />
          <span>★ Show only favorites</span>
        </label>
        {favCount > 0 && <span className="fav-hint">{displayCars.filter(c => isFavorite(c.URL)).length} of {favCount} in view</span>}
      </div>

      {/* New cars indicator bar */}
      {!loading && newCount > 0 && (
        <div className="new-cars-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="new-badge-pulse">NEW</span>
            <span>{newCount} new car{newCount !== 1 ? 's' : ''} since your last visit</span>
          </div>
          <button className="btn-mark-seen" onClick={handleMarkAllSeen}>
            ✓ Mark All as Seen
          </button>
        </div>
      )}

      <div className="table-container">
        {loading && <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}><div className="loader"></div></div>}
        
        {!loading && cars.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Rank</th>
                <th>Title</th>
                <th>Brand</th>
                <th>Year</th>
                <th>Price ($)</th>
                <th>Mileage (km)</th>
                <th>Provincia</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayCars.map((car, idx) => {
                const carIsNew = newCarUrls.has(car.URL);
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
                        {carIsNew && <span className="new-badge-inline">NEW</span>}
                      </span>
                    </td>
                    <td style={{ fontWeight: '500' }}>{car.Title}</td>
                    <td>{car.Brand}</td>
                    <td>{car.Year}</td>
                    <td style={{ color: 'var(--success)', fontWeight: '600' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}</span>
                        <PriceBar price={car.Price} maxPrice={topParams.priceMax ? Number(topParams.priceMax) : 0} />
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
                        View
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        
        {!loading && cars.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            No cars found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default TopCarsPage;
