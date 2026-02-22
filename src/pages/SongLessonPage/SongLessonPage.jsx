import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createFlashcardFolder, createFlashcardInFolder } from '../../api/flashcards';
import {
  fetchSongDetail,
  fetchSongLyrics,
  fetchTrackFlashcardTemplates,
  fetchTrackLearningState,
  fetchTrackLevelCards,
  getDifficultyMeta,
  markTrackAsListened,
  startTrackLearning,
} from '../../api/songs';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import styles from './SongLessonPage.module.css';

const FIRST_TASK_LEVEL = 1;
const LESSON_STAGE = {
  SONG: 'song',
  TASK: 'task',
};

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

function extractYouTubeVideoId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) return trimmed;

  const parsed =
    (() => {
      try {
        return new URL(trimmed);
      } catch {
        try {
          return new URL(`https://${trimmed}`);
        } catch {
          return null;
        }
      }
    })();

  if (!parsed) return null;

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'youtu.be') {
    const shortId = parsed.pathname.split('/').filter(Boolean)[0];
    return idPattern.test(shortId ?? '') ? shortId : null;
  }

  if (hostname.endsWith('youtube.com') || hostname === 'youtube-nocookie.com') {
    const watchId = parsed.searchParams.get('v');
    if (idPattern.test(watchId ?? '')) return watchId;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const candidates = [
      pathParts[0] === 'embed' ? pathParts[1] : null,
      pathParts[0] === 'shorts' ? pathParts[1] : null,
      pathParts[0] === 'live' ? pathParts[1] : null,
    ];

    const firstValid = candidates.find((item) => idPattern.test(item ?? ''));
    return firstValid ?? null;
  }

  return null;
}

function toYouTubeEmbedUrl(value) {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

function isRetriableRouteError(error) {
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;

  return status === 404 || status === 405 || status === 422;
}

function formatLearningStatus(status) {
  if (typeof status !== 'string' || !status.trim()) return 'Not started';

  const normalized = status.trim().toLowerCase();
  if (normalized === 'not_started') return 'Not started';
  if (normalized === 'listened') return 'Listened';
  if (normalized === 'in_progress') return 'In progress';
  if (normalized === 'completed') return 'Completed';

  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function normalizeCardText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function uniqueTaskCards(cards) {
  if (!Array.isArray(cards)) return [];

  const unique = [];
  const signatures = new Set();

  cards.forEach((card) => {
    const kgText = normalizeCardText(card?.kgText);
    const ruText = normalizeCardText(card?.ruText);
    if (!kgText || !ruText) return;

    const signature = `${kgText}\u0000${ruText}`;
    if (signatures.has(signature)) return;

    signatures.add(signature);
    unique.push({
      ...card,
      kgText,
      ruText,
    });
  });

  return unique;
}

async function createSongFolderFromCards({ token, songTitle, cards } = {}) {
  const normalizedName = normalizeCardText(songTitle);
  const folderName = normalizedName || 'Song lesson';
  const preparedCards = uniqueTaskCards(cards);

  const createdFolder = await createFlashcardFolder({ token, name: folderName });
  const folderId = normalizeId(createdFolder?.id);
  if (!folderId) return null;

  for (const card of preparedCards) {
    await createFlashcardInFolder({
      token,
      folderId,
      frontText: card.kgText,
      backText: card.ruText,
    });
  }

  return folderId;
}

function SongLessonPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { songId } = useParams();
  const normalizedSongId = normalizeId(songId);

  const [song, setSong] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [learningState, setLearningState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [taskCards, setTaskCards] = useState([]);
  const [activeStage, setActiveStage] = useState(LESSON_STAGE.SONG);
  const [revealedCards, setRevealedCards] = useState({});
  const [isPreparingTask, setIsPreparingTask] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  const loadSong = useCallback(async () => {
    if (!normalizedSongId) {
      setSong(null);
      setLyrics(null);
      setLearningState(null);
      setLoadError('Invalid song id');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const detail = await fetchSongDetail({ token, songId: normalizedSongId });
      const lyricsText =
        detail.lyricsText ?? (await fetchSongLyrics({ token, songId: normalizedSongId }).catch(() => null));
      const nextLearningState = await fetchTrackLearningState({
        token,
        trackId: normalizedSongId,
      }).catch(() => null);

      setSong(detail);
      setLyrics(lyricsText);
      setLearningState(nextLearningState);
    } catch (error) {
      setSong(null);
      setLyrics(null);
      setLearningState(null);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedSongId, token]);

  useEffect(() => {
    loadSong();
  }, [loadSong]);

  useEffect(() => {
    setTaskCards([]);
    setTaskError('');
    setRevealedCards({});
    setActiveStage(LESSON_STAGE.SONG);
  }, [normalizedSongId]);

  const levelMeta = getDifficultyMeta(song?.difficultyLevel);
  const preparedTaskCards = useMemo(() => uniqueTaskCards(taskCards), [taskCards]);
  const learningStatus = useMemo(
    () => formatLearningStatus(learningState?.status),
    [learningState?.status],
  );
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
  const youtubeEmbedUrl = useMemo(() => toYouTubeEmbedUrl(song?.youtubeUrl), [song?.youtubeUrl]);
  const youtubeUrl = typeof song?.youtubeUrl === 'string' ? song.youtubeUrl.trim() : '';
  const isTaskStage = activeStage === LESSON_STAGE.TASK;

  const toggleCard = (cardId) => {
    setRevealedCards((previous) => ({
      ...previous,
      [cardId]: !previous[cardId],
    }));
  };

  const openTask = async () => {
    if (!normalizedSongId) return;

    setIsPreparingTask(true);
    setTaskError('');
    setRevealedCards({});

    try {
      await markTrackAsListened({
        token,
        trackId: normalizedSongId,
        percent: 100,
        secondsListened: song?.durationSeconds ?? 0,
      }).catch(() => null);

      let cards = [];

      try {
        cards = await fetchTrackFlashcardTemplates({
          token,
          trackId: normalizedSongId,
          level: FIRST_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) {
          throw error;
        }
      }

      if (cards.length === 0) {
        cards = await fetchTrackLevelCards({
          token,
          trackId: normalizedSongId,
          level: FIRST_TASK_LEVEL,
        });
      }

      setTaskCards(cards);
      setActiveStage(LESSON_STAGE.TASK);
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsPreparingTask(false);
    }
  };

  const completeTask = async () => {
    if (!normalizedSongId) return;

    setIsCompletingTask(true);
    setTaskError('');

    try {
      await markTrackAsListened({
        token,
        trackId: normalizedSongId,
        percent: 100,
        secondsListened: song?.durationSeconds ?? 0,
      }).catch(() => null);

      let folderId = null;
      let nextLearningState = learningState;

      try {
        const started = await startTrackLearning({
          token,
          trackId: normalizedSongId,
        });

        folderId = normalizeId(started.folderId);
        nextLearningState = {
          trackId: started.trackId ?? normalizedSongId,
          status: started.status ?? 'in_progress',
          unlockedLevel: started.unlockedLevel,
          folderId,
        };
      } catch (error) {
        if (!preparedTaskCards.length || !isRetriableRouteError(error)) {
          throw error;
        }
      }

      if (!folderId) {
        folderId = await createSongFolderFromCards({
          token,
          songTitle: song?.title,
          cards: preparedTaskCards,
        });
      }

      setLearningState({
        trackId: nextLearningState?.trackId ?? normalizedSongId,
        status: nextLearningState?.status ?? 'in_progress',
        unlockedLevel:
          typeof nextLearningState?.unlockedLevel === 'number'
            ? nextLearningState.unlockedLevel
            : FIRST_TASK_LEVEL,
        folderId: folderId ?? nextLearningState?.folderId ?? null,
      });

      navigate('/cards', {
        state: {
          sourceTrackId: normalizedSongId,
          sourceFolderId: folderId,
        },
      });
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsCompletingTask(false);
    }
  };

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

        <h2 className={styles.title}>{song?.title ?? 'Song lesson'}</h2>
      </header>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}
      {taskError ? <p className={styles.errorText}>{taskError}</p> : null}

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
            {isTaskStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 1</p>
                <h3 className={styles.taskTitle}>Tap and memorize cards</h3>
                <p className={styles.taskSubtitle}>
                  Open each card to see translation, then press Done to move cards into Flashcards.
                </p>

                {preparedTaskCards.length > 0 ? (
                  <ul className={styles.taskCardsGrid}>
                    {preparedTaskCards.map((card, index) => {
                      const cardId = normalizeId(card.id) ?? `task-card-${index}`;
                      const isRevealed = Boolean(revealedCards[cardId]);

                      return (
                        <li key={cardId}>
                          <article className={styles.taskCard}>
                            <p className={styles.taskCardHint}>Tap card to flip</p>

                            <div
                              className={styles.taskFlipArea}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleCard(cardId)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  toggleCard(cardId);
                                }
                              }}
                            >
                              <div
                                className={`${styles.taskFlipInner} ${isRevealed ? styles.taskFlipInnerFlipped : ''}`}
                              >
                                <div className={`${styles.taskFace} ${styles.taskFaceFront}`}>
                                  <p className={styles.taskFaceLabel}>KG</p>
                                  <p className={styles.taskFaceText}>{card.kgText || '—'}</p>
                                </div>
                                <div className={`${styles.taskFace} ${styles.taskFaceBack}`}>
                                  <p className={styles.taskFaceLabel}>RU</p>
                                  <p className={styles.taskFaceText}>{card.ruText || '—'}</p>
                                </div>
                              </div>
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.taskEmpty}>
                    This track does not have prepared cards for Task 1 yet.
                  </p>
                )}
              </div>
            ) : (
              <>
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
              </>
            )}
          </section>

          <aside className={styles.infoSidebar}>
            <article className={styles.trackCard}>
              {youtubeEmbedUrl ? (
                <div className={styles.playerWrap}>
                  <iframe
                    className={styles.playerFrame}
                    src={youtubeEmbedUrl}
                    title={`YouTube player: ${song.title ?? 'Song'}`}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className={styles.playerFallback}>YouTube player is unavailable for this song.</div>
              )}

              <h3 className={styles.trackTitle}>{song.title ?? 'Untitled song'}</h3>
              <p className={styles.trackArtist}>{song.author ?? 'Unknown artist'}</p>
              {youtubeUrl ? (
                <a className={styles.playerLink} href={youtubeUrl} target="_blank" rel="noreferrer">
                  Open on YouTube
                </a>
              ) : null}
              <div className={styles.lessonActions}>
                {isTaskStage ? (
                  <>
                    <button
                      type="button"
                      className={styles.primaryActionButton}
                      onClick={completeTask}
                      disabled={isCompletingTask || isPreparingTask}
                    >
                      {isCompletingTask ? 'Saving...' : 'Done'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.SONG)}
                      disabled={isCompletingTask}
                    >
                      Back to song
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryActionButton}
                    onClick={openTask}
                    disabled={isPreparingTask}
                  >
                    {isPreparingTask ? 'Preparing...' : 'Ready to learn'}
                  </button>
                )}
              </div>
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
                <div className={styles.metaRow}>
                  <dt>Learning</dt>
                  <dd>{learningStatus}</dd>
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
