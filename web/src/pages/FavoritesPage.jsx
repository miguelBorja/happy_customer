import { useState, useEffect, useMemo } from 'react';
import { fetchCarsByUrls } from '../api/client';
import { buildCarAlertQuery, formatCarAlertLabel } from '../utils/carAlerts';
import { useFavorites } from '../hooks/useFavorites';
import { useSavedSearches } from '../hooks/useSavedSearches';
import { useSeenCars } from '../hooks/useSeenCars';
import { trackEvent } from '../utils/analytics';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import MarketBadge from '../components/MarketBadge';
import PriceDropBadge from '../components/PriceDropBadge';
import MotivatedBadge from '../components/MotivatedBadge';
import { getMarketDeal, formatUSD } from '../utils/marketDeal';
import { useLanguage } from '../context/LanguageContext';
import { useTableDensity } from '../hooks/useTableDensity';
import { useCompare } from '../hooks/useCompare';
import { CarThumb } from '../components/CarPhoto';
import CarDetailsModal from '../components/CarDetailsModal';
import AlertSubscribeModal from '../components/AlertSubscribeModal';
import {
  StarIcon,
  CardsGridIcon,
  TableListIcon,
  BellIcon,
  WhatsAppIcon,
} from '../components/icons/AppIcons';
import { ResultsSkeleton } from '../components/LoadingSkeletons';

const FavoritesPage = ({ viewMode, setViewMode, onApplySavedSearch, onFilterBySeller, onNegotiateWithCopilot }) => {
  const [cars, setCars] = useState([]);
  const { isFavorite, toggleFavorite, favCount, getAllUrls, getFavoriteMeta, syncFavoritePrices } = useFavorites();
  const { savedSearches, digests, removeSearch, markSearchChecked } = useSavedSearches();
  const { isNew } = useSeenCars();
  const [selectedCar, setSelectedCar] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const [onlyDrops, setOnlyDrops] = useState(false);
  const { density, setDensity, showPhotos } = useTableDensity();
  const { isComparing, toggleCompare } = useCompare();
  const { t, language } = useLanguage();

  const favUrls = getAllUrls();
  const favUrlsKey = favUrls.join('\n');
  const [loadedKey, setLoadedKey] = useState('');
  const loading = favUrls.length > 0 && loadedKey !== favUrlsKey;

  useEffect(() => {
    if (!favUrlsKey) return;
    let cancelled = false;
    const urls = favUrlsKey.split('\n');
    fetchCarsByUrls(urls)
      .then((data) => {
        if (!cancelled) {
          setCars(data);
          syncFavoritePrices(data);
        }
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(favUrlsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [favUrlsKey, syncFavoritePrices]);

  // Filter out unfavorited cars from display (in case user unfavorites while on this page)
  const displayCars = useMemo(
    () => (favUrls.length === 0 ? [] : cars.filter((car) => isFavorite(car.URL))),
    [favUrls.length, cars, isFavorite]
  );

  const dropByUrl = useMemo(() => {
    const map = new Map();
    displayCars.forEach((car) => {
      const meta = getFavoriteMeta(car.URL);
      if (meta && meta.savedPrice > 0 && car.Price > 0 && meta.savedPrice - car.Price >= 100) {
        const diffUSD = meta.savedPrice - car.Price;
        const diffPct = Math.round((diffUSD / meta.savedPrice) * 100);
        map.set(car.URL, { savedPrice: meta.savedPrice, diffUSD, diffPct });
      }
    });
    return map;
  }, [displayCars, getFavoriteMeta]);

  const droppedCars = useMemo(
    () => displayCars.filter((car) => dropByUrl.has(car.URL)),
    [displayCars, dropByUrl]
  );

  const shownCars = onlyDrops && droppedCars.length > 0 ? droppedCars : displayCars;

  const activeFavCars = useMemo(() => displayCars.filter((c) => !c.IsSold && c.URL), [displayCars]);

  const openCarAlert = (car) => {
    const { query } = buildCarAlertQuery([car.URL]);
    if (query) setAlertTarget({ query, label: formatCarAlertLabel(car) });
  };

  const openFavoritesListAlert = () => {
    if (activeFavCars.length === 0) return;
    if (activeFavCars.length === 1) {
      openCarAlert(activeFavCars[0]);
      return;
    }
    const { query, count } = buildCarAlertQuery(activeFavCars.map((c) => c.URL));
    if (query) setAlertTarget({ query, label: t('favPriceAlertListLabel', { count }) });
  };

  const activeFavs = displayCars.filter(c => !c.IsSold).length;
  const soldFavs = displayCars.filter(c => c.IsSold).length;

  return (
    <div className="favorites-container">
      <div className="favorites-header">
        <div>
          <h2 className="favorites-title">
            <StarIcon size={26} color="var(--icon-gold)" />
            <span>{t('myFavoritesTitle')}</span>
          </h2>
          <p className="favorites-subtitle">
            {favCount === 1 
              ? t('carsSaved', { count: favCount }) 
              : t('carsSavedPlural', { count: favCount })}
            {activeFavs > 0 && <span> · <span className="favorites-count-active">{activeFavs}</span> {t('activeStatus').toLowerCase()}</span>}
            {soldFavs > 0 && <span> · <span className="favorites-count-sold">{soldFavs}</span> {t('soldStatus').toLowerCase()}</span>}
          </p>
        </div>

        <div className="favorites-controls">
          {activeFavCars.length > 0 && (
            <button
              type="button"
              className="btn-telegram-alert fav-list-alert-btn"
              onClick={openFavoritesListAlert}
              title={t('favPriceAlertListTitle')}
            >
              <span>📲</span>
              <span>{t('carPriceAlertBtn')}</span>
            </button>
          )}
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
          <button
            className={`btn-view-mode ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            <CardsGridIcon size={14} color="currentColor" />
            <span>{t('viewCards')}</span>
          </button>
          <button
            className={`btn-view-mode ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            <TableListIcon size={14} color="currentColor" />
            <span>{t('viewTable')}</span>
          </button>
        </div>
      </div>

      {loading && <ResultsSkeleton viewMode={viewMode} count={4} />}

      <section className="fav-saved-searches" aria-label={t('savedSearchesTitle')}>
        <div className="fav-saved-header">
          <h3 className="fav-saved-title">
            <BellIcon size={17} color="var(--icon-gold)" />
            <span>{t('savedSearchesTitle')}</span>
          </h3>
        </div>
        {savedSearches.length === 0 ? (
          <p className="fav-saved-empty">{t('savedSearchesEmpty')}</p>
        ) : (
          <div className="fav-saved-grid">
            {savedSearches.map((item) => {
              const d = digests[item.id];
              const hasAlerts = d && ((d.newCount || 0) + (d.dropCount || 0) > 0);
              return (
                <div key={item.id} className={`fav-saved-card ${hasAlerts ? 'has-alerts' : ''}`}>
                  <button
                    type="button"
                    className="fav-saved-main"
                    onClick={() => {
                      markSearchChecked(item.id);
                      onApplySavedSearch && onApplySavedSearch(item);
                    }}
                    title={t('savedSearchApply')}
                  >
                    <span className="fav-saved-name">{item.name}</span>
                    <span className="fav-saved-badges">
                      {d ? (
                        <>
                          {d.newCount > 0 && (
                            <span className="saved-alert-badge saved-alert-badge--new">
                              {t('savedSearchNewBadge', { count: d.newCount })}
                            </span>
                          )}
                          {d.dropCount > 0 && (
                            <span className="saved-alert-badge saved-alert-badge--drop">
                              {t('savedSearchDropBadge', { count: d.dropCount })}
                            </span>
                          )}
                          <span className="saved-alert-total">
                            {t('savedSearchTotal', { count: d.totalCount })}
                          </span>
                        </>
                      ) : (
                        <span className="saved-alert-total">…</span>
                      )}
                    </span>
                  </button>
                  <div className="fav-saved-actions">
                    {hasAlerts && (
                      <button
                        type="button"
                        className="fav-saved-check-btn"
                        onClick={() => markSearchChecked(item.id)}
                      >
                        {t('savedSearchCheck')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="fav-saved-alert-btn"
                      onClick={() => setAlertTarget({ query: item.query, label: item.name })}
                      title={t('telegramAlertTitle')}
                      aria-label={t('telegramAlertTitle')}
                    >
                      📲 {t('telegramAlertBtn')}
                    </button>
                    <button
                      type="button"
                      className="fav-saved-remove-btn"
                      onClick={() => removeSearch(item.id)}
                      aria-label={t('savedSearchRemove')}
                      title={t('savedSearchRemove')}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!loading && droppedCars.length > 0 && (
        <div className="fav-drops-banner">
          <div className="fav-drops-banner-text">
            <span>📉</span>
            <span>{t('favDropsTitle', { count: droppedCars.length })}</span>
          </div>
          <button
            type="button"
            className={`fav-drops-filter-btn ${onlyDrops ? 'active' : ''}`}
            onClick={() => setOnlyDrops((prev) => !prev)}
          >
            {onlyDrops ? t('favDropsFilterAll') : t('favDropsFilter')}
          </button>
        </div>
      )}

      {!loading && displayCars.length === 0 && (
        <div className="page-empty-state">
          <div className="page-empty-icon">☆</div>
          <h3>{t('noFavoritesTitle')}</h3>
          <p>{t('noFavoritesText')}</p>
        </div>
      )}

      {!loading && shownCars.length > 0 && (
        <>
          <div className={`results-grid fav-cards-container ${viewMode === 'cards' ? 'active-view' : ''}`}>
            {shownCars.map(car => {
              const dropInfo = dropByUrl.get(car.URL);
              return (
                <div key={car.URL} className="fav-card-slot">
                  {dropInfo && (
                    <div className="fav-saved-drop-pill">
                      <span>{t('favSavedAt', { price: formatUSD(dropInfo.savedPrice) })}</span>
                      <strong>{t('favDropSinceSaved', { amount: formatUSD(dropInfo.diffUSD), pct: dropInfo.diffPct })}</strong>
                    </div>
                  )}
                  <CarCard
                    car={car}
                    isNew={isNew(car)}
                    isFav={true}
                    onToggleFav={toggleFavorite}
                    onOpenDetails={setSelectedCar}
                    onNegotiateWithCopilot={onNegotiateWithCopilot}
                  />
                  {!car.IsSold && (
                    <button
                      type="button"
                      className="fav-card-alert-btn"
                      onClick={() => openCarAlert(car)}
                      title={t('carPriceAlertBtn')}
                    >
                      📲 {t('carPriceAlertBtn')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`table-container fav-table-container ${viewMode === 'table' ? 'active-view' : ''}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fav"></th>
                  {showPhotos && <th className="col-photo"></th>}
                  <th className="col-title">{t('title')}</th>
                  <th className="col-year">{t('year')}</th>
                  <th className="col-price">{t('priceHeader')}</th>
                  <th className="col-km">{t('mileageHeader')}</th>
                  <th className="col-province">{t('province')}</th>
                  <th className="col-listed">{t('listedHeader')}</th>
                  <th className="col-status">{t('status')}</th>
                  <th className="text-right col-action">{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {shownCars.map(car => {
                  const waPhone = getWhatsAppPhone(car.SellerPhone);
                  const dropInfo = dropByUrl.get(car.URL);
                  return (
                    <tr 
                      key={car.URL} 
                      className={`draggable-car-row clickable-row ${car.IsSold ? 'sold-row' : ''}`}
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
                          className="fav-btn-table active"
                          onClick={() => toggleFavorite(car.URL, car.Price)}
                          title={t('removeFromFavorites')}
                        >
                          ★
                        </button>
                      </td>
                      {showPhotos && (
                        <td className="photo-cell col-photo">
                          <CarThumb car={car} variant="table" hoverPreview />
                        </td>
                      )}
                    <td className="col-title">
                      <span className="col-title-inner">
                        {car.Title}
                        {car.Comment && (
                          <span className="tooltip-container" tabIndex={0}>
                            💬
                            <span className="tooltip-text">"{car.Comment}"</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="col-year">{car.Year}</td>
                    <td className="col-price">
                      <div className="col-price-badges">
                        <PriceBar price={car.Price} priceText={car.PriceText} deal={getMarketDeal(car)} />
                        <MarketBadge car={car} variant="compact" />
                        <PriceDropBadge car={car} variant="compact" />
                        <MotivatedBadge car={car} variant="compact" />
                        {dropInfo && (
                          <span className="fav-saved-drop-table-badge" title={t('favSavedAt', { price: formatUSD(dropInfo.savedPrice) })}>
                            ↓ {formatUSD(dropInfo.diffUSD)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="col-km">
                      <MileageBar km={car.Kilometraje} />
                    </td>
                    <td className="col-province">{car.Provincia}</td>
                    <td className="col-listed">
                      <span title={formatListingDate(car, language)} className="col-date-text">
                        {formatListingAge(car, language)}
                      </span>
                    </td>
                    <td className="col-status">
                      {car.IsSold
                        ? <span className="col-status-sold">{t('soldStatus')}</span>
                        : <span className="col-status-active">{t('activeStatus')}</span>
                      }
                    </td>
                    <td className="text-right col-action">
                      <div className="col-action-inner">
                        {!car.IsSold && (
                          <button
                            type="button"
                            className="btn-alert-table"
                            onClick={() => openCarAlert(car)}
                            title={t('carPriceAlertBtn')}
                            aria-label={t('carPriceAlertBtn')}
                          >
                            📲
                          </button>
                        )}
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
                        {waPhone && (
                          <a
                            href={buildWhatsAppLink(waPhone, car, language)}
                            target="_blank"
                            rel="noreferrer"
                            title={`WhatsApp ${waPhone.display}`}
                            className="btn-action-icon--whatsapp"
                            onClick={() => trackEvent('contact_whatsapp', 'outbound', car.Title || car.URL)}
                          >
                            <WhatsAppIcon size={16} color="currentColor" />
                          </a>
                        )}
                        <a href={car.URL} target="_blank" rel="noreferrer" className="btn-table-action">
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
        </>
      )}

      {selectedCar && (
        <CarDetailsModal
          isOpen
          onClose={() => setSelectedCar(null)}
          car={selectedCar}
          onFilterBySeller={onFilterBySeller}
          onNegotiateWithCopilot={onNegotiateWithCopilot}
        />
      )}

      <AlertSubscribeModal
        isOpen={Boolean(alertTarget)}
        onClose={() => setAlertTarget(null)}
        query={alertTarget?.query || ''}
        label={alertTarget?.label || ''}
      />
    </div>
  );
};

export default FavoritesPage;
