import React from 'react';

const formatPrice = (price, text) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return text;
};

const CarCard = ({ car }) => {
  return (
    <div className={`car-card ${car.IsSold ? 'sold' : ''}`}>
      {car.IsSold && <div className="sold-badge">Sold</div>}
      
      <div className="car-header">
        <h3 className="car-title">{car.Title}</h3>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="car-price">{formatPrice(car.Price, car.PriceText)}</span>
          {car.Price > 0 && car.PriceText.includes('¢') && (
            <span className="car-price-muted">{car.PriceText}</span>
          )}
        </div>
      </div>
      
      <div className="car-body">
        <div className="car-stats">
          <div className="stat">
            <span className="stat-label">Year</span>
            <span className="stat-value">{car.Year}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Mileage</span>
            <span className="stat-value">{car.Kilometraje > 0 ? `${car.Kilometraje.toLocaleString()} km` : 'N/A'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Engine</span>
            <span className="stat-value">{car.Cilindrada || 'N/A'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Transmission</span>
            <span className="stat-value">{car.Transmision || 'N/A'}</span>
          </div>
        </div>
        
        {car.Equipments && Object.keys(car.Equipments).length > 0 && (
          <div className="car-equip">
            {Object.keys(car.Equipments).slice(0, 5).map(eq => (
              <span key={eq} className="equip-badge">{eq}</span>
            ))}
            {Object.keys(car.Equipments).length > 5 && (
              <span className="equip-badge">+{Object.keys(car.Equipments).length - 5} more</span>
            )}
          </div>
        )}
      </div>
      
      <div className="car-footer">
        <a href={car.URL} target="_blank" rel="noreferrer" className="btn-link">
          View on Crautos
        </a>
      </div>
    </div>
  );
};

export default CarCard;
