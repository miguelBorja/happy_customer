import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { sortEquipments, isFeaturedEquipment } from '../utils/equipmentPriority';
import {
  AutoTransmissionIcon,
  ElectricPlugIcon,
  LocationPinIcon,
  StarIcon,
  NewBadgeIcon
} from './icons/AppIcons';
import { CarThumb } from './CarPhoto';
import CarDetailsModal from './CarDetailsModal';
import MarketBadge from './MarketBadge';
import { getMarketDeal } from '../utils/marketDeal';
import { useCompare } from '../hooks/useCompare';

const MAX_PRICE = 100000;
const MAX_MILEAGE = 150000;

const formatPrice = (price, text) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return text;
};

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
    <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
    <line x1="7" y1="7" x2="11" y2="7"></line>
  </svg>
);

// onOpenDetails (optional): let the parent own the details modal (e.g. to keep ?car= in the URL).
const CarCard = ({ car, isNew, isFav, onToggleFav, maxPrice, maxMileage, onOpenDetails }) => {
  const { t, language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openDetails = () => (onOpenDetails ? onOpenDetails(car) : setIsModalOpen(true));

  const limitPrice = maxPrice && maxPrice > 0 ? maxPrice : MAX_PRICE;
  const limitMileage = maxMileage && maxMileage > 0 ? maxMileage : MAX_MILEAGE;

  const carPrice = car.Price || 0;
  const carMileage = car.Kilometraje || 0;
  const pricePercent = Math.min((carPrice / limitPrice) * 100, 100);
  const mileagePercent = Math.min((carMileage / limitMileage) * 100, 100);

  const deal = getMarketDeal(car);

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

  const { isComparing, toggleCompare } = useCompare();
  const inCompare = isComparing(car.URL);

  const listingAge = formatListingAge(car, language);
  const listingDate = formatListingDate(car, language);

  const sortedEquips = sortEquipments(car.Equipments);

  return (
    <div 
      className={`car-card draggable-car-card ${car.IsSold ? 'sold' : ''} ${isNew ? 'new-car-card' : ''} ${isFav ? 'fav-car-card' : ''}`}
      role="button"
      tabIndex={0}
      draggable={true}
      onClick={(e) => { if (e.target.closest('a, button')) return; openDetails(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openDetails(); } }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(car));
        e.dataTransfer.setData('text/plain', JSON.stringify(car));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div 
        className="car-card-photo" 
        style={{ margin: '0 0 0.5rem 0' }}
      >
        <CarThumb car={car} variant="card" badge={isNew ? <NewBadgeIcon size={18} /> : null} />
      </div>

      <button
        type="button"
        className={`compare-btn-card ${inCompare ? 'active' : ''}`}
        style={{ zIndex: 5 }}
        onClick={(e) => { e.stopPropagation(); toggleCompare(car); }}
        title={inCompare
          ? (language === 'es' ? 'Quitar del comparador' : 'Remove from comparator')
          : (language === 'es' ? 'Comparar lado a lado' : 'Compare side by side')}
        aria-pressed={inCompare}
      >
        ⇄
      </button>

      <button
        className={`fav-btn-card ${isFav ? 'active' : ''}`}
        style={{ zIndex: 5 }}
        onClick={(e) => { e.stopPropagation(); onToggleFav && onToggleFav(car.URL); }}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <StarIcon size={16} color="#fbbf24" filled={isFav} />
      </button>

      <div className="car-card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between' }}>
          <h3 className="car-title" style={{ margin: 0, flex: 1 }}>{car.Title}</h3>
        </div>
        
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
                border: `1px solid ${deal ? deal.border : priceColors.border}`,
                background: deal ? deal.bg : priceColors.bg,
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0
              }}
            >
              {/* Background Progress Fill */}
              {!deal && (
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
              )}
              {/* Text */}
              <span 
                style={{
                  fontSize: '1.05rem',
                  fontWeight: '800',
                  color: deal ? deal.color : priceColors.text,
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

          <MarketBadge car={car} style={{ alignSelf: 'flex-start', maxWidth: '100%', whiteSpace: 'normal' }} />

          <div className="car-secondary-specs" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '0.1rem' }}>
            <span className="spec-year">{car.Year}</span>
            {car.Provincia && (
              <>
                <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
                <span className="spec-province" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <LocationPinIcon size={13} color="#94a3b8" />
                  <span>{car.Provincia}</span>
                </span>
              </>
            )}
            {listingAge && (
              <>
                <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
                <span className="spec-age" title={listingDate || undefined}>
                  {listingAge}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Transmission & Fuel details using standard inline SVGs */}
        <div className="car-extra-details">
          {car.Transmision && (
            <span className="detail-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <AutoTransmissionIcon size={16} color="#fbbf24" />
              <span>{car.Transmision}</span>
            </span>
          )}
          {car.Combustible && (
            <span className="detail-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              {String(car.Combustible).toLowerCase().includes('eléctrico') || 
               String(car.Combustible).toLowerCase().includes('electrico') || 
               String(car.Combustible).toLowerCase().includes('electric') ? (
                <ElectricPlugIcon size={16} color="#38bdf8" />
              ) : (
                <FuelPumpIcon />
              )}
              <span>{car.Combustible}</span>
            </span>
          )}
        </div>

        {/* Description/Comment: Strict 2-line clamp, secondary text color, triggers modal overlay on click */}
        {car.Comment && car.Comment.trim() !== '-' && (
          <div 
            style={{
              marginTop: '0.75rem',
              padding: '0.45rem 0.6rem',
              background: 'rgba(255, 255, 255, 0.03)', 
              borderLeft: '3px solid var(--accent)', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontStyle: 'italic',
              color: 'var(--text-muted)',
              lineHeight: '1.4',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
            title={language === 'es' ? 'Clic para ver más detalles' : 'Click to view details'}
          >
            {`"${car.Comment}"`}
          </div>
        )}

        {/* Feature Tags: Display maximum of 3 feature pills, plus a "+[X] más" pill that triggers the modal */}
        {sortedEquips.length > 0 && (
          <div className="car-equip">
            {sortedEquips.slice(0, 3).map(eq => (
              <span key={eq} className={`equip-badge ${isFeaturedEquipment(eq) ? 'equip-badge--featured' : ''}`}>{t(eq)}</span>
            ))}
            {sortedEquips.length > 3 && (
              <span className="equip-badge" style={{ opacity: 0.75, borderStyle: 'dashed' }}>
                +{sortedEquips.length - 3} {t('more')}
              </span>
            )}
          </div>
        )}

      </div>

      {/* Details modal overlay */}
      <CarDetailsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        car={car} 
      />
    </div>
  );
};

export default CarCard;
