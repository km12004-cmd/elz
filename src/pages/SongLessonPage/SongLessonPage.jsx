import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createFlashcardFolder, createFlashcardInFolder } from '../../api/flashcards';
import {
  createTrackPairsTemplates,
  fetchTrackPairsTemplates,
  finishPairsGame,
  startTrackPairsGame,
  submitPairsGameAnswer,
} from '../../api/pairsGame';
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
const SECOND_TASK_LEVEL = 2;
const THIRD_TASK_LEVEL = 3;

const LESSON_STAGE = {
  SONG: 'song',
  TASK_1: 'task_1',
  TASK_2: 'task_2',
  TASK_3: 'task_3',
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

  const parsed = (() => {
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
    typeof error?.status === 'number' && Number.isFinite(error.status) ? error.status : null;

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

function toPairsAnswersMap(answers) {
  if (!Array.isArray(answers)) return {};

  return answers.reduce((accumulator, answer) => {
    const pairId = normalizeId(answer?.pairId);
    const optionId = normalizeId(answer?.optionId);
    if (!pairId || !optionId) return accumulator;

    return {
      ...accumulator,
      [pairId]: {
        optionId,
        correct: Boolean(answer?.correct),
      },
    };
  }, {});
}

function toPairsTemplateItems(cards) {
  return uniqueTaskCards(cards).map((card, index) => ({
    kg_text: card.kgText,
    ru_text: card.ruText,
    order: index + 1,
  }));
}

function toPairsOptionOwners(answers) {
  const optionOwners = new Map();

  Object.entries(answers ?? {}).forEach(([pairId, answer]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(answer?.optionId);
    if (!normalizedPairId || !normalizedOptionId) return;

    optionOwners.set(normalizedOptionId, normalizedPairId);
  });

  return optionOwners;
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
  const [exerciseOneFolderId, setExerciseOneFolderId] = useState(null);

  const [taskTwoSession, setTaskTwoSession] = useState(null);
  const [taskTwoAnswers, setTaskTwoAnswers] = useState({});
  const [taskTwoSelectedPairId, setTaskTwoSelectedPairId] = useState(null);

  const [pairsSession, setPairsSession] = useState(null);
  const [pairsAnswers, setPairsAnswers] = useState({});
  const [taskThreeSelectedPairId, setTaskThreeSelectedPairId] = useState(null);

  const [isPreparingTask, setIsPreparingTask] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [isCompletingTaskTwo, setIsCompletingTaskTwo] = useState(false);
  const [isPreparingPairs, setIsPreparingPairs] = useState(false);
  const [isSubmittingPairsAnswer, setIsSubmittingPairsAnswer] = useState(false);
  const [isFinishingPairs, setIsFinishingPairs] = useState(false);

  const loadSong = useCallback(async () => {
    if (!normalizedSongId) {
      setSong(null);
      setLyrics(null);
      setLearningState(null);
      setExerciseOneFolderId(null);
      setLoadError('Invalid song id');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const detail = await fetchSongDetail({ token, songId: normalizedSongId });
      const lyricsText =
        detail.lyricsText ??
        (await fetchSongLyrics({ token, songId: normalizedSongId }).catch(() => null));
      const nextLearningState = await fetchTrackLearningState({
        token,
        trackId: normalizedSongId,
      }).catch(() => null);

      setSong(detail);
      setLyrics(lyricsText);
      setLearningState(nextLearningState);
      setExerciseOneFolderId(normalizeId(nextLearningState?.folderId));
    } catch (error) {
      setSong(null);
      setLyrics(null);
      setLearningState(null);
      setExerciseOneFolderId(null);
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
    setExerciseOneFolderId(null);
    setTaskTwoSession(null);
    setTaskTwoAnswers({});
    setTaskTwoSelectedPairId(null);
    setPairsSession(null);
    setPairsAnswers({});
    setTaskThreeSelectedPairId(null);
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

  const isTaskOneStage = activeStage === LESSON_STAGE.TASK_1;
  const isTaskTwoStage = activeStage === LESSON_STAGE.TASK_2;
  const isTaskThreeStage = activeStage === LESSON_STAGE.TASK_3;

  const taskTwoItems = useMemo(
    () => (Array.isArray(taskTwoSession?.items) ? taskTwoSession.items : []),
    [taskTwoSession?.items],
  );
  const taskTwoOptions = useMemo(
    () => (Array.isArray(taskTwoSession?.options) ? taskTwoSession.options : []),
    [taskTwoSession?.options],
  );
  const taskTwoAnsweredCount = useMemo(
    () =>
      taskTwoItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId) return count;
        return taskTwoAnswers[pairId] ? count + 1 : count;
      }, 0),
    [taskTwoAnswers, taskTwoItems],
  );
  const taskTwoOptionOwners = useMemo(() => toPairsOptionOwners(taskTwoAnswers), [taskTwoAnswers]);
  const taskTwoCanFinish = taskTwoItems.length > 0 && taskTwoAnsweredCount === taskTwoItems.length;
  const taskTwoSessionId = normalizeId(taskTwoSession?.sessionId);

  const pairsSessionId = normalizeId(pairsSession?.sessionId);
  const pairsItems = useMemo(
    () => (Array.isArray(pairsSession?.items) ? pairsSession.items : []),
    [pairsSession?.items],
  );
  const pairsOptions = useMemo(
    () => (Array.isArray(pairsSession?.options) ? pairsSession.options : []),
    [pairsSession?.options],
  );

  const pairsAnsweredCount = useMemo(
    () =>
      pairsItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId) return count;
        return pairsAnswers[pairId] ? count + 1 : count;
      }, 0),
    [pairsItems, pairsAnswers],
  );

  const pairsOptionOwners = useMemo(() => toPairsOptionOwners(pairsAnswers), [pairsAnswers]);

  const pairsCanFinish =
    Boolean(pairsSessionId) && pairsItems.length > 0 && pairsAnsweredCount === pairsItems.length;

  const openCardsPage = () => {
    navigate('/cards', {
      state: {
        sourceTrackId: normalizedSongId,
        sourceFolderId: exerciseOneFolderId ?? normalizeId(learningState?.folderId) ?? null,
      },
    });
  };

  const toggleCard = (cardId) => {
    setRevealedCards((previous) => ({
      ...previous,
      [cardId]: !previous[cardId],
    }));
  };

  const openTaskOne = async () => {
    if (!normalizedSongId) return;

    setIsPreparingTask(true);
    setTaskError('');
    setRevealedCards({});
    setTaskTwoSession(null);
    setTaskTwoAnswers({});
    setTaskTwoSelectedPairId(null);
    setPairsSession(null);
    setPairsAnswers({});
    setTaskThreeSelectedPairId(null);

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
      setActiveStage(LESSON_STAGE.TASK_1);
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsPreparingTask(false);
    }
  };

  const startTaskTwoExercise = async ({ seedCards } = {}) => {
    if (!normalizedSongId) throw new Error('Track id is required');

    setIsPreparingPairs(true);
    setTaskError('');

    try {
      let templates = [];

      try {
        templates = await fetchTrackPairsTemplates({
          token,
          trackId: normalizedSongId,
          exerciseIdx: SECOND_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) throw error;
      }

      const templateSeedItems = toPairsTemplateItems(seedCards);

      if (templates.length === 0 && templateSeedItems.length > 0) {
        await createTrackPairsTemplates({
          token,
          trackId: normalizedSongId,
          exerciseIdx: SECOND_TASK_LEVEL,
          items: templateSeedItems,
        });
      }

      const session = await startTrackPairsGame({
        token,
        trackId: normalizedSongId,
        exerciseIdx: SECOND_TASK_LEVEL,
      });

      const normalizedSessionId = normalizeId(session?.sessionId);
      if (!normalizedSessionId) {
        throw new Error('Exercise 2 session was not created');
      }

      setTaskTwoSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      setTaskTwoAnswers(toPairsAnswersMap(session?.answers));
      setTaskTwoSelectedPairId(null);
      setPairsSession(null);
      setPairsAnswers({});
      setTaskThreeSelectedPairId(null);
      setActiveStage(LESSON_STAGE.TASK_2);

      setLearningState((previous) => ({
        trackId: previous?.trackId ?? normalizedSongId,
        status: previous?.status ?? 'in_progress',
        unlockedLevel:
          typeof previous?.unlockedLevel === 'number' ? previous.unlockedLevel : FIRST_TASK_LEVEL,
        unlockedGame:
          typeof previous?.unlockedGame === 'number'
            ? Math.max(previous.unlockedGame, SECOND_TASK_LEVEL)
            : SECOND_TASK_LEVEL,
        folderId: exerciseOneFolderId ?? previous?.folderId ?? null,
      }));
    } finally {
      setIsPreparingPairs(false);
    }
  };

  const startTaskThreeExercise = async () => {
    if (!normalizedSongId) throw new Error('Track id is required');

    setIsPreparingPairs(true);
    setTaskError('');

    try {
      const session = await startTrackPairsGame({
        token,
        trackId: normalizedSongId,
        exerciseIdx: THIRD_TASK_LEVEL,
      });

      const normalizedSessionId = normalizeId(session?.sessionId);
      if (!normalizedSessionId) {
        throw new Error('Pairs session was not created');
      }

      setPairsSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      setPairsAnswers(toPairsAnswersMap(session?.answers));
      setTaskThreeSelectedPairId(null);
      setActiveStage(LESSON_STAGE.TASK_3);

      setLearningState((previous) => ({
        trackId: previous?.trackId ?? normalizedSongId,
        status: previous?.status ?? 'in_progress',
        unlockedLevel:
          typeof previous?.unlockedLevel === 'number' ? previous.unlockedLevel : FIRST_TASK_LEVEL,
        unlockedGame:
          typeof previous?.unlockedGame === 'number'
            ? Math.max(previous.unlockedGame, THIRD_TASK_LEVEL)
            : THIRD_TASK_LEVEL,
        folderId: exerciseOneFolderId ?? previous?.folderId ?? null,
      }));
    } finally {
      setIsPreparingPairs(false);
    }
  };

  const completeTaskOne = async () => {
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

      let folderId = exerciseOneFolderId ?? normalizeId(learningState?.folderId);
      let nextLearningState = learningState;

      try {
        const started = await startTrackLearning({
          token,
          trackId: normalizedSongId,
        });

        const startedFolderId = normalizeId(started?.folderId);
        folderId = startedFolderId ?? folderId;

        nextLearningState = {
          trackId: started.trackId ?? normalizedSongId,
          status: started.status ?? 'in_progress',
          unlockedLevel: started.unlockedLevel,
          unlockedGame: started.unlockedGame,
          folderId,
        };
      } catch (error) {
        if (!preparedTaskCards.length || !isRetriableRouteError(error)) {
          throw error;
        }
      }

      if (!folderId && preparedTaskCards.length > 0) {
        folderId = await createSongFolderFromCards({
          token,
          songTitle: song?.title,
          cards: preparedTaskCards,
        });
      }

      if (folderId) {
        setExerciseOneFolderId(folderId);
      }

      setLearningState({
        trackId: nextLearningState?.trackId ?? normalizedSongId,
        status: nextLearningState?.status ?? 'in_progress',
        unlockedLevel:
          typeof nextLearningState?.unlockedLevel === 'number'
            ? Math.max(nextLearningState.unlockedLevel, FIRST_TASK_LEVEL)
            : FIRST_TASK_LEVEL,
        unlockedGame:
          typeof nextLearningState?.unlockedGame === 'number'
            ? Math.max(nextLearningState.unlockedGame, FIRST_TASK_LEVEL)
            : FIRST_TASK_LEVEL,
        folderId: folderId ?? nextLearningState?.folderId ?? null,
      });

      await startTaskTwoExercise({ seedCards: preparedTaskCards });
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsCompletingTask(false);
    }
  };

  const selectTaskTwoPairItem = (pairId) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (isCompletingTaskTwo || isPreparingPairs || isSubmittingPairsAnswer) return;

    setTaskTwoSelectedPairId(normalizedPairId);
  };

  const submitTaskTwoOption = async (optionId) => {
    const normalizedOptionId = normalizeId(optionId);
    const normalizedPairId = normalizeId(taskTwoSelectedPairId);
    const normalizedSessionId = normalizeId(taskTwoSessionId);

    if (!normalizedSessionId || !normalizedOptionId || !normalizedPairId) return;

    const currentOptionOwner = taskTwoOptionOwners.get(normalizedOptionId);
    if (currentOptionOwner && currentOptionOwner !== normalizedPairId) return;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
      const answer = await submitPairsGameAnswer({
        token,
        sessionId: normalizedSessionId,
        pairId: normalizedPairId,
        optionId: normalizedOptionId,
      });

      const savedPairId = normalizeId(answer?.pairId) ?? normalizedPairId;
      const savedOptionId = normalizeId(answer?.optionId) ?? normalizedOptionId;

      setTaskTwoAnswers((previous) => ({
        ...previous,
        [savedPairId]: {
          optionId: savedOptionId,
          correct: Boolean(answer?.correct),
        },
      }));
      setTaskTwoSelectedPairId(null);
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsSubmittingPairsAnswer(false);
    }
  };

  const completeTaskTwo = async () => {
    if (!taskTwoSessionId) return;
    if (taskTwoItems.length > 0 && !taskTwoCanFinish) return;

    setIsCompletingTaskTwo(true);
    setTaskError('');

    try {
      await finishPairsGame({
        token,
        sessionId: taskTwoSessionId,
      });

      await startTaskThreeExercise();
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsCompletingTaskTwo(false);
    }
  };

  const selectTaskThreePairItem = (pairId) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (isSubmittingPairsAnswer || isFinishingPairs) return;

    setTaskThreeSelectedPairId(normalizedPairId);
  };

  const submitTaskThreeOption = async (optionId) => {
    const normalizedOptionId = normalizeId(optionId);
    const normalizedPairId = normalizeId(taskThreeSelectedPairId);
    const normalizedSessionId = normalizeId(pairsSessionId);

    if (!normalizedSessionId || !normalizedPairId || !normalizedOptionId) return;

    const currentOptionOwner = pairsOptionOwners.get(normalizedOptionId);
    if (currentOptionOwner && currentOptionOwner !== normalizedPairId) return;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
      const answer = await submitPairsGameAnswer({
        token,
        sessionId: normalizedSessionId,
        pairId: normalizedPairId,
        optionId: normalizedOptionId,
      });

      const savedPairId = normalizeId(answer?.pairId) ?? normalizedPairId;
      const savedOptionId = normalizeId(answer?.optionId) ?? normalizedOptionId;

      setPairsAnswers((previous) => ({
        ...previous,
        [savedPairId]: {
          optionId: savedOptionId,
          correct: Boolean(answer?.correct),
        },
      }));
      setTaskThreeSelectedPairId(null);
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsSubmittingPairsAnswer(false);
    }
  };

  const finishTaskThree = async () => {
    if (!pairsSessionId) return;

    setIsFinishingPairs(true);
    setTaskError('');

    try {
      const result = await finishPairsGame({
        token,
        sessionId: pairsSessionId,
      });

      setLearningState((previous) => {
        const nextUnlockedGameFloor = THIRD_TASK_LEVEL;
        const nextStatus = result.passed ? 'finished' : previous?.status ?? 'in_progress';

        if (!previous) {
          return {
            trackId: normalizedSongId,
            status: nextStatus,
            unlockedLevel: SECOND_TASK_LEVEL,
            unlockedGame: nextUnlockedGameFloor,
            folderId: exerciseOneFolderId ?? null,
          };
        }

        return {
          ...previous,
          status: nextStatus,
          unlockedLevel: Math.max(previous.unlockedLevel ?? 0, SECOND_TASK_LEVEL),
          unlockedGame: Math.max(previous.unlockedGame ?? 0, nextUnlockedGameFloor),
          folderId: exerciseOneFolderId ?? previous.folderId ?? null,
        };
      });

      openCardsPage();
    } catch (error) {
      setTaskError(extractErrorMessage(error));
    } finally {
      setIsFinishingPairs(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate(-1)}>
            Back
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={loadSong}
            disabled={isLoading}>
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
            {isTaskOneStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 1</p>
                <h3 className={styles.taskTitle}>Tap and memorize cards</h3>
                <p className={styles.taskSubtitle}>
                  Open each card to see translation, then press OK to continue to Exercise 2.
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
                              }}>
                              <div
                                className={`${styles.taskFlipInner} ${
                                  isRevealed ? styles.taskFlipInnerFlipped : ''
                                }`}>
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
            ) : null}

            {isTaskTwoStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 2</p>
                <h3 className={styles.taskTitle}>Match words from Task 1</h3>

                <p className={styles.pairsProgress}>
                  {taskTwoAnsweredCount}/{taskTwoItems.length || 0} pairs answered
                </p>

                {taskTwoItems.length > 0 && taskTwoOptions.length > 0 ? (
                  <>
                    <p className={styles.pairsHint}>
                      {taskTwoSelectedPairId
                        ? 'Now choose a matching translation from the right column.'
                        : 'Pick a card from the left column to start matching.'}
                    </p>

                    <div className={styles.pairsBoard}>
                      <section className={styles.pairsColumn}>
                        <h4 className={styles.pairsColumnTitle}>Kyrgyz</h4>
                        <ul className={styles.pairsList}>
                          {taskTwoItems.map((item, index) => {
                            const pairId = normalizeId(item?.pairId);
                            const answer = pairId ? taskTwoAnswers[pairId] : null;
                            const isSelected = Boolean(pairId && taskTwoSelectedPairId === pairId);

                            const pairClassName = [
                              styles.pairsButton,
                              styles.pairsLeftButton,
                              isSelected ? styles.pairsLeftButtonSelected : '',
                              answer?.correct ? styles.pairsLeftButtonCorrect : '',
                              answer && !answer.correct ? styles.pairsLeftButtonWrong : '',
                            ]
                              .filter(Boolean)
                              .join(' ');

                            return (
                              <li key={pairId ?? `pair-item-${index}`}>
                                <button
                                  type="button"
                                  className={pairClassName}
                                  onClick={() => selectTaskTwoPairItem(pairId)}
                                  disabled={
                                    !pairId ||
                                    isCompletingTaskTwo ||
                                    isPreparingPairs ||
                                    isSubmittingPairsAnswer
                                  }>
                                  <span className={styles.pairsMainText}>{item.leftText || '—'}</span>
                                  {answer ? (
                                    <span className={styles.pairsStateText}>
                                      {answer.correct ? 'Correct' : 'Wrong'}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>

                      <section className={styles.pairsColumn}>
                        <h4 className={styles.pairsColumnTitle}>Russian options</h4>
                        <ul className={styles.pairsList}>
                          {taskTwoOptions.map((option, index) => {
                            const optionId = normalizeId(option?.optionId);
                            const ownerPairId = optionId
                              ? taskTwoOptionOwners.get(optionId) ?? null
                              : null;
                            const isUsedByAnotherPair =
                              Boolean(ownerPairId) && ownerPairId !== taskTwoSelectedPairId;
                            const isUsedBySelectedPair =
                              Boolean(ownerPairId) && ownerPairId === taskTwoSelectedPairId;
                            const isUsed = Boolean(ownerPairId);

                            const optionClassName = [
                              styles.pairsButton,
                              styles.pairsOptionButton,
                              taskTwoSelectedPairId ? styles.pairsOptionButtonReady : '',
                              isUsed ? styles.pairsOptionButtonUsed : '',
                            ]
                              .filter(Boolean)
                              .join(' ');

                            return (
                              <li key={optionId ?? `option-item-${index}`}>
                                <button
                                  type="button"
                                  className={optionClassName}
                                  onClick={() => submitTaskTwoOption(optionId)}
                                  disabled={
                                    !optionId ||
                                    !taskTwoSelectedPairId ||
                                    isUsedByAnotherPair ||
                                    isCompletingTaskTwo ||
                                    isPreparingPairs ||
                                    isSubmittingPairsAnswer
                                  }>
                                  <span className={styles.pairsMainText}>{option.text || '—'}</span>
                                  {isUsed ? (
                                    <span className={styles.pairsStateText}>
                                      {isUsedBySelectedPair ? 'Selected' : 'Used'}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    </div>
                  </>
                ) : (
                  <p className={styles.taskEmpty}>
                    No Exercise 2 pairs were returned for this track.
                  </p>
                )}
              </div>
            ) : null}

            {isTaskThreeStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 3</p>
                <h3 className={styles.taskTitle}>Match phrases from your database</h3>

                <p className={styles.pairsProgress}>
                  {pairsAnsweredCount}/{pairsItems.length || 0} pairs answered
                </p>

                {pairsItems.length > 0 && pairsOptions.length > 0 ? (
                  <>
                    <p className={styles.pairsHint}>
                      {taskThreeSelectedPairId
                        ? 'Now choose a matching translation from the right column.'
                        : 'Pick a card from the left column to start matching.'}
                    </p>

                    <div className={styles.pairsBoard}>
                      <section className={styles.pairsColumn}>
                        <h4 className={styles.pairsColumnTitle}>Kyrgyz</h4>
                        <ul className={styles.pairsList}>
                          {pairsItems.map((item, index) => {
                            const pairId = normalizeId(item?.pairId);
                            const answer = pairId ? pairsAnswers[pairId] : null;
                            const isSelected = Boolean(pairId && taskThreeSelectedPairId === pairId);

                            const pairClassName = [
                              styles.pairsButton,
                              styles.pairsLeftButton,
                              isSelected ? styles.pairsLeftButtonSelected : '',
                              answer?.correct ? styles.pairsLeftButtonCorrect : '',
                              answer && !answer.correct ? styles.pairsLeftButtonWrong : '',
                            ]
                              .filter(Boolean)
                              .join(' ');

                            return (
                              <li key={pairId ?? `pair-item-${index}`}>
                                <button
                                  type="button"
                                  className={pairClassName}
                                  onClick={() => selectTaskThreePairItem(pairId)}
                                  disabled={!pairId || isSubmittingPairsAnswer || isFinishingPairs}>
                                  <span className={styles.pairsMainText}>{item.leftText || '—'}</span>
                                  {answer ? (
                                    <span className={styles.pairsStateText}>
                                      {answer.correct ? 'Correct' : 'Wrong'}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>

                      <section className={styles.pairsColumn}>
                        <h4 className={styles.pairsColumnTitle}>Russian options</h4>
                        <ul className={styles.pairsList}>
                          {pairsOptions.map((option, index) => {
                            const optionId = normalizeId(option?.optionId);
                            const ownerPairId = optionId
                              ? pairsOptionOwners.get(optionId) ?? null
                              : null;
                            const isUsedByAnotherPair =
                              Boolean(ownerPairId) && ownerPairId !== taskThreeSelectedPairId;
                            const isUsedBySelectedPair =
                              Boolean(ownerPairId) && ownerPairId === taskThreeSelectedPairId;
                            const isUsed = Boolean(ownerPairId);

                            const optionClassName = [
                              styles.pairsButton,
                              styles.pairsOptionButton,
                              taskThreeSelectedPairId ? styles.pairsOptionButtonReady : '',
                              isUsed ? styles.pairsOptionButtonUsed : '',
                            ]
                              .filter(Boolean)
                              .join(' ');

                            return (
                              <li key={optionId ?? `option-item-${index}`}>
                                <button
                                  type="button"
                                  className={optionClassName}
                                  onClick={() => submitTaskThreeOption(optionId)}
                                  disabled={
                                    !optionId ||
                                    !taskThreeSelectedPairId ||
                                    isUsedByAnotherPair ||
                                    isSubmittingPairsAnswer ||
                                    isFinishingPairs
                                  }>
                                  <span className={styles.pairsMainText}>{option.text || '—'}</span>
                                  {isUsed ? (
                                    <span className={styles.pairsStateText}>
                                      {isUsedBySelectedPair ? 'Selected' : 'Used'}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    </div>
                  </>
                ) : (
                  <p className={styles.taskEmpty}>
                    No Task 3 pairs were returned for this track. Add phrase templates in DB and restart this task.
                  </p>
                )}
              </div>
            ) : null}

            {!isTaskOneStage && !isTaskTwoStage && !isTaskThreeStage ? (
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
            ) : null}
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
                <div className={styles.playerFallback}>
                  YouTube player is unavailable for this song.
                </div>
              )}

              <h3 className={styles.trackTitle}>{song.title ?? 'Untitled song'}</h3>
              <p className={styles.trackArtist}>{song.author ?? 'Unknown artist'}</p>
              {youtubeUrl ? (
                <a className={styles.playerLink} href={youtubeUrl} target="_blank" rel="noreferrer">
                  Open on YouTube
                </a>
              ) : null}

              <div className={styles.lessonActions}>
                {isTaskOneStage ? (
                  <>
                    <button
                      type="button"
                      className={styles.primaryActionButton}
                      onClick={completeTaskOne}
                      disabled={isCompletingTask || isPreparingPairs || isPreparingTask}>
                      {isCompletingTask || isPreparingPairs ? 'Preparing...' : 'OK'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.SONG)}
                      disabled={isCompletingTask || isPreparingPairs}>
                      Back to song
                    </button>
                  </>
                ) : null}

                {isTaskTwoStage ? (
                  <>
                    {taskTwoItems.length > 0 && taskTwoOptions.length > 0 ? (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={completeTaskTwo}
                        disabled={
                          !taskTwoCanFinish ||
                          isCompletingTaskTwo ||
                          isPreparingPairs ||
                          isSubmittingPairsAnswer
                        }>
                        {isCompletingTaskTwo || isPreparingPairs || isSubmittingPairsAnswer
                          ? 'Preparing...'
                          : 'Start exercise 3'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={completeTaskTwo}
                        disabled={isCompletingTaskTwo || isPreparingPairs || isSubmittingPairsAnswer}>
                        {isCompletingTaskTwo || isPreparingPairs || isSubmittingPairsAnswer
                          ? 'Preparing...'
                          : 'Open exercise 3'}
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_1)}
                      disabled={isCompletingTaskTwo || isPreparingPairs || isSubmittingPairsAnswer}>
                      Back to task 1
                    </button>
                  </>
                ) : null}

                {isTaskThreeStage ? (
                  <>
                    {pairsItems.length > 0 && pairsOptions.length > 0 ? (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={finishTaskThree}
                        disabled={!pairsCanFinish || isFinishingPairs || isSubmittingPairsAnswer}>
                        {isFinishingPairs ? 'Finishing...' : 'Finish exercise 3'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={openCardsPage}
                        disabled={isFinishingPairs}>
                        Open flashcards
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_2)}
                      disabled={isFinishingPairs || isSubmittingPairsAnswer}>
                      Back to task 2
                    </button>
                  </>
                ) : null}

                {!isTaskOneStage && !isTaskTwoStage && !isTaskThreeStage ? (
                  <button
                    type="button"
                    className={styles.primaryActionButton}
                    onClick={openTaskOne}
                    disabled={isPreparingTask}>
                    {isPreparingTask ? 'Preparing...' : 'Ready to learn'}
                  </button>
                ) : null}
              </div>

              <span className={styles.trackBadge}>
                {isTaskThreeStage
                  ? 'Exercise 3: matching'
                  : isTaskTwoStage
                  ? 'Exercise 2: matching'
                  : isTaskOneStage
                  ? 'Exercise 1: flashcards'
                  : 'Listening mode'}
              </span>
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
