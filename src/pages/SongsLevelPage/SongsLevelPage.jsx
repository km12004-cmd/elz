import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSongsByDifficulty, getDifficultyMeta } from '../../api/songs';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import styles from './SongsLevelPage.module.css';

function normalizeDifficultyLevel(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, '0')}`;
}

function SongsLevelPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { difficultyLevel } = useParams();

  const normalizedLevel = normalizeDifficultyLevel(difficultyLevel);
  const levelMeta = getDifficultyMeta(normalizedLevel);

  const [songs, setSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadSongs = useCallback(async () => {
    if (!normalizedLevel) {
      setSongs([]);
      setLoadError('Invalid difficulty level');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const items = await fetchSongsByDifficulty({
        token,
        difficultyLevel: normalizedLevel,
      });
      setSongs(items);
    } catch (error) {
      setSongs([]);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedLevel, token]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  const startLevel = (songId) => {
    const normalizedSongId = normalizeId(songId);
    if (!normalizedSongId) return;

    navigate(`/songs/${encodeURIComponent(normalizedSongId)}`);
  };

  if (!normalizedLevel) {
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Songs Library</p>
          <h2 className={styles.title}>Invalid level</h2>
          <p className={styles.subtitle}>Use one of the supported levels: 1, 2, or 3.</p>
        </header>
        <button type="button" className={styles.primaryButton} onClick={() => navigate('/')}>
          Back to home
        </button>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/')}>
            Back
          </button>
          <button type="button" className={styles.ghostButton} onClick={loadSongs} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <p className={styles.eyebrow}>Songs Library</p>
        <h2 className={styles.title}>{levelMeta?.title ?? 'Level'}</h2>
        <p className={styles.subtitle}>{levelMeta?.description ?? ''}</p>
      </header>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? (
        <>
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading songs...</span>
          </div>
          <ul className={styles.songGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={`song-skeleton-${index}`} className={styles.songCard}>
                <Skeleton className={styles.skeletonTitle} />
                <Skeleton className={styles.skeletonMeta} />
                <Skeleton className={styles.skeletonMeta} />
                <Skeleton className={styles.skeletonButton} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!isLoading && songs.length === 0 ? (
        <EmptyState
          kind="playlist"
          title="No songs found"
          description="This level does not have any available songs yet."
        />
      ) : null}

      {!isLoading && songs.length > 0 ? (
        <ul className={styles.songGrid}>
          {songs.map((song, index) => {
            const songId = normalizeId(song.id);

            return (
              <li key={songId ?? `song-${index}`}>
                <article className={styles.songCard}>
                  <p className={styles.songTitle}>{song.title}</p>
                  <p className={styles.songAuthor}>{song.author ?? 'Unknown artist'}</p>

                  <div className={styles.songMetaRow}>
                    <span>{song.releaseYear ? `Year: ${song.releaseYear}` : 'Year: —'}</span>
                    <span>
                      {formatDuration(song.durationSeconds)
                        ? `Duration: ${formatDuration(song.durationSeconds)}`
                        : 'Duration: —'}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.outlineButton}
                    onClick={() => startLevel(songId)}
                    disabled={!songId}
                  >
                    Start Level
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default SongsLevelPage;
