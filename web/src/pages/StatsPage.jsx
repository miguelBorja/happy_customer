import { useState, useEffect } from 'react';
import { fetchDetailedStats } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

function StatsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'factors', 'boost'
  const [boostSort, setBoostSort] = useState('boost'); // 'boost', 'usage'

  useEffect(() => {
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
      <div className="stats-loading">
        <div className="loader stats-loading-spinner"></div>
        <p className="stats-loading-text">{t('statsLoading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="stats-error">
        <h3>⚠️ {t('statsLoadError')}</h3>
        <p className="stats-error-msg">{error || 'No data returned'}</p>
      </div>
    );
  }

  // Helper to calculate total active/sold
  const totalInventory = data.brandStats.reduce((sum, item) => sum + item.total, 0);
  const totalSold = data.brandStats.reduce((sum, item) => sum + item.sold, 0);
  const overallSoldRate = totalInventory > 0 ? (totalSold / totalInventory) * 100 : 0;

  // Render Sub Tabs Selector
  const renderTabSelector = () => (
    <div className="stats-subtabs">
      <button
        onClick={() => setActiveSubTab('overview')}
        className={`stats-subtab${activeSubTab === 'overview' ? ' active' : ''}`}
      >
        📊 {t('statsTabOverview')}
      </button>
      <button
        onClick={() => setActiveSubTab('factors')}
        className={`stats-subtab${activeSubTab === 'factors' ? ' active' : ''}`}
      >
        ⚡ {t('statsTabFactors')}
      </button>
      <button
        onClick={() => setActiveSubTab('boost')}
        className={`stats-subtab${activeSubTab === 'boost' ? ' active' : ''}`}
      >
        📈 {t('statsTabBoost')}
      </button>
    </div>
  );

  // Layout 1: Summary Cards
  const renderSummaryCards = () => (
    <div className="stats-kpi-grid">
      <div className="stats-kpi-card stats-kpi-card--inventory">
        <div className="stats-kpi-watermark">📋</div>
        <div className="stats-kpi-label">
          {t('statsTotalInventory')}
        </div>
        <div className="stats-kpi-number">
          {totalInventory.toLocaleString()}
        </div>
        <div className="stats-kpi-desc">
          {t('statsVehiclesScraped')}
        </div>
      </div>

      <div className="stats-kpi-card stats-kpi-card--sold">
        <div className="stats-kpi-watermark">🤝</div>
        <div className="stats-kpi-label">
          {t('statsVehiclesSold')}
        </div>
        <div className="stats-kpi-number">
          {totalSold.toLocaleString()}
        </div>
        <div className="stats-kpi-desc">
          {t('statsMarkedAsSold')}
        </div>
      </div>

      <div className="stats-kpi-card stats-kpi-card--rate">
        <div className="stats-kpi-watermark">📈</div>
        <div className="stats-kpi-label">
          {t('statsSoldRate')}
        </div>
        <div className="stats-kpi-number">
          {overallSoldRate.toFixed(1)}%
        </div>
        <div className="stats-kpi-desc">
          {t('statsConversionRate')}
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
      <div className="stats-overview-stack">
        {/* Year Trend SVG Graph */}
        <div className="stats-chart-card">
          <h3 className="stats-card-title stats-chart-title">
            📅 {t('statsYearTrend')}
          </h3>

          {yearTrend.length === 0 ? (
            <div className="stats-no-data">{t('statsNoData')}</div>
          ) : (
            <div className="stats-chart-scroll">
              <div className="stats-chart-inner">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="stats-chart-svg">
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
              <div className="stats-chart-legend">
                <div className="stats-legend-item">
                  <span className="stats-legend-box stats-legend-box--active"></span>
                  <span className="stats-legend-text">{t('statsAvailableLegend')}</span>
                </div>
                <div className="stats-legend-item">
                  <span className="stats-legend-box stats-legend-box--sold"></span>
                  <span className="stats-legend-text">{t('statsSoldVolumeLegend')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dual Grid: Top Brands & Top Models */}
        <div className="stats-columns-grid">
          {/* Top Brands Card */}
          <div className="stats-column-card">
            <h3 className="stats-card-title">
              🏷️ {t('statsTopBrands')}
            </h3>

            <div className="stats-rows-list">
              {topBrands.map((item) => {
                const percentageOfMax = (item.total / maxBrandTotal) * 100;
                const soldPercentage = item.total > 0 ? (item.sold / item.total) * 100 : 0;

                return (
                  <div key={item.brand} className="stats-row-item">
                    <div className="stats-row-header">
                      <span className="stats-row-name">{item.brand.toUpperCase()}</span>
                      <span className="stats-row-counts">
                        <span className="stats-row-sold">{item.sold}</span> / <span className="stats-row-total">{item.total}</span>
                        <span className="stats-row-pct">
                          ({soldPercentage.toFixed(0)}% sold)
                        </span>
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="stats-bar-track">
                      <div
                        className="stats-bar-fill stats-bar-fill--brand"
                        style={{ width: `${percentageOfMax}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Models Card */}
          <div className="stats-column-card">
            <h3 className="stats-card-title">
              🚗 {t('statsTopModels')}
            </h3>

            <div className="stats-rows-list">
              {topModels.map((item) => {
                const percentageOfMax = (item.total / maxModelTotal) * 100;
                const soldPercentage = item.total > 0 ? (item.sold / item.total) * 100 : 0;

                return (
                  <div key={`${item.brand}-${item.model}`} className="stats-row-item">
                    <div className="stats-row-header">
                      <span className="stats-row-name">
                        {item.brand.toUpperCase()} <span className="stats-row-model">{item.model}</span>
                      </span>
                      <span className="stats-row-counts">
                        <span className="stats-row-sold">{item.sold}</span> / <span className="stats-row-total">{item.total}</span>
                        <span className="stats-row-pct">
                          ({soldPercentage.toFixed(0)}% sold)
                        </span>
                      </span>
                    </div>
                    {/* Visual Bar */}
                    <div className="stats-bar-track">
                      <div
                        className="stats-bar-fill stats-bar-fill--model"
                        style={{ width: `${percentageOfMax}%` }}
                      />
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
      <div className="stats-factor-card">
        <h3 className="stats-factor-title">
          {icon} {title}
        </h3>

        {stats.length === 0 ? (
          <div className="stats-no-data stats-no-data--compact">{t('statsNoData')}</div>
        ) : (
          <div className="stats-factor-list">
            {stats.map((item) => {
              const nameText = t(item.name.toLowerCase()) || item.name;
              const ratePct = item.soldRate * 100;

              // Color helper based on sold probability rate
              let progressColor = 'var(--accent)';
              if (ratePct >= 40) progressColor = 'var(--success)';
              else if (ratePct < 20) progressColor = 'var(--danger)';

              return (
                <div key={item.name} className="stats-factor-item">
                  <div className="stats-factor-item-header">
                    <span className="stats-factor-item-name">{nameText}</span>
                    <span className="stats-factor-item-ratio">
                      {t('statsSoldRatio', { sold: item.sold, total: item.total })}
                    </span>
                  </div>

                  <div className="stats-factor-bar-row">
                    {/* Bar */}
                    <div className="stats-factor-track">
                      <div
                        className="stats-factor-fill"
                        style={{ width: `${ratePct}%`, backgroundColor: progressColor }}
                      />
                    </div>
                    {/* Rate Indicator */}
                    <span className="stats-factor-rate" style={{ color: progressColor }}>
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
      <div className="stats-factors-container">
        {/* Row 1: Transmission & Fuel */}
        <div className="stats-factors-row">
          {listFactor(t('statsTransmissionTitle'), '⚙️', data.transmissionStats)}
          {listFactor(t('statsFuelTitle'), '⛽', data.fuelStats)}
        </div>

        {/* Row 2: Age, Mileage, and Price Relative */}
        <div>
          <h3 className="stats-numerical-heading">
            🔢 {t('statsNumericalFactors')}
          </h3>
          <div className="stats-factors-row">
            {listFactor(t('statsAgeTitle'), '📅', data.ageStats)}
            {listFactor(t('statsMileageTitle'), '🛣️', data.mileageStats)}
            {listFactor(t('statsPriceRelTitle'), '💲', data.priceRelStats)}
          </div>
        </div>

        {/* Row 3: Styles */}
        <div className="stats-factors-single-row">
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
      <div className="stats-boost-container">
        {/* Explanation Alert banner */}
        <div className="stats-boost-banner">
          <h4 className="stats-boost-banner-title">
            {t('statsExplainTitle')}
          </h4>
          <p className="stats-boost-banner-text">
            {t('statsExplainText')}
          </p>
        </div>

        {/* Sorting Controller */}
        <div className="stats-sort-toolbar">
          <span className="stats-sort-toolbar-title">
            📊 {t('statsEquipmentTitle')}
          </span>
          <div className="stats-sort-controls">
            <span className="stats-sort-label">
              {t('sortByColon')}
            </span>
            <button
              onClick={() => setBoostSort('boost')}
              className={`stats-sort-btn${boostSort === 'boost' ? ' active' : ''}`}
            >
              📈 Boost
            </button>
            <button
              onClick={() => setBoostSort('usage')}
              className={`stats-sort-btn${boostSort === 'usage' ? ' active' : ''}`}
            >
              {t('statsSortFrequency')}
            </button>
          </div>
        </div>

        {/* Equipment Boost Analytical Data Table */}
        <div className="table-container stats-boost-table-wrap">
          <table className="data-table stats-boost-table">
            <thead>
              <tr>
                <th className="stats-boost-th-left">
                  {t('statsTableFeature')}
                </th>
                <th className="stats-boost-th-center">
                  {t('statsTableBase')}
                </th>
                <th className="stats-boost-th-center">
                  {t('statsTableWithOption')}
                </th>
                <th
                  className={`sortable stats-boost-th-center stats-boost-th-sort${boostSort === 'boost' ? ' active' : ''}`}
                  onClick={() => setBoostSort('boost')}
                >
                  {t('statsTableBoost')}{boostSort === 'boost' ? ' ↑' : ''}
                </th>
                <th
                  className={`sortable stats-boost-th-right stats-boost-th-sort${boostSort === 'usage' ? ' active' : ''}`}
                  onClick={() => setBoostSort('usage')}
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
                    <td className="stats-boost-td-feature">
                      {t(item.featureName) || item.featureName}
                    </td>
                    <td className="stats-boost-td-center">
                      {noRatePct.toFixed(1)}%
                    </td>
                    <td className="stats-boost-td-center">
                      {hasRatePct.toFixed(1)}%
                    </td>
                    <td className="stats-boost-td-delta" style={{ color: boostColor }}>
                      {boostPct >= 0 ? '+' : ''}{boostPct.toFixed(1)}%
                    </td>
                    <td className="stats-boost-td-right">
                      <div className="stats-boost-sample">
                        <span>{t('statsTableCon')}: <strong className="stats-boost-sample-with">{item.totalWith.toLocaleString()}</strong></span>
                        <span>{t('statsTableSin')}: <strong className="stats-boost-sample-without">{item.totalWithout.toLocaleString()}</strong></span>
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
    <div className="stats-page">
      {/* Header section */}
      <div className="stats-page-header">
        <h1 className="stats-page-title">
          {t('statsTitle')}
        </h1>
        <p className="stats-page-subtitle">
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
