import React from 'react';
import { useLanguage } from '../context/LanguageContext';

const commonEquipments = [
  { id: "Tapicería de cuero", labelKey: "equipLeather" },
  { id: "Cámara de retroceso", labelKey: "equipCamera" },
  { id: "Bluetooth", labelKey: "equipBluetooth" },
  { id: "Aros de lujo", labelKey: "equipRims" },
  { id: "Sunroof/techo panorámico", labelKey: "equipSunroof" },
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
  provinces = []
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name === 'isSold') {
        setFilters(f => ({ ...f, isSold: checked ? '' : 'false' })); // empty means show all, false means only active
      } else if (name === 'showFavsOnly') {
        setShowFavsOnly(checked);
      } else {
        // Equipment checkboxes
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

  return (
    <div className="filters-modal-overlay open" onClick={onClose}>
      <div className="filters-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filters-modal-header">
          <h3>{t('filtersHeader')}</h3>
          <button className="filters-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="filters-modal-content">
          {/* Brand */}
          <div className="filter-group">
            <label>{t('brand')}</label>
            <select name="brand" className="select-field" value={filters.brand || ''} onChange={handleChange}>
              <option value="">{t('allBrands')}</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Province */}
          <div className="filter-group">
            <label>{t('province')}</label>
            <select name="provincia" className="select-field" value={filters.provincia || ''} onChange={handleChange}>
              <option value="">{t('allProvinces')}</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Year Range Slider */}
          <div className="filter-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>{t('minYear')}</label>
              <span style={{ fontWeight: '600', color: 'var(--accent)', fontSize: '0.95rem' }}>
                {filters.yearMin && filters.yearMin !== '2010' ? filters.yearMin : `${t('any')} (2010)`}
              </span>
            </div>
            <input
              type="range"
              min="2010"
              max="2027"
              step="1"
              name="yearMin"
              className="range-slider"
              value={filters.yearMin || '2010'}
              onChange={handleChange}
            />
          </div>

          {/* Max Price Dropdown & Custom Option */}
          <div className="filter-group">
            <label>{t('maxPrice') || 'Max Price'}</label>
            <select
              name="priceModeSelect"
              className="select-field"
              value={filters.priceMode === 'custom' ? 'custom' : filters.priceMax || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setFilters(f => ({ ...f, priceMode: 'custom' }));
                } else {
                  setFilters(f => ({ ...f, priceMax: val, priceMode: '' }));
                }
              }}
            >
              <option value="">{t('any')}</option>
              <option value="5000">$5,000</option>
              <option value="10000">$10,000</option>
              <option value="15000">$15,000</option>
              <option value="20000">$20,000</option>
              <option value="25000">$25,000</option>
              <option value="30000">$30,000</option>
              <option value="35000">$35,000</option>
              <option value="40000">$40,000</option>
              <option value="custom">{t('custom') || 'Custom'}</option>
            </select>
            {filters.priceMode === 'custom' && (
              <input
                type="number"
                name="priceMax"
                className="input-field"
                style={{ marginTop: '0.5rem' }}
                placeholder={t('enterMaxPrice') || 'Enter max price'}
                value={filters.priceMax || ''}
                onChange={handleChange}
              />
            )}
          </div>

          {/* Max Mileage Dropdown & Custom Option */}
          <div className="filter-group">
            <label>{t('maxMileage')}</label>
            <select
              name="kmModeSelect"
              className="select-field"
              value={filters.kmMode === 'custom' ? 'custom' : filters.kmMax || ''}
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
              <option value="100000">100,000 km</option>
              <option value="125000">125,000 km</option>
              <option value="150000">150,000 km</option>
              <option value="175000">175,000 km</option>
              <option value="200000">200,000 km</option>
              <option value="custom">{t('custom') || 'Custom'}</option>
            </select>
            {filters.kmMode === 'custom' && (
              <input
                type="number"
                name="kmMax"
                className="input-field"
                style={{ marginTop: '0.5rem' }}
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

          {/* Transmission */}
          <div className="filter-group">
            <label>{t('transmission')}</label>
            <select name="transmision" className="select-field" value={filters.transmision || ''} onChange={handleChange}>
              <option value="">{t('any')}</option>
              <option value="Manual">{t('manual')}</option>
              <option value="Automática">{t('automatic')}</option>
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

          {/* Results Limit */}
          <div className="filter-group">
            <label>{t('limit')}</label>
            <select name="limit" className="select-field" value={filters.limit || '100'} onChange={handleChange}>
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
              <option value="500">Top 500</option>
            </select>
          </div>


          {/* Equipments Checkboxes */}
          <div className="filter-group full-width" style={{ marginTop: '0.5rem' }}>
            <label>{t('equipment')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.25rem' }}>
              {commonEquipments.map(eq => (
                <label key={eq.id} className="checkbox-group">
                  <input 
                    type="checkbox" 
                    name={eq.id} 
                    checked={(filters.equipments || []).includes(eq.id)} 
                    onChange={handleChange} 
                  />
                  <span>{t(eq.labelKey)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Toggles: Show Sold & Show Favorites */}
          <div className="filter-group full-width" style={{ display: 'flex', flexDirection: 'row', gap: '2rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <label className="checkbox-group">
              <input type="checkbox" name="isSold" checked={filters.isSold !== 'false'} onChange={handleChange} />
              <span>{t('showSold')}</span>
            </label>
            
            <label className="checkbox-group fav-filter-label">
              <input type="checkbox" name="showFavsOnly" checked={showFavsOnly} onChange={handleChange} />
              <span>{t('showFavsOnly')}</span>
            </label>
          </div>
        </div>
        
        <div className="filters-modal-footer">
          <button className="btn-reset-filters" onClick={onReset}>
            {t('resetFilters')}
          </button>
          <button className="btn-primary" onClick={onClose}>
            {t('showResultsCount', { count: resultsCount })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FiltersModal;
export { commonEquipments };
