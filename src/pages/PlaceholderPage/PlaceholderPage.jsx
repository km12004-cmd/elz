import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSongLevels, getDifficultyMeta } from '../../api/songs';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import styles from './placeholderPage.module.css';

const FALLBACK_LEVELS = [1, 2, 3].map((difficultyLevel) => ({
  difficultyLevel,
  songsCount: 0,
  ...(getDifficultyMeta(difficultyLevel) ?? {}),
}));

function PlaceholderPage({ title, subtitle, showLevels = false }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [levels, setLevels] = useState(FALLBACK_LEVELS);
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [levelsError, setLevelsError] = useState('');

  useEffect(() => {
    if (!showLevels) return undefined;

    let isCancelled = false;

    const loadLevels = async () => {
      setIsLoadingLevels(true);
      setLevelsError('');

      try {
        const items = await fetchSongLevels({ token });
        if (isCancelled) return;
        setLevels(items.length > 0 ? items : FALLBACK_LEVELS);
      } catch (error) {
        if (isCancelled) return;
        setLevels(FALLBACK_LEVELS);
        setLevelsError(extractErrorMessage(error));
      } finally {
        if (!isCancelled) setIsLoadingLevels(false);
      }
    };

    loadLevels();

    return () => {
      isCancelled = true;
    };
  }, [showLevels, token]);

  const normalizedLevels = useMemo(
    () =>
      levels.map((level, index) => {
        const parsedLevel = Number.parseInt(String(level?.difficultyLevel ?? '').trim(), 10);
        const difficultyLevel =
          parsedLevel === 1 || parsedLevel === 2 || parsedLevel === 3 ? parsedLevel : index + 1;
        const fallbackMeta = getDifficultyMeta(difficultyLevel) ?? {};

        return {
          difficultyLevel,
          title: level?.title ?? fallbackMeta.title ?? 'Level',
          description: level?.description ?? fallbackMeta.description ?? '',
          songsCount:
            typeof level?.songsCount === 'number' && Number.isFinite(level.songsCount)
              ? level.songsCount
              : 0,
        };
      }),
    [levels],
  );

  const openSongsLibrary = (difficultyLevel) => {
    navigate(`/songs/levels/${encodeURIComponent(String(difficultyLevel))}`);
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
          <h3 className={styles.levelsTitle}>Choose your level</h3>
          <p className={styles.levelsSubtitle}>Open the song library for a specific difficulty.</p>

          {isLoadingLevels ? <p className={styles.levelsLoading}>Loading levels...</p> : null}
          {levelsError ? <p className={styles.levelsError}>{levelsError}</p> : null}

          <div className={styles.levelsGrid}>
            {normalizedLevels.map((level) => (
              <button
                key={level.difficultyLevel}
                type="button"
                className={styles.levelCard}
                onClick={() => openSongsLibrary(level.difficultyLevel)}
              >
                <span className={styles.levelBadge}>Level {level.difficultyLevel}</span>
                <span className={styles.levelName}>{level.title}</span>
                <span className={styles.levelDescription}>{level.description}</span>
                <span className={styles.levelMeta}>{level.songsCount} songs</span>
                <span className={styles.levelAction}>Open library</span>
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
