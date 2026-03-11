import { Link } from 'react-router-dom';
import { useProgress } from '@/features/xp/hooks/useProgress';
import { xpFillPercent } from '@/shared/lib/xpLevels';
import styles from './xpWidget.module.css';

export default function XpWidget() {
  const { progress } = useProgress();
  const { level, xpTotal, xpToNextLevel } = progress;

  const fillPercent = xpFillPercent(level, xpTotal);

  return (
    <Link
      to="/profile"
      className={styles.widget}
      aria-label={`Level ${level}, ${xpToNextLevel} XP to next level`}
    >
      <span className={styles.levelBadge}>Lv. {level}</span>
      <span className={styles.barWrap} aria-hidden="true">
        <span className={styles.barFill} style={{ width: `${fillPercent}%` }} />
      </span>
      <span className={styles.xpText}>{xpTotal} XP</span>
    </Link>
  );
}
