import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { CalculatorIcon } from './icons/AppIcons';

const STORAGE_KEY = 'crautosdb_welcome_seen_v1';

const WelcomeBanner = ({ stats, onExploreGoodDeals, onOpenBargains, onOpenValuate }) => {
  const { t } = useLanguage();

  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
  };

  if (!visible) return null;

  const totalListings = stats?.active > 0 ? (stats.active + (stats.sold || 0)).toLocaleString() : null;

  return (
    <section className="welcome-banner" aria-label={t('welcomeAria')}>
      <div className="welcome-topbar">
        <span className="welcome-badge">
          {t('welcomeKicker')}
        </span>
        <button
          className="welcome-dismiss"
          type="button"
          onClick={dismiss}
          aria-label={t('welcomeDismissAria')}
        >
          ×
        </button>
      </div>

      <h2 className="welcome-title">
        {t('welcomeTitle')}
      </h2>

      <p className="welcome-subtitle">
        {totalListings
          ? t('welcomeSubtitleCount', { count: totalListings })
          : t('welcomeSubtitleFallback')}
      </p>

      <div className="welcome-pillars">
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">📊</span>
          <h3>{t('welcomePillar1Title')}</h3>
          <p>{t('welcomePillar1Body')}</p>
        </div>
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">💬</span>
          <h3>{t('welcomePillar2Title')}</h3>
          <p>{t('welcomePillar2Body')}</p>
        </div>
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">⚖️</span>
          <h3>{t('welcomePillar3Title')}</h3>
          <p>{t('welcomePillar3Body')}</p>
        </div>
      </div>

      <div className="welcome-actions">
        <button
          className="btn-welcome-primary"
          type="button"
          onClick={() => {
            dismiss();
            onExploreGoodDeals && onExploreGoodDeals();
          }}
        >
          {t('welcomeCtaGoodDeals')}
        </button>
        <button
          className="btn-welcome-secondary"
          type="button"
          onClick={() => {
            dismiss();
            onOpenBargains && onOpenBargains();
          }}
        >
          {t('welcomeCtaBargains')}
        </button>
        {onOpenValuate && (
          <button
            className="btn-welcome-secondary btn-welcome-valuate"
            type="button"
            onClick={() => {
              dismiss();
              onOpenValuate();
            }}
          >
            <CalculatorIcon size={15} color="currentColor" />
            <span>{t('valuateQuickPill')}</span>
          </button>
        )}
        <button className="btn-welcome-ghost" type="button" onClick={dismiss}>
          {t('welcomeCtaBrowse')}
        </button>
      </div>
    </section>
  );
};

export default WelcomeBanner;
