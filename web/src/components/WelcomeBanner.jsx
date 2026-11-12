import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const STORAGE_KEY = 'crautosdb_welcome_seen_v1';

const WelcomeBanner = ({ stats, onExploreGoodDeals, onOpenBargains }) => {
  const { language } = useLanguage();

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

  const es = language === 'es';
  const totalListings = stats?.active > 0 ? (stats.active + (stats.sold || 0)).toLocaleString() : null;

  return (
    <section className="welcome-banner" aria-label={es ? 'Bienvenida' : 'Welcome'}>
      <div className="welcome-topbar">
        <span className="welcome-badge">
          {es ? '🇨🇷 Costa Rica · Autos usados con datos reales' : '🇨🇷 Costa Rica · Used cars backed by real data'}
        </span>
        <button
          className="welcome-dismiss"
          type="button"
          onClick={dismiss}
          aria-label={es ? 'Cerrar bienvenida' : 'Dismiss welcome'}
        >
          ×
        </button>
      </div>

      <h2 className="welcome-title">
        {es
          ? 'Encuentra tu próximo auto sabiendo si el precio es justo'
          : 'Find your next car knowing if the price is fair'}
      </h2>

      <p className="welcome-subtitle">
        {totalListings
          ? (es
            ? `Analizamos ${totalListings} anuncios activos e históricos en Costa Rica para que compres con datos, no a ciegas.`
            : `We analyze ${totalListings} active and historical listings in Costa Rica so you buy with data, not guesswork.`)
          : (es
            ? 'Compra con datos, no a ciegas: precios de mercado, contacto directo y comparación lado a lado.'
            : 'Buy with data, not guesswork: market prices, direct contact and side-by-side comparison.')}
      </p>

      <div className="welcome-pillars">
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">📊</span>
          <h3>{es ? 'Precio de mercado ajustado por km' : 'Mileage-adjusted market price'}</h3>
          <p>
            {es
              ? 'Comparamos cada auto contra su misma marca, modelo, año y kilometraje, y alertamos precios dudosos.'
              : 'We compare each car against the same make, model, year and mileage, and flag suspicious prices.'}
          </p>
        </div>
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">💬</span>
          <h3>{es ? 'Contacto directo y links compartibles' : 'Direct WhatsApp & shareable links'}</h3>
          <p>
            {es
              ? 'Escribe al vendedor por WhatsApp en un clic o comparte cualquier búsqueda filtrada.'
              : 'Message the seller on WhatsApp in one click or share any filtered search.'}
          </p>
        </div>
        <div className="welcome-pillar">
          <span className="welcome-pillar-icon" aria-hidden="true">⚖️</span>
          <h3>{es ? 'Comparador y Copilot IA' : 'Side-by-side Comparator & AI Copilot'}</h3>
          <p>
            {es
              ? 'Compara de 2 a 4 autos lado a lado (ícono ⇄) o arrástralos al asistente IA.'
              : 'Compare 2 to 4 cars side by side (⇄ icon) or drag them into the AI assistant.'}
          </p>
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
          🔥 {es ? 'Ver buenos precios' : 'See good prices'}
        </button>
        <button
          className="btn-welcome-secondary"
          type="button"
          onClick={() => {
            dismiss();
            onOpenBargains && onOpenBargains();
          }}
        >
          🏷️ {es ? 'Explorar Gangas' : 'Explore Bargains'}
        </button>
        <button className="btn-welcome-ghost" type="button" onClick={dismiss}>
          {es ? 'Ir al catálogo →' : 'Browse catalog →'}
        </button>
      </div>
    </section>
  );
};

export default WelcomeBanner;
