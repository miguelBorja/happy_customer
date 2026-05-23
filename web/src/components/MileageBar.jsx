import React from 'react';

const MAX_KM = 150000;

const MileageBar = ({ km }) => {
  if (!km || km <= 0) return null;
  
  const pct = Math.min((km / MAX_KM) * 100, 100);
  
  // Green → Yellow → Red gradient based on percentage
  let color;
  if (pct <= 33) {
    color = '#10b981'; // green
  } else if (pct <= 66) {
    color = '#f59e0b'; // amber
  } else {
    color = '#ef4444'; // red
  }

  return (
    <div className="mileage-bar" title={`${km.toLocaleString()} / ${MAX_KM.toLocaleString()} km`}>
      <div className="mileage-bar-track">
        <div
          className="mileage-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

export default MileageBar;
