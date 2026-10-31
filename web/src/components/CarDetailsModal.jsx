import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { trackEvent } from '../utils/analytics';
import { parsePhones, getWhatsAppPhone, buildWhatsAppLink, buildTelLink } from '../utils/phone';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { CarGallery } from './CarPhoto';
import MarketBadge from './MarketBadge';
import { getMarketDeal, formatUSD } from '../utils/marketDeal';

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

const WhatsAppIcon = ({ size = 18, color = 'currentColor', style = {} }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={color}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.71 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const CarDetailsModal = ({ isOpen, onClose, car }) => {
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !car) return null;

  const featuresArray = car.Equipments ? Object.keys(car.Equipments) : [];
  const categorized = categorizeFeatures(featuresArray, t);

  // Check if there are any categorized features to display
  const hasFeatures = Object.values(categorized).some(list => list.length > 0);

  const formattedPrice = car.Price > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(car.Price)
    : (car.PriceText || null);

  const deal = getMarketDeal(car);
  const minRange = deal ? 0.7 * deal.median : 0;
  const maxRange = deal ? 1.3 * deal.median : 0;
  const carPrice = Number(car.Price) || 0;
  const clampedPrice = Math.max(minRange, Math.min(carPrice, maxRange));
  const dotPercent = deal ? ((clampedPrice - minRange) / (maxRange - minRange)) * 100 : 50;
  const carSubject = [car.Brand, car.Model, car.Year].filter(Boolean).join(' ') || car.Title || '';

  const sellerName = car.SellerName && String(car.SellerName).trim() !== '-' ? String(car.SellerName).trim() : null;
  const listingAge = formatListingAge(car, language);
  const listingDate = formatListingDate(car, language);

  const whatsappPhone = getWhatsAppPhone(car.SellerPhone);
  const allPhones = parsePhones(car.SellerPhone);
  const otherPhones = whatsappPhone
    ? allPhones.filter(p => p.digits !== whatsappPhone.digits)
    : allPhones;

  const specsList = [
    { key: 'Year', label: language === 'es' ? 'Año' : 'Year', value: car.Year },
    {
      key: 'Kilometraje',
      label: language === 'es' ? 'Kilometraje' : 'Mileage',
      value: car.Kilometraje ? `${Number(car.Kilometraje).toLocaleString()} km` : null
    },
    { key: 'Provincia', label: language === 'es' ? 'Provincia' : 'Province', value: car.Provincia },
    { key: 'Transmision', label: language === 'es' ? 'Transmisión' : 'Transmission', value: car.Transmision },
    { key: 'Combustible', label: language === 'es' ? 'Combustible' : 'Fuel', value: car.Combustible },
    { key: 'Cilindrada', label: language === 'es' ? 'Cilindrada' : 'Displacement', value: car.Cilindrada },
    { key: 'Estilo', label: language === 'es' ? 'Estilo' : 'Body Style', value: car.Estilo },
    { key: 'ColorExterior', label: language === 'es' ? 'Color exterior' : 'Exterior Color', value: car.ColorExterior },
    { key: 'Puertas', label: language === 'es' ? 'Puertas' : 'Doors', value: car.Puertas },
    { key: 'Pasajeros', label: language === 'es' ? 'Pasajeros' : 'Passengers', value: car.Pasajeros },
    { key: 'PrecioNegociable', label: language === 'es' ? 'Precio negociable' : 'Negotiable', value: car.PrecioNegociable },
    { key: 'SeRecibe', label: language === 'es' ? 'Se recibe' : 'Trade-in accepted', value: car.SeRecibe },
  ];

  const activeSpecs = specsList.filter(s => {
    if (s.value === null || s.value === undefined) return false;
    const str = String(s.value).trim();
    return str !== '' && str !== '-';
  });

  return createPortal(
    <div 
      className={`details-modal-overlay ${isOpen ? 'open' : ''}`} 
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onDragStart={(e) => e.stopPropagation()}
    >
      <div 
        className="details-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="details-modal-header">
          <h3>{car.Title}</h3>
          <button className="details-modal-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>
        
        <div className="details-modal-content">
          <CarGallery car={car} />

          {formattedPrice && (
            <div className="details-modal-price">
              {formattedPrice}
            </div>
          )}

          {deal && (
            <div
              style={{
                margin: '0.85rem 0',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {language === 'es' ? 'Precio de mercado' : 'Market price'}
                </span>
                <MarketBadge car={car} />
              </div>

              <div style={{ fontSize: '0.9rem', color: 'var(--text-main, #f8fafc)', fontWeight: 500 }}>
                {language === 'es'
                  ? `Mediana de ${deal.count} autos ${carSubject}: ${formatUSD(deal.median)}`
                  : `Median of ${deal.count} ${carSubject} cars: ${formatUSD(deal.median)}`}
              </div>

              {/* Range indicator: 0.7×median to 1.3×median */}
              <div style={{ marginTop: '0.25rem', marginBottom: '0.15rem' }}>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px'
                  }}
                >
                  {/* Median tick */}
                  <div
                    title={`${language === 'es' ? 'Mediana' : 'Median'}: ${formatUSD(deal.median)}`}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '-3px',
                      bottom: '-3px',
                      width: '2px',
                      background: 'rgba(255, 255, 255, 0.65)',
                      transform: 'translateX(-50%)',
                      borderRadius: '1px',
                      zIndex: 1
                    }}
                  />
                  {/* Car price dot */}
                  <div
                    title={`${language === 'es' ? 'Precio' : 'Price'}: ${formatUSD(carPrice)}`}
                    style={{
                      position: 'absolute',
                      left: `${dotPercent}%`,
                      top: '50%',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: deal.color,
                      border: '2px solid #0f172a',
                      boxShadow: `0 0 6px ${deal.color}`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 2
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.35rem' }}>
                  <span>{formatUSD(minRange)}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{language === 'es' ? 'Mediana' : 'Median'} ({formatUSD(deal.median)})</span>
                  <span>{formatUSD(maxRange)}</span>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                {language === 'es'
                  ? 'Comparación aproximada; no considera kilometraje, versión ni estado.'
                  : 'Approximate comparison; does not consider mileage, trim, or condition.'}
              </div>
            </div>
          )}

          {activeSpecs.length > 0 && (
            <div className="details-specs-grid">
              {activeSpecs.map(spec => (
                <div key={spec.key} className="details-spec-item">
                  <span className="details-spec-label">{spec.label}</span>
                  <span className="details-spec-value">{spec.value}</span>
                </div>
              ))}
            </div>
          )}

          {(sellerName || listingAge) && (
            <div
              style={{
                margin: '0.85rem 0',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-muted, #94a3b8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {language === 'es' ? 'Vendedor' : 'Seller'}
              </div>
              {sellerName && (
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>
                  {sellerName}
                </div>
              )}
              {listingAge && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                  {language === 'es' ? 'Publicado' : 'Listed'}: {listingAge}{listingDate ? ` (${listingDate})` : ''}
                </div>
              )}
            </div>
          )}

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

        <div
          className="details-modal-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          {whatsappPhone && (
            <a
              href={buildWhatsAppLink(whatsappPhone, car, language)}
              target="_blank"
              rel="noreferrer"
              className="btn-link"
              style={{
                flex: 1,
                minWidth: '180px',
                backgroundColor: '#25D366',
                color: '#ffffff',
                fontWeight: 'bold',
                textDecoration: 'none',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onClick={() => trackEvent('contact_whatsapp', 'outbound', car.Title || car.URL)}
            >
              <WhatsAppIcon size={18} color="#ffffff" />
              <span>WhatsApp {whatsappPhone.display}</span>
            </a>
          )}
          <a 
            href={car.URL} 
            target="_blank" 
            rel="noreferrer" 
            className="btn-link" 
            style={{
              flex: 1,
              minWidth: '180px',
              textDecoration: 'none',
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => trackEvent('view_external_car', 'outbound', car.Title || car.URL)}
          >
            {t('view')}{language === 'es' ? ' en Crautos' : ' on Crautos'}
          </a>

          {otherPhones.length > 0 && (
            <div
              style={{
                width: '100%',
                flexBasis: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                justifyContent: 'center',
                alignItems: 'center',
                paddingTop: '0.25rem',
              }}
            >
              {otherPhones.map((phone) => (
                phone.mobile ? (
                  <a
                    key={phone.digits}
                    href={buildWhatsAppLink(phone, car, language)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--text-muted, #94a3b8)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    onClick={() => trackEvent('contact_whatsapp', 'outbound', car.Title || car.URL)}
                  >
                    <WhatsAppIcon size={13} color="currentColor" />
                    <span>WhatsApp {phone.display}</span>
                  </a>
                ) : (
                  <a
                    key={phone.digits}
                    href={buildTelLink(phone)}
                    style={{
                      color: 'var(--text-muted, #94a3b8)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    onClick={() => trackEvent('contact_call', 'outbound', car.Title || car.URL)}
                  >
                    <span>📞 {phone.display}</span>
                  </a>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CarDetailsModal;
