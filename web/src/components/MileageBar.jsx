import React from 'react';

const MAX_KM = 150000;

const getDynamicColors = (percent) => {
  const hue = Math.max(0, Math.min(120, 120 - (percent * 1.2)));
  return {
    text: `hsl(${hue}, 85%, 48%)`,
    fill: `hsla(${hue}, 85%, 48%, 0.3)`,
    border: `hsla(${hue}, 85%, 48%, 0.25)`,
    bg: `hsla(${hue}, 85%, 48%, 0.03)`
  };
};

const MileageBar = ({ km, maxMileage }) => {
  const displayVal = km > 0 ? `${km.toLocaleString()} km` : 'N/A';
  
  const limit = maxMileage && maxMileage > 0 ? maxMileage : MAX_KM;
  const pct = km > 0 ? Math.min((km / limit) * 100, 100) : 0;
  const colors = getDynamicColors(pct);

  return (
    <div 
      title={`${km?.toLocaleString() || 0} / ${limit.toLocaleString()} km`}
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
          fontSize: '0.85rem',
          fontWeight: '700',
          color: colors.text,
          zIndex: 2,
          position: 'relative',
          whiteSpace: 'nowrap'
        }}
      >
        {displayVal}
      </span>
    </div>
  );
};

export default MileageBar;
