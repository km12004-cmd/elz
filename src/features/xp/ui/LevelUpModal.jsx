import { useEffect } from 'react';
import { useProgress } from '@/features/xp/hooks/useProgress';
import styles from './levelUpModal.module.css';

const AUTO_DISMISS_MS = 3500;

export default function LevelUpModal() {
  const { levelUpNotification, dismissLevelUpNotification } = useProgress();

  useEffect(() => {
    if (!levelUpNotification) return;
    const timer = setTimeout(dismissLevelUpNotification, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [levelUpNotification, dismissLevelUpNotification]);

  if (!levelUpNotification) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Level Up"
      onClick={dismissLevelUpNotification}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>Level Up!</p>
        <p className={styles.levelBadge}>Lv. {levelUpNotification.newLevel}</p>
        <p className={styles.body}>You've reached a new level.</p>
        <button className={styles.btn} onClick={dismissLevelUpNotification}>
          Awesome
        </button>
      </div>
    </div>
  );
}
