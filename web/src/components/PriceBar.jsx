import React from 'react';

const DEFAULT_MAX_PRICE = 100000;

const formatPrice = (price) => {
  if (price > 0) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  }
  return '';
};

const getDynamicColors = (percent) => {
  const hue = Math.max(0, Math.min(120, 120 - (percent * 1.2)));
  return {
    text: `hsl(${hue}, 85%, 48%)`,
    fill: `hsla(${hue}, 85%, 48%, 0.3)`,
    border: `hsla(${hue}, 85%, 48%, 0.25)`,
    bg: `hsla(${hue}, 85%, 48%, 0.03)`
  };
};

const PriceBar = ({ price, maxPrice, priceText }) => {
  const displayVal = price > 0 ? formatPrice(price) : priceText;
  if (!displayVal) return null;

  const limit = maxPrice && maxPrice > 0 ? maxPrice : DEFAULT_MAX_PRICE;
  const pct = price > 0 ? Math.min((price / limit) * 100, 100) : 0;
  const colors = getDynamicColors(pct);

  return (
    <div 
      title={`$${price?.toLocaleString() || 0} / $${limit.toLocaleString()}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '0.35rem 0.75rem',
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0
      }}
    >
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${pct}%`,
          background: colors.fill,
          zIndex: 1,
          transition: 'width 0.6s ease'
        }}
      />
      <span 
        style={{
          fontSize: '0.9rem',
          fontWeight: '800',
          color: colors.text,
          zIndex: 2,
          position: 'relative'
        }}
      >
        {displayVal}
      </span>
    </div>
  );
};

export default PriceBar;
