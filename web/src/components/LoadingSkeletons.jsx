export const ResultsSkeleton = ({ viewMode = 'cards', count = 6 }) => {
  if (viewMode === 'cards') {
    return (
      <div className="results-grid" aria-busy="true" aria-live="polite">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="car-card skeleton-card">
            <div className="skeleton-photo skeleton-shimmer" />
            <div className="car-card-body skeleton-card-body">
              <div className="skeleton-line skeleton-shimmer skeleton-title-line" />
              <div className="skeleton-pills-row">
                <div className="skeleton-pill skeleton-shimmer skeleton-pill--price" />
                <div className="skeleton-pill skeleton-shimmer skeleton-pill--km" />
              </div>
              <div className="skeleton-line skeleton-shimmer skeleton-line--sub" />
              <div className="skeleton-badges-row">
                <div className="skeleton-pill skeleton-shimmer skeleton-badge-md" />
                <div className="skeleton-pill skeleton-shimmer skeleton-badge-lg" />
                <div className="skeleton-pill skeleton-shimmer skeleton-badge-sm" />
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
                <div className="skeleton-circle skeleton-shimmer skeleton-fav-circle" />
              </td>
              <td>
                <div className="skeleton-rect skeleton-shimmer skeleton-thumb" />
              </td>
              <td>
                <div className="skeleton-line skeleton-shimmer skeleton-table-title" />
              </td>
              <td>
                <div className="skeleton-line skeleton-shimmer skeleton-table-year" />
              </td>
              <td>
                <div className="skeleton-pill skeleton-shimmer skeleton-table-pill-lg" />
              </td>
              <td>
                <div className="skeleton-pill skeleton-shimmer skeleton-table-pill-md" />
              </td>
              <td className="text-right">
                <div className="skeleton-pill skeleton-shimmer skeleton-table-action" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="top-car-mobile-list">
        {Array.from({ length: Math.min(count, 4) }, (_, i) => (
          <div key={i} className="top-car-mobile-card with-photo skeleton-card">
            <div className="skeleton-photo skeleton-shimmer skeleton-mobile-thumb" />
            <div className="car-card-body skeleton-mobile-body">
              <div className="skeleton-line skeleton-shimmer skeleton-mobile-title" />
              <div className="skeleton-line skeleton-shimmer skeleton-mobile-sub" />
              <div className="skeleton-mobile-pills">
                <div className="skeleton-pill skeleton-shimmer skeleton-mobile-pill-md" />
                <div className="skeleton-pill skeleton-shimmer skeleton-mobile-pill-sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
