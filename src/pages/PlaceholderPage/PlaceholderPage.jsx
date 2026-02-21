import { useNavigate } from 'react-router-dom';
import styles from './placeholderPage.module.css';

const LEVELS = [
  {
    key: 'beginner',
    title: 'Начальный',
    description: 'Простые тексты и базовая лексика для старта.',
  },
  {
    key: 'intermediate',
    title: 'Продолжающий',
    description: 'Больше слов, устойчивых выражений и грамматики.',
  },
  {
    key: 'expert',
    title: 'Эксперт',
    description: 'Сложные тексты и продвинутые языковые конструкции.',
  },
];

function PlaceholderPage({ title, subtitle, showLevels = false }) {
  const navigate = useNavigate();

  const openSongsLibrary = (level) => {
    navigate(`/playlists?level=${encodeURIComponent(level)}`);
  };

  return (
    <section className={styles.page}>
      <div className={styles.icon} aria-hidden="true">
        ✨
      </div>
      <h2 className={styles.title}>{title}</h2>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      {showLevels ? (
        <div className={styles.levelsSection}>
          <h3 className={styles.levelsTitle}>Выберите уровень</h3>
          <p className={styles.levelsSubtitle}>По клику откроется библиотека песен.</p>
          <div className={styles.levelsGrid}>
            {LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                className={styles.levelCard}
                onClick={() => openSongsLibrary(level.key)}
              >
                <span className={styles.levelName}>{level.title}</span>
                <span className={styles.levelDescription}>{level.description}</span>
                <span className={styles.levelAction}>Открыть библиотеку песен</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.note}>This section is being prepared and will be available soon.</p>
      )}
    </section>
  );
}

export default PlaceholderPage;
