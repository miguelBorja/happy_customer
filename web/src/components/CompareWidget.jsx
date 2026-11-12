import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCompare } from '../hooks/useCompare';
import { useLanguage } from '../context/LanguageContext';
import { CarThumb } from './CarPhoto';
import MarketBadge from './MarketBadge';
import { getMarketDeal, formatUSD } from '../utils/marketDeal';
import { sortEquipments, FEATURED_EQUIPMENTS } from '../utils/equipmentPriority';
import { getWhatsAppPhone, buildWhatsAppLink } from '../utils/phone';

const shortTitle = (title = '') => (title.length > 30 ? `${title.slice(0, 29)}…` : title);

const CompareWidget = ({ onAnalyzeWithCopilot }) => {
  const { compareCars, removeCompare, clearCompare, isCompareOpen, setIsCompareOpen, maxCars } = useCompare();
  const { language, t } = useLanguage();
  const [onlyDiffs, setOnlyDiffs] = useState(false);

  // Close the modal on Escape.
  useEffect(() => {
    if (!isCompareOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsCompareOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isCompareOpen, setIsCompareOpen]);

  // Union of every car's equipment keys, featured-first, capped at 12.
  const equipmentKeys = useMemo(() => {
    const set = new Set();
    compareCars.forEach((car) => {
      const equipments = car?.Equipments;
      if (equipments && typeof equipments === 'object') {
        Object.keys(equipments).forEach((key) => {
          if (equipments[key]) set.add(key);
        });
      }
    });
    const ordered = sortEquipments([...set]);
    const featured = ordered.filter((key) => FEATURED_EQUIPMENTS.includes(key));
    const rest = ordered.filter((key) => !FEATURED_EQUIPMENTS.includes(key));
    return [...featured, ...rest].slice(0, 12);
  }, [compareCars]);

  // Build the spec rows for the comparison table.
  const rows = useMemo(() => {
    const es = language === 'es';
    const priceValues = compareCars.map((car) => Number(car.Price) || 0);
    const yearValues = compareCars.map((car) => Number(car.Year) || 0);
    const kmValues = compareCars.map((car) => Number(car.Kilometraje) || 0);
    const deals = compareCars.map((car) => getMarketDeal(car));

    const lowestPositive = (values) => {
      const positives = values.filter((value) => value > 0);
      return positives.length ? Math.min(...positives) : null;
    };

    const priceMin = lowestPositive(priceValues);
    const priceDiff = new Set(priceValues).size > 1;
    const yearMax = yearValues.length ? Math.max(...yearValues) : null;
    const yearDiff = new Set(yearValues).size > 1;
    const kmMin = lowestPositive(kmValues);
    const kmDiff = new Set(kmValues).size > 1;

    let bestDealPct = null;
    deals.forEach((deal) => {
      if (deal && deal.level !== 'check') {
        if (bestDealPct === null || deal.pct < bestDealPct) bestDealPct = deal.pct;
      }
    });

    const out = [];

    // 1. Price
    out.push({
      key: 'price',
      label: es ? 'Precio' : 'Price',
      always: true,
      render: (car) => {
        const value = Number(car.Price) || 0;
        const best = value > 0 && priceDiff && value === priceMin;
        return <span className={best ? 'compare-cell-best' : undefined}>{formatUSD(car.Price)}</span>;
      },
    });

    // 2. Market deal
    out.push({
      key: 'market',
      label: es ? 'Precio vs. mercado' : 'Market deal',
      always: true,
      render: (car, index) => {
        const deal = deals[index];
        const best = deal && deal.level !== 'check' && bestDealPct !== null && deal.pct === bestDealPct;
        return (
          <span className={`compare-deal ${best ? 'compare-cell-best' : ''}`.trim()}>
            <MarketBadge car={car} />
            <span className="compare-deal-ref">{deal ? formatUSD(deal.median) : '—'}</span>
          </span>
        );
      },
    });

    // 3. Year
    out.push({
      key: 'year',
      label: es ? 'Año' : 'Year',
      diff: yearDiff,
      render: (car) => {
        const value = Number(car.Year) || 0;
        const best = value > 0 && yearDiff && value === yearMax;
        return <span className={best ? 'compare-cell-best' : undefined}>{car.Year || '—'}</span>;
      },
    });

    // 4. Mileage
    out.push({
      key: 'km',
      label: es ? 'Kilometraje' : 'Mileage',
      diff: kmDiff,
      render: (car) => {
        const value = Number(car.Kilometraje) || 0;
        const best = value > 0 && kmDiff && value === kmMin;
        const text = car.Kilometraje > 0 ? `${car.Kilometraje.toLocaleString()} km` : '—';
        return <span className={best ? 'compare-cell-best' : undefined}>{text}</span>;
      },
    });

    const simpleRow = (key, label, getValue) => {
      const values = compareCars.map(getValue);
      return {
        key,
        label,
        diff: new Set(values).size > 1,
        render: (car) => <span>{getValue(car) || '—'}</span>,
      };
    };

    // 5-9. Compact text specs
    out.push(simpleRow('transmission', es ? 'Transmisión' : 'Transmission', (car) => car.Transmision || ''));
    out.push(simpleRow('fuel', es ? 'Combustible' : 'Fuel', (car) => [car.Combustible, car.Cilindrada].filter(Boolean).join(' · ')));
    out.push(simpleRow('style', es ? 'Estilo' : 'Body style', (car) => car.Estilo || ''));
    out.push(simpleRow('province', es ? 'Provincia' : 'Province', (car) => car.Provincia || ''));
    out.push(simpleRow('negotiable', es ? 'Negociable / Recibe' : 'Negotiable / Trades', (car) => [car.PrecioNegociable, car.SeRecibe].filter((value) => value && value !== '-').join(' · ')));

    // 10. Featured equipment (one row per key)
    equipmentKeys.forEach((eq) => {
      const present = compareCars.map((car) => Boolean(car?.Equipments && car.Equipments[eq]));
      const diff = new Set(present).size > 1;
      out.push({
        key: `eq-${eq}`,
        label: t(eq),
        diff,
        render: (car) => {
          const owned = Boolean(car?.Equipments && car.Equipments[eq]);
          return owned
            ? <span className="compare-check-yes">✓</span>
            : <span className="compare-check-no">—</span>;
        },
      });
    });

    return out;
  }, [compareCars, language, equipmentKeys, t]);

  const visibleRows = onlyDiffs ? rows.filter((row) => row.always || row.diff) : rows;

  if (compareCars.length === 0) return null;

  const es = language === 'es';

  return (
    <>
      <div
        className="compare-tray"
        role="region"
        aria-label={es ? 'Comparador de autos' : 'Car comparator'}
      >
        <div className="compare-tray-items">
          {compareCars.map((car) => (
            <div className="compare-tray-chip" key={car.URL}>
              <CarThumb car={car} variant="table" />
              <div className="compare-tray-chip-info">
                <span className="compare-tray-chip-title">{shortTitle(car.Title)}</span>
                {car.Year ? <span className="compare-tray-chip-year">{car.Year}</span> : null}
              </div>
              <button
                className="compare-tray-remove"
                type="button"
                onClick={() => removeCompare(car.URL)}
                aria-label={es ? 'Quitar del comparador' : 'Remove from comparator'}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="compare-tray-count">{compareCars.length}/{maxCars}</div>

        {compareCars.length === 1 ? (
          <div className="compare-tray-hint">
            {es ? 'Elige al menos 1 auto más' : 'Pick at least 1 more car'}
          </div>
        ) : null}

        <div className="compare-tray-actions">
          <button
            className="btn-compare-open"
            type="button"
            disabled={compareCars.length < 2}
            onClick={() => setIsCompareOpen(true)}
          >
            ⇄ {es ? `Comparar (${compareCars.length})` : `Compare (${compareCars.length})`}
          </button>
          <button
            className="btn-compare-copilot"
            type="button"
            onClick={() => {
              setIsCompareOpen(false);
              onAnalyzeWithCopilot && onAnalyzeWithCopilot(compareCars);
            }}
          >
            ✨ Copilot
          </button>
          <button className="btn-compare-clear" type="button" onClick={clearCompare}>
            {es ? 'Limpiar' : 'Clear'}
          </button>
        </div>
      </div>

      {isCompareOpen && compareCars.length >= 2 && createPortal(
        <div
          className="details-modal-overlay open compare-modal-overlay"
          onClick={() => setIsCompareOpen(false)}
        >
          <div className="compare-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compare-modal-header">
              <h3 className="compare-modal-title">
                {es ? 'Comparación lado a lado' : 'Side-by-side comparison'}
              </h3>
              <button
                className={`compare-diff-toggle ${onlyDiffs ? 'active' : ''}`.trim()}
                type="button"
                aria-pressed={onlyDiffs}
                onClick={() => setOnlyDiffs((value) => !value)}
              >
                {es ? 'Solo diferencias' : 'Differences only'}
              </button>
              <button
                className="btn-compare-copilot"
                type="button"
                onClick={() => {
                  setIsCompareOpen(false);
                  onAnalyzeWithCopilot && onAnalyzeWithCopilot(compareCars);
                }}
              >
                ✨ {es ? 'Analizar con Copilot' : 'Ask Copilot'}
              </button>
              <button
                className="compare-modal-close"
                type="button"
                onClick={() => setIsCompareOpen(false)}
                aria-label={es ? 'Cerrar' : 'Close'}
              >
                ×
              </button>
            </div>

            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th className="compare-label-col">{null}</th>
                    {compareCars.map((car) => {
                      const phone = getWhatsAppPhone(car.SellerPhone);
                      const waLink = phone ? buildWhatsAppLink(phone, car, language) : null;
                      return (
                        <th key={car.URL} className="compare-car-head">
                          <button
                            className="compare-col-remove"
                            type="button"
                            onClick={() => removeCompare(car.URL)}
                            aria-label={es ? 'Quitar del comparador' : 'Remove from comparator'}
                          >
                            ×
                          </button>
                          <CarThumb car={car} variant="card" />
                          <div className="compare-col-title">{car.Title}</div>
                          <div className="compare-col-actions">
                            {waLink ? (
                              <a
                                className="compare-col-action"
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                WhatsApp
                              </a>
                            ) : null}
                            {car.URL ? (
                              <a
                                className="compare-col-action"
                                href={car.URL}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Crautos
                              </a>
                            ) : null}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.key} className={row.always ? 'compare-row-spec' : undefined}>
                      <th scope="row" className="compare-row-label">{row.label}</th>
                      {compareCars.map((car, index) => (
                        <td key={car.URL}>{row.render(car, index)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default CompareWidget;
