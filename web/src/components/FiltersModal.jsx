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

          {/* Year Range */}
          <div className="filter-group">
            <label>{t('minYear')} / {t('maxYear')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input type="number" name="yearMin" className="input-field" placeholder="2010" value={filters.yearMin || ''} onChange={handleChange} />
              <input type="number" name="yearMax" className="input-field" placeholder="2025" value={filters.yearMax || ''} onChange={handleChange} />
            </div>
          </div>

          {/* Price Range */}
          <div className="filter-group">
            <label>{t('minPrice')} / {t('maxPrice')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input type="number" name="priceMin" className="input-field" placeholder="0" value={filters.priceMin || ''} onChange={handleChange} />
              <input type="number" name="priceMax" className="input-field" placeholder="100000" value={filters.priceMax || ''} onChange={handleChange} />
            </div>
          </div>

          {/* Max Mileage */}
          <div className="filter-group">
            <label>{t('maxMileage')}</label>
            <input type="number" name="kmMax" className="input-field" placeholder="150000" value={filters.kmMax || ''} onChange={handleChange} />
          </div>

          {/* Scraped Dates */}
          <div className="filter-group">
            <label>{t('scrapedFrom')} / {t('scrapedTo')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input type="date" name="scrapedFrom" className="input-field" value={filters.scrapedFrom || ''} onChange={handleChange} />
              <input type="date" name="scrapedTo" className="input-field" value={filters.scrapedTo || ''} onChange={handleChange} />
            </div>
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
