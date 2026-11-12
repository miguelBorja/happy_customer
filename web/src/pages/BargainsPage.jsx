import { useState, useEffect, useMemo } from 'react';
import { fetchBargains } from '../api/client';
import CarCard from '../components/CarCard';
import MileageBar from '../components/MileageBar';
import PriceBar from '../components/PriceBar';
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

const BargainsPage = ({ viewMode, setViewMode }) => {
  const [bargains, setBargains] = useState([]);
  const [sortBy, setSortBy] = useState('discount');
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);
  const { density, setDensity, showPhotos } = useTableDensity();
  const { language } = useLanguage();
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
    <div style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <TagIcon size={26} color="#fbbf24" />
              <span>{language === 'es' ? '¡Una Ganga!' : 'A Bargain!'}</span>
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {language === 'es' 
                ? `Autos publicados con "Gran precio": al menos ${GREAT_DISCOUNT}% bajo la mediana de su marca, modelo y año (activos y vendidos), ajustada por kilometraje.`
                : `Active listings with a "Great price" badge: at least ${GREAT_DISCOUNT}% below the median for their make, model and year (active and sold), adjusted for mileage.`}
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                {language === 'es' ? 'Ordenar por:' : 'Sort by:'}
              </span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)} 
                className="select-field" 
                style={{ width: 'auto', padding: '0.4rem 2rem 0.4rem 1rem', fontSize: '0.9rem', borderRadius: '8px', minWidth: '150px' }}
              >
                <option value="discount">{language === 'es' ? 'Descuento' : 'Discount'}</option>
                <option value="title">{language === 'es' ? 'Título' : 'Title'}</option>
                <option value="year">{language === 'es' ? 'Año' : 'Year'}</option>
                <option value="price">{language === 'es' ? 'Precio Oferta' : 'Deal Price'}</option>
                <option value="mileage">{language === 'es' ? 'Kilometraje' : 'Mileage'}</option>
              </select>
            </div>

            {viewMode === 'table' && (
              <div className="table-density-toggle">
                <button
                  className={`btn-view-toggle ${density === 'photos' ? 'active' : ''}`}
                  onClick={() => setDensity('photos')}
                >
                  {language === 'es' ? 'Con fotos' : 'Photos'}
                </button>
                <button
                  className={`btn-view-toggle ${density === 'compact' ? 'active' : ''}`}
                  onClick={() => setDensity('compact')}
                >
                  {language === 'es' ? 'Compacta' : 'Compact'}
                </button>
              </div>
            )}

            <div className="view-mode-toggle">
              <button 
                className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <CardsGridIcon size={14} color="currentColor" />
                <span>{language === 'es' ? 'Tarjetas' : 'Cards'}</span>
              </button>
              <button 
                className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <TableListIcon size={14} color="currentColor" />
                <span>{language === 'es' ? 'Tabla' : 'Table'}</span>
              </button>
            </div>
          </div>
        </div>


      {loading ? (
        <ResultsSkeleton viewMode={viewMode} count={6} />
      ) : bargains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🤷‍♂️</div>
          <h3 style={{ marginBottom: '0.5rem' }}>
            {language === 'es' ? 'No se encontraron gangas' : 'No bargains found'}
          </h3>
          <p>
            {language === 'es' 
              ? `Ahora mismo no hay autos publicados con ${GREAT_DISCOUNT}% o más bajo su precio de mercado.`
              : `There are no active listings ${GREAT_DISCOUNT}% or more below their market price right now.`}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="results-grid fav-cards-container active-view">
          {sortedBargains.map(b => (
            <div key={b.car.URL} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div 
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '-12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  zIndex: 10,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  border: '2px solid var(--bg-card)'
                }}
              >
                {Math.round(b.discountPercent)}% {language === 'es' ? 'DESCUENTO' : 'OFF'}
              </div>
              
              <div style={{ flexGrow: 1 }} draggable={true} onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify(b.car)); }}>
                <CarCard 
                  car={b.car} 
                  isNew={isNew(b.car)}
                  isFav={isFavorite(b.car.URL)}
                  onToggleFav={toggleFavorite}
                  onOpenDetails={setSelectedCar}
                />
              </div>
              
              <div
                title={b.deal ? dealTooltip(b.car, b.deal, language) : undefined}
                style={{ 
                marginTop: '12px', 
                padding: '10px 14px', 
                background: 'rgba(16, 185, 129, 0.08)', 
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                fontSize: '0.9rem',
                color: '#34d399',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span>
                  {b.deal?.kmAdjusted
                    ? (language === 'es' ? 'Precio de mercado (ajustado por km):' : 'Market price (mileage-adjusted):')
                    : (language === 'es' ? 'Precio de mercado:' : 'Market price:')}
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
                <th className="col-discount">{language === 'es' ? 'Descuento' : 'Discount'}</th>
                <th className="col-title">{language === 'es' ? 'Título' : 'Title'}</th>
                <th className="col-year">{language === 'es' ? 'Año' : 'Year'}</th>
                <th className="col-price">{language === 'es' ? 'Precio Oferta' : 'Deal Price'}</th>
                <th className="col-market-price">{language === 'es' ? 'Precio de mercado' : 'Market price'}</th>
                <th className="col-km">{language === 'es' ? 'Kilometraje' : 'Mileage'}</th>
                <th className="col-province">{language === 'es' ? 'Provincia' : 'Province'}</th>
                <th className="text-right col-action">{language === 'es' ? 'Acción' : 'Action'}</th>
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
                        onClick={() => toggleFavorite(car.URL)}
                      >
                        {carIsFav ? '★' : '☆'}
                      </button>
                    </td>
                    {showPhotos && (
                      <td className="photo-cell col-photo">
                        <CarThumb car={car} variant="table" hoverPreview />
                      </td>
                    )}
                    <td className="col-discount" style={{ fontWeight: 'bold', color: '#10b981' }}>
                      {Math.round(b.discountPercent)}%
                    </td>
                    <td className="col-title" style={{ fontWeight: '500' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {car.Title}
                        {carIsNew && <span className="new-badge-inline">{language === 'es' ? 'NUEVO' : 'NEW'}</span>}
                      </span>
                    </td>
                    <td className="col-year">{car.Year}</td>
                    <td className="col-price">
                      <PriceBar price={car.Price} maxPrice={0} priceText={car.PriceText} deal={b.deal} />
                    </td>
                    <td className="col-market-price" style={{ color: '#10b981', fontWeight: 'bold' }} title={b.deal ? dealTooltip(car, b.deal, language) : undefined}>
                      {formatUSD(b.marketPrice)}
                    </td>
                    <td className="col-km">
                      <MileageBar km={car.Kilometraje} maxMileage={0} />
                    </td>
                    <td className="col-province">{car.Provincia}</td>
                    <td className="text-right col-action">
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.45rem' }}>
                        <button
                          type="button"
                          className={`btn-compare-table ${isComparing(car.URL) ? 'active' : ''}`}
                          onClick={() => toggleCompare(car)}
                          title={isComparing(car.URL)
                            ? (language === 'es' ? 'Quitar del comparador' : 'Remove from comparator')
                            : (language === 'es' ? 'Comparar' : 'Compare')}
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
                          {language === 'es' ? 'Ver' : 'View'}
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
        />
      )}
    </div>
  );
};

export default BargainsPage;
