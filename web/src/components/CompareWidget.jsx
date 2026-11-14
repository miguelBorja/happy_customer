import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCompare } from '../hooks/useCompare';
import { useLanguage } from '../context/LanguageContext';
import { CarThumb } from './CarPhoto';
import MarketBadge from './MarketBadge';
import PriceDropBadge from './PriceDropBadge';
import { getMarketDeal, formatUSD } from '../utils/marketDeal';
import { sortEquipments, FEATURED_EQUIPMENTS } from '../utils/equipmentPriority';
import { getWhatsAppPhone, buildWhatsAppLink, buildComparisonWhatsAppLink } from '../utils/phone';
import {
  estimateCrCosts,
  estimateCrTco3Yr,
  formatCRC,
  getStoredMonthlyKm,
  setStoredMonthlyKm,
} from '../utils/crCostEstimator';
import { fetchDepreciation } from '../api/client';
import { WhatsAppIcon } from './icons/AppIcons';

const COMPARE_KM_PRESETS = [600, 1200, 2000];

const shortTitle = (title = '') => (title.length > 30 ? `${title.slice(0, 29)}…` : title);

const CompareWidget = ({ onAnalyzeWithCopilot }) => {
  const { compareCars, removeCompare, clearCompare, isCompareOpen, setIsCompareOpen, maxCars } = useCompare();
  const { language, t } = useLanguage();
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

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

  const costsByUrl = useMemo(() => (
    new Map(compareCars.map((car) => [car.URL, estimateCrCosts(car)]))
  ), [compareCars]);

  const [monthlyKm, setMonthlyKm] = useState(getStoredMonthlyKm);
  const [depMap, setDepMap] = useState({});
  const fetchedDepKeysRef = useRef(new Set());

  useEffect(() => {
    if (!isCompareOpen || compareCars.length === 0) return undefined;

    const missing = [];
    const seen = new Set();
    compareCars.forEach((car) => {
      if (!car?.Brand || !car?.Model) return;
      const key = `${car.Brand}|${car.Model}`;
      if (seen.has(key) || fetchedDepKeysRef.current.has(key)) return;
      seen.add(key);
      missing.push({ key, brand: car.Brand, model: car.Model });
    });

    if (missing.length === 0) return undefined;

    const controller = new AbortController();
    missing.forEach((m) => fetchedDepKeysRef.current.add(m.key));

    Promise.allSettled(
      missing.map((m) =>
        fetchDepreciation({ brand: m.brand, model: m.model }, controller.signal).then((data) => ({
          key: m.key,
          data,
        })),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const updates = {};
      let hasUpdates = false;
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.data) {
          updates[res.value.key] = res.value.data;
          hasUpdates = true;
        }
      });
      if (hasUpdates) {
        setDepMap((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => controller.abort();
  }, [isCompareOpen, compareCars]);

  const tcoByUrl = useMemo(() => (
    new Map(
      compareCars.map((car) => {
        const key = car?.Brand && car?.Model ? `${car.Brand}|${car.Model}` : '';
        return [car.URL, estimateCrTco3Yr(car, { monthlyKm, depCurve: depMap[key] || null })];
      }),
    )
  ), [compareCars, monthlyKm, depMap]);

  const handleSelectMonthlyKm = (val) => {
    const saved = setStoredMonthlyKm(val);
    setMonthlyKm(saved);
  };

  const shareCompareUrl = useMemo(() => {
    if (compareCars.length < 2 || typeof window === 'undefined') return '';
    const params = new URLSearchParams();
    params.set('compare', compareCars.map((c) => c.URL).filter(Boolean).join(','));
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [compareCars]);

  const verdictItems = useMemo(() => {
    if (compareCars.length < 2) return [];
    const items = [];

    let bestDealCar = null;
    let bestDeal = null;
    compareCars.forEach((car) => {
      const d = getMarketDeal(car);
      if (d && d.level !== 'check' && (!bestDeal || d.pct < bestDeal.pct)) {
        bestDeal = d;
        bestDealCar = car;
      }
    });
    if (bestDealCar && bestDeal) {
      const pctText = `${bestDeal.pct > 0 ? '+' : ''}${Math.round(bestDeal.pct)}`;
      items.push({
        key: 'best-market',
        text: t('compareBestMarket', { title: shortTitle(bestDealCar.Title), pct: pctText }),
      });
    }

    let minTurnkeyCar = null;
    let minTurnkey = null;
    compareCars.forEach((car) => {
      const c = costsByUrl.get(car.URL);
      if (c && c.turnkeyUSD > 0 && (minTurnkey === null || c.turnkeyUSD < minTurnkey)) {
        minTurnkey = c.turnkeyUSD;
        minTurnkeyCar = car;
      }
    });
    if (minTurnkeyCar && minTurnkey !== null) {
      items.push({
        key: 'lowest-turnkey',
        text: t('compareLowestTurnkey', { title: shortTitle(minTurnkeyCar.Title), amount: formatUSD(minTurnkey) }),
      });
    }

    let minKmCar = null;
    let minKm = null;
    compareCars.forEach((car) => {
      const km = Number(car.Kilometraje) || 0;
      if (km > 0 && (minKm === null || km < minKm)) {
        minKm = km;
        minKmCar = car;
      }
    });
    if (minKmCar && minKm !== null) {
      items.push({
        key: 'lowest-km',
        text: t('compareLowestKm', { title: shortTitle(minKmCar.Title), km: `${minKm.toLocaleString()} km` }),
      });
    }

    let mostEquippedCar = null;
    let maxEquip = 0;
    const eqCounts = compareCars.map((car) => {
      const count = car?.Equipments ? Object.values(car.Equipments).filter(Boolean).length : 0;
      if (count > maxEquip) {
        maxEquip = count;
        mostEquippedCar = car;
      }
      return count;
    });
    if (mostEquippedCar && maxEquip > 0 && new Set(eqCounts).size > 1) {
      items.push({
        key: 'most-equipped',
        text: t('compareMostEquipped', { title: shortTitle(mostEquippedCar.Title), count: maxEquip }),
      });
    }

    let minTco = null;
    let minTcoCar = null;
    compareCars.forEach((car) => {
      const tco = tcoByUrl.get(car.URL);
      if (tco && tco.netTco3YrUSD > 0 && (minTco === null || tco.netTco3YrUSD < minTco)) {
        minTco = tco.netTco3YrUSD;
        minTcoCar = car;
      }
    });
    if (minTcoCar && minTco !== null) {
      items.push({
        key: 'lowest-tco',
        text: `${t('compareLowestTco')}: ${shortTitle(minTcoCar.Title)} · ${formatUSD(minTco)}`,
      });
    }

    return items;
  }, [compareCars, costsByUrl, tcoByUrl, t]);

  // Build the spec rows for the comparison table.
  const rows = useMemo(() => {
    const priceValues = compareCars.map((car) => Number(car.Price) || 0);
    const turnkeyValues = compareCars.map((car) => costsByUrl.get(car.URL)?.turnkeyUSD || 0);
    const marchamoValues = compareCars.map((car) => costsByUrl.get(car.URL)?.marchamoCRC || 0);
    const energyValues = compareCars.map((car) => tcoByUrl.get(car.URL)?.energy3YrUSD || 0);
    const tcoValues = compareCars.map((car) => tcoByUrl.get(car.URL)?.netTco3YrUSD || 0);
    const yearValues = compareCars.map((car) => Number(car.Year) || 0);
    const kmValues = compareCars.map((car) => Number(car.Kilometraje) || 0);
    const deals = compareCars.map((car) => getMarketDeal(car));

    const lowestPositive = (values) => {
      const positives = values.filter((value) => value > 0);
      return positives.length ? Math.min(...positives) : null;
    };

    const priceMin = lowestPositive(priceValues);
    const priceDiff = new Set(priceValues).size > 1;
    const turnkeyMin = lowestPositive(turnkeyValues);
    const turnkeyDiff = new Set(turnkeyValues).size > 1;
    const marchamoMin = lowestPositive(marchamoValues);
    const marchamoDiff = new Set(marchamoValues).size > 1;
    const energyMin = lowestPositive(energyValues);
    const energyDiff = new Set(energyValues).size > 1;
    const tcoMin = lowestPositive(tcoValues);
    const tcoDiff = new Set(tcoValues).size > 1;
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
      label: t('priceLabel'),
      always: true,
      render: (car) => {
        const value = Number(car.Price) || 0;
        const best = value > 0 && priceDiff && value === priceMin;
        return (
          <span className="compare-price-cell">
            <span className={best ? 'compare-cell-best' : undefined}>{formatUSD(car.Price)}</span>
            <PriceDropBadge car={car} variant="compact" />
          </span>
        );
      },
    });

    // 2. Market deal
    out.push({
      key: 'market',
      label: t('compareMarketDeal'),
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

    // 2b. Estimated Turnkey & Marchamo
    out.push({
      key: 'turnkey',
      label: t('compareRowTurnkey'),
      always: true,
      render: (car) => {
        const c = costsByUrl.get(car.URL);
        if (!c || c.turnkeyUSD <= 0) return <span>—</span>;
        const best = turnkeyDiff && c.turnkeyUSD === turnkeyMin;
        return (
          <span className="compare-cost-cell">
            <span className={best ? 'compare-cell-best' : undefined}>~{formatUSD(c.turnkeyUSD)}</span>
            <span className="compare-cost-sub">{formatCRC(c.turnkeyCRC)}</span>
          </span>
        );
      },
    });

    out.push({
      key: 'marchamo',
      label: t('compareRowMarchamo'),
      diff: marchamoDiff,
      render: (car) => {
        const c = costsByUrl.get(car.URL);
        if (!c || c.marchamoCRC <= 0) return <span>—</span>;
        const best = marchamoDiff && c.marchamoCRC === marchamoMin;
        return (
          <span className="compare-cost-cell">
            <span className={best ? 'compare-cell-best' : undefined}>~{formatCRC(c.marchamoCRC)}</span>
            <span className="compare-cost-sub">~{formatUSD(c.marchamoUSD)}</span>
          </span>
        );
      },
    });

    out.push({
      key: 'energy-3yr',
      label: t('compareRowEnergy3Yr', { km: monthlyKm }),
      diff: energyDiff,
      render: (car) => {
        const e = tcoByUrl.get(car.URL);
        if (!e || e.energy3YrUSD <= 0) return <span>—</span>;
        const best = energyDiff && e.energy3YrUSD === energyMin;
        return (
          <span className="compare-cost-cell">
            <span className={best ? 'compare-cell-best' : undefined}>~{formatUSD(e.energy3YrUSD)}</span>
            <span className="compare-cost-sub">{e.consumption.value} {e.consumption.unit}</span>
          </span>
        );
      },
    });

    out.push({
      key: 'tco-3yr',
      label: t('compareRowTco3Yr'),
      always: true,
      diff: tcoDiff,
      render: (car) => {
        const e = tcoByUrl.get(car.URL);
        if (!e || e.netTco3YrUSD <= 0) return <span>—</span>;
        const best = tcoDiff && e.netTco3YrUSD === tcoMin;
        return (
          <span className="compare-cost-cell">
            <span className={best ? 'compare-cell-best' : undefined}>~{formatUSD(e.netTco3YrUSD)}</span>
            <span className="compare-cost-sub">{t('tcoPerMonth', { usd: formatUSD(e.netMonthlyTcoUSD) })}</span>
          </span>
        );
      },
    });

    // 3. Year
    out.push({
      key: 'year',
      label: t('year'),
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
      label: t('mileageLabel'),
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
    out.push(simpleRow('transmission', t('transmission'), (car) => car.Transmision || ''));
    out.push(simpleRow('fuel', t('fuelType'), (car) => [car.Combustible, car.Cilindrada].filter(Boolean).join(' · ')));
    out.push(simpleRow('style', t('specBodyStyle'), (car) => car.Estilo || ''));
    out.push(simpleRow('province', t('province'), (car) => car.Provincia || ''));
    out.push(simpleRow('negotiable', t('specNegotiableTrades'), (car) => [car.PrecioNegociable, car.SeRecibe].filter((value) => value && value !== '-').join(' · ')));

    out.push({
      key: 'seller',
      label: t('compareRowSeller'),
      diff: true,
      render: (car) => {
        const name = car.SellerName && String(car.SellerName).trim() !== '-' ? String(car.SellerName).trim() : '';
        const count = Number(car.SellerActiveCount) || 0;
        if (!name && !count) return <span>—</span>;
        return (
          <span className="compare-cost-cell">
            <span>{name || '—'}</span>
            {count >= 2 && <span className="compare-cost-sub">{t('compareSellerActive', { count })}</span>}
          </span>
        );
      },
    });

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
  }, [compareCars, equipmentKeys, costsByUrl, tcoByUrl, monthlyKm, t]);

  const handleCopyShareLink = () => {
    if (!shareCompareUrl) return;
    const copyPromise = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(shareCompareUrl)
      : Promise.reject();
    copyPromise
      .then(() => {
        setCopiedLink(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
      })
      .catch(() => {
        window.prompt(t('compareCopyLink'), shareCompareUrl);
      });
  };

  const compareWaShareHref = useMemo(
    () => buildComparisonWhatsAppLink(compareCars, shareCompareUrl, language),
    [compareCars, shareCompareUrl, language]
  );

  const visibleRows = onlyDiffs ? rows.filter((row) => row.always || row.diff) : rows;

  if (compareCars.length === 0) return null;

  return (
    <>
      <div
        className="compare-tray"
        role="region"
        aria-label={t('compareAriaLabel')}
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
                aria-label={t('removeFromComparator')}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="compare-tray-count">{compareCars.length}/{maxCars}</div>

        {compareCars.length === 1 ? (
          <div className="compare-tray-hint">
            {t('comparePickOneMore')}
          </div>
        ) : null}

        <div className="compare-tray-actions">
          <button
            className="btn-compare-open"
            type="button"
            disabled={compareCars.length < 2}
            onClick={() => setIsCompareOpen(true)}
          >
            {t('compareButtonCount', { count: compareCars.length })}
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
            {t('clear')}
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
                {t('compareModalTitle')}
              </h3>
              <div className="compare-header-actions">
                <div className="compare-usage-switcher" role="group" aria-label={t('compareUsageLabel')}>
                  <span className="compare-usage-label">{t('compareUsageLabel')}:</span>
                  {COMPARE_KM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`compare-usage-btn ${monthlyKm === preset ? 'active' : ''}`.trim()}
                      aria-pressed={monthlyKm === preset}
                      onClick={() => handleSelectMonthlyKm(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <button
                  className={`compare-diff-toggle ${onlyDiffs ? 'active' : ''}`.trim()}
                  type="button"
                  aria-pressed={onlyDiffs}
                  onClick={() => setOnlyDiffs((value) => !value)}
                >
                  {t('compareOnlyDiffs')}
                </button>
                <button
                  className="btn-compare-share"
                  type="button"
                  onClick={handleCopyShareLink}
                >
                  {copiedLink ? t('compareLinkCopied') : `🔗 ${t('compareCopyLink')}`}
                </button>
                {compareWaShareHref && (
                  <a
                    className="btn-compare-wa-share"
                    href={compareWaShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon size={14} color="currentColor" />
                    <span>{t('compareShareWhatsApp')}</span>
                  </a>
                )}
                <button
                  className="btn-compare-copilot"
                  type="button"
                  onClick={() => {
                    setIsCompareOpen(false);
                    onAnalyzeWithCopilot && onAnalyzeWithCopilot(compareCars);
                  }}
                >
                  {t('compareAskCopilot')}
                </button>
              </div>
              <button
                className="compare-modal-close"
                type="button"
                onClick={() => setIsCompareOpen(false)}
                aria-label={t('close')}
              >
                ×
              </button>
            </div>

            {verdictItems.length > 0 && (
              <div className="compare-verdict-banner">
                <span className="compare-verdict-title">⚖️ {t('compareVerdictTitle')}:</span>
                <div className="compare-verdict-pills">
                  {verdictItems.map((item) => (
                    <span key={item.key} className="compare-verdict-pill">{item.text}</span>
                  ))}
                </div>
              </div>
            )}

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
                            aria-label={t('removeFromComparator')}
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
