import React, { useState, useEffect, useMemo } from 'react';
import { fetchBargains } from '../api/client';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';

const BargainsPage = ({ viewMode, setViewMode }) => {
  const [bargains, setBargains] = useState([]);
  const [sortBy, setSortBy] = useState('discount');
  const [loading, setLoading] = useState(true);
  const { language } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isNew } = useSeenCars();

  useEffect(() => {
    fetchBargains()
      .then(setBargains)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sortedBargains = useMemo(() => {
    return [...bargains].sort((a, b) => {
      if (sortBy === 'title') {
        return (a.car.Title || '').localeCompare(b.car.Title || '');
      }
      if (sortBy === 'year') {
        return (b.car.Year || 0) - (a.car.Year || 0);
      }
      if (sortBy === 'price') {
        const aPrice = a.car.Price || Infinity;
        const bPrice = b.car.Price || Infinity;
        return aPrice - bPrice;
      }
      if (sortBy === 'mileage') {
        const aKm = a.car.Kilometraje === 0 ? Infinity : (a.car.Kilometraje || Infinity);
        const bKm = b.car.Kilometraje === 0 ? Infinity : (b.car.Kilometraje || Infinity);
        return aKm - bKm;
      }
      // Default: discount percent descending
      return b.discountPercent - a.discountPercent;
    });
  }, [bargains, sortBy]);

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              <span style={{ color: '#10b981', marginRight: '0.5rem' }}>💰</span>
              {language === 'es' ? '¡Una Ganga!' : 'A Bargain!'}
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {language === 'es' 
                ? 'Estos vehículos tienen un precio significativamente menor al promedio histórico del mercado para su marca, modelo y año.' 
                : 'These cars are priced significantly below their historical market average for their make, model, and year.'}
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                {language === 'es' ? 'Ordenar por:' : 'Sort by:'}
              </span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)} 
                className="select-field" 
                style={{ width: 'auto', padding: '0.4rem 2rem 0.4rem 1rem', fontSize: '0.9rem', borderRadius: '8px', minWidth: '150px' }}
              >
                <option value="discount">{language === 'es' ? 'Descuento' : 'Discount'}</option>
                <option value="title">{language === 'es' ? 'Título' : 'Title'}</option>
                <option value="year">{language === 'es' ? 'Año' : 'Year'}</option>
                <option value="price">{language === 'es' ? 'Precio Oferta' : 'Deal Price'}</option>
                <option value="mileage">{language === 'es' ? 'Kilometraje' : 'Mileage'}</option>
              </select>
            </div>

            <div className="view-mode-toggle">
              <button 
                className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
              >
                {language === 'es' ? 'Tarjetas' : 'Cards'}
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                {language === 'es' ? 'Tabla' : 'Table'}
              </button>
            </div>
          </div>
        </div>


      {loading ? (
        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
          <div className="loader"></div>
        </div>
      ) : bargains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🤷‍♂️</div>
          <h3 style={{ marginBottom: '0.5rem' }}>
            {language === 'es' ? 'No se encontraron gangas' : 'No bargains found'}
          </h3>
          <p>
            {language === 'es' 
              ? 'No pudimos encontrar ningún vehículo publicado con un 10% o más de descuento sobre el precio promedio.' 
              : 'We couldn\'t find any active listings priced 10% below the historical average right now.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="results-grid fav-cards-container active-view">
          {sortedBargains.map(b => (
            <div key={b.car.URL} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div 
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '-12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  zIndex: 10,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  border: '2px solid var(--bg-card)'
                }}
              >
                {Math.round(b.discountPercent)}% {language === 'es' ? 'DESCUENTO' : 'OFF'}
              </div>
              
              <div style={{ flexGrow: 1 }} draggable={true} onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify(b.car)); }}>
                <CarCard 
                  car={b.car} 
                  isNew={isNew(b.car.URL)}
                  isFav={isFavorite(b.car.URL)}
                  onToggleFav={toggleFavorite}
                />
              </div>
              
              <div style={{ 
                marginTop: '12px', 
                padding: '10px 14px', 
                background: 'rgba(16, 185, 129, 0.08)', 
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                fontSize: '0.9rem',
                color: '#34d399',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span>{language === 'es' ? 'Promedio del mercado:' : 'Market Average:'}</span>
                <strong>${Math.round(b.avgPrice).toLocaleString()}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>{language === 'es' ? 'Descuento' : 'Discount'}</th>
                <th>{language === 'es' ? 'Título' : 'Title'}</th>
                <th>{language === 'es' ? 'Año' : 'Year'}</th>
                <th>{language === 'es' ? 'Precio Oferta' : 'Deal Price'}</th>
                <th>{language === 'es' ? 'Promedio Histórico' : 'Historical Avg'}</th>
                <th>{language === 'es' ? 'Kilometraje' : 'Mileage'}</th>
                <th>{language === 'es' ? 'Provincia' : 'Province'}</th>
                <th className="text-right">{language === 'es' ? 'Acción' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {sortedBargains.map((b) => {
                const car = b.car;
                const carIsNew = isNew(car.URL);
                const carIsFav = isFavorite(car.URL);
                return (
                  <tr 
                    key={car.URL} 
                    className={`draggable-car-row ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify(car));
                      e.dataTransfer.setData('text/plain', JSON.stringify(car));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <td>
                      <button
                        className={`fav-btn-table ${carIsFav ? 'active' : ''}`}
                        onClick={() => toggleFavorite(car.URL)}
                      >
                        {carIsFav ? '★' : '☆'}
                      </button>
                    </td>
                    <td style={{ fontWeight: 'bold', color: '#10b981' }}>
                      {Math.round(b.discountPercent)}%
                    </td>
                    <td style={{ fontWeight: '500' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {car.Title}
                        {carIsNew && <span className="new-badge-inline">{language === 'es' ? 'NUEVO' : 'NEW'}</span>}
                      </span>
                    </td>
                    <td>{car.Year}</td>
                    <td>
                      <PriceBar price={car.Price} maxPrice={0} priceText={car.PriceText} />
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(b.historicalAvgPrice)}
                    </td>
                    <td>
                      <MileageBar km={car.Kilometraje} maxMileage={0} />
                    </td>
                    <td>{car.Provincia}</td>
                    <td className="text-right">
                      <a 
                        href={car.URL} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn-table-action"
                      >
                        {language === 'es' ? 'Ver' : 'View'}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BargainsPage;
