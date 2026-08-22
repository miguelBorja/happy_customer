import React from 'react';

/**
 * 1. Language Toggle: Flag icon (pole + wavy flag)
 */
export const FlagIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-flag ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M4 2.5C4 1.67 4.67 1 5.5 1S7 1.67 7 2.5V3.34C8.42 2.65 10.3 2.5 12.5 3.3C15.8 4.5 18.2 3.8 19.8 3.1C20.6 2.8 21.5 3.4 21.5 4.3V14.2C21.5 14.8 21 15.3 20.4 15.5C18.6 16.1 16.1 16.6 13.5 15.7C10.2 14.5 7.8 15.2 6.2 15.9V21.5C6.2 22.33 5.53 23 4.7 23C3.87 23 3.2 22.33 3.2 21.5V3.5C3.2 3.1 3.5 2.7 4 2.5Z" />
  </svg>
);

/**
 * 2. Favorites: Rounded Star Icon
 */
export const StarIcon = ({ size = 18, color = '#fbbf24', filled = true, className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? color : 'none'}
    stroke={color}
    strokeWidth={filled ? '0' : '2'}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`hc-icon hc-icon-star ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M12 2.5L14.9 8.6L21.6 9.5C22.2 9.6 22.5 10.4 22 10.9L17.1 15.6L18.3 22.2C18.4 22.8 17.8 23.3 17.2 23L12 20.2L6.8 23C6.2 23.3 5.6 22.8 5.7 22.2L6.9 15.6L2 10.9C1.5 10.4 1.8 9.6 2.4 9.5L9.1 8.6L12 2.5Z" />
  </svg>
);

/**
 * 3. Bargains: Price Tag Icon
 */
export const TagIcon = ({ size = 18, color = '#fbbf24', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-tag ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M21.4 11.6L12.4 2.6C11.6 1.8 10.6 1.4 9.5 1.4H4C2.6 1.4 1.4 2.6 1.4 4V9.5C1.4 10.6 1.8 11.6 2.6 12.4L11.6 21.4C12.4 22.2 13.6 22.6 14.8 22.6C16 22.6 17.2 22.2 18 21.4L21.4 18C23.1 16.3 23.1 13.3 21.4 11.6ZM6.5 8C5.4 8 4.5 7.1 4.5 6C4.5 4.9 5.4 4 6.5 4C7.6 4 8.5 4.9 8.5 6C8.5 7.1 7.6 8 6.5 8Z" />
  </svg>
);

/**
 * 4. Stats: 3-Bar Histogram / Chart
 */
export const StatsChartIcon = ({ size = 18, color = '#fbbf24', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-stats ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <rect x="2" y="13" width="5" height="9" rx="2.5" />
    <rect x="9.5" y="8" width="5" height="14" rx="2.5" />
    <rect x="17" y="3" width="5" height="19" rx="2.5" />
  </svg>
);

/**
 * 5. About: Solid Info Circle
 */
export const InfoCircleIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-info ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <circle cx="12" cy="12" r="11" />
    <path
      d="M12 7.25C12.7 7.25 13.25 6.7 13.25 6C13.25 5.3 12.7 4.75 12 4.75C11.3 4.75 10.75 5.3 10.75 6C10.75 6.7 11.3 7.25 12 7.25ZM13.5 17.5C13.5 18.3 12.8 19 12 19C11.2 19 10.5 18.3 10.5 17.5V10.5C10.5 9.7 11.2 9 12 9C12.8 9 13.5 9.7 13.5 10.5V17.5Z"
      fill="#0d1117"
    />
  </svg>
);

/**
 * 6. Search: Clean Magnifying Glass
 */
export const SearchIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`hc-icon hc-icon-search ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <circle cx="10.5" cy="10.5" r="7.5" />
    <line x1="16.2" y1="16.2" x2="21.5" y2="21.5" strokeWidth="3.2" />
  </svg>
);

/**
 * 7. Sort: Directional Dual Arrows
 */
export const SortIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-sort ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    {/* Up Arrow */}
    <path d="M7.5 3.2C8 2.6 8.9 2.6 9.4 3.2L12.8 7.2C13.4 7.9 12.9 9 12 9H9.7V17.5C9.7 18.3 9 19 8.2 19C7.4 19 6.7 18.3 6.7 17.5V9H4.4C3.5 9 3 7.9 3.6 7.2L7.5 3.2Z" />
    {/* Down Arrow */}
    <path d="M16.5 20.8C16 21.4 15.1 21.4 14.6 20.8L11.2 16.8C10.6 16.1 11.1 15 12 15H14.3V6.5C14.3 5.7 15 5 15.8 5C16.6 5 17.3 5.7 17.3 6.5V15H19.6C20.5 15 21 16.1 20.4 16.8L16.5 20.8Z" />
  </svg>
);

/**
 * 8. All Filters: Funnel Filter
 */
export const FilterFunnelIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-funnel ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M2.5 3.8C2.5 2.8 3.3 2 4.3 2H19.7C20.7 2 21.5 2.8 21.5 3.8C21.5 4.4 21.2 5 20.8 5.4L14.8 12.2V19.8C14.8 20.5 14.3 21.2 13.6 21.5L10.6 22.8C9.6 23.2 8.5 22.5 8.5 21.4V12.2L2.9 5.4C2.6 5 2.5 4.4 2.5 3.8Z" />
  </svg>
);

/**
 * 9. Cards View: 2x2 Grid
 */
export const CardsGridIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-cards ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <rect x="2" y="2" width="8.5" height="8.5" rx="2.5" />
    <rect x="13.5" y="2" width="8.5" height="8.5" rx="2.5" />
    <rect x="2" y="13.5" width="8.5" height="8.5" rx="2.5" />
    <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="2.5" />
  </svg>
);

/**
 * 10. Table View: 3-Bar Bulleted List
 */
export const TableListIcon = ({ size = 18, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-table ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    {/* Row 1 */}
    <circle cx="4" cy="5" r="2" />
    <rect x="8.5" y="3.5" width="13.5" height="3" rx="1.5" />
    {/* Row 2 */}
    <circle cx="4" cy="12" r="2" />
    <rect x="8.5" y="10.5" width="13.5" height="3" rx="1.5" />
    {/* Row 3 */}
    <circle cx="4" cy="19" r="2" />
    <rect x="8.5" y="17.5" width="13.5" height="3" rx="1.5" />
  </svg>
);

/**
 * 11. Car Details: Automatic Transmission (Gear + Wrench + 'A' Badge)
 */
export const AutoTransmissionIcon = ({ size = 18, color = '#fbbf24', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill={color}
    className={`hc-icon hc-icon-transmission ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    {/* Gear Body (Top Left) */}
    <path d="M12.5 7.2L13.8 5.9C14.2 5.5 14.1 4.8 13.6 4.5L12 3.6C11.5 3.3 10.9 3.5 10.6 4L9.8 5.1C9.2 5 8.6 5 8 5.1L7.2 4C6.9 3.5 6.3 3.3 5.8 3.6L4.2 4.5C3.7 4.8 3.6 5.5 4 5.9L5.3 7.2C4.9 7.7 4.6 8.3 4.4 8.9L3 9.2C2.4 9.3 2 9.9 2 10.5V12.3C2 12.9 2.4 13.5 3 13.6L4.4 13.9C4.6 14.5 4.9 15.1 5.3 15.6L4 16.9C3.6 17.3 3.7 18 4.2 18.3L5.8 19.2C6.3 19.5 6.9 19.3 7.2 18.8L8 17.7C8.6 17.8 9.2 17.8 9.8 17.7L10.6 18.8C10.9 19.3 11.5 19.5 12 19.2L13.6 18.3C14.1 18 14.2 17.3 13.8 16.9L12.5 15.6C12.9 15.1 13.2 14.5 13.4 13.9L14.8 13.6C15.4 13.5 15.8 12.9 15.8 12.3V10.5C15.8 9.9 15.4 9.3 14.8 9.2L13.4 8.9C13.2 8.3 12.9 7.7 12.5 7.2Z" />
    
    {/* Wrench Handle (Crossing Down-Left to Top-Right) */}
    <path d="M22.5 2.5C20.8 1.8 18.8 2.3 17.6 3.7C16.9 4.5 16.6 5.5 16.7 6.5L10.2 13C9.8 13.4 9.8 14 10.2 14.4C10.6 14.8 11.2 14.8 11.6 14.4L18.1 7.9C19.1 8 20.1 7.7 20.9 7C22.3 5.8 22.8 3.8 22.1 2.1L20.2 4L18.8 2.6L20.7 0.7C21.4 1.2 22 1.8 22.5 2.5Z" />

    {/* 'A' Badge in Circle (Bottom Right) */}
    <circle cx="20" cy="20" r="7" fill={color} />
    <path
      d="M20 15.5L22.5 23.5H20.9L20.3 21.7H19.7L19.1 23.5H17.5L20 15.5ZM20 17.4L19.4 20.3H20.6L20 17.4Z"
      fill="#0d1117"
    />
  </svg>
);

/**
 * 12. Car Details: Electric Plug (2-Prong Plug)
 */
export const ElectricPlugIcon = ({ size = 18, color = '#38bdf8', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-electric ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    {/* 2 Prongs */}
    <rect x="7" y="2" width="2.5" height="5" rx="1" />
    <rect x="14.5" y="2" width="2.5" height="5" rx="1" />
    
    {/* Plug Body */}
    <path d="M5 7H19C19.8 7 20.5 7.7 20.5 8.5V11.5C20.5 15.1 17.6 18 14 18H13V21.5C13 22.3 12.3 23 11.5 23C10.7 23 10 22.3 10 21.5V18H10C6.4 18 3.5 15.1 3.5 11.5V8.5C3.5 7.7 4.2 7 5 7Z" />
  </svg>
);

/**
 * 13. Location: Map Pin Teardrop
 */
export const LocationPinIcon = ({ size = 16, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-location ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M12 2C7.6 2 4 5.6 4 10C4 15.2 10.8 21.8 11.3 22.3C11.7 22.7 12.3 22.7 12.7 22.3C13.2 21.8 20 15.2 20 10C20 5.6 16.4 2 12 2ZM12 13C10.3 13 9 11.7 9 10C9 8.3 10.3 7 12 7C13.7 7 15 8.3 15 10C15 11.7 13.7 13 12 13Z" />
  </svg>
);

/**
 * 14. New Badge: Green Circle with White "N"
 */
export const NewBadgeIcon = ({ size = 18, className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={`hc-icon hc-icon-new-badge ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <circle cx="12" cy="12" r="11" fill="#22c55e" />
    <path
      d="M8.2 17.5V6.5H10.5L14.6 13.2V6.5H16.8V17.5H14.5L10.4 10.8V17.5H8.2Z"
      fill="#ffffff"
    />
  </svg>
);

/**
 * 15. Sparkle (Single 4-Point Star)
 */
export const SparkleIcon = ({ size = 16, color = '#c084fc', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-sparkle ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M12 0C12 6.6 6.6 12 0 12C6.6 12 12 17.4 12 24C12 17.4 17.4 12 24 12C17.4 12 12 6.6 12 0Z" />
  </svg>
);

/**
 * 16. Sparkle Cluster (Top Left of AI Copilot Button)
 */
export const SparkleClusterIcon = ({ size = 20, color = '#fef08a', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill={color}
    className={`hc-icon hc-icon-sparkle-cluster ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    {/* Main Big Sparkle */}
    <path d="M14 2C14 7.5 9.5 12 4 12C9.5 12 14 16.5 14 22C14 16.5 18.5 12 24 12C18.5 12 14 7.5 14 2Z" />
    {/* Top Right Mini Sparkle */}
    <path d="M22 2C22 4.2 20.2 6 18 6C20.2 6 22 7.8 22 10C22 7.8 23.8 6 26 6C23.8 6 22 4.2 22 2Z" opacity="0.9" />
    {/* Bottom Left Micro Sparkle */}
    <path d="M6 20C6 21.6 4.7 23 3 23C4.7 23 6 24.3 6 26C6 24.3 7.3 23 9 23C7.3 23 6 21.6 6 20Z" opacity="0.8" />
  </svg>
);

/**
 * 17. AI Advisor Glowing Orb (Center Hero in Empty State matching 2 & 3)
 */
export const AdvisorOrb = ({ size = 110, className = '', style = {} }) => (
  <div
    className={`hc-advisor-orb-container ${className}`}
    style={{
      width: size,
      height: size,
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style
    }}
  >
    {/* Glowing Radial Halo */}
    <div
      className="hc-advisor-orb-glow"
      style={{
        position: 'absolute',
        inset: '-15%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, rgba(99, 102, 241, 0.3) 45%, transparent 75%)',
        filter: 'blur(12px)',
        animation: 'orbGlowPulse 3s ease-in-out infinite'
      }}
    />

    {/* Concentric Dashed / Arc Rings & Sparkles */}
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className="hc-advisor-orb-svg"
      style={{ position: 'relative', zIndex: 2 }}
    >
      {/* Outer Orbit Arcs */}
      <circle
        cx="50"
        cy="50"
        r="44"
        stroke="#c4b5fd"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="28 16 38 18 20 16"
        opacity="0.85"
        className="hc-orbit-ring"
      />
      {/* Inner Orbit Dashes */}
      <circle
        cx="50"
        cy="50"
        r="34"
        stroke="#a78bfa"
        strokeWidth="2"
        strokeDasharray="14 12 18 10"
        opacity="0.65"
        className="hc-inner-ring"
      />

      {/* Main Center 4-Point Star */}
      <path
        d="M50 20C50 33.2 39.2 44 26 44C39.2 44 50 54.8 50 68C50 54.8 60.8 44 74 44C60.8 44 50 33.2 50 20Z"
        fill="#ffffff"
        filter="drop-shadow(0 0 8px rgba(255, 255, 255, 0.95))"
      />

      {/* Surrounding Accent Sparkles */}
      {/* Top Right Sparkle */}
      <path
        d="M68 24C68 28.5 64.5 32 60 32C64.5 32 68 35.5 68 40C68 35.5 71.5 32 76 32C71.5 32 68 28.5 68 24Z"
        fill="#f5f3ff"
        opacity="0.95"
      />
      {/* Top Left Sparkle */}
      <path
        d="M34 26C34 29.5 31.5 32 28 32C31.5 32 34 34.5 34 38C34 34.5 36.5 32 40 32C36.5 32 34 29.5 34 26Z"
        fill="#ddd6fe"
        opacity="0.85"
      />
      {/* Bottom Right Sparkle */}
      <path
        d="M66 56C66 60 62.8 63 59 63C62.8 63 66 66 66 70C66 66 69.2 63 73 63C69.2 63 66 60 66 56Z"
        fill="#ddd6fe"
        opacity="0.85"
      />
      {/* Bottom Left Sparkle */}
      <path
        d="M32 54C32 57.5 29.5 60 26 60C29.5 60 32 62.5 32 66C32 62.5 34.5 60 38 60C34.5 60 32 57.5 32 54Z"
        fill="#f5f3ff"
        opacity="0.9"
      />

      {/* Floating Sparkle Dots */}
      <circle cx="50" cy="76" r="2" fill="#ede9fe" />
      <circle cx="24" cy="46" r="1.5" fill="#ede9fe" />
      <circle cx="76" cy="46" r="1.5" fill="#ede9fe" />
    </svg>
  </div>
);

/**
 * 18. Send: Telegram / Paper Airplane Directional Send Icon
 */
export const SendAirplaneIcon = ({ size = 18, color = '#ffffff', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    className={`hc-icon hc-icon-send ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M2.3 11.2C1.4 10.8 1.4 9.5 2.4 9.1L21.4 1.3C22.3 0.9 23.2 1.8 22.8 2.7L15 21.7C14.6 22.7 13.3 22.7 12.9 21.8L9.8 14.2L2.3 11.2ZM19.2 4.8L8.7 12.8L10.5 17.2L12.5 14.5C12.8 14.1 13.2 13.8 13.7 13.7L19.2 4.8Z" />
  </svg>
);

/**
 * 19. Window Controls: Stop Square, Minimize Bar, Maximize/Expand, Close X
 */
export const StopIcon = ({ size = 14, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
    <rect x="5" y="5" width="14" height="14" rx="3" />
  </svg>
);

export const MinimizeIcon = ({ size = 14, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
    <rect x="4" y="11" width="16" height="2.5" rx="1.25" />
  </svg>
);

export const ExpandIcon = ({ size = 14, color = 'currentColor', isExpanded = false, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {isExpanded ? (
      <>
        <rect x="8" y="4" width="12" height="12" rx="2" />
        <path d="M4 8v10a2 2 0 0 0 2 2h10" />
      </>
    ) : (
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
    )}
  </svg>
);

export const CloseIcon = ({ size = 14, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * 20. Chevron Icons for Expand / Collapse
 */
export const ChevronUpIcon = ({ size = 14, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`hc-icon hc-icon-chevron-up ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M18 15L12 9L6 15" />
  </svg>
);

export const ChevronDownIcon = ({ size = 14, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`hc-icon hc-icon-chevron-down ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path d="M6 9L12 15L18 9" />
  </svg>
);

