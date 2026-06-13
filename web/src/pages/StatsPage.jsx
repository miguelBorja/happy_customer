import React, { useState, useEffect } from 'react';
import { fetchDetailedStats } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

function StatsPage() {
  const { language, t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'factors', 'boost'
  const [boostSort, setBoostSort] = useState('boost'); // 'boost', 'usage'

  useEffect(() => {
    setLoading(true);
    fetchDetailedStats()
      .then(setData)
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Failed to load statistics');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1.5rem' }}>
        <div className="loader" style={{ width: '48px', height: '48px', borderWidth: '4px' }}></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('statsLoading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
        <h3>⚠️ {language === 'es' ? 'Error al cargar las estadísticas' : 'Failed to load statistics'}</h3>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>{error || 'No data returned'}</p>
      </div>
    );
  }

  // Helper to calculate total active/sold
  const totalInventory = data.brandStats.reduce((sum, item) => sum + item.total, 0);
  const totalSold = data.brandStats.reduce((sum, item) => sum + item.sold, 0);
  const overallSoldRate = totalInventory > 0 ? (totalSold / totalInventory) * 100 : 0;

  // Render Sub Tabs Selector
  const renderTabSelector = () => (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      borderBottom: '1px solid var(--border)',
      paddingBottom: '1rem',
      marginBottom: '2rem',
      overflowX: 'auto',
      whiteSpace: 'nowrap'
    }}>
      <button
        onClick={() => setActiveSubTab('overview')}
        style={{
          background: activeSubTab === 'overview' ? 'var(--bg-hover)' : 'none',
          border: 'none',
          color: activeSubTab === 'overview' ? 'var(--text-main)' : 'var(--text-muted)',
          padding: '0.6rem 1.25rem',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'var(--transition)',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        📊 {t('statsTabOverview')}
      </button>
      <button
        onClick={() => setActiveSubTab('factors')}
        style={{
          background: activeSubTab === 'factors' ? 'var(--bg-hover)' : 'none',
          border: 'none',
          color: activeSubTab === 'factors' ? 'var(--text-main)' : 'var(--text-muted)',
          padding: '0.6rem 1.25rem',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'var(--transition)',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        ⚡ {t('statsTabFactors')}
      </button>
      <button
        onClick={() => setActiveSubTab('boost')}
        style={{
          background: activeSubTab === 'boost' ? 'var(--bg-hover)' : 'none',
          border: 'none',
          color: activeSubTab === 'boost' ? 'var(--text-main)' : 'var(--text-muted)',
          padding: '0.6rem 1.25rem',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'var(--transition)',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        📈 {t('statsTabBoost')}
      </button>
    </div>
  );

  // Layout 1: Summary Cards
  const renderSummaryCards = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1.5rem',
      marginBottom: '2.5rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.7))',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '1.75rem',
        boxShadow: 'var(--shadow)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '5rem', opacity: 0.04 }}>📋</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
          {t('statsTotalInventory')}
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.5rem' }}>
          {totalInventory.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {language === 'es' ? 'Autos registrados' : 'Vehicles scraped'}
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 23, 42, 0.7))',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '16px',
        padding: '1.75rem',
        boxShadow: 'var(--shadow)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '5rem', opacity: 0.04 }}>🤝</div>
        <div style={{ fontSize: '0.875rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
          {language === 'es' ? 'Autos Vendidos' : 'Vehicles Sold'}
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981', marginTop: '0.5rem' }}>
          {totalSold.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {language === 'es' ? 'Confirmados como vendidos' : 'Marked as sold'}
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(15, 23, 42, 0.7))',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '16px',
        padding: '1.75rem',
        boxShadow: 'var(--shadow)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10px', bottom: '-20px', fontSize: '5rem', opacity: 0.04 }}>📈</div>
        <div style={{ fontSize: '0.875rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
          {t('statsSoldRate')}
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.5rem' }}>
          {overallSoldRate.toFixed(1)}%
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {language === 'es' ? 'Tasa general de conversión' : 'Overall conversion rate'}
        </div>
      </div>
    </div>
  );

  // Tab Content 1: OVERVIEW
  const renderOverviewTab = () => {
    // Top 8 Brands
    const topBrands = data.brandStats.slice(0, 8);
    // Top 8 Models
    const topModels = data.modelStats.slice(0, 8);
    // Year trend: filter out year=0, limit to top 12 years for clean layout
    const yearTrend = data.yearStats
      .filter((y) => y.year > 2000 && y.year <= new Date().getFullYear() + 1)
      .slice(0, 12)
      .reverse();

    // Max count for scale
    const maxBrandTotal = topBrands[0]?.total || 1;
    const maxModelTotal = topModels[0]?.total || 1;

    // SVG Year Chart Setup
    const chartHeight = 220;
    const chartWidth = 700;
    const maxYearTotal = Math.max(...yearTrend.map((y) => y.total), 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        {/* Year Trend SVG Graph */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '2rem 1.5rem',
          boxShadow: 'var(--shadow)'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📅 {t('statsYearTrend')}
          </h3>

          {yearTrend.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>{t('statsNoData')}</div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <div style={{ minWidth: '600px', padding: '0.5rem 0' }}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                    const yPos = chartHeight - 40 - p * (chartHeight - 70);
                    return (
                      <g key={i}>
                        <line
                          x1="40"
                          y1={yPos}
                          x2={chartWidth - 20}
                          y2={yPos}
                          stroke="rgba(255, 255, 255, 0.05)"
                          strokeWidth="1"
                        />
                        <text
                          x="10"
                          y={yPos + 4}
                          fill="var(--text-muted)"
                          fontSize="10"
                          textAnchor="start"
                        >
                          {Math.round(p * maxYearTotal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Render Columns */}
                  {yearTrend.map((item, idx) => {
                    const colWidth = (chartWidth - 80) / yearTrend.length;
                    const spacing = colWidth * 0.25;
                    const x = 50 + idx * colWidth;
                    const h = (item.total / maxYearTotal) * (chartHeight - 70);
                    const y = chartHeight - 40 - h;

                    // Sold part height
                    const hSold = (item.sold / maxYearTotal) * (chartHeight - 70);
                    const ySold = chartHeight - 40 - hSold;

                    return (
                      <g key={item.year} className="bar-group">
                        {/* Tooltip hint trigger */}
                        <title>{`${item.year}: ${item.total} total, ${item.sold} sold (${(item.soldRate * 100).toFixed(1)}%)`}</title>

                        {/* Active/Unsold portion (total height background) */}
                        <rect
                          x={x + spacing / 2}
                          y={y}
                          width={colWidth - spacing}
                          height={h}
                          fill="rgba(59, 130, 246, 0.15)"
                          rx="4"
                          stroke="rgba(59, 130, 246, 0.3)"
                          strokeWidth="1"
                        />

                        {/* Sold portion */}
                        <rect
                          x={x + spacing / 2}
                          y={ySold}
                          width={colWidth - spacing}
                          height={hSold}
                          fill="var(--success)"
                          fillOpacity="0.8"
                          rx="4"
                        />

                        {/* Text: Total Count */}
                        <text
                          x={x + colWidth / 2}
                          y={y - 8}
                          textAnchor="middle"
                          fill="var(--text-main)"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {item.total}
                        </text>

                        {/* Text: Year Label */}
                        <text
                          x={x + colWidth / 2}
                          y={chartHeight - 15}
                          textAnchor="middle"
                          fill="var(--text-muted)"
                          fontSize="11"
                          fontWeight="500"
                        >
                          {item.year}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1.25rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(59, 130, 246, 0.25)', border: '1px solid rgba(59, 130, 246, 0.5)' }}></span>
                  <span style={{ color: 'var(--text-muted)' }}>{language === 'es' ? 'Disponibles' : 'Active'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--success)' }}></span>
                  <span style={{ color: 'var(--text-muted)' }}>{language === 'es' ? 'Vendidos (Volumen)' : 'Sold (Volume)'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dual Grid: Top Brands & Top Models */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2rem'
        }}>
          {/* Top Brands Card */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '2rem 1.5rem',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🏷️ {t('statsTopBrands')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {topBrands.map((item) => {
                const percentageOfMax = (item.total / maxBrandTotal) * 100;
                const soldPercentage = item.total > 0 ? (item.sold / item.total) * 100 : 0;

                return (
                  <div key={item.brand} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-main)' }}>{item.brand.toUpperCase()}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: '#10b981' }}>{item.sold}</span> / <span style={{ fontWeight: 'normal' }}>{item.total}</span>
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--accent)' }}>
                          ({soldPercentage.toFixed(0)}% sold)
                        </span>
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div style={{
                      width: '100%',
                      height: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '5px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: `${percentageOfMax}%`,
                        height: '100%',
                        background: 'linear-gradient(to right, var(--accent), #60a5fa)',
                        borderRadius: '5px',
                        transition: 'width 0.8s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Models Card */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '2rem 1.5rem',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🚗 {t('statsTopModels')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {topModels.map((item) => {
                const percentageOfMax = (item.total / maxModelTotal) * 100;
                const soldPercentage = item.total > 0 ? (item.sold / item.total) * 100 : 0;

                return (
                  <div key={`${item.brand}-${item.model}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-main)' }}>
                        {item.brand.toUpperCase()} <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.model}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: '#10b981' }}>{item.sold}</span> / <span style={{ fontWeight: 'normal' }}>{item.total}</span>
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--accent)' }}>
                          ({soldPercentage.toFixed(0)}% sold)
                        </span>
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div style={{
                      width: '100%',
                      height: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '5px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: `${percentageOfMax}%`,
                        height: '100%',
                        background: 'linear-gradient(to right, #a78bfa, #8b5cf6)',
                        borderRadius: '5px',
                        transition: 'width 0.8s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Tab Content 2: SALES FACTORS (Transmission, Fuel, Style)
  const renderFactorsTab = () => {
    const listFactor = (title, icon, stats) => (
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        padding: '2rem 1.5rem',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        flex: '1 1 300px'
      }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.75rem' }}>
          {icon} {title}
        </h3>

        {stats.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>{t('statsNoData')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {stats.map((item) => {
              const nameText = t(item.name.toLowerCase()) || item.name;
              const ratePct = item.soldRate * 100;
              
              // Color helper based on sold probability rate
              let progressColor = 'var(--accent)';
              if (ratePct >= 40) progressColor = 'var(--success)';
              else if (ratePct < 20) progressColor = 'var(--danger)';

              return (
                <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{nameText}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {item.sold} / {item.total} {language === 'es' ? 'vendidos' : 'sold'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Bar */}
                    <div style={{
                      flex: 1,
                      height: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${ratePct}%`,
                        height: '100%',
                        backgroundColor: progressColor,
                        borderRadius: '4px',
                        transition: 'width 0.6s ease'
                      }} />
                    </div>
                    {/* Rate Indicator */}
                    <span style={{
                      minWidth: '45px',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: progressColor
                    }}>
                      {ratePct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Row 1: Transmission & Fuel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
          {listFactor(t('statsTransmissionTitle'), '⚙️', data.transmissionStats)}
          {listFactor(t('statsFuelTitle'), '⛽', data.fuelStats)}
        </div>

        {/* Row 2: Age, Mileage, and Price Relative */}
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', color: '#60a5fa' }}>
            🔢 {t('statsNumericalFactors')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
            {listFactor(t('statsAgeTitle'), '📅', data.ageStats)}
            {listFactor(t('statsMileageTitle'), '🛣️', data.mileageStats)}
            {listFactor(t('statsPriceRelTitle'), '💲', data.priceRelStats)}
          </div>
        </div>

        {/* Row 3: Styles */}
        <div style={{ display: 'flex' }}>
          {listFactor(t('statsStyleTitle'), '🚙', data.styleStats.slice(0, 10))}
        </div>
      </div>
    );
  };

  // Tab Content 3: EQUIPMENT BOOST
  const renderEquipmentBoostTab = () => {
    // Sort equipment stats based on user toggle
    const sortedEquip = [...data.equipmentStats].sort((a, b) => {
      if (boostSort === 'boost') {
        return b.difference - a.difference;
      } else {
        // Sort by total usage (frequency)
        return b.totalWith - a.totalWith;
      }
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Explanation Alert banner */}
        <div style={{
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <h4 style={{ color: '#60a5fa', margin: 0, fontWeight: 700, fontSize: '1rem' }}>
            {t('statsExplainTitle')}
          </h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            {t('statsExplainText')}
          </p>
        </div>

        {/* Sorting Controller */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'rgba(255, 255, 255, 0.02)',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          border: '1px solid var(--border)'
        }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            📊 {t('statsEquipmentTitle')}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {language === 'es' ? 'Ordenar por:' : 'Sort by:'}
            </span>
            <button
              onClick={() => setBoostSort('boost')}
              style={{
                background: boostSort === 'boost' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                transition: 'var(--transition)'
              }}
            >
              📈 Boost
            </button>
            <button
              onClick={() => setBoostSort('usage')}
              style={{
                background: boostSort === 'usage' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                transition: 'var(--transition)'
              }}
            >
              🏷️ {language === 'es' ? 'Uso/Frecuencia' : 'Usage Frequency'}
            </button>
          </div>
        </div>

        {/* Equipment Boost Analytical Data Table */}
        <div className="table-container" style={{ marginTop: '0.5rem', boxShadow: 'var(--shadow)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem' }}>
                  {t('statsTableFeature')}
                </th>
                <th style={{ textAlign: 'center', padding: '1.25rem 1.5rem' }}>
                  {t('statsTableBase')}
                </th>
                <th style={{ textAlign: 'center', padding: '1.25rem 1.5rem' }}>
                  {t('statsTableWithOption')}
                </th>
                <th 
                  className="sortable"
                  onClick={() => setBoostSort('boost')}
                  style={{ 
                    textAlign: 'center', 
                    padding: '1.25rem 1.5rem',
                    color: boostSort === 'boost' ? 'var(--success)' : 'var(--text-muted)',
                    fontWeight: boostSort === 'boost' ? 700 : 600
                  }}
                >
                  {t('statsTableBoost')}{boostSort === 'boost' ? ' ↑' : ''}
                </th>
                <th 
                  className="sortable"
                  onClick={() => setBoostSort('usage')}
                  style={{ 
                    textAlign: 'right', 
                    padding: '1.25rem 1.5rem',
                    color: boostSort === 'usage' ? 'var(--success)' : 'var(--text-muted)',
                    fontWeight: boostSort === 'usage' ? 700 : 600
                  }}
                >
                  {t('statsTableSample')}{boostSort === 'usage' ? ' ↑' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEquip.map((item) => {
                const boostPct = item.difference * 100;
                const hasRatePct = item.hasFeatureSoldRate * 100;
                const noRatePct = item.noFeatureSoldRate * 100;
                
                const isPositive = boostPct > 0;
                const isNegative = boostPct < 0;

                // Define colors
                let boostColor = 'var(--text-muted)';
                if (isPositive) {
                  boostColor = 'var(--success)';
                } else if (isNegative) {
                  boostColor = 'var(--danger)';
                }

                return (
                  <tr key={item.featureName}>
                    <td style={{ textAlign: 'left', padding: '1.25rem 1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {t(item.featureName) || item.featureName}
                    </td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1.5rem', fontWeight: 500 }}>
                      {noRatePct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1.5rem', fontWeight: 500 }}>
                      {hasRatePct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1.5rem', fontWeight: 800, color: boostColor }}>
                      {boostPct >= 0 ? '+' : ''}{boostPct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'right', padding: '1.25rem 1.5rem' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                        <span>{t('statsTableCon')}: <strong style={{ color: 'var(--text-main)' }}>{item.totalWith.toLocaleString()}</strong></span>
                        <span>{t('statsTableSin')}: <strong style={{ color: 'var(--text-muted)' }}>{item.totalWithout.toLocaleString()}</strong></span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="stats-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 0 3rem' }}>
      {/* Header section */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 800,
          background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          marginBottom: '0.5rem'
        }}>
          {t('statsTitle')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.975rem' }}>
          {t('statsSubtitle')}
        </p>
      </div>

      {/* Summary numeric counters */}
      {renderSummaryCards()}

      {/* Page Tabs */}
      {renderTabSelector()}

      {/* Render selected Sub-tab */}
      {activeSubTab === 'overview' && renderOverviewTab()}
      {activeSubTab === 'factors' && renderFactorsTab()}
      {activeSubTab === 'boost' && renderEquipmentBoostTab()}
    </div>
  );
}

export default StatsPage;
