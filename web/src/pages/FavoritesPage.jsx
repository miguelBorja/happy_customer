import React, { useState, useEffect, useCallback } from 'react';
import { fetchCarsByUrls } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import { useLanguage } from '../context/LanguageContext';

const FavoritesPage = ({ viewMode, setViewMode }) => {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const { isNew } = useSeenCars();
  const { t } = useLanguage();

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
            {t('myFavoritesTitle')}
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {favCount === 1 
              ? t('carsSaved', { count: favCount }) 
              : t('carsSavedPlural', { count: favCount })}
            {activeFavs > 0 && <span> · <span style={{ color: 'var(--success)' }}>{activeFavs}</span> {t('activeStatus').toLowerCase()}</span>}
            {soldFavs > 0 && <span> · <span style={{ color: 'var(--danger)' }}>{soldFavs}</span> {t('soldStatus').toLowerCase()}</span>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn-view-mode ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            {t('viewCards')}
          </button>
          <button
            className={`btn-view-mode ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            {t('viewTable')}
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
          <h3 style={{ marginBottom: '0.5rem' }}>{t('noFavoritesTitle')}</h3>
          <p>{t('noFavoritesText')}</p>
        </div>
      )}

      {!loading && displayCars.length > 0 && (
        <>
          <div className={`results-grid fav-cards-container ${viewMode === 'cards' ? 'active-view' : ''}`}>
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

          <div className={`table-container fav-table-container ${viewMode === 'table' ? 'active-view' : ''}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>{t('title')}</th>
                  <th>{t('year')}</th>
                  <th>{t('priceHeader')}</th>
                  <th>{t('mileageHeader')}</th>
                  <th>{t('province')}</th>
                  <th>{t('status')}</th>
                  <th className="text-right">{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {displayCars.map(car => {
                  return (
                    <tr 
                      key={car.URL} 
                      className={`draggable-car-row ${car.IsSold ? 'sold-row' : ''}`}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify(car));
                        e.dataTransfer.setData('text/plain', JSON.stringify(car));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <td>
                        <button
                          className="fav-btn-table active"
                          onClick={() => toggleFavorite(car.URL)}
                          title="Remove from favorites"
                        >
                          ★
                        </button>
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
                      <PriceBar price={car.Price} priceText={car.PriceText} />
                    </td>
                    <td>
                      <MileageBar km={car.Kilometraje} />
                    </td>
                    <td>{car.Provincia}</td>
                    <td>
                      {car.IsSold
                        ? <span style={{ color: 'var(--danger)', fontWeight: '600' }}>{t('soldStatus')}</span>
                        : <span style={{ color: 'var(--success)' }}>{t('activeStatus')}</span>
                      }
                    </td>
                    <td className="text-right">
                      <a href={car.URL} target="_blank" rel="noreferrer" className="btn-table-action">
                        {t('view')}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default FavoritesPage;
