import React from 'react';
import MileageBar from './MileageBar';
import PriceBar from './PriceBar';
import { useLanguage } from '../context/LanguageContext';

const formatPrice = (price, text) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return text;
};

const CarCard = ({ car, isNew, isFav, onToggleFav, maxPrice, isSelected, onToggleSelect }) => {
  const { t } = useLanguage();

  return (
    <div className={`car-card ${car.IsSold ? 'sold' : ''} ${isNew ? 'new-car-card' : ''} ${isFav ? 'fav-car-card' : ''} ${isSelected ? 'selected' : ''}`}>
      {onToggleSelect && (
        <button
          className={`car-select-btn ${isSelected ? 'selected' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(car); }}
          title={isSelected ? t('deselectCar') : t('selectToCompare')}
        >
          {isSelected ? '☑' : '☐'}
        </button>
      )}
      <button
        className={`fav-btn-card ${isFav ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleFav && onToggleFav(car.URL); }}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFav ? '★' : '☆'}
      </button>

      <div className="car-card-body">
        <h3 className="car-title">{car.Title}</h3>
        
        <div className="car-specs-row">
          <span className="spec-badge year">{car.Year}</span>
          <span className="spec-badge price">{formatPrice(car.Price, car.PriceText)}</span>
          {car.Kilometraje > 0 && (
            <span className="spec-badge mileage">{car.Kilometraje.toLocaleString()} km</span>
          )}
        </div>

        <div className="car-bars">
          <PriceBar price={car.Price} maxPrice={maxPrice} />
          <MileageBar km={car.Kilometraje} />
        </div>

        <div className="car-extra-details">
          {car.Transmision && (
            <span className="detail-item">⚙️ {car.Transmision}</span>
          )}
          {car.Combustible && (
            <span className="detail-item">⛽ {car.Combustible}</span>
          )}
        </div>

        {car.Comment && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.45rem 0.6rem',
            background: 'rgba(23, 112, 1, 0.12)', 
            borderLeft: '3px solid #177001', 
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: 'var(--text-main)',
            lineHeight: '1.4'
          }}>
            "{car.Comment}"
          </div>
        )}

        {car.Equipments && Object.keys(car.Equipments).length > 0 && (
          <div className="car-equip">
            {Object.keys(car.Equipments).slice(0, 5).map(eq => (
              <span key={eq} className="equip-badge">{t(eq)}</span>
            ))}
            {Object.keys(car.Equipments).length > 5 && (
              <span className="equip-badge">+{Object.keys(car.Equipments).length - 5} {t('more')}</span>
            )}
          </div>
        )}

        {car.Provincia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <span>📍</span>
            <span>{car.Provincia}</span>
          </div>
        )}
      </div>
      
      <div className="car-footer">
        <a href={car.URL} target="_blank" rel="noreferrer" className="btn-link">
          {t('view')} on Crautos
        </a>
      </div>
    </div>
  );
};

export default CarCard;
