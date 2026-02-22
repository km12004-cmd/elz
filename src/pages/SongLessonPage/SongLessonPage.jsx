import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSongDetail, fetchSongLyrics, getDifficultyMeta } from '../../api/songs';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import styles from './SongLessonPage.module.css';

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, '0')}`;
}

function SongLessonPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { songId } = useParams();
  const normalizedSongId = normalizeId(songId);

  const [song, setSong] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadSong = useCallback(async () => {
    if (!normalizedSongId) {
      setSong(null);
      setLyrics(null);
      setLoadError('Invalid song id');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const detail = await fetchSongDetail({ token, songId: normalizedSongId });
      const lyricsText =
        detail.lyricsText ?? (await fetchSongLyrics({ token, songId: normalizedSongId }).catch(() => null));

      setSong(detail);
      setLyrics(lyricsText);
    } catch (error) {
      setSong(null);
      setLyrics(null);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedSongId, token]);

  useEffect(() => {
    loadSong();
  }, [loadSong]);

  const levelMeta = getDifficultyMeta(song?.difficultyLevel);
  const lyricsLines = useMemo(
    () =>
      typeof lyrics === 'string'
        ? lyrics
            .split(/\r?\n/g)
            .map((line) => line.trimEnd())
            .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
        : [],
    [lyrics],
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate(-1)}>
            Back
          </button>
          <button type="button" className={styles.ghostButton} onClick={loadSong} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <p className={styles.eyebrow}>Song Level</p>
        <h2 className={styles.title}>{song?.title ?? 'Song lesson'}</h2>
      </header>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? (
        <>
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading song details...</span>
          </div>
          <div className={styles.layout}>
            <section className={styles.lyricsPane}>
              <Skeleton className={styles.skeletonLyricsStatus} />
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={`lyrics-skeleton-${index}`} className={styles.skeletonLyricsLine} />
              ))}
            </section>
            <aside className={styles.infoSidebar}>
              <div className={styles.trackCard}>
                <Skeleton className={styles.skeletonCoverArt} />
                <Skeleton className={styles.skeletonTrackTitle} />
                <Skeleton className={styles.skeletonTrackMeta} />
              </div>
              <div className={styles.infoPanel}>
                <Skeleton className={styles.skeletonInfoTitle} />
                <Skeleton className={styles.skeletonInfoRow} />
                <Skeleton className={styles.skeletonInfoRow} />
                <Skeleton className={styles.skeletonInfoRow} />
                <Skeleton className={styles.skeletonInfoRow} />
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {!isLoading && song ? (
        <div className={styles.layout}>
          <section className={styles.lyricsPane}>
            <p className={styles.lyricsStatus}>
              {lyricsLines.length > 0
                ? 'Lyrics are synchronized for this song.'
                : 'Lyrics for this song are not synchronized yet.'}
            </p>
            {lyricsLines.length > 0 ? (
              <div className={styles.lyricsList}>
                {lyricsLines.map((line, index) => (
                  <p key={`line-${index}`} className={styles.lyricsLine}>
                    {line || ' '}
                  </p>
                ))}
              </div>
            ) : (
              <p className={styles.lyricsEmpty}>Lyrics are not available for this song yet.</p>
            )}
          </section>

          <aside className={styles.infoSidebar}>
            <article className={styles.trackCard}>
              <div className={styles.coverArt} aria-hidden="true">
                <span>{(song.title?.[0] ?? 'S').toUpperCase()}</span>
              </div>
              <h3 className={styles.trackTitle}>{song.title ?? 'Untitled song'}</h3>
              <p className={styles.trackArtist}>{song.author ?? 'Unknown artist'}</p>
              <span className={styles.trackBadge}>Ready to learn</span>
            </article>

            <article className={styles.infoPanel}>
              <h3 className={styles.sidebarTitle}>Details</h3>
              <dl className={styles.metaList}>
                <div className={styles.metaRow}>
                  <dt>Artist</dt>
                  <dd>{song.author ?? 'Unknown artist'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Difficulty</dt>
                  <dd>{levelMeta?.title ?? '—'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Year</dt>
                  <dd>{song.releaseYear ?? '—'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Duration</dt>
                  <dd>{formatDuration(song.durationSeconds)}</dd>
                </div>
              </dl>
            </article>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export default SongLessonPage;
