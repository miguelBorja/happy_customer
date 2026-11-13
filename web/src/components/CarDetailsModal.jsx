import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { trackEvent } from '../utils/analytics';
import { parsePhones, getWhatsAppPhone, buildWhatsAppLink, buildTelLink } from '../utils/phone';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { CarGallery } from './CarPhoto';
import MarketBadge from './MarketBadge';
import { getMarketDeal, formatUSD, formatMarketReference, dealReason } from '../utils/marketDeal';
import { useCompare } from '../hooks/useCompare';
import { fetchPriceHistory } from '../api/client';
import {
  summarizePriceHistory,
  formatChangeAge,
  formatHistoryDate,
  formatHeadlineChange,
} from '../utils/priceHistory';

// Data Categorization Utility
const categorizeFeatures = (featuresArray, translateFn) => {
  const categories = {
    catSecurity: [],
    catComfort: [],
    catTechnology: [],
    catExterior: [],
    catOther: []
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
      categories.catSecurity.push(displayName);
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
      categories.catComfort.push(displayName);
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
      categories.catTechnology.push(displayName);
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
      categories.catExterior.push(displayName);
    } else {
      categories.catOther.push(displayName);
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
    className="hc-icon"
    style={style}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.71 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const CarDetailsModal = ({ isOpen, onClose, car }) => {
  const { t, language } = useLanguage();
  const { isComparing, toggleCompare } = useCompare();
  const [historyState, setHistoryState] = useState({ url: null, points: [] });
  const activeUrl = isOpen && car?.URL ? car.URL : null;

  useEffect(() => {
    if (!activeUrl) return undefined;
    const controller = new AbortController();
    fetchPriceHistory(activeUrl, controller.signal)
      .then((points) => {
        if (!controller.signal.aborted) {
          setHistoryState({ url: activeUrl, points: Array.isArray(points) ? points : [] });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryState({ url: activeUrl, points: [] });
        }
      });
    return () => controller.abort();
  }, [activeUrl]);

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
  const inCompare = isComparing(car.URL);

  const rawHistory = activeUrl && historyState.url === activeUrl ? historyState.points : null;
  const fallbackPoints = rawHistory === null && car.PricePrevious > 0 && car.Price > 0 && car.PricePrevious !== car.Price && car.MarketFlag !== 'typo'
    ? [
      { price: car.PricePrevious, seenAt: car.ScrapedAt || null },
      { price: car.Price, seenAt: car.PriceChangedAt || null },
    ]
    : null;
  const effectivePoints = rawHistory ?? fallbackPoints;
  const historySummary = car.MarketFlag === 'typo' ? null : summarizePriceHistory(effectivePoints);

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
  const medianLabel = deal?.kmAdjusted
    ? t('mileageAdjustedLabel')
    : t('medianLabel');

  const sellerName = car.SellerName && String(car.SellerName).trim() !== '-' ? String(car.SellerName).trim() : null;
  const listingAge = formatListingAge(car, language);
  const listingDate = formatListingDate(car, language);

  const whatsappPhone = getWhatsAppPhone(car.SellerPhone);
  const allPhones = parsePhones(car.SellerPhone);
  const otherPhones = whatsappPhone
    ? allPhones.filter(p => p.digits !== whatsappPhone.digits)
    : allPhones;

  const specsList = [
    { key: 'Year', label: t('year'), value: car.Year },
    {
      key: 'Kilometraje',
      label: t('mileageLabel'),
      value: car.Kilometraje ? `${Number(car.Kilometraje).toLocaleString()} km` : null
    },
    { key: 'Provincia', label: t('province'), value: car.Provincia },
    { key: 'Transmision', label: t('transmission'), value: car.Transmision },
    { key: 'Combustible', label: t('fuelType'), value: car.Combustible },
    { key: 'Cilindrada', label: t('specDisplacement'), value: car.Cilindrada },
    { key: 'Estilo', label: t('specBodyStyle'), value: car.Estilo },
    { key: 'ColorExterior', label: t('specExteriorColor'), value: car.ColorExterior },
    { key: 'Puertas', label: t('specDoors'), value: car.Puertas },
    { key: 'Pasajeros', label: t('specPassengers'), value: car.Pasajeros },
    { key: 'PrecioNegociable', label: t('specNegotiable'), value: car.PrecioNegociable },
    { key: 'SeRecibe', label: t('specTradeIn'), value: car.SeRecibe },
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
          <button className="details-modal-close" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        
        <div className="details-modal-content">
          <CarGallery car={car} />

          {formattedPrice && (
            <div className="details-modal-price">
              {formattedPrice}
            </div>
          )}

          {historySummary && (
            <div className="price-history-card">
              <div className="price-history-header">
                <span>{t('priceHistoryTitle')}</span>
                <span className={`price-history-pill ${historySummary.latestDelta < 0 ? 'is-drop' : 'is-rise'}`}>
                  {formatHeadlineChange(historySummary, language)}
                </span>
              </div>

              {historySummary.steps.length >= 3 && (() => {
                const { steps, minPrice, maxPrice } = historySummary;
                const span = maxPrice - minPrice || 1;
                const coords = steps.map((s, i) => {
                  const x = 10 + (i / (steps.length - 1)) * 220;
                  const y = 36 - ((s.price - minPrice) / span) * 28;
                  return { x, y };
                });
                const pointsAttr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                const strokeColor = historySummary.netDelta <= 0 ? 'var(--sparkline-drop, #38bdf8)' : 'var(--sparkline-rise, #fdba74)';
                return (
                  <svg className="price-history-sparkline" viewBox="0 0 240 44" aria-hidden="true">
                    <polyline
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pointsAttr}
                    />
                    {coords.map((c, idx) => (
                      <circle
                        key={idx}
                        cx={c.x}
                        cy={c.y}
                        r={idx === coords.length - 1 ? 3.5 : 2.5}
                        fill={idx === coords.length - 1 ? strokeColor : 'var(--sparkline-dot, #94a3b8)'}
                      />
                    ))}
                  </svg>
                );
              })()}

              <div className="price-history-list">
                {historySummary.steps.map((step, idx) => {
                  const isFirst = idx === 0;
                  const isCurrent = idx === historySummary.steps.length - 1;
                  const ageText = formatChangeAge(step.seenAt, language);
                  const dateLabel = formatHistoryDate(step.seenAt, language);
                  let tagText = ageText;
                  if (isFirst) {
                    tagText = t('priceHistoryInitial');
                  } else if (isCurrent) {
                    tagText = ageText ? `${t('priceHistoryCurrent')} (${ageText})` : t('priceHistoryCurrent');
                  }
                  const deltaSign = step.delta > 0 ? '+' : '−';
                  const deltaPct = Math.abs(step.pct).toFixed(1);
                  return (
                    <div key={`${idx}-${step.price}`} className={`price-history-row ${isCurrent ? 'is-current' : ''}`}>
                      <span className="price-history-row-date">
                        {dateLabel && <span>{dateLabel}</span>}
                        {tagText && <span className="price-history-row-tag">{dateLabel ? `· ${tagText}` : tagText}</span>}
                      </span>
                      <span className="price-history-row-values">
                        {idx > 0 && step.delta !== 0 && (
                          <span className={`price-history-delta ${step.delta < 0 ? 'is-drop' : 'is-rise'}`}>
                            {`${deltaSign}${formatUSD(Math.abs(step.delta))} (${deltaSign}${deltaPct}%)`}
                          </span>
                        )}
                        <span>{formatUSD(step.price)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {historySummary.steps.length >= 3 && historySummary.netDelta !== 0 && (
                <div className="price-history-net">
                  <span>{t('priceHistoryNetChange')}</span>
                  <span className={`price-history-delta ${historySummary.netDelta < 0 ? 'is-drop' : 'is-rise'}`}>
                    {`${historySummary.netDelta > 0 ? '+' : '−'}${formatUSD(Math.abs(historySummary.netDelta))} (${historySummary.netDelta > 0 ? '+' : '−'}${Math.abs(historySummary.netPct).toFixed(1)}%)`}
                  </span>
                </div>
              )}
            </div>
          )}

          {deal && (
            <div className="details-market-card">
              <div className="details-market-header">
                <span className="details-market-label">
                  {t('marketPriceLabel')}
                </span>
                <MarketBadge car={car} />
              </div>

              <div className="details-market-ref">
                {formatMarketReference(deal, carSubject, language)}
              </div>

              {/* Range indicator: 0.7×reference to 1.3×reference (reference = mileage-adjusted median) */}
              <div className="details-range-container">
                <div className="details-range-track">
                  {/* Median tick */}
                  <div
                    title={`${medianLabel}: ${formatUSD(deal.median)}`}
                    className="details-range-median"
                  />
                  {/* Car price dot */}
                  <div
                    title={t('priceTooltipValue', { price: formatUSD(carPrice) })}
                    className="details-range-dot"
                    style={{
                      left: `${dotPercent}%`,
                      background: deal.color,
                      boxShadow: `0 0 6px ${deal.color}`,
                    }}
                  />
                </div>
                <div className="details-range-labels">
                  <span>{formatUSD(minRange)}</span>
                  <span className="details-range-median-label">{medianLabel} ({formatUSD(deal.median)})</span>
                  <span>{formatUSD(maxRange)}</span>
                </div>
              </div>

              {deal.level === 'check' && (
                <div className="details-deal-check-warning">
                  ⚠️ {t('checkPriceWithSeller', { reason: dealReason(deal, language) })}
                </div>
              )}

              <div className="details-market-footnote">
                {deal.kmAdjusted
                  ? t('marketDisclaimerKm')
                  : t('marketDisclaimerPlain')}
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
            <div className="details-seller-card">
              <div className="details-seller-label">
                {t('sellerName')}
              </div>
              {sellerName && (
                <div className="details-seller-name">
                  {sellerName}
                </div>
              )}
              {listingAge && (
                <div className="details-seller-date">
                  {t('listedColon')} {listingAge}{listingDate ? ` (${listingDate})` : ''}
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
                    <h4 className="details-modal-category-title">{t(category)}</h4>
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
          {whatsappPhone && (
            <a
              href={buildWhatsAppLink(whatsappPhone, car, language)}
              target="_blank"
              rel="noreferrer"
              className="btn-link btn-whatsapp"
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
            className="btn-link btn-crautos"
            onClick={() => trackEvent('view_external_car', 'outbound', car.Title || car.URL)}
          >
            {t('viewOnCrautos', { view: t('view') })}
          </a>

          <button
            type="button"
            className={`btn-modal-compare ${inCompare ? 'active' : ''}`}
            onClick={() => toggleCompare(car)}
          >
            <span>{inCompare ? '✓' : '⇄'}</span>
            <span>
              {inCompare ? t('inComparator') : t('compareAction')}
            </span>
          </button>

          {otherPhones.length > 0 && (
            <div className="details-phones-row">
              {otherPhones.map((phone) => (
                phone.mobile ? (
                  <a
                    key={phone.digits}
                    href={buildWhatsAppLink(phone, car, language)}
                    target="_blank"
                    rel="noreferrer"
                    className="details-phone-link"
                    onClick={() => trackEvent('contact_whatsapp', 'outbound', car.Title || car.URL)}
                  >
                    <WhatsAppIcon size={13} color="currentColor" />
                    <span>WhatsApp {phone.display}</span>
                  </a>
                ) : (
                  <a
                    key={phone.digits}
                    href={buildTelLink(phone)}
                    className="details-phone-link"
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
