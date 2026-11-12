import { useState, useEffect } from 'react';
import { fetchCarsByUrls } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';
import { useSeenCars } from '../hooks/useSeenCars';
import { trackEvent } from '../utils/analytics';
import { formatListingAge, formatListingDate } from '../utils/listingDate';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
import MarketBadge from '../components/MarketBadge';
import PriceDropBadge from '../components/PriceDropBadge';
import { getMarketDeal } from '../utils/marketDeal';
import { useLanguage } from '../context/LanguageContext';
import { useTableDensity } from '../hooks/useTableDensity';
import { useCompare } from '../hooks/useCompare';
import { CarThumb } from '../components/CarPhoto';
import CarDetailsModal from '../components/CarDetailsModal';
import { StarIcon, CardsGridIcon, TableListIcon } from '../components/icons/AppIcons';
import { ResultsSkeleton } from '../components/LoadingSkeletons';

const FavoritesPage = ({ viewMode, setViewMode }) => {
  const [cars, setCars] = useState([]);
  const { isFavorite, toggleFavorite, favCount, getAllUrls } = useFavorites();
  const { isNew } = useSeenCars();
  const [selectedCar, setSelectedCar] = useState(null);
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
        if (!cancelled) setCars(data);
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
  }, [favUrlsKey]);

  // Filter out unfavorited cars from display (in case user unfavorites while on this page)
  const displayCars = favUrls.length === 0 ? [] : cars.filter(car => isFavorite(car.URL));

  const activeFavs = displayCars.filter(c => !c.IsSold).length;
  const soldFavs = displayCars.filter(c => c.IsSold).length;

  return (
    <div className="favorites-container">
      <div className="favorites-header">
        <div>
          <h2 className="favorites-title">
            <StarIcon size={26} color="#fbbf24" />
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

      {!loading && displayCars.length === 0 && (
        <div className="page-empty-state">
          <div className="page-empty-icon">☆</div>
          <h3>{t('noFavoritesTitle')}</h3>
          <p>{t('noFavoritesText')}</p>
        </div>
      )}

      {!loading && displayCars.length > 0 && (
        <>
          <div className={`results-grid fav-cards-container ${viewMode === 'cards' ? 'active-view' : ''}`}>
            {displayCars.map(car => (
              <CarCard
                key={car.URL}
                car={car}
                isNew={isNew(car)}
                isFav={true}
                onToggleFav={toggleFavorite}
                onOpenDetails={setSelectedCar}
              />
            ))}
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
                {displayCars.map(car => {
                  const waPhone = getWhatsAppPhone(car.SellerPhone);
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
                          onClick={() => toggleFavorite(car.URL)}
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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
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
        />
      )}
    </div>
  );
};

export default FavoritesPage;
