import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { trackEvent } from '../utils/analytics';

const MAX_PRICE = 100000;
const MAX_MILEAGE = 150000;

const formatPrice = (price, text) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return text;
};

// Data Categorization Utility
const categorizeFeatures = (featuresArray, translateFn) => {
  const categories = {
    Seguridad: [],
    Confort: [],
    Tecnología: [],
    Exterior: [],
    Otros: []
  };

  if (!featuresArray || featuresArray.length === 0) return categories;

  featuresArray.forEach(featureKey => {
    // Translate feature key using translation helper
    const displayName = translateFn(featureKey) || featureKey;
    
    // We match both key and display name to cover all cases
    const lowerKey = featureKey.toLowerCase();
    const lowerName = displayName.toLowerCase();

    if (
      lowerKey.includes('frenos abs') || lowerName.includes('frenos abs') ||
      lowerKey.includes('bolsa de aire') || lowerName.includes('bolsa de aire') ||
      lowerKey.includes('alarma') || lowerName.includes('alarma') ||
      lowerKey.includes('seguridad') || lowerName.includes('seguridad') ||
      lowerKey.includes('abs') || lowerName.includes('abs') ||
      lowerKey.includes('airbag') || lowerName.includes('airbag') ||
      lowerKey.includes('estabilidad') || lowerName.includes('estabilidad')
    ) {
      categories.Seguridad.push(displayName);
    } else if (
      lowerKey.includes('aire acondicionado') || lowerName.includes('aire acondicionado') ||
      lowerKey.includes('asientos') || lowerName.includes('asientos') ||
      lowerKey.includes('asiento') || lowerName.includes('asiento') ||
      lowerKey.includes('confort') || lowerName.includes('confort') ||
      lowerKey.includes('cuero') || lowerName.includes('cuero') ||
      lowerKey.includes('leather') || lowerName.includes('leather') ||
      lowerKey.includes('climatizado') || lowerName.includes('climatizado') ||
      lowerKey.includes('cierre central') || lowerName.includes('cierre central') ||
      lowerKey.includes('vidrios eléctricos') || lowerName.includes('vidrios eléctricos') ||
      lowerKey.includes('crucero') || lowerName.includes('crucero')
    ) {
      categories.Confort.push(displayName);
    } else if (
      lowerKey.includes('apple carplay') || lowerName.includes('apple carplay') ||
      lowerKey.includes('bluetooth') || lowerName.includes('bluetooth') ||
      lowerKey.includes('pantalla') || lowerName.includes('pantalla') ||
      lowerKey.includes('tecnología') || lowerName.includes('tecnología') ||
      lowerKey.includes('android auto') || lowerName.includes('android auto') ||
      lowerKey.includes('cámara') || lowerName.includes('cámara') ||
      lowerKey.includes('camera') || lowerName.includes('camera') ||
      lowerKey.includes('computadora') || lowerName.includes('computadora') ||
      lowerKey.includes('radio') || lowerName.includes('radio') ||
      lowerKey.includes('sensor') || lowerName.includes('sensor')
    ) {
      categories.Tecnología.push(displayName);
    } else if (
      lowerKey.includes('aros de lujo') || lowerName.includes('aros de lujo') ||
      lowerKey.includes('halógenos') || lowerName.includes('halógenos') ||
      lowerKey.includes('exterior') || lowerName.includes('exterior') ||
      lowerKey.includes('rims') || lowerName.includes('rims') ||
      lowerKey.includes('sunroof') || lowerName.includes('sunroof') ||
      lowerKey.includes('retrovisores') || lowerName.includes('retrovisores') ||
      lowerKey.includes('xenón') || lowerName.includes('xenón') ||
      lowerKey.includes('tintados') || lowerName.includes('tintados') ||
      lowerKey.includes('bixenón') || lowerName.includes('bixenón')
    ) {
      categories.Exterior.push(displayName);
    } else {
      categories.Otros.push(displayName);
    }
  });

  return categories;
};

// Transmission (Gear) Icon SVG
const GearIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="14" 
    height="14" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px', opacity: 0.8 }}
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

// Electric (Lightning Bolt) Icon SVG
const ElectricIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="14" 
    height="14" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px', color: '#fbbf24' }}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);

// Generic Fuel (Fuel Pump) Icon SVG
const FuelPumpIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    width="14" 
    height="14" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px', opacity: 0.8 }}
  >
    <line x1="3" y1="22" x2="21" y2="22"></line>
    <path d="M4 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
    <path d="M6 6h6v4H6z"></path>
    <path d="M18 18V9a2 2 0 0 0-2-2h-2"></path>
  </svg>
);

const CarDetailsModal = ({ isOpen, onClose, car, t, language }) => {
  if (!isOpen) return null;

  const featuresArray = car.Equipments ? Object.keys(car.Equipments) : [];
  const categorized = categorizeFeatures(featuresArray, t);

  // Check if there are any categorized features to display
  const hasFeatures = Object.values(categorized).some(list => list.length > 0);

  return createPortal(
    <div 
      className={`details-modal-overlay ${isOpen ? 'open' : ''}`} 
      onClick={onClose}
    >
      <div 
        className="details-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="details-modal-header">
          <h3>{car.Title}</h3>
          <button className="details-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="details-modal-content">
          {car.Comment && (
            <div className="details-modal-comment">
              "{car.Comment}"
            </div>
          )}
          
          {hasFeatures && (
            <div className="details-modal-categories">
              {Object.entries(categorized).map(([category, items]) => {
                if (items.length === 0) return null;
                return (
                  <div key={category} className="details-modal-category-section">
                    <h4 className="details-modal-category-title">{category}</h4>
                    <div className="details-modal-features-list">
                      {items.map((item, idx) => (
                        <div key={idx} className="details-modal-feature-item">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="details-modal-footer">
          <a 
            href={car.URL} 
            target="_blank" 
            rel="noreferrer" 
            className="btn-link" 
            style={{ width: '100%', textDecoration: 'none', margin: 0 }}
            onClick={() => trackEvent('view_external_car', 'outbound', car.Title || car.URL)}
          >
            {t('view')}{language === 'es' ? ' en Crautos' : ' on Crautos'}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};

const CarCard = ({ car, isNew, isFav, onToggleFav, maxPrice, maxMileage, isSelected, onToggleSelect }) => {
  const { t, language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const limitPrice = maxPrice && maxPrice > 0 ? maxPrice : MAX_PRICE;
  const limitMileage = maxMileage && maxMileage > 0 ? maxMileage : MAX_MILEAGE;

  const carPrice = car.Price || 0;
  const carMileage = car.Kilometraje || 0;
  const pricePercent = Math.min((carPrice / limitPrice) * 100, 100);
  const mileagePercent = Math.min((carMileage / limitMileage) * 100, 100);

  // Helper to interpolate colors: Green (120 hue) -> Yellow -> Orange -> Red (0 hue)
  const getDynamicColors = (percent) => {
    const hue = Math.max(0, Math.min(120, 120 - (percent * 1.2)));
    return {
      text: `hsl(${hue}, 90%, 65%)`,
      fill: `hsla(${hue}, 85%, 48%, 0.2)`,
      border: `hsla(${hue}, 85%, 48%, 0.25)`,
      bg: `hsla(${hue}, 85%, 48%, 0.03)`
    };
  };

  const priceColors = getDynamicColors(pricePercent);
  const mileageColors = getDynamicColors(mileagePercent);

  const hasMoreDetails = car.Comment || (car.Equipments && Object.keys(car.Equipments).length > 3);

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
        
        {/* Visual hierarchy: Price and Mileage are progress-filled pills; Year and Province are smaller/muted */}
        <div className="car-specs-block" style={{ margin: '0.25rem 0 0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            {/* Price Pill */}
            <div 
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${priceColors.border}`,
                background: priceColors.bg,
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0
              }}
            >
              {/* Background Progress Fill */}
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${pricePercent}%`,
                  background: priceColors.fill,
                  zIndex: 1,
                  transition: 'width 0.6s ease'
                }}
              />
              {/* Text */}
              <span 
                style={{
                  fontSize: '1.05rem',
                  fontWeight: '800',
                  color: priceColors.text,
                  zIndex: 2,
                  position: 'relative'
                }}
              >
                {formatPrice(car.Price, car.PriceText)}
              </span>
            </div>

            {/* Mileage Pill */}
            {car.Kilometraje > 0 && (
              <div 
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${mileageColors.border}`,
                  background: mileageColors.bg,
                  display: 'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0
                }}
              >
                {/* Background Progress Fill */}
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${mileagePercent}%`,
                    background: mileageColors.fill,
                    zIndex: 1,
                    transition: 'width 0.6s ease'
                  }}
                />
                {/* Text */}
                <span 
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: mileageColors.text,
                    zIndex: 2,
                    position: 'relative'
                  }}
                >
                  {car.Kilometraje.toLocaleString()} km
                </span>
              </div>
            )}
          </div>

          <div className="car-secondary-specs" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '0.1rem' }}>
            <span className="spec-year">{car.Year}</span>
            {car.Provincia && (
              <>
                <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
                <span className="spec-province">📍 {car.Provincia}</span>
              </>
            )}
          </div>
        </div>

        {/* Transmission & Fuel details using standard inline SVGs */}
        <div className="car-extra-details">
          {car.Transmision && (
            <span className="detail-item">
              <GearIcon />
              <span>{car.Transmision}</span>
            </span>
          )}
          {car.Combustible && (
            <span className="detail-item">
              {String(car.Combustible).toLowerCase().includes('eléctrico') || 
               String(car.Combustible).toLowerCase().includes('electrico') || 
               String(car.Combustible).toLowerCase().includes('electric') ? (
                <ElectricIcon />
              ) : (
                <FuelPumpIcon />
              )}
              <span>{car.Combustible}</span>
            </span>
          )}
        </div>

        {/* Description/Comment: Strict 2-line clamp, secondary text color, triggers modal overlay on click */}
        <div 
          style={{
            marginTop: '0.75rem',
            padding: '0.45rem 0.6rem',
            background: 'rgba(255, 255, 255, 0.03)', 
            borderLeft: `3px solid ${car.Comment ? 'var(--accent)' : 'var(--border)'}`, 
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: 'var(--text-muted)',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            cursor: 'pointer',
            userSelect: 'none',
            minHeight: '72px'
          }}
          onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
          title={car.Comment ? (language === 'es' ? 'Clic para ver más detalles' : 'Click to view details') : undefined}
        >
          {car.Comment ? `"${car.Comment}"` : (language === 'es' ? 'Sin comentarios del vendedor' : 'No seller comments')}
        </div>

        {/* Feature Tags: Display maximum of 3 feature pills, plus a "+[X] más" pill that triggers the modal */}
        {car.Equipments && Object.keys(car.Equipments).length > 0 && (
          <div className="car-equip">
            {Object.keys(car.Equipments)
              .slice(0, 3)
              .map(eq => (
                <span key={eq} className="equip-badge">{t(eq)}</span>
              ))}
            {Object.keys(car.Equipments).length > 3 && (
              <span 
                className="equip-badge"
                style={{ cursor: 'pointer', opacity: 0.7, borderStyle: 'dashed' }}
                onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
                title={language === 'es' ? 'Mostrar más equipamiento' : 'Show more equipment'}
              >
                +{Object.keys(car.Equipments).length - 3} {t('more')}
              </span>
            )}
          </div>
        )}

        {/* Modal trigger details button */}
        {hasMoreDetails && (
          <button 
            className="btn-details-trigger"
            onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
          >
            <span>▼</span> {language === 'es' ? 'Mostrar más detalles' : 'Show more details'}
          </button>
        )}
      </div>
      
      {/* View on Crautos button: Pinned to the absolute bottom of the card using margin-top: auto */}
      <div className="car-footer" style={{ marginTop: 'auto' }}>
        <a 
          href={car.URL} 
          target="_blank" 
          rel="noreferrer" 
          className="btn-link"
          onClick={() => trackEvent('view_external_car', 'outbound', car.Title || car.URL)}
        >
          {t('view')}{language === 'es' ? ' en Crautos' : ' on Crautos'}
        </a>
      </div>

      {/* Details modal overlay */}
      <CarDetailsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        car={car} 
        t={t}
        language={language}
      />
    </div>
  );
};

export default CarCard;
