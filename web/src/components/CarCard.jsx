import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { sortEquipments, isFeaturedEquipment } from '../utils/equipmentPriority';
import {
  AutoTransmissionIcon,
  ElectricPlugIcon,
  LocationPinIcon,
  StarIcon,
  NewBadgeIcon,
  WhatsAppIcon
} from './icons/AppIcons';
import { CarThumb } from './CarPhoto';
import CarDetailsModal from './CarDetailsModal';
import MarketBadge from './MarketBadge';
import PriceDropBadge from './PriceDropBadge';
import MotivatedBadge from './MotivatedBadge';
import { getMarketDeal } from '../utils/marketDeal';
import { useCompare } from '../hooks/useCompare';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';
import { trackEvent } from '../utils/analytics';

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
    className="icon-agency-fuel"
  >
    <line x1="3" y1="22" x2="21" y2="22"></line>
    <path d="M4 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
    <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
    <line x1="7" y1="7" x2="11" y2="7"></line>
  </svg>
);

// onOpenDetails (optional): let the parent own the details modal (e.g. to keep ?car= in the URL).
const CarCard = ({ car, isNew, isFav, onToggleFav, maxPrice, maxMileage, onOpenDetails, onNegotiateWithCopilot }) => {
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
  const waPhone = !car.IsSold ? getWhatsAppPhone(car.SellerPhone) : null;

  // Helper to interpolate colors: Green (120 hue) -> Yellow -> Orange -> Red (0 hue)
  const getDynamicColors = (percent) => {
    const hue = Math.max(0, Math.min(120, 120 - (percent * 1.2)));
    return {
      text: `hsl(${hue}, var(--bar-card-text-s, 90%), var(--bar-card-text-l, 65%))`,
      fill: `hsla(${hue}, 85%, 48%, var(--bar-card-fill-a, 0.2))`,
      border: `hsla(${hue}, 85%, 48%, var(--bar-card-border-a, 0.25))`,
      bg: `hsla(${hue}, 85%, 48%, var(--bar-card-bg-a, 0.03))`
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
      <div className="car-card-photo">
        <CarThumb car={car} variant="card" badge={isNew ? <NewBadgeIcon size={18} /> : null} />
      </div>

      {waPhone && (
        <a
          className="whatsapp-btn-card"
          href={buildWhatsAppLink(waPhone, car, language)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            trackEvent('contact_whatsapp_card', 'outbound', car.Title || car.URL);
          }}
          title={t('waCardTitle')}
          aria-label={t('waCardTitle')}
        >
          <WhatsAppIcon size={15} color="currentColor" />
        </a>
      )}

      <button
        type="button"
        className={`compare-btn-card ${inCompare ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); toggleCompare(car); }}
        title={inCompare ? t('removeFromComparator') : t('compareSideBySide')}
        aria-pressed={inCompare}
      >
        ⇄
      </button>

      <button
        className={`fav-btn-card ${isFav ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleFav && onToggleFav(car.URL, car.Price); }}
        title={isFav ? t('removeFromFavorites') : t('addToFavorites')}
      >
        <StarIcon size={16} color="var(--icon-gold)" filled={isFav} />
      </button>

      <div className="car-card-body">
        <div className="car-card-header">
          <h3 className="car-title">{car.Title}</h3>
        </div>
        
        {/* Visual hierarchy: Price and Mileage are progress-filled pills; Year and Province are smaller/muted */}
        <div className="car-specs-block">
          <div className="car-pills-row">
            {/* Price Pill */}
            <div
              className="car-pill"
              style={{
                border: `1px solid ${deal ? deal.border : priceColors.border}`,
                background: deal ? deal.bg : priceColors.bg,
              }}
            >
              {/* Background Progress Fill */}
              {!deal && (
                <div
                  className="car-pill-fill"
                  style={{
                    width: `${pricePercent}%`,
                    background: priceColors.fill,
                  }}
                />
              )}
              {/* Text */}
              <span
                className="car-pill-text car-pill-text--price"
                style={{ color: deal ? deal.color : priceColors.text }}
              >
                {formatPrice(car.Price, car.PriceText)}
              </span>
            </div>

            {/* Mileage Pill */}
            {car.Kilometraje > 0 && (
              <div
                className="car-pill"
                style={{
                  border: `1px solid ${mileageColors.border}`,
                  background: mileageColors.bg,
                }}
              >
                {/* Background Progress Fill */}
                <div
                  className="car-pill-fill"
                  style={{
                    width: `${mileagePercent}%`,
                    background: mileageColors.fill,
                  }}
                />
                {/* Text */}
                <span
                  className="car-pill-text car-pill-text--mileage"
                  style={{ color: mileageColors.text }}
                >
                  {car.Kilometraje.toLocaleString()} km
                </span>
              </div>
            )}
          </div>

          <div className="car-badges-row">
            <MarketBadge car={car} />
            <PriceDropBadge car={car} />
            <MotivatedBadge car={car} />
          </div>

          <div className="car-secondary-specs">
            <span className="spec-year">{car.Year}</span>
            {car.Provincia && (
              <>
                <span className="car-spec-dot">•</span>
                <span className="spec-province">
                  <LocationPinIcon size={13} color="currentColor" />
                  <span>{car.Provincia}</span>
                </span>
              </>
            )}
            {listingAge && (
              <>
                <span className="car-spec-dot">•</span>
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
            <span className="detail-item">
              <AutoTransmissionIcon size={16} color="var(--icon-gold)" />
              <span>{car.Transmision}</span>
            </span>
          )}
          {car.Combustible && (
            <span className="detail-item">
              {String(car.Combustible).toLowerCase().includes('eléctrico') || 
               String(car.Combustible).toLowerCase().includes('electrico') || 
               String(car.Combustible).toLowerCase().includes('electric') ? (
                <ElectricPlugIcon size={16} color="var(--icon-electric)" />
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
            className="car-card-comment"
            title={t('clickToViewDetails')}
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
              <span className="equip-badge equip-badge--more">
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
        onNegotiateWithCopilot={onNegotiateWithCopilot}
      />
    </div>
  );
};

export default CarCard;
