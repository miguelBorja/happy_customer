import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { SearchIcon } from './icons/AppIcons';

const ExcelMultiSelect = ({
  options = [],
  selected = [],
  onChange,
  placeholder,
  id = 'excel-multiselect',
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);

  // Normalize selected to always be an array of strings
  const selectedList = useMemo(() => {
    if (Array.isArray(selected)) return selected;
    if (typeof selected === 'string' && selected.trim() !== '') {
      return selected.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }, [selected]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => opt.toLowerCase().includes(q));
  }, [options, searchTerm]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Auto focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Calculate tri-state for (Select All) checkbox
  const isSearchActive = searchTerm.trim().length > 0;
  const targetOptions = isSearchActive ? filteredOptions : options;
  
  const selectedInTargetCount = useMemo(() => {
    if (targetOptions.length === 0) return 0;
    return targetOptions.filter(opt => selectedList.includes(opt)).length;
  }, [targetOptions, selectedList]);

  const isAllTargetSelected = targetOptions.length > 0 && selectedInTargetCount === targetOptions.length;
  const isPartialTargetSelected = selectedInTargetCount > 0 && !isAllTargetSelected;

  // Set indeterminate DOM property on the checkbox
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isPartialTargetSelected;
    }
  }, [isPartialTargetSelected, isOpen]);

  // Toggle single item
  const handleToggleItem = (item) => {
    if (selectedList.includes(item)) {
      onChange(selectedList.filter(s => s !== item));
    } else {
      onChange([...selectedList, item]);
    }
  };

  // Toggle Select All (or Select All Search Results)
  const handleToggleSelectAll = () => {
    if (isAllTargetSelected) {
      // Deselect all target items
      if (isSearchActive) {
        onChange(selectedList.filter(s => !targetOptions.includes(s)));
      } else {
        onChange([]);
      }
    } else {
      // Select all target items
      if (isSearchActive) {
        const set = new Set([...selectedList, ...targetOptions]);
        onChange(Array.from(set));
      } else {
        onChange([...options]);
      }
    }
  };

  // Clear all selections
  const handleClearAll = (e) => {
    if (e) e.stopPropagation();
    onChange([]);
  };

  // Select all options
  const handleSelectAllGlobal = (e) => {
    if (e) e.stopPropagation();
    onChange([...options]);
  };

  // Format trigger label text
  const triggerLabel = useMemo(() => {
    if (selectedList.length === 0) {
      return placeholder || t('allBrands');
    }
    if (selectedList.length === 1) {
      return selectedList[0];
    }
    if (selectedList.length === 2) {
      return `${selectedList[0]}, ${selectedList[1]}`;
    }
    return t('brandsCountSummary', {
      first: selectedList[0],
      count: selectedList.length - 1
    });
  }, [selectedList, placeholder, t]);

  return (
    <div className="excel-multiselect-container" ref={containerRef} id={id}>
      {/* Dropdown Trigger Button */}
      <div 
        className={`excel-multiselect-trigger ${isOpen ? 'active' : ''} ${selectedList.length > 0 ? 'has-selection' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="excel-trigger-text-wrapper">
          <span className={`excel-trigger-label ${selectedList.length === 0 ? 'placeholder' : ''}`}>
            {triggerLabel}
          </span>
          {selectedList.length > 1 && (
            <span className="excel-trigger-badge">
              {selectedList.length}
            </span>
          )}
        </div>

        <div className="excel-trigger-actions">
          {selectedList.length > 0 && (
            <button
              type="button"
              className="excel-trigger-clear-btn"
              title={t('clearSelection')}
              onClick={handleClearAll}
            >
              ×
            </button>
          )}
          <span className={`excel-trigger-chevron ${isOpen ? 'open' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Excel-Style Dropdown Popover */}
      {isOpen && (
        <div className="excel-popover-dropdown">
          {/* Search Header */}
          <div className="excel-popover-search">
            <div className="excel-search-input-wrapper">
              <SearchIcon size={14} color="var(--text-muted)" className="excel-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="excel-search-input"
                placeholder={t('searchBrands')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="excel-search-clear-btn"
                  onClick={() => setSearchTerm('')}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Bar / Summary */}
          <div className="excel-popover-toolbar">
            <span className="excel-toolbar-count">
              {t('selectedOfTotal', {
                selected: selectedList.length,
                total: options.length
              })}
            </span>
            <div className="excel-toolbar-links">
              <button 
                type="button" 
                className="excel-link-btn" 
                onClick={handleSelectAllGlobal}
              >
                {t('selectAllAction')}
              </button>
              <span className="excel-link-divider">•</span>
              <button 
                type="button" 
                className="excel-link-btn" 
                onClick={handleClearAll}
                disabled={selectedList.length === 0}
              >
                {t('clearSelection')}
              </button>
            </div>
          </div>

          {/* (Select All) Checkbox Row */}
          {targetOptions.length > 0 && (
            <div className="excel-select-all-row" onClick={handleToggleSelectAll}>
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                className="excel-checkbox"
                checked={isAllTargetSelected}
                onChange={handleToggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="excel-select-all-label">
                {isSearchActive ? t('selectAllSearchResults') : t('selectAll')}
              </span>
              <span className="excel-items-count-tag">
                ({targetOptions.length})
              </span>
            </div>
          )}

          {/* Scrollable Checkbox List */}
          <div className="excel-options-list" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="excel-no-results">
                {t('noBrandsFound')}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selectedList.includes(opt);
                return (
                  <div
                    key={opt}
                    className={`excel-option-item ${isChecked ? 'selected' : ''}`}
                    onClick={() => handleToggleItem(opt)}
                    role="option"
                    aria-selected={isChecked}
                  >
                    <input
                      type="checkbox"
                      className="excel-checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleItem(opt)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="excel-option-label">{opt}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelMultiSelect;
