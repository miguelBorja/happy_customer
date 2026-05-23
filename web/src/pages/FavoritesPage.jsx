import React, { useState, useEffect, useCallback } from 'react';
import { fetchCarsByUrls } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';

const FavoritesPage = () => {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const { isNew } = useSeenCars();

  const loadFavorites = useCallback(async () => {
    const urls = getAllUrls();
    if (urls.length === 0) {
      setCars([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchCarsByUrls(urls);
      setCars(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getAllUrls]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Filter out unfavorited cars from display (in case user unfavorites while on this page)
  const displayCars = cars.filter(car => isFavorite(car.URL));

  const activeFavs = displayCars.filter(c => !c.IsSold).length;
  const soldFavs = displayCars.filter(c => c.IsSold).length;

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            <span style={{ color: '#fbbf24', marginRight: '0.5rem' }}>★</span>
            My Favorites
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {favCount} car{favCount !== 1 ? 's' : ''} saved
            {activeFavs > 0 && <span> · <span style={{ color: 'var(--success)' }}>{activeFavs}</span> active</span>}
            {soldFavs > 0 && <span> · <span style={{ color: 'var(--danger)' }}>{soldFavs}</span> sold</span>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn-view-mode ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            ▦ Cards
          </button>
          <button
            className={`btn-view-mode ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            ☰ Table
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
          <div className="loader"></div>
        </div>
      )}

      {!loading && displayCars.length === 0 && (
        <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>☆</div>
          <h3 style={{ marginBottom: '0.5rem' }}>No favorites yet</h3>
          <p>Click the star icon on any car to add it to your favorites.</p>
        </div>
      )}

      {!loading && displayCars.length > 0 && viewMode === 'cards' && (
        <div className="results-grid">
          {displayCars.map(car => (
            <CarCard
              key={car.URL}
              car={car}
              isNew={isNew(car.URL)}
              isFav={true}
              onToggleFav={toggleFavorite}
            />
          ))}
        </div>
      )}

      {!loading && displayCars.length > 0 && viewMode === 'table' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Brand</th>
                <th>Year</th>
                <th>Price ($)</th>
                <th>Mileage (km)</th>
                <th>Provincia</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayCars.map(car => (
                <tr key={car.URL} className={car.IsSold ? 'sold-row' : ''}>
                  <td>
                    <button
                      className="fav-btn-table active"
                      onClick={() => toggleFavorite(car.URL)}
                      title="Remove from favorites"
                    >
                      ★
                    </button>
                  </td>
                  <td style={{ fontWeight: '500' }}>{car.Title}</td>
                  <td>{car.Brand}</td>
                  <td>{car.Year}</td>
                  <td style={{ color: 'var(--success)', fontWeight: '600' }}>
                    {car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{car.Kilometraje > 0 ? car.Kilometraje.toLocaleString() : 'N/A'}</span>
                      <MileageBar km={car.Kilometraje} />
                    </div>
                  </td>
                  <td>{car.Provincia}</td>
                  <td>
                    {car.IsSold
                      ? <span style={{ color: 'var(--danger)', fontWeight: '600' }}>Sold</span>
                      : <span style={{ color: 'var(--success)' }}>Active</span>
                    }
                  </td>
                  <td>
                    <a href={car.URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
