export const ResultsSkeleton = ({ viewMode = 'cards', count = 6 }) => {
  if (viewMode === 'cards') {
    return (
      <div className="results-grid" aria-busy="true" aria-live="polite">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="car-card skeleton-card">
            <div className="skeleton-photo skeleton-shimmer" />
            <div className="car-card-body" style={{ paddingTop: '1rem', gap: '0.75rem' }}>
              <div className="skeleton-line skeleton-shimmer" style={{ width: '78%', height: '1.2rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '96px', height: '32px' }} />
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '88px', height: '32px' }} />
              </div>
              <div className="skeleton-line skeleton-shimmer" style={{ width: '55%', height: '0.85rem' }} />
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '72px', height: '22px' }} />
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '84px', height: '22px' }} />
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '64px', height: '22px' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="table-container" aria-busy="true" aria-live="polite">
      <table className="data-table">
        <tbody>
          {Array.from({ length: count }, (_, i) => (
            <tr key={i} className="skeleton-row">
              <td>
                <div className="skeleton-circle skeleton-shimmer" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
              </td>
              <td>
                <div className="skeleton-rect skeleton-shimmer" style={{ width: '64px', height: '48px', borderRadius: '6px' }} />
              </td>
              <td>
                <div className="skeleton-line skeleton-shimmer" style={{ width: '70%', height: '0.9rem' }} />
              </td>
              <td>
                <div className="skeleton-line skeleton-shimmer" style={{ width: '42px', height: '0.9rem' }} />
              </td>
              <td>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '90px', height: '22px' }} />
              </td>
              <td>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '80px', height: '22px' }} />
              </td>
              <td className="text-right">
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '56px', height: '22px', marginLeft: 'auto' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="top-car-mobile-list">
        {Array.from({ length: Math.min(count, 4) }, (_, i) => (
          <div key={i} className="top-car-mobile-card with-photo skeleton-card">
            <div className="skeleton-photo skeleton-shimmer" style={{ width: '96px', height: '72px', borderRadius: '8px' }} />
            <div className="car-card-body" style={{ gap: '0.5rem', flex: 1 }}>
              <div className="skeleton-line skeleton-shimmer" style={{ width: '80%', height: '0.9rem' }} />
              <div className="skeleton-line skeleton-shimmer" style={{ width: '50%', height: '0.8rem' }} />
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '72px', height: '20px' }} />
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '64px', height: '20px' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
