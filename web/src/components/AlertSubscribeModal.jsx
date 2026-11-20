import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createAlertSubscription, fetchAlertStatus } from '../api/client';
import { isCarAlertQuery } from '../utils/carAlerts';
import { useLanguage } from '../context/LanguageContext';

const AlertSubscribeModal = ({ isOpen, onClose, query, label }) => {
  const { t } = useLanguage();
  const isCarAlert = isCarAlertQuery(query);
  const [reloadKey, setReloadKey] = useState(0);
  const currentKey = isOpen && query ? `${query}::${reloadKey}` : '';
  const [subState, setSubState] = useState({
    forKey: '',
    connectToken: null,
    telegramUrl: null,
    activated: false,
    error: false,
  });

  const isCurrent = subState.forKey === currentKey;
  const connectToken = isCurrent ? subState.connectToken : null;
  const telegramUrl = isCurrent ? subState.telegramUrl : null;
  const activated = isCurrent ? subState.activated : false;
  const error = isCurrent ? subState.error : false;

  // Create the subscription link when the modal opens.
  useEffect(() => {
    if (!currentKey) return undefined;
    let cancelled = false;
    createAlertSubscription(query, label)
      .then((data) => {
        if (cancelled) return;
        setSubState({
          forKey: currentKey,
          connectToken: data.connectToken,
          telegramUrl: data.telegramUrl,
          activated: false,
          error: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSubState({
          forKey: currentKey,
          connectToken: null,
          telegramUrl: null,
          activated: false,
          error: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [currentKey, query, label]);

  // Poll the alert status until it becomes active, or the modal closes/unmounts.
  useEffect(() => {
    if (!currentKey || !connectToken || activated) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await fetchAlertStatus(connectToken);
        if (!cancelled && status?.active) {
          setSubState((prev) => (prev.forKey === currentKey ? { ...prev, activated: true } : prev));
        }
      } catch {
        // Ignore transient polling errors and retry on the next tick.
      }
    };
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentKey, connectToken, activated]);

  if (!isOpen) return null;

  return createPortal(
    <div className="alert-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="alert-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="alert-modal-close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>

        <h2 className="alert-modal-title">{t(isCarAlert ? 'telegramCarAlertTitle' : 'telegramAlertTitle')}</h2>
        {label && <span className="alert-modal-label">{label}</span>}
        <p className="alert-modal-subtitle">{t(isCarAlert ? 'telegramCarAlertSubtitle' : 'telegramAlertSubtitle')}</p>

        {activated ? (
          <>
            <div className="alert-modal-success">{t('telegramAlertActivated')}</div>
            <button type="button" className="btn-telegram-alert" onClick={onClose}>
              {t('close')}
            </button>
          </>
        ) : error ? (
          <>
            <p className="alert-modal-error">{t('telegramAlertError')}</p>
            <button
              type="button"
              className="btn-telegram-alert"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t('telegramAlertRetry')}
            </button>
          </>
        ) : telegramUrl ? (
          <>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="alert-modal-telegram-btn"
            >
              {t('telegramAlertOpenBtn')}
            </a>
            <div className="alert-modal-waiting">
              <span className="alert-modal-spinner" aria-hidden="true" />
              {t('telegramAlertWaiting')}
            </div>
            <p className="alert-modal-hint">{t('telegramAlertHint')}</p>
          </>
        ) : (
          <div className="alert-modal-waiting">
            <span className="alert-modal-spinner" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AlertSubscribeModal;
