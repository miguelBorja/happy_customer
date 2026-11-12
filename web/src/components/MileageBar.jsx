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
      className="car-pill"
      title={`${km?.toLocaleString() || 0} / ${limit.toLocaleString()} km`}
      style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
    >
      <div
        className="car-pill-fill"
        style={{ width: `${pct}%`, background: colors.fill }}
      />
      <span
        className="car-pill-text car-pill-text--mileage"
        style={{ color: colors.text }}
      >
        {displayVal}
      </span>
    </div>
  );
};

export default MileageBar;
