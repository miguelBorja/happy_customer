import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { FilterFunnelIcon, BellIcon } from './icons/AppIcons';
import ExcelMultiSelect from './ExcelMultiSelect';

const commonEquipments = [
  { id: "Apple CarPlay" },
  { id: "Android Auto" },
  { id: "Cámara de retroceso", labelKey: "equipCamera" },
  { id: "Cámara 360" },
  { id: "Sunroof/techo panorámico", labelKey: "equipSunroof" },
  { id: "Tapicería de cuero", labelKey: "equipLeather" },
  { id: "Llave inteligente/botón de arranque" },
  { id: "Control crucero" },
  { id: "Sensores de retroceso" },
  { id: "Aros de lujo", labelKey: "equipRims" },
  { id: "Bluetooth", labelKey: "equipBluetooth" },
  { id: "Control de radio en el volante", labelKey: "equipSteering" },
];

const getScrapedDateRange = (period) => {
  const now = new Date();
  const format = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = format(now);

  switch (period) {
    case 'today':
      return { scrapedFrom: todayStr, scrapedTo: todayStr };
    case 'yesterday': {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = format(yesterday);
      return { scrapedFrom: yesterdayStr, scrapedTo: yesterdayStr };
    }
    case 'week': {
      const startOfWeek = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return { scrapedFrom: format(startOfWeek), scrapedTo: todayStr };
    }
    case 'month': {
      const startOfPeriod = new Date();
      startOfPeriod.setDate(now.getDate() - 30);
      return { scrapedFrom: format(startOfPeriod), scrapedTo: todayStr };
    }
    default:
      return { scrapedFrom: '', scrapedTo: '' };
  }
};

const FiltersModal = ({
  isOpen,
  onClose,
  filters,
  setFilters,
  showFavsOnly,
  setShowFavsOnly,
  resultsCount,
  onReset,
  brands = [],
  provinces = [],
  sellers = [],
  models = [],
  styles = [],
  hasActiveFilters = false,
  isSearchSaved = false,
  onSaveSearch,
  onOpenTelegramAlert
}) => {
  const { t } = useLanguage();

  // Local state for Year range slider (immediate visual feedback)
  const [localMinYear, setLocalMinYear] = useState(Number(filters.yearMin) || 2010);
  const [localMaxYear, setLocalMaxYear] = useState(Number(filters.yearMax) || 2027);

  // Local state for Price range slider (immediate visual feedback)
  const [localMinPrice, setLocalMinPrice] = useState(Number(filters.priceMin) || 0);
  const [localMaxPrice, setLocalMaxPrice] = useState(Number(filters.priceMax) || 100000);

  // Synchronize local states when filters change (e.g. on load, reset, or tag close)
  const syncKey = `${isOpen}|${filters.yearMin}|${filters.yearMax}|${filters.priceMin}|${filters.priceMax}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    if (isOpen) {
      setLocalMinYear(Number(filters.yearMin) || 2010);
      setLocalMaxYear(Number(filters.yearMax) || 2027);
      setLocalMinPrice(Number(filters.priceMin) || 0);
      setLocalMaxPrice(Number(filters.priceMax) || 100000);
    }
  }

  const getPriceRangeLabel = () => {
    const minVal = localMinPrice;
    const maxVal = localMaxPrice;
    
    if (minVal === 0 && maxVal === 100000) {
      return t('any');
    }
    if (minVal > 0 && maxVal === 100000) {
      return `≥ $${minVal.toLocaleString()}`;
    }
    if (minVal === 0 && maxVal < 100000) {
      return `≤ $${maxVal.toLocaleString()}`;
    }
    return `$${minVal.toLocaleString()} - $${maxVal.toLocaleString()}`;
  };

  const getYearRangeLabel = () => {
    const minVal = localMinYear;
    const maxVal = localMaxYear;
    
    if (minVal === 2010 && maxVal === 2027) {
      return t('any');
    }
    if (minVal > 2010 && maxVal === 2027) {
      return `≥ ${minVal}`;
    }
    if (minVal === 2010 && maxVal < 2027) {
      return `≤ ${maxVal}`;
    }
    return `${minVal} - ${maxVal}`;
  };

  const applyYearFilters = (minY, maxY) => {
    setFilters(f => ({ 
      ...f, 
      yearMin: minY === 2010 ? '' : String(minY),
      yearMax: maxY === 2027 ? '' : String(maxY)
    }));
  };

  const applyPriceFilters = (minP, maxP) => {
    setFilters(f => ({ 
      ...f, 
      priceMin: minP === 0 ? '' : String(minP),
      priceMax: maxP === 100000 ? '' : String(maxP)
    }));
  };

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name === 'isSold') {
        setFilters(f => ({ ...f, isSold: checked ? '' : 'false' }));
      } else if (name === 'showFavsOnly') {
        setShowFavsOnly(checked);
      } else {
        setFilters(f => ({
          ...f,
          equipments: checked 
            ? [...(f.equipments || []), name]
            : (f.equipments || []).filter(eq => eq !== name)
        }));
      }
    } else if (name === 'yearMin') {
      setFilters(f => ({ ...f, yearMin: value === '2010' ? '' : value }));
    } else if (name === 'scrapedPeriod') {
      const dates = getScrapedDateRange(value);
      setFilters(f => ({
        ...f,
        scrapedPeriod: value,
        ...dates
      }));
    } else {
      setFilters(f => ({ ...f, [name]: value }));
    }
  };

  const selectedBrands = Array.isArray(filters.brands)
    ? filters.brands
    : (filters.brand ? filters.brand.split(',').map(s => s.trim()).filter(Boolean) : []);

  const handleBrandChange = (newBrands) => {
    setFilters(f => ({
      ...f,
      brands: newBrands,
      brand: newBrands.join(','),
      models: newBrands.length === 0 ? [] : f.models,
    }));
  };

  const KM_PRESETS = ['30000', '50000', '75000', '100000', '125000', '150000', '200000'];
  const isCustomKm = filters.kmMode === 'custom' || (Boolean(filters.kmMax) && !KM_PRESETS.includes(String(filters.kmMax)));

  return (
    <div className="filters-modal-overlay open" onClick={onClose}>
      <div className="filters-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filters-modal-header">
          <h3 className="filters-modal-title">
            <FilterFunnelIcon size={18} color="var(--accent)" />
            <span>{t('filtersHeader')}</span>
          </h3>
          <button className="filters-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="filters-modal-content">
          {/* Brand - Excel MultiSelect */}
          <div className="filter-group">
            <label>{t('brand')}</label>
            <ExcelMultiSelect
              options={brands}
              selected={selectedBrands}
              onChange={handleBrandChange}
              placeholder={t('allBrands')}
            />
          </div>

          {/* Model - Excel MultiSelect */}
          <div className="filter-group">
            <label>{t('model')}</label>
            {selectedBrands.length === 0 ? (
              <ExcelMultiSelect
                disabled
                options={[]}
                selected={[]}
                placeholder={t('selectBrandFirst')}
                id="excel-multiselect-models"
              />
            ) : (
              <ExcelMultiSelect
                options={models}
                selected={filters.models || []}
                onChange={(newModels) => setFilters(f => ({ ...f, models: newModels }))}
                placeholder={t('allModels')}
                searchPlaceholder={t('searchModels')}
                noResultsLabel={t('noModelsFound')}
                id="excel-multiselect-models"
              />
            )}
          </div>
 
          {/* Province */}
          <div className="filter-group">
            <label>{t('province')}</label>
            <select name="provincia" className="select-field" value={filters.provincia || ''} onChange={handleChange}>
              <option value="">{t('allProvinces')}</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Seller */}
          <div className="filter-group">
            <label>{t('sellerName')}</label>
            <select
              name="sellerModeSelect"
              className="select-field"
              value={filters.sellerMode === 'custom' ? 'custom' : filters.sellerName || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setFilters(f => ({ ...f, sellerMode: 'custom', sellerName: '' }));
                } else {
                  setFilters(f => ({ ...f, sellerName: val, sellerMode: '' }));
                }
              }}
            >
              <option value="">{t('allSellers')}</option>
              {sellers.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="custom">{t('custom')}</option>
            </select>
            {filters.sellerMode === 'custom' && (
              <input
                type="text"
                name="sellerName"
                className="input-field input-field--spaced"
                placeholder={t('enterSellerName')}
                value={filters.sellerName || ''}
                onChange={handleChange}
              />
            )}
          </div>
 
          {/* Year Range Slider */}
          <div className="filter-group">
            <div className="slider-header">
              <label>{t('yearRange') || 'Year Range'}</label>
              <span className="slider-value-label">
                {getYearRangeLabel()}
              </span>
            </div>
            <div className="dual-slider-container">
              <input
                type="range"
                min="2010"
                max="2027"
                step="1"
                value={localMinYear}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), localMaxYear - 1);
                  setLocalMinYear(val);
                }}
                onMouseUp={() => applyYearFilters(localMinYear, localMaxYear)}
                onTouchEnd={() => applyYearFilters(localMinYear, localMaxYear)}
                className="thumb thumb-left"
                style={{ zIndex: localMinYear > 2018 ? '5' : '3' }}
              />
              <input
                type="range"
                min="2010"
                max="2027"
                step="1"
                value={localMaxYear}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), localMinYear + 1);
                  setLocalMaxYear(val);
                }}
                onMouseUp={() => applyYearFilters(localMinYear, localMaxYear)}
                onTouchEnd={() => applyYearFilters(localMinYear, localMaxYear)}
                className="thumb thumb-right"
                style={{ zIndex: localMinYear > 2018 ? '3' : '5' }}
              />
              <div className="slider-track" />
              <div
                className="slider-range"
                style={{
                  left: `${((localMinYear - 2010) / 17) * 100}%`,
                  width: `${((localMaxYear - localMinYear) / 17) * 100}%`,
                }}
              />
            </div>
          </div>
 
          {/* Price Range Slider */}
          <div className="filter-group">
            <div className="slider-header">
              <label>{t('priceRange') || 'Price Range'}</label>
              <span className="slider-value-label">
                {getPriceRangeLabel()}
              </span>
            </div>
            <div className="dual-slider-container">
              <input
                type="range"
                min="0"
                max="100000"
                step="1000"
                value={localMinPrice}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), localMaxPrice - 1000);
                  setLocalMinPrice(val);
                }}
                onMouseUp={() => applyPriceFilters(localMinPrice, localMaxPrice)}
                onTouchEnd={() => applyPriceFilters(localMinPrice, localMaxPrice)}
                className="thumb thumb-left"
                style={{ zIndex: localMinPrice > 50000 ? '5' : '3' }}
              />
              <input
                type="range"
                min="0"
                max="100000"
                step="1000"
                value={localMaxPrice}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), localMinPrice + 1000);
                  setLocalMaxPrice(val);
                }}
                onMouseUp={() => applyPriceFilters(localMinPrice, localMaxPrice)}
                onTouchEnd={() => applyPriceFilters(localMinPrice, localMaxPrice)}
                className="thumb thumb-right"
                style={{ zIndex: localMinPrice > 50000 ? '3' : '5' }}
              />
              <div className="slider-track" />
              <div
                className="slider-range"
                style={{
                  left: `${(localMinPrice / 100000) * 100}%`,
                  width: `${((localMaxPrice - localMinPrice) / 100000) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Max Mileage Dropdown & Custom Option */}
          <div className="filter-group">
            <label>{t('maxMileage')}</label>
            <select
              name="kmModeSelect"
              className="select-field"
              value={isCustomKm ? 'custom' : filters.kmMax || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setFilters(f => ({ ...f, kmMode: 'custom' }));
                } else {
                  setFilters(f => ({ ...f, kmMax: val, kmMode: '' }));
                }
              }}
            >
              <option value="">{t('any')}</option>
              <option value="30000">30,000 km</option>
              <option value="50000">50,000 km</option>
              <option value="75000">75,000 km</option>
              <option value="100000">100,000 km</option>
              <option value="125000">125,000 km</option>
              <option value="150000">150,000 km</option>
              <option value="200000">200,000 km</option>
              <option value="custom">{t('custom') || 'Custom'}</option>
            </select>
            {isCustomKm && (
              <input
                type="number"
                name="kmMax"
                className="input-field input-field--spaced"
                placeholder={t('enterMaxMileage') || 'Enter max mileage'}
                value={filters.kmMax || ''}
                onChange={handleChange}
              />
            )}
          </div>

          {/* Scraped Date Dropdown */}
          <div className="filter-group">
            <label>{t('scrapedDate') || 'Scraped Date'}</label>
            <select name="scrapedPeriod" className="select-field" value={filters.scrapedPeriod || ''} onChange={handleChange}>
              <option value="">{t('any')}</option>
              <option value="today">{t('today')}</option>
              <option value="yesterday">{t('yesterday')}</option>
              <option value="week">{t('thisWeek')}</option>
              <option value="month">{t('lastMonth')}</option>
            </select>
          </div>

          {/* Body Style */}
          <div className="filter-group">
            <label>{t('specBodyStyle')}</label>
            <select name="estilo" className="select-field" value={filters.estilo || ''} onChange={handleChange}>
              <option value="">{t('any')}</option>
              {styles.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>

          {/* Transmission */}
          <div className="filter-group">
            <label>{t('transmission')}</label>
            <select name="transmision" className="select-field" value={filters.transmision === 'Automática' ? 'Automática/Dual' : (filters.transmision || '')} onChange={handleChange}>
              <option value="">{t('any')}</option>
              <option value="Manual">{t('manual')}</option>
              <option value="Automática/Dual">{t('automatic')}</option>
              <option value="Dual">{t('dual')}</option>
            </select>
          </div>
          
          {/* Fuel */}
          <div className="filter-group">
            <label>{t('fuel')}</label>
            <select name="combustible" className="select-field" value={filters.combustible || ''} onChange={handleChange}>
              <option value="">{t('any')}</option>
              <option value="Gasolina">{t('gasoline')}</option>
              <option value="Diesel">{t('diesel')}</option>
              <option value="Eléctrico">{t('electric')}</option>
              <option value="Híbrido">{t('hybrid')}</option>
            </select>
          </div>

          {/* Equipments Checkboxes */}
          <div className="filter-group full-width filter-group--equipments">
            <label>{t('equipment')}</label>
            <div className="equipments-grid">
              {commonEquipments.map(eq => (
                <label key={eq.id} className="checkbox-group">
                  <input 
                    type="checkbox" 
                    name={eq.id} 
                    checked={(filters.equipments || []).includes(eq.id)} 
                    onChange={handleChange} 
                  />
                  <span>{eq.labelKey ? t(eq.labelKey) : t(eq.id)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Toggles: Show Sold & Show Favorites */}
          <div className="filter-group full-width filter-toggles-row">
            <label className="checkbox-group">
              <input type="checkbox" name="isSold" checked={filters.isSold !== 'false'} onChange={handleChange} />
              <span>{t('showSold')}</span>
            </label>
            
            <label className="checkbox-group fav-filter-label">
              <input type="checkbox" name="showFavsOnly" checked={showFavsOnly} onChange={handleChange} />
              <span>{t('showFavsOnly')}</span>
            </label>

            <label className="checkbox-group">
              <input type="checkbox" checked={filters.deal === 'good'} onChange={(e) => setFilters(f => ({ ...f, deal: e.target.checked ? 'good' : '' }))} />
              <span>{t('goodPricesOnly')}</span>
            </label>

            <label className="checkbox-group">
              <input type="checkbox" checked={filters.priceDrop === 'true'} onChange={(e) => setFilters(f => ({ ...f, priceDrop: e.target.checked ? 'true' : '' }))} />
              <span>{t('priceDropsOnly')}</span>
            </label>

            <label className="checkbox-group">
              <input type="checkbox" checked={filters.motivated === 'true'} onChange={(e) => setFilters(f => ({ ...f, motivated: e.target.checked ? 'true' : '' }))} />
              <span>{t('motivatedOnly')}</span>
            </label>

            <label className="checkbox-group">
              <input type="checkbox" checked={filters.seRecibe === 'true'} onChange={(e) => setFilters(f => ({ ...f, seRecibe: e.target.checked ? 'true' : '' }))} />
              <span>{t('tradeInOnly')}</span>
            </label>

            <label className="checkbox-group">
              <input type="checkbox" checked={filters.negociable === 'true'} onChange={(e) => setFilters(f => ({ ...f, negociable: e.target.checked ? 'true' : '' }))} />
              <span>{t('negotiableOnly')}</span>
            </label>
          </div>
        </div>
        
        <div className="filters-modal-footer">
          <button className="btn-reset-filters" onClick={onReset}>
            {t('resetFilters')}
          </button>
          {hasActiveFilters && onSaveSearch && (
            <button
              type="button"
              className={`btn-save-search-modal ${isSearchSaved ? 'saved' : ''}`}
              disabled={isSearchSaved}
              onClick={onSaveSearch}
            >
              <BellIcon size={14} color="currentColor" />
              <span>{isSearchSaved ? t('searchSavedBtn') : t('saveSearchBtn')}</span>
            </button>
          )}
          {hasActiveFilters && onOpenTelegramAlert && (
            <button
              type="button"
              className="btn-telegram-alert"
              onClick={onOpenTelegramAlert}
            >
              📲 {t('telegramAlertBtn')}
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            {t('showResultsCount', { count: resultsCount })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FiltersModal;
