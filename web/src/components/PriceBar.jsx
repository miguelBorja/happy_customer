import React from 'react';

const DEFAULT_MAX_PRICE = 100000;

const PriceBar = ({ price, maxPrice }) => {
  if (!price || price <= 0) return null;
  
  const limit = maxPrice && maxPrice > 0 ? maxPrice : DEFAULT_MAX_PRICE;
  const pct = Math.min((price / limit) * 100, 100);
  
  // Green → Yellow → Red gradient based on percentage
  let color;
  if (pct <= 33) {
    color = '#10b981'; // green – great deal
  } else if (pct <= 66) {
    color = '#f59e0b'; // amber – moderate
  } else {
    color = '#ef4444'; // red – expensive
  }

  return (
    <div className="price-bar" title={`$${price.toLocaleString()} / $${limit.toLocaleString()}`}>
      <div className="price-bar-track">
        <div
          className="price-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

export default PriceBar;
