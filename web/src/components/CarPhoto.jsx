import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { getThumbUrl, getPhotoUrl, getBodyType, MAX_GALLERY_PHOTOS } from '../utils/carPhotos';

/**
 * Simple inline SVG side-profile car silhouette per body type (6 types).
 * ViewBox 0 0 120 60, centered on a subtle gradient background (.car-photo-fallback).
 */
export const CarSilhouette = ({ type, className = '' }) => {
  const normalizedType = (type || 'sedan').toLowerCase();

  const renderPaths = () => {
    switch (normalizedType) {
      case 'suv':
        return (
          <>
            <path d="M10 45 L10 36 L36 34 L48 16 L88 16 L104 34 L108 45" />
            <path d="M48 20 L86 20 L98 32 L38 32 Z" opacity="0.6" />
            <line x1="68" y1="20" x2="68" y2="32" opacity="0.6" />
          </>
        );
      case 'hatchback':
        return (
          <>
            <path d="M12 45 L12 40 L38 38 L54 22 L78 22 L102 38 L106 45" />
            <path d="M53 25 L76 25 L96 36 L40 36 Z" opacity="0.6" />
            <line x1="68" y1="25" x2="68" y2="36" opacity="0.6" />
          </>
        );
      case 'pickup':
        return (
          <>
            <path d="M10 45 L10 36 L36 34 L48 18 L72 18 L72 34 L108 34 L108 45" />
            <path d="M50 21 L70 21 L70 32 L40 32 Z" opacity="0.6" />
            <line x1="72" y1="34" x2="72" y2="44" opacity="0.4" strokeDasharray="2 2" />
          </>
        );
      case 'van':
        return (
          <>
            <path d="M12 45 L12 30 L26 16 L98 16 L104 32 L104 45" />
            <path d="M26 19 L96 19 L96 30 L22 30 Z" opacity="0.6" />
            <line x1="46" y1="19" x2="46" y2="30" opacity="0.6" />
            <line x1="72" y1="19" x2="72" y2="30" opacity="0.6" />
          </>
        );
      case 'wagon':
        return (
          <>
            <path d="M10 45 L10 40 L36 38 L52 22 L94 22 L106 38 L110 45" />
            <path d="M53 25 L92 25 L101 36 L38 36 Z" opacity="0.6" />
            <line x1="66" y1="25" x2="66" y2="36" opacity="0.6" />
            <line x1="82" y1="25" x2="82" y2="36" opacity="0.6" />
          </>
        );
      case 'sedan':
      default:
        return (
          <>
            <path d="M10 45 L10 40 L36 38 L52 22 L75 22 L92 36 L108 38 L110 45" />
            <path d="M52 25 L73 25 L87 36 L38 36 Z" opacity="0.6" />
            <line x1="64" y1="25" x2="64" y2="36" opacity="0.6" />
          </>
        );
    }
  };

  return (
    <div className={`car-photo-fallback ${className}`}>
      <svg
        viewBox="0 0 120 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Wheels */}
        <circle cx="32" cy="45" r="7" strokeWidth="2.5" />
        <circle cx="32" cy="45" r="2.5" fill="currentColor" opacity="0.4" />
        <circle cx="88" cy="45" r="7" strokeWidth="2.5" />
        <circle cx="88" cy="45" r="2.5" fill="currentColor" opacity="0.4" />
        {/* Ground clearance segments */}
        <line x1="8" y1="45" x2="25" y2="45" />
        <line x1="39" y1="45" x2="81" y2="45" />
        <line x1="95" y1="45" x2="112" y2="45" />
        {/* Vehicle outline */}
        {renderPaths()}
      </svg>
    </div>
  );
};

/**
 * Thumbnail component with fallback chain, shimmer skeleton, and optional hover preview.
 * Variants:
 * - 'table': 64x48 box
 * - 'mobile': 88x66 box
 * - 'card': full-width 4:3 box
 */
export const CarThumb = ({ car, variant = 'table', hoverPreview = false, badge = null }) => {
  const bodyType = getBodyType(car?.Estilo);

  const candidates = [];
  if (car?.URL) {
    if (variant === 'card') {
      const p = getPhotoUrl(car.URL, 1);
      const t = getThumbUrl(car.URL);
      if (p) candidates.push(p);
      if (t) candidates.push(t);
    } else {
      const t = getThumbUrl(car.URL);
      if (t) candidates.push(t);
    }
  }

  // Adjust state during render when car.URL changes
  const [prevUrl, setPrevUrl] = useState(car?.URL);
  const [step, setStep] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCoords, setPreviewCoords] = useState({ top: 0, left: 0 });
  const [previewError, setPreviewError] = useState(false);

  if (prevUrl !== car?.URL) {
    setPrevUrl(car?.URL);
    setStep(0);
    setLoadedSrc(null);
    setShowPreview(false);
    setPreviewError(false);
  }

  const timerRef = useRef(null);
  const thumbRef = useRef(null);

  const previewUrl = getPhotoUrl(car?.URL, 1);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Hide preview on window scroll or resize
  useEffect(() => {
    if (!showPreview) return;
    const hide = () => setShowPreview(false);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    window.addEventListener('resize', hide, { passive: true });
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [showPreview]);

  const handleMouseEnter = () => {
    if (!hoverPreview || previewError || !previewUrl) return;
    if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(hover: hover)').matches) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!thumbRef.current) return;
      const rect = thumbRef.current.getBoundingClientRect();
      const previewWidth = 320;
      const previewHeight = 240;
      const margin = 12;

      let left = rect.right + margin;
      if (left + previewWidth > window.innerWidth - margin) {
        left = rect.left - previewWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }

      let top = rect.top + rect.height / 2 - previewHeight / 2;
      if (top + previewHeight > window.innerHeight - margin) {
        top = window.innerHeight - margin - previewHeight;
      }
      if (top < margin) {
        top = margin;
      }

      setPreviewCoords({ top, left });
      setShowPreview(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPreview(false);
  };

  const currentSrc = step < candidates.length ? candidates[step] : null;
  const isLoaded = loadedSrc === currentSrc && currentSrc !== null;

  return (
    <div
      ref={thumbRef}
      className={`car-thumb car-thumb--${variant}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {badge && <div className="car-thumb-badge">{badge}</div>}

      {currentSrc ? (
        <>
          {!isLoaded && <div className="car-thumb-skeleton" />}
          <img
            src={currentSrc}
            alt={car?.Title || 'Car'}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadedSrc(currentSrc)}
            onError={() => {
              setStep((prev) => prev + 1);
            }}
            style={{ opacity: isLoaded ? 1 : 0 }}
          />
        </>
      ) : (
        <CarSilhouette type={bodyType} />
      )}

      {showPreview && !previewError && previewUrl && typeof document !== 'undefined' && createPortal(
        <div
          className="car-thumb-preview"
          style={{
            top: `${previewCoords.top}px`,
            left: `${previewCoords.left}px`,
          }}
        >
          <img
            src={previewUrl}
            alt={car?.Title || 'Car preview'}
            onError={() => {
              setPreviewError(true);
              setShowPreview(false);
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/**
 * Gallery component with sequential photo discovery, responsive 4:3 box, keyboard nav, and thumbnails strip.
 */
export const CarGallery = ({ car }) => {
  const { t } = useLanguage();
  const [prevUrl, setPrevUrl] = useState(car?.URL);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [probingDone, setProbingDone] = useState(false);
  const [loadedPhoto, setLoadedPhoto] = useState(null);
  const stripRef = useRef(null);

  // Reset state during render if car.URL changes
  if (prevUrl !== car?.URL) {
    setPrevUrl(car?.URL);
    setPhotos([]);
    setCurrentIndex(0);
    setProbingDone(false);
    setLoadedPhoto(null);
  }

  // Sequential photo probing
  useEffect(() => {
    if (!car?.URL) {
      return;
    }

    let cancelled = false;
    let activeImg = null;

    const probe = (n) => {
      if (cancelled || n > MAX_GALLERY_PHOTOS) {
        if (!cancelled) setProbingDone(true);
        return;
      }

      const url = getPhotoUrl(car.URL, n);
      if (!url) {
        if (!cancelled) setProbingDone(true);
        return;
      }

      const img = new Image();
      activeImg = img;
      img.onload = () => {
        if (cancelled) return;
        setPhotos((prev) => [...prev, url]);
        probe(n + 1);
      };
      img.onerror = () => {
        if (cancelled) return;
        setProbingDone(true);
      };
      img.src = url;
    };

    probe(1);

    return () => {
      cancelled = true;
      if (activeImg) {
        activeImg.onload = null;
        activeImg.onerror = null;
      }
    };
  }, [car?.URL]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (photos.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!stripRef.current) return;
    const activeItem = stripRef.current.children[currentIndex];
    if (activeItem && activeItem.scrollIntoView) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentIndex]);

  const bodyType = getBodyType(car?.Estilo);
  const hasPhotos = photos.length > 0;
  const currentPhoto = hasPhotos ? photos[currentIndex] : null;
  const isMainLoaded = loadedPhoto === currentPhoto && currentPhoto !== null;

  return (
    <div className="car-gallery">
      <div className="car-gallery-main">
        {!hasPhotos ? (
          probingDone || !car?.URL ? (
            <CarSilhouette type={bodyType} />
          ) : (
            <div className="car-thumb-skeleton" />
          )
        ) : (
          <>
            {!isMainLoaded && <div className="car-thumb-skeleton" />}
            <img
              src={currentPhoto}
              alt={`${car?.Title || 'Car'} - photo ${currentIndex + 1}`}
              onLoad={() => setLoadedPhoto(currentPhoto)}
              style={{ opacity: isMainLoaded ? 1 : 0 }}
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="car-gallery-arrow car-gallery-arrow--prev"
                  onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))}
                  aria-label={t('prevPhoto')}
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  className="car-gallery-arrow car-gallery-arrow--next"
                  onClick={() => setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))}
                  aria-label={t('nextPhoto')}
                >
                  <ChevronRight />
                </button>
                <div className="car-gallery-counter">
                  {currentIndex + 1} / {photos.length}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="car-gallery-strip" ref={stripRef}>
          {photos.map((photoUrl, idx) => (
            <button
              key={photoUrl}
              type="button"
              className={`car-gallery-strip-item ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
              aria-label={t('viewPhotoN', { index: idx + 1 })}
            >
              <img src={photoUrl} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
