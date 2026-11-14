import { useState, useEffect, useMemo } from 'react';
import { fetchBargains } from '../api/client';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import PriceDropBadge from '../components/PriceDropBadge';
import MotivatedBadge from '../components/MotivatedBadge';
import { CarThumb } from '../components/CarPhoto';
import CarDetailsModal from '../components/CarDetailsModal';
import { useTableDensity } from '../hooks/useTableDensity';
import { useCompare } from '../hooks/useCompare';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';
import { TagIcon, CardsGridIcon, TableListIcon } from '../components/icons/AppIcons';
import { getMarketDeal, formatUSD, dealTooltip, DEAL_GREAT_MAX_PCT } from '../utils/marketDeal';
import { ResultsSkeleton } from '../components/LoadingSkeletons';

// Gangas = active listings with the "Gran precio" badge. The server already uses the same
// reference (mileage-adjusted median) and threshold; we recompute from the car so the number
// shown here always matches the badge.
const toBargainView = (b) => {
  const deal = getMarketDeal(b.car);
  return {
    ...b,
    deal,
    discountPercent: deal ? -deal.pct : (b.discountPercent || 0),
    marketPrice: deal ? deal.median : (b.marketPrice || 0),
  };
};

const GREAT_DISCOUNT = Math.abs(DEAL_GREAT_MAX_PCT);

const BargainsPage = ({ viewMode, setViewMode, onNegotiateWithCopilot }) => {
  const [bargains, setBargains] = useState([]);
  const [sortBy, setSortBy] = useState('discount');
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);
  const { density, setDensity, showPhotos } = useTableDensity();
  const { language, t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isComparing, toggleCompare } = useCompare();
  const { isNew } = useSeenCars();

  useEffect(() => {
    fetchBargains()
      .then((data) => setBargains((data || []).map(toBargainView)))
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
    <div className="bargains-container">
      <div className="bargains-header">
          <div>
            <h2 className="bargains-title">
              <TagIcon size={26} color="var(--icon-gold)" />
              <span>{t('bargainsTitle')}</span>
            </h2>
            <p className="bargains-subtitle">
              {t('bargainsSubtitle', { pct: GREAT_DISCOUNT })}
            </p>
          </div>
          
          <div className="bargains-controls">
            <div className="bargains-threshold">
              <span className="bargains-threshold-label">
                {t('sortByColon')}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="select-field bargains-threshold-select"
              >
                <option value="discount">{t('discountLabel')}</option>
                <option value="title">{t('title')}</option>
                <option value="year">{t('year')}</option>
                <option value="price">{t('dealPriceHeader')}</option>
                <option value="mileage">{t('mileageLabel')}</option>
              </select>
            </div>

            {viewMode === 'table' && (
              <div className="table-density-toggle">
                <button
                  className={`btn-view-toggle ${density === 'photos' ? 'active' : ''}`}
                  onClick={() => setDensity('photos')}
                >
                  {t('viewWithPhotos')}
                </button>
                <button
                  className={`btn-view-toggle ${density === 'compact' ? 'active' : ''}`}
                  onClick={() => setDensity('compact')}
                >
                  {t('viewCompact')}
                </button>
              </div>
            )}

            <div className="view-mode-toggle">
              <button
                className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
              >
                <CardsGridIcon size={14} color="currentColor" />
                <span>{t('viewCards')}</span>
              </button>
              <button
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <TableListIcon size={14} color="currentColor" />
                <span>{t('viewTable')}</span>
              </button>
            </div>
          </div>
        </div>


      {loading ? (
        <ResultsSkeleton viewMode={viewMode} count={6} />
      ) : bargains.length === 0 ? (
        <div className="page-empty-state">
          <div className="page-empty-icon">🤷‍♂️</div>
          <h3>
            {t('noBargainsTitle')}
          </h3>
          <p>
            {t('noBargainsText', { pct: GREAT_DISCOUNT })}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="results-grid fav-cards-container active-view">
          {sortedBargains.map(b => (
            <div key={b.car.URL} className="bargain-card-wrapper">
              <div className="bargain-discount-badge">
                {t('discountBadgeOff', { pct: Math.round(b.discountPercent) })}
              </div>
              
              <div className="bargain-card-drag" draggable={true} onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify(b.car)); }}>
                <CarCard 
                  car={b.car} 
                  isNew={isNew(b.car)}
                  isFav={isFavorite(b.car.URL)}
                  onToggleFav={toggleFavorite}
                  onOpenDetails={setSelectedCar}
                  onNegotiateWithCopilot={onNegotiateWithCopilot}
                />
              </div>
              
              <div
                title={b.deal ? dealTooltip(b.car, b.deal, language) : undefined}
                className="bargain-deal-info"
              >
                <span>
                  {b.deal?.kmAdjusted
                    ? t('marketPriceKmColon')
                    : t('marketPriceColon')}
                </span>
                <strong>{formatUSD(b.marketPrice)}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-fav"></th>
                {showPhotos && <th className="col-photo"></th>}
                <th className="col-discount">{t('discountLabel')}</th>
                <th className="col-title">{t('title')}</th>
                <th className="col-year">{t('year')}</th>
                <th className="col-price">{t('dealPriceHeader')}</th>
                <th className="col-market-price">{t('marketPriceLabel')}</th>
                <th className="col-km">{t('mileageLabel')}</th>
                <th className="col-province">{t('province')}</th>
                <th className="text-right col-action">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedBargains.map((b) => {
                const car = b.car;
                const carIsNew = isNew(car);
                const carIsFav = isFavorite(car.URL);
                return (
                  <tr 
                    key={car.URL} 
                    className={`draggable-car-row clickable-row ${carIsNew ? 'new-car-row' : ''} ${carIsFav ? 'fav-car-row' : ''}`}
                    onClick={(e) => {
                      if (e.target.closest('a, button, .tooltip-container')) return;
                      setSelectedCar(car);
                    }}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify(car));
                      e.dataTransfer.setData('text/plain', JSON.stringify(car));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <td className="col-fav">
                      <button
                        className={`fav-btn-table ${carIsFav ? 'active' : ''}`}
                        onClick={() => toggleFavorite(car.URL, car.Price)}
                      >
                        {carIsFav ? '★' : '☆'}
                      </button>
                    </td>
                    {showPhotos && (
                      <td className="photo-cell col-photo">
                        <CarThumb car={car} variant="table" hoverPreview />
                      </td>
                    )}
                    <td className="col-discount">
                      {Math.round(b.discountPercent)}%
                    </td>
                    <td className="col-title">
                      <span className="col-title-inner">
                        {car.Title}
                        {carIsNew && <span className="new-badge-inline">{t('newBadge')}</span>}
                      </span>
                    </td>
                    <td className="col-year">{car.Year}</td>
                    <td className="col-price">
                      <div className="col-price-badges">
                        <PriceBar price={car.Price} maxPrice={0} priceText={car.PriceText} deal={b.deal} />
                        <PriceDropBadge car={car} variant="compact" />
                        <MotivatedBadge car={car} variant="compact" />
                      </div>
                    </td>
                    <td className="col-market-price" title={b.deal ? dealTooltip(car, b.deal, language) : undefined}>
                      {formatUSD(b.marketPrice)}
                    </td>
                    <td className="col-km">
                      <MileageBar km={car.Kilometraje} maxMileage={0} />
                    </td>
                    <td className="col-province">{car.Provincia}</td>
                    <td className="text-right col-action">
                      <div className="col-action-inner col-action-inner--compact">
                        <button
                          type="button"
                          className={`btn-compare-table ${isComparing(car.URL) ? 'active' : ''}`}
                          onClick={() => toggleCompare(car)}
                          title={isComparing(car.URL)
                            ? t('removeFromComparator')
                            : t('compareAction')}
                          aria-pressed={isComparing(car.URL)}
                        >
                          ⇄
                        </button>
                        <a 
                          href={car.URL} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="btn-table-action"
                        >
                          {t('view')}
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedCar && (
        <CarDetailsModal
          isOpen
          onClose={() => setSelectedCar(null)}
          car={selectedCar}
          onNegotiateWithCopilot={onNegotiateWithCopilot}
        />
      )}
    </div>
  );
};

export default BargainsPage;
