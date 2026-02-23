import { useEffect } from 'react';
import { useProgress } from '../../../contexts/useProgress';
import styles from './xpToast.module.css';

const AUTO_DISMISS_MS = 3000;

export default function XpToast() {
  const { xpNotification, dismissXpNotification } = useProgress();

  useEffect(() => {
    if (!xpNotification) return;
    const timer = setTimeout(dismissXpNotification, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [xpNotification, dismissXpNotification]);

  if (!xpNotification) return null;

  const isAwarded = xpNotification.type === 'awarded';

  return (
    <div className={styles.viewport} role="status" aria-live="polite" aria-atomic="true">
      <div className={`${styles.toast} ${isAwarded ? styles.toastAwarded : styles.toastDuplicate}`}>
        <span className={styles.icon} aria-hidden="true">
          {isAwarded ? '+' : '—'}
        </span>
        <div className={styles.body}>
          <span className={styles.title}>
            {isAwarded ? `+${xpNotification.delta} XP` : 'Already rewarded'}
          </span>
          {isAwarded && <span className={styles.subtitle}>Progress updated</span>}
        </div>
        <button
          className={styles.closeBtn}
          onClick={dismissXpNotification}
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
