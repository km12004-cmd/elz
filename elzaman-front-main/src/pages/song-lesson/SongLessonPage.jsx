import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createFlashcardInFolder,
  fetchFlashcardFolders,
} from '@/entities/flashcard/api';
import {
  createTrackPairsTemplates,
  fetchTrackPairsTemplates,
  finishPairsGame,
  startTrackPairsGame,
  submitPairsGameAnswer,
} from '@/entities/pairs-game/api';
import {
  fetchSongDetail,
  fetchSongLyrics,
  fetchTrackFlashcardTemplates,
  fetchTrackLearningState,
  fetchTrackLevelCards,
  markTrackAsListened,
  startTrackLearning,
} from '@/entities/song/api';
import { fetchTokenizedLyrics, fetchSongTranslations } from '@/entities/lyrics/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useProgress } from '@/features/xp/hooks/useProgress';
import { openSong, completeSong } from '@/entities/xp/api';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import { normalizeId } from '@/shared/lib/normalizeId';
import {
  formatDuration,
  toYouTubeEmbedUrl,
  isRetriableRouteError,
  formatLearningStatus,
  normalizeCardText,
  uniqueTaskCards,
  createSongFolderFromCards,
  pickAvailableFolderId,
} from '@/features/song-lesson/lib/songHelpers';
import { toPairsTemplateItems } from '@/features/song-lesson/lib/pairsLogic';
import { buildTypingRows } from '@/features/song-lesson/lib/typingLogic';
import { usePairsTask } from '@/features/song-lesson/hooks/usePairsTask';
import { useTypingTask } from '@/features/song-lesson/hooks/useTypingTask';
import FlashcardTask from '@/widgets/song-lesson/FlashcardTask';
import PairsTask from '@/widgets/song-lesson/PairsTask';
import TypingTask from '@/widgets/song-lesson/TypingTask';
import CompletionModal from '@/widgets/song-lesson/CompletionModal';
import LessonSkeleton from '@/widgets/song-lesson/LessonSkeleton';
import styles from '@/widgets/song-lesson/songLesson.module.css';

const FIRST_TASK_LEVEL = 1;
const SECOND_TASK_LEVEL = 2;
const THIRD_TASK_LEVEL = 3;
const FOURTH_TASK_LEVEL = 4;
const FIFTH_TASK_LEVEL = 5;

const LESSON_STAGE = {
  SONG: 'song',
  TASK_1: 'task_1',
  TASK_2: 'task_2',
  TASK_3: 'task_3',
  TASK_4: 'task_4',
  TASK_5: 'task_5',
};


function SongLessonPage() {
  const { token } = useAuth();
  const { applyXpResult } = useProgress();
  const navigate = useNavigate();
  const { songId } = useParams();
  const normalizedSongId = normalizeId(songId);

  const [song, setSong] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsRu, setLyricsRu] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [learningState, setLearningState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [taskError, setTaskError] = useState('');

  const [taskCards, setTaskCards] = useState([]);
  const [activeStage, setActiveStage] = useState(LESSON_STAGE.SONG);
  const [revealedCards, setRevealedCards] = useState({});
  const [exerciseOneFolderId, setExerciseOneFolderId] = useState(null);

  const [tokenizedLines, setTokenizedLines] = useState(null);
  const [translationsMap, setTranslationsMap] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [lyricsFolders, setLyricsFolders] = useState([]);
  const [isLoadingLyricsFolders, setIsLoadingLyricsFolders] = useState(false);
  const [hasLoadedLyricsFolders, setHasLoadedLyricsFolders] = useState(false);
  const [selectedLyricsFolderId, setSelectedLyricsFolderId] = useState(null);
  const [lyricsWordActionError, setLyricsWordActionError] = useState('');
  const [lyricsWordActionSuccess, setLyricsWordActionSuccess] = useState('');
  const [isAddingLyricsWordCard, setIsAddingLyricsWordCard] = useState(false);
  const [lyricsFoldersError, setLyricsFoldersError] = useState('');

  const [isPreparingTask, setIsPreparingTask] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [isCompletingTaskFour, setIsCompletingTaskFour] = useState(false);
  const [isCompletingTaskFive, setIsCompletingTaskFive] = useState(false);
  const [isPreparingPairs, setIsPreparingPairs] = useState(false);
  const [isSubmittingPairsAnswer, setIsSubmittingPairsAnswer] = useState(false);
  const [isFinishingPairs, setIsFinishingPairs] = useState(false);
  const [completionModal, setCompletionModal] = useState(null);

  const lyricsContainerRef = useRef(null);
  const lyricsWordPopoverRef = useRef(null);
  const lessonErrorsRef = useRef(0);
  const lessonStatsRef = useRef({ correct: 0, total: 0, errors: 0, checks: 0 });

  const isTaskOneStage = activeStage === LESSON_STAGE.TASK_1;
  const isTaskTwoStage = activeStage === LESSON_STAGE.TASK_2;
  const isTaskThreeStage = activeStage === LESSON_STAGE.TASK_3;
  const isTaskFourStage = activeStage === LESSON_STAGE.TASK_4;
  const isTaskFiveStage = activeStage === LESSON_STAGE.TASK_5;

  const taskTwo = usePairsTask({ isActive: isTaskTwoStage });
  const taskThree = usePairsTask({ isActive: isTaskThreeStage });
  const typingFour = useTypingTask();
  const typingFive = useTypingTask();

  const loadSong = useCallback(async () => {
    if (!normalizedSongId) {
      setSong(null);
      setLyrics(null);
      setLyricsRu(null);
      setShowTranslation(false);
      setLearningState(null);
      setExerciseOneFolderId(null);
      setLoadError('Invalid song id');
      return;
    }

    setIsLoading(true);
    setLoadError('');
    lessonErrorsRef.current = 0;
    lessonStatsRef.current = { correct: 0, total: 0, errors: 0, checks: 0 };

    try {
      const detail = await fetchSongDetail({ token, songId: normalizedSongId });
      const fetchedLyrics = await fetchSongLyrics({ token, songId: normalizedSongId }).catch(
        () => null,
      );
      const fallbackLyricsText =
        typeof fetchedLyrics === 'string' ? fetchedLyrics : fetchedLyrics?.lyricsText ?? null;
      const fallbackLyricsTextRu =
        fetchedLyrics && typeof fetchedLyrics === 'object'
          ? fetchedLyrics.lyricsTextRu ?? null
          : null;
      const lyricsText = detail.lyricsText ?? fallbackLyricsText;
      const lyricsTextRu = detail.lyricsTextRu ?? fallbackLyricsTextRu;
      const nextLearningState = await fetchTrackLearningState({
        token,
        trackId: normalizedSongId,
      }).catch(() => null);

      setSong(detail);
      setLyrics(lyricsText);
      setLyricsRu(lyricsTextRu);
      setLearningState(nextLearningState);
      setExerciseOneFolderId(normalizeId(nextLearningState?.folderId));
    } catch (error) {
      setSong(null);
      setLyrics(null);
      setLyricsRu(null);
      setLearningState(null);
      setExerciseOneFolderId(null);
      setLoadError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedSongId, token]);

  useEffect(() => {
    loadSong();
  }, [loadSong]);

  // Register song open for XP timer gate (fire-and-forget)
  useEffect(() => {
    if (token && normalizedSongId) {
      openSong({ token, songId: normalizedSongId }).catch(() => {});
    }
  }, [normalizedSongId, token]);

  // Load tokenized lyrics and translations
  useEffect(() => {
    if (!token || !normalizedSongId || !song) return;
    let cancelled = false;

    (async () => {
      try {
        const [tokenized, tMap] = await Promise.all([
          fetchTokenizedLyrics({ token, songId: normalizedSongId }).catch(() => null),
          fetchSongTranslations({ token, songId: normalizedSongId, lang: 'ru' }).catch(
            () => new Map(),
          ),
        ]);
        if (!cancelled) {
          setTokenizedLines(tokenized?.lines?.length ? tokenized.lines : null);
          setTranslationsMap(tMap instanceof Map ? tMap : new Map());
        }
      } catch {
        if (!cancelled) {
          setTokenizedLines(null);
          setTranslationsMap(new Map());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, normalizedSongId, song]);

  useEffect(() => {
    setTaskCards([]);
    setTaskError('');
    setRevealedCards({});
    setExerciseOneFolderId(null);
    taskTwo.resetState();
    taskThree.resetState();
    typingFour.resetState();
    typingFive.resetState();
    setCompletionModal(null);
    setActiveStage(LESSON_STAGE.SONG);
    setLyrics(null);
    setLyricsRu(null);
    setShowTranslation(false);
    setTokenizedLines(null);
    setTranslationsMap(null);
    setSelectedWord(null);
    setLyricsFolders([]);
    setIsLoadingLyricsFolders(false);
    setHasLoadedLyricsFolders(false);
    setSelectedLyricsFolderId(null);
    setLyricsFoldersError('');
    setLyricsWordActionError('');
    setLyricsWordActionSuccess('');
    setIsAddingLyricsWordCard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSongId]);

  const preparedTaskCards = useMemo(() => uniqueTaskCards(taskCards), [taskCards]);
  const learningStatus = useMemo(
    () => formatLearningStatus(learningState?.status),
    [learningState?.status],
  );
  const hasKyrgyzLyrics = typeof lyrics === 'string' && lyrics.trim().length > 0;
  const hasRussianLyrics = typeof lyricsRu === 'string' && lyricsRu.trim().length > 0;
  const canToggleLyrics = hasKyrgyzLyrics && hasRussianLyrics;
  const activeLyrics = useMemo(() => {
    if (showTranslation && hasRussianLyrics) return lyricsRu;
    if (hasKyrgyzLyrics) return lyrics;
    if (hasRussianLyrics) return lyricsRu;
    return null;
  }, [hasKyrgyzLyrics, hasRussianLyrics, lyrics, lyricsRu, showTranslation]);
  const activeLyricsLanguage = useMemo(() => {
    if (showTranslation && hasRussianLyrics) return 'ru';
    if (hasKyrgyzLyrics) return 'kg';
    if (hasRussianLyrics) return 'ru';
    return null;
  }, [hasKyrgyzLyrics, hasRussianLyrics, showTranslation]);
  const lyricsLines = useMemo(
    () =>
      typeof activeLyrics === 'string'
        ? activeLyrics
            .split(/\r?\n/g)
            .map((line) => line.trimEnd())
            .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
        : [],
    [activeLyrics],
  );
  const preferredLyricsFolderId = useMemo(
    () => normalizeId(exerciseOneFolderId) ?? normalizeId(learningState?.folderId) ?? null,
    [exerciseOneFolderId, learningState?.folderId],
  );
  const selectedWordPopoverStyle = useMemo(() => {
    if (!selectedWord) return null;

    return {
      top: `${selectedWord.top + 8}px`,
      left: `clamp(146px, ${selectedWord.left}px, calc(100% - 146px))`,
    };
  }, [selectedWord]);

  useEffect(() => {
    if (!selectedWord) return;
    const popoverNode = lyricsWordPopoverRef.current;
    const containerNode = lyricsContainerRef.current;
    if (!popoverNode || !containerNode) return;

    requestAnimationFrame(() => {
      const containerRect = containerNode.getBoundingClientRect();
      const popoverRect = popoverNode.getBoundingClientRect();

      if (popoverRect.left < containerRect.left + 4) {
        popoverNode.style.left = `${popoverRect.width / 2 + 4}px`;
      } else if (popoverRect.right > containerRect.right - 4) {
        popoverNode.style.left = `${containerNode.scrollWidth - popoverRect.width / 2 - 4}px`;
      }

      if (popoverRect.bottom > containerRect.bottom) {
        const aboveTop = selectedWord.top - popoverRect.height - 12;
        if (aboveTop > 0) {
          popoverNode.style.top = `${aboveTop}px`;
        }
      }
    });
  }, [selectedWord]);
  const youtubeEmbedUrl = useMemo(() => toYouTubeEmbedUrl(song?.youtubeUrl), [song?.youtubeUrl]);
  const youtubeUrl = typeof song?.youtubeUrl === 'string' ? song.youtubeUrl.trim() : '';

  const toggleLyricsTranslation = useCallback(() => {
    if (!canToggleLyrics) return;
    setShowTranslation((previous) => !previous);
    setSelectedWord(null);
  }, [canToggleLyrics]);

  const loadLyricsFolders = useCallback(async () => {
    if (!token) return;

    setIsLoadingLyricsFolders(true);
    setLyricsFoldersError('');

    try {
      const fetchedFolders = await fetchFlashcardFolders({ token });
      const normalizedFolders = (Array.isArray(fetchedFolders) ? fetchedFolders : []).filter(
        (folder) => normalizeId(folder?.id),
      );
      const defaultFolderId = pickAvailableFolderId(
        normalizedFolders,
        selectedLyricsFolderId,
        preferredLyricsFolderId,
      );

      setLyricsFolders(normalizedFolders);
      setSelectedLyricsFolderId(defaultFolderId ?? null);
    } catch (error) {
      setLyricsFolders([]);
      setSelectedLyricsFolderId(null);
      setLyricsFoldersError(extractErrorMessage(error, { context: 'cards' }));
    } finally {
      setIsLoadingLyricsFolders(false);
      setHasLoadedLyricsFolders(true);
    }
  }, [preferredLyricsFolderId, selectedLyricsFolderId, token]);

  const addSelectedWordToFlashcards = useCallback(async () => {
    if (!selectedWord) return;

    const folderId = normalizeId(selectedLyricsFolderId);
    const frontText = normalizeCardText(selectedWord.surface);
    const backText = normalizeCardText(selectedWord.translation);

    if (!folderId) {
      setLyricsWordActionError('Сначала выберите папку для карточек.');
      setLyricsWordActionSuccess('');
      return;
    }

    if (!frontText || !backText) {
      setLyricsWordActionError('Перевод для этого слова отсутствует.');
      setLyricsWordActionSuccess('');
      return;
    }

    setIsAddingLyricsWordCard(true);
    setLyricsWordActionError('');
    setLyricsWordActionSuccess('');

    try {
      await createFlashcardInFolder({
        token,
        folderId,
        frontText,
        backText,
      });
      setLyricsWordActionSuccess('Карточка добавлена');
    } catch (error) {
      setLyricsWordActionError(extractErrorMessage(error, { context: 'folder' }));
    } finally {
      setIsAddingLyricsWordCard(false);
    }
  }, [selectedLyricsFolderId, selectedWord, token]);

  useEffect(() => {
    if (!selectedWord || hasLoadedLyricsFolders || isLoadingLyricsFolders) return;
    loadLyricsFolders();
  }, [hasLoadedLyricsFolders, isLoadingLyricsFolders, loadLyricsFolders, selectedWord]);

  useEffect(() => {
    if (!lyricsFolders.length) return;

    setSelectedLyricsFolderId((previous) => {
      const nextFolderId = pickAvailableFolderId(lyricsFolders, previous, preferredLyricsFolderId);
      return nextFolderId ?? null;
    });
  }, [lyricsFolders, preferredLyricsFolderId]);

  useEffect(() => {
    if (!selectedWord) return undefined;

    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (lyricsWordPopoverRef.current?.contains(target)) return;
      if (target.closest('[data-lyrics-word="true"]')) return;
      setSelectedWord(null);
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedWord(null);
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [selectedWord]);

  useEffect(() => {
    if (!lyricsWordActionError && !lyricsWordActionSuccess) return undefined;

    const timer = setTimeout(() => {
      setLyricsWordActionError('');
      setLyricsWordActionSuccess('');
    }, 2200);

    return () => clearTimeout(timer);
  }, [lyricsWordActionError, lyricsWordActionSuccess]);

  const pairsBusy = { isBusy: isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs };

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
    setCompletionModal(null);
    setRevealedCards({});
    taskTwo.resetState();
    taskThree.resetState();

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
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
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

      taskTwo.initSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      taskThree.resetState();
      setCompletionModal(null);
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

      taskThree.initSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      typingFour.resetState();
      typingFive.resetState();
      setCompletionModal(null);
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

  const startTaskFourExercise = async () => {
    if (!normalizedSongId) throw new Error('Track id is required');

    setIsPreparingPairs(true);
    setTaskError('');

    try {
      let templates = [];
      try {
        templates = await fetchTrackPairsTemplates({
          token,
          trackId: normalizedSongId,
          exerciseIdx: FOURTH_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) throw error;
      }

      let session = null;
      try {
        session = await startTrackPairsGame({
          token,
          trackId: normalizedSongId,
          exerciseIdx: FOURTH_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) throw error;
      }

      const normalizedSessionId = normalizeId(session?.sessionId);
      if (session && !normalizedSessionId) {
        throw new Error('Exercise 4 session was not created');
      }

      const rows = buildTypingRows(templates, session);
      if (rows.length === 0) {
        throw new Error('No Exercise 4 prompts were returned for this track.');
      }

      typingFour.initSession(normalizedSessionId, rows);
      typingFive.resetState();
      setCompletionModal(null);
      setActiveStage(LESSON_STAGE.TASK_4);

      setLearningState((previous) => ({
        trackId: previous?.trackId ?? normalizedSongId,
        status: previous?.status ?? 'in_progress',
        unlockedLevel:
          typeof previous?.unlockedLevel === 'number' ? previous.unlockedLevel : FIRST_TASK_LEVEL,
        unlockedGame:
          typeof previous?.unlockedGame === 'number'
            ? Math.max(previous.unlockedGame, FOURTH_TASK_LEVEL)
            : FOURTH_TASK_LEVEL,
        folderId: exerciseOneFolderId ?? previous?.folderId ?? null,
      }));
    } finally {
      setIsPreparingPairs(false);
    }
  };

  const startTaskFiveExercise = async () => {
    if (!normalizedSongId) throw new Error('Track id is required');

    setIsPreparingPairs(true);
    setTaskError('');

    try {
      let templates = [];
      try {
        templates = await fetchTrackPairsTemplates({
          token,
          trackId: normalizedSongId,
          exerciseIdx: FIFTH_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) throw error;
      }

      let session = null;
      try {
        session = await startTrackPairsGame({
          token,
          trackId: normalizedSongId,
          exerciseIdx: FIFTH_TASK_LEVEL,
        });
      } catch (error) {
        if (!isRetriableRouteError(error)) throw error;
      }

      const normalizedSessionId = normalizeId(session?.sessionId);
      if (session && !normalizedSessionId) {
        throw new Error('Exercise 5 session was not created');
      }

      const rows = buildTypingRows(templates, session);
      if (rows.length === 0) {
        throw new Error('No Exercise 5 prompts were returned for this track.');
      }

      typingFive.initSession(normalizedSessionId, rows);
      setCompletionModal(null);
      setActiveStage(LESSON_STAGE.TASK_5);

      setLearningState((previous) => ({
        trackId: previous?.trackId ?? normalizedSongId,
        status: previous?.status ?? 'in_progress',
        unlockedLevel:
          typeof previous?.unlockedLevel === 'number' ? previous.unlockedLevel : FIRST_TASK_LEVEL,
        unlockedGame:
          typeof previous?.unlockedGame === 'number'
            ? Math.max(previous.unlockedGame, FIFTH_TASK_LEVEL)
            : FIFTH_TASK_LEVEL,
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
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsCompletingTask(false);
    }
  };

  const checkTaskTwoAnswers = async () => {
    const normalizedSessionId = taskTwo.sessionId;
    if (!normalizedSessionId || !taskTwo.readyToCheck) return;

    const pendingPairs = taskTwo.getPendingPairs();
    if (pendingPairs.length === 0) return;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
      const checkResults = [];

      for (const entry of pendingPairs) {
        const answer = await submitPairsGameAnswer({
          token,
          sessionId: normalizedSessionId,
          pairId: entry.pairId,
          optionId: entry.optionId,
        });

        const savedPairId = normalizeId(answer?.pairId) ?? entry.pairId;
        const savedOptionId = normalizeId(answer?.optionId) ?? entry.optionId;
        const isCorrect = answer?.correct === true;

        checkResults.push({
          pairId: savedPairId,
          optionId: savedOptionId,
          isCorrect,
        });
      }

      const { nextStats, allResolved } = taskTwo.applyCheckResults(checkResults);

      if (allResolved) {
        lessonErrorsRef.current += nextStats.errors;
        lessonStatsRef.current = {
          correct: lessonStatsRef.current.correct + taskTwo.items.length,
          total: lessonStatsRef.current.total + taskTwo.items.length,
          errors: lessonStatsRef.current.errors + nextStats.errors,
          checks: lessonStatsRef.current.checks + nextStats.checks,
        };
        setIsFinishingPairs(true);

        let task2FinishResult = null;
        try {
          task2FinishResult = await finishPairsGame({
            token,
            sessionId: normalizedSessionId,
          });
        } finally {
          setIsFinishingPairs(false);
        }

        if (task2FinishResult?.xpApplied) {
          applyXpResult({
            applied: true,
            xpDelta: task2FinishResult.xpDelta,
            newXp: task2FinishResult.newXp,
            newLevel: task2FinishResult.newLevel,
            nextLevelThreshold: task2FinishResult.nextLevelThreshold,
            xpToNextLevel: task2FinishResult.xpToNextLevel,
          });
        } else if (task2FinishResult?.passed) {
          applyXpResult({ applied: false });
        }

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
      }
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsSubmittingPairsAnswer(false);
      setIsFinishingPairs(false);
    }
  };

  const goToMainFromCompletionModal = () => {
    setCompletionModal(null);
    navigate('/');
  };

  const openCardsFromCompletionModal = () => {
    setCompletionModal(null);
    openCardsPage();
  };

  const startTaskThreeFromTaskTwo = async () => {
    if (isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs) return;

    try {
      await startTaskThreeExercise();
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    }
  };

  const startTaskFourFromTaskThree = async () => {
    if (isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs) return;

    try {
      await startTaskFourExercise();
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    }
  };

  const completeTaskFour = async () => {
    if (typingFour.rows.length === 0) return;

    const { allCorrect, newErrors } = typingFour.checkAllAnswers();
    if (!allCorrect) {
      lessonErrorsRef.current += newErrors;
      return;
    }

    lessonErrorsRef.current += typingFour.stats.errors;
    lessonStatsRef.current = {
      correct: lessonStatsRef.current.correct + typingFour.rows.length,
      total: lessonStatsRef.current.total + typingFour.rows.length,
      errors: lessonStatsRef.current.errors + typingFour.stats.errors,
      checks: lessonStatsRef.current.checks + typingFour.stats.checks,
    };

    setIsCompletingTaskFour(true);
    setTaskError('');

    try {
      if (typingFour.sessionId) {
        for (const row of typingFour.rows) {
          if (!row?.pairId || !row?.optionId) continue;
          await submitPairsGameAnswer({
            token,
            sessionId: typingFour.sessionId,
            pairId: row.pairId,
            optionId: row.optionId,
          });
        }

        const task4FinishResult = await finishPairsGame({
          token,
          sessionId: typingFour.sessionId,
        }).catch(() => null);

        if (task4FinishResult?.xpApplied) {
          applyXpResult({
            applied: true,
            xpDelta: task4FinishResult.xpDelta,
            newXp: task4FinishResult.newXp,
            newLevel: task4FinishResult.newLevel,
            nextLevelThreshold: task4FinishResult.nextLevelThreshold,
            xpToNextLevel: task4FinishResult.xpToNextLevel,
          });
        } else if (task4FinishResult?.passed) {
          applyXpResult({ applied: false });
        }
      }

      await startTaskFiveExercise();
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsCompletingTaskFour(false);
    }
  };

  const completeTaskFive = async () => {
    if (typingFive.rows.length === 0) return;

    const { allCorrect, newErrors } = typingFive.checkAllAnswers();
    if (!allCorrect) {
      lessonErrorsRef.current += newErrors;
      return;
    }

    lessonErrorsRef.current += typingFive.stats.errors;
    lessonStatsRef.current = {
      correct: lessonStatsRef.current.correct + typingFive.rows.length,
      total: lessonStatsRef.current.total + typingFive.rows.length,
      errors: lessonStatsRef.current.errors + typingFive.stats.errors,
      checks: lessonStatsRef.current.checks + typingFive.stats.checks,
    };

    setIsCompletingTaskFive(true);
    setTaskError('');

    try {
      let finishResult = null;

      if (typingFive.sessionId) {
        for (const row of typingFive.rows) {
          if (!row?.pairId || !row?.optionId) continue;
          await submitPairsGameAnswer({
            token,
            sessionId: typingFive.sessionId,
            pairId: row.pairId,
            optionId: row.optionId,
          });
        }

        finishResult = await finishPairsGame({
          token,
          sessionId: typingFive.sessionId,
        }).catch(() => null);
      }

      // Award XP: prefer song completion XP (which covers the whole lesson);
      // fall back to task 5 exercise XP if song completion fails.
      let songXpShown = false;
      if (finishResult?.passed && normalizedSongId && token) {
        try {
          const songXp = await completeSong({ token, songId: normalizedSongId, totalErrors: lessonErrorsRef.current });
          applyXpResult({
            applied: songXp.applied,
            xpDelta: songXp.xpDelta,
            newXp: songXp.newXp,
            newLevel: songXp.newLevel,
            nextLevelThreshold: songXp.nextLevelThreshold,
            xpToNextLevel: songXp.xpToNextLevel,
          });
          songXpShown = true;
        } catch {
          // Silently ignore — timer gate may not have passed
        }
      }
      if (!songXpShown) {
        if (finishResult?.xpApplied) {
          applyXpResult({
            applied: true,
            xpDelta: finishResult.xpDelta,
            newXp: finishResult.newXp,
            newLevel: finishResult.newLevel,
            nextLevelThreshold: finishResult.nextLevelThreshold,
            xpToNextLevel: finishResult.xpToNextLevel,
          });
        } else if (finishResult?.passed) {
          applyXpResult({ applied: false });
        }
      }

      setLearningState((previous) => {
        const nextStatus =
          finishResult?.passed === false ? previous?.status ?? 'in_progress' : 'finished';

        if (!previous) {
          return {
            trackId: normalizedSongId,
            status: nextStatus,
            unlockedLevel: THIRD_TASK_LEVEL,
            unlockedGame: FIFTH_TASK_LEVEL,
            folderId: exerciseOneFolderId ?? null,
          };
        }

        return {
          ...previous,
          status: nextStatus,
          unlockedLevel: Math.max(previous.unlockedLevel ?? 0, THIRD_TASK_LEVEL),
          unlockedGame: Math.max(previous.unlockedGame ?? 0, FIFTH_TASK_LEVEL),
          folderId: exerciseOneFolderId ?? previous.folderId ?? null,
        };
      });

      const agg = lessonStatsRef.current;
      const finalTotal = agg.total;
      const finalErrors = agg.errors;
      const finalCorrect = finalTotal - finalErrors;
      const finalAccuracy = finalTotal > 0 ? Math.round((finalCorrect / finalTotal) * 100) : 100;

      setCompletionModal({
        title: 'Lesson completed',
        subtitle: 'Great work. You finished all 5 exercises for this song.',
        correct: finalCorrect,
        total: finalTotal,
        errors: finalErrors,
        checks: agg.checks,
        accuracy: finalAccuracy,
        nextCta: 'Open flashcards',
      });
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsCompletingTaskFive(false);
    }
  };

  const checkTaskThreeAnswers = async () => {
    const normalizedSessionId = taskThree.sessionId;
    if (!normalizedSessionId || !taskThree.readyToCheck) return;

    const pendingPairs = taskThree.getPendingPairs();
    if (pendingPairs.length === 0) return;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
      const checkResults = [];

      for (const entry of pendingPairs) {
        const answer = await submitPairsGameAnswer({
          token,
          sessionId: normalizedSessionId,
          pairId: entry.pairId,
          optionId: entry.optionId,
        });

        const savedPairId = normalizeId(answer?.pairId) ?? entry.pairId;
        const savedOptionId = normalizeId(answer?.optionId) ?? entry.optionId;
        const isCorrect = answer?.correct === true;

        checkResults.push({
          pairId: savedPairId,
          optionId: savedOptionId,
          isCorrect,
        });
      }

      const { nextStats, allResolved } = taskThree.applyCheckResults(checkResults);

      if (allResolved) {
        lessonErrorsRef.current += nextStats.errors;
        lessonStatsRef.current = {
          correct: lessonStatsRef.current.correct + taskThree.items.length,
          total: lessonStatsRef.current.total + taskThree.items.length,
          errors: lessonStatsRef.current.errors + nextStats.errors,
          checks: lessonStatsRef.current.checks + nextStats.checks,
        };
        setIsFinishingPairs(true);

        let task3FinishResult = null;
        try {
          task3FinishResult = await finishPairsGame({
            token,
            sessionId: normalizedSessionId,
          });
        } finally {
          setIsFinishingPairs(false);
        }

        if (task3FinishResult?.xpApplied) {
          applyXpResult({
            applied: true,
            xpDelta: task3FinishResult.xpDelta,
            newXp: task3FinishResult.newXp,
            newLevel: task3FinishResult.newLevel,
            nextLevelThreshold: task3FinishResult.nextLevelThreshold,
            xpToNextLevel: task3FinishResult.xpToNextLevel,
          });
        } else if (task3FinishResult?.passed) {
          applyXpResult({ applied: false });
        }

        setLearningState((previous) => {
          const nextUnlockedGameFloor = FOURTH_TASK_LEVEL;
          const nextStatus = previous?.status ?? 'in_progress';

          if (!previous) {
            return {
              trackId: normalizedSongId,
              status: nextStatus,
              unlockedLevel: THIRD_TASK_LEVEL,
              unlockedGame: nextUnlockedGameFloor,
              folderId: exerciseOneFolderId ?? null,
            };
          }

          return {
            ...previous,
            status: nextStatus,
            unlockedLevel: Math.max(previous.unlockedLevel ?? 0, THIRD_TASK_LEVEL),
            unlockedGame: Math.max(previous.unlockedGame ?? 0, nextUnlockedGameFloor),
            folderId: exerciseOneFolderId ?? previous.folderId ?? null,
          };
        });
      }
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsSubmittingPairsAnswer(false);
      setIsFinishingPairs(false);
    }
  };

  const lessonActionButtons = (
    <>
      {isTaskOneStage ? (
        <>
          <button
            type="button"
            className={styles.primaryActionButton}
            onClick={completeTaskOne}
            disabled={isCompletingTask || isPreparingPairs || isPreparingTask}>
            {isCompletingTask || isPreparingPairs ? 'Подготовка...' : 'ОК'}
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => setActiveStage(LESSON_STAGE.SONG)}
            disabled={isCompletingTask || isPreparingPairs}>
            Вернуться к песне
          </button>
        </>
      ) : null}

      {isTaskTwoStage ? (
        <>
          {taskTwo.items.length > 0 && taskTwo.options.length > 0 ? (
            <button
              type="button"
              className={styles.primaryActionButton}
              onClick={
                taskTwo.allCorrect ? startTaskThreeFromTaskTwo : checkTaskTwoAnswers
              }
              disabled={
                taskTwo.allCorrect
                  ? isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                  : !taskTwo.readyToCheck ||
                    isPreparingPairs ||
                    isSubmittingPairsAnswer ||
                    isFinishingPairs
              }>
              {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                ? 'Проверка...'
                : taskTwo.allCorrect
                ? 'Начать задание 3'
                : 'Проверить'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryActionButton}
              onClick={startTaskThreeFromTaskTwo}
              disabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}>
              {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                ? 'Подготовка...'
                : 'Открыть задание 3'}
            </button>
          )}

          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => setActiveStage(LESSON_STAGE.TASK_1)}
            disabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}>
            К заданию 1
          </button>
        </>
      ) : null}

      {isTaskThreeStage ? (
        <>
          {taskThree.items.length > 0 && taskThree.options.length > 0 ? (
            <button
              type="button"
              className={styles.primaryActionButton}
              onClick={
                taskThree.allCorrect ? startTaskFourFromTaskThree : checkTaskThreeAnswers
              }
              disabled={
                taskThree.allCorrect
                  ? isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                  : !taskThree.readyToCheck ||
                    isPreparingPairs ||
                    isSubmittingPairsAnswer ||
                    isFinishingPairs
              }>
              {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                ? 'Проверка...'
                : taskThree.allCorrect
                ? 'Начать задание 4'
                : 'Проверить'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryActionButton}
              onClick={startTaskFourFromTaskThree}
              disabled={isPreparingPairs || isFinishingPairs || isSubmittingPairsAnswer}>
              Открыть задание 4
            </button>
          )}

          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => setActiveStage(LESSON_STAGE.TASK_2)}
            disabled={isFinishingPairs || isSubmittingPairsAnswer || isPreparingPairs}>
            К заданию 2
          </button>
        </>
      ) : null}

      {isTaskFourStage ? (
        <>
          <button
            type="button"
            className={styles.primaryActionButton}
            onClick={completeTaskFour}
            disabled={
              isCompletingTaskFour || isPreparingPairs || typingFour.rows.length === 0
            }>
            {isCompletingTaskFour || isPreparingPairs
              ? 'Подготовка...'
              : 'Проверить и начать задание 5'}
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => setActiveStage(LESSON_STAGE.TASK_3)}
            disabled={isCompletingTaskFour || isPreparingPairs}>
            К заданию 3
          </button>
        </>
      ) : null}

      {isTaskFiveStage ? (
        <>
          <button
            type="button"
            className={styles.primaryActionButton}
            onClick={completeTaskFive}
            disabled={
              isCompletingTaskFive || isPreparingPairs || typingFive.rows.length === 0
            }>
            {isCompletingTaskFive || isPreparingPairs ? 'Завершение...' : 'Завершить урок'}
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => setActiveStage(LESSON_STAGE.TASK_4)}
            disabled={isCompletingTaskFive || isPreparingPairs}>
            К заданию 4
          </button>
        </>
      ) : null}

      {!isTaskOneStage &&
      !isTaskTwoStage &&
      !isTaskThreeStage &&
      !isTaskFourStage &&
      !isTaskFiveStage ? (
        <button
          type="button"
          className={styles.primaryActionButton}
          onClick={openTaskOne}
          disabled={isPreparingTask}>
          {isPreparingTask ? 'Подготовка...' : 'Начать обучение'}
        </button>
      ) : null}
    </>
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate(-1)}>
            Назад
          </button>
        </div>

        <h2 className={styles.title}>{song?.title ?? 'Урок по песне'}</h2>
      </header>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}
      {taskError ? <p className={styles.errorText}>{taskError}</p> : null}

      {isLoading ? <LessonSkeleton /> : null}

      {!isLoading && song ? (
        <div className={styles.layout}>
          <section className={styles.lyricsPane}>
            {isTaskOneStage ? (
              <FlashcardTask
                cards={preparedTaskCards}
                revealedCards={revealedCards}
                onToggleCard={toggleCard}
              />
            ) : null}

            {isTaskTwoStage ? (
              <PairsTask
                taskNumber={2}
                title="Соедини слова из задания 1"
                items={taskTwo.items}
                options={taskTwo.options}
                resolvedCount={taskTwo.resolvedCount}
                linkedCount={taskTwo.linkedCount}
                allCorrect={taskTwo.allCorrect}
                accuracy={taskTwo.accuracy}
                stats={taskTwo.stats}
                selectedPairId={taskTwo.selectedPairId}
                assignments={taskTwo.assignments}
                optionOwners={taskTwo.optionOwners}
                wrongPairs={taskTwo.wrongPairs}
                connectorPaths={taskTwo.connectorPaths}
                confirmedAnswers={taskTwo.answers}
                onSelectPairItem={(pairId) => taskTwo.selectPairItem(pairId, pairsBusy)}
                onAssignOption={(optionId) => taskTwo.assignOption(optionId, pairsBusy)}
                boardRef={taskTwo.boardRef}
                onBoardScroll={taskTwo.onBoardScroll}
                registerLeftNode={taskTwo.registerLeftNode}
                registerRightNode={taskTwo.registerRightNode}
                isDisabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}
                successMessage="Все пары верны! Можно переходить к заданию 3."
                emptyMessage="Для этого трека нет пар для задания 2."
              />
            ) : null}

            {isTaskThreeStage ? (
              <PairsTask
                taskNumber={3}
                title="Соедини фразы из базы данных"
                items={taskThree.items}
                options={taskThree.options}
                resolvedCount={taskThree.resolvedCount}
                linkedCount={taskThree.linkedCount}
                allCorrect={taskThree.allCorrect}
                accuracy={taskThree.accuracy}
                stats={taskThree.stats}
                selectedPairId={taskThree.selectedPairId}
                assignments={taskThree.assignments}
                optionOwners={taskThree.optionOwners}
                wrongPairs={taskThree.wrongPairs}
                connectorPaths={taskThree.connectorPaths}
                confirmedAnswers={taskThree.answers}
                onSelectPairItem={(pairId) => taskThree.selectPairItem(pairId, pairsBusy)}
                onAssignOption={(optionId) => taskThree.assignOption(optionId, pairsBusy)}
                boardRef={taskThree.boardRef}
                onBoardScroll={taskThree.onBoardScroll}
                registerLeftNode={taskThree.registerLeftNode}
                registerRightNode={taskThree.registerRightNode}
                isDisabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}
                successMessage="Все пары верны! Можно переходить к заданию 4."
                emptyMessage="No Task 3 pairs were returned for this track. Add phrase templates in DB and restart this task."
              />
            ) : null}

            {isTaskFourStage ? (
              <TypingTask
                taskNumber={4}
                title="Напиши перевод на кыргызском"
                subtitle="Напиши каждое предложение на кыргызском. Регистр и пунктуация не учитываются."
                rows={typingFour.rows}
                inputs={typingFour.inputs}
                results={typingFour.results}
                correctCount={typingFour.correctCount}
                onInputChange={typingFour.onInputChange}
                isDisabled={isCompletingTaskFour || isPreparingPairs}
                emptyMessage="Для этого трека нет заданий для упражнения 4."
              />
            ) : null}

            {isTaskFiveStage ? (
              <TypingTask
                taskNumber={5}
                title="Напиши краткий перевод"
                subtitle="Напиши каждое предложение на кыргызском. Регистр и пунктуация не учитываются."
                rows={typingFive.rows}
                inputs={typingFive.inputs}
                results={typingFive.results}
                correctCount={typingFive.correctCount}
                onInputChange={typingFive.onInputChange}
                isDisabled={isCompletingTaskFive || isPreparingPairs}
                emptyMessage="Для этого трека нет заданий для упражнения 5."
              />
            ) : null}

            {!isTaskOneStage &&
            !isTaskTwoStage &&
            !isTaskThreeStage &&
            !isTaskFourStage &&
            !isTaskFiveStage ? (
              <>
                <div className={styles.lyricsHeader}>
                  <div className={styles.lyricsHeading}>
                    <p className={styles.lyricsTitle}>Текст песни</p>
                    {activeLyricsLanguage ? (
                      <span className={styles.lyricsTag}>
                        {activeLyricsLanguage === 'ru' ? 'Русский' : 'Кыргызский'}
                      </span>
                    ) : null}
                  </div>
                  {hasRussianLyrics ? (
                    <button
                      type="button"
                      className={`${styles.translateButton} ${
                        showTranslation ? styles.translateButtonActive : ''
                      }`}
                      onClick={toggleLyricsTranslation}
                      disabled={!canToggleLyrics}
                      aria-pressed={showTranslation}>
                      {showTranslation ? 'Кыргызский' : 'Перевести'}
                    </button>
                  ) : null}
                </div>
                {lyricsLines.length > 0 ? (
                  <div
                    ref={lyricsContainerRef}
                    key={`lyrics-${activeLyricsLanguage ?? 'none'}-${
                      showTranslation ? 'ru' : 'kg'
                    }`}
                    className={`${styles.lyricsList} ${styles.lyricsListAnimated}`}
                    data-i18n-skip="true">
                    {tokenizedLines && activeLyricsLanguage === 'kg' && !showTranslation
                      ? tokenizedLines.map((line, lineIdx) => (
                          <p
                            key={`tline-${line.id}`}
                            className={styles.lyricsLine}
                            style={{ '--line-index': lineIdx }}>
                            {line.tokens.length > 0
                              ? line.tokens.map((tok) =>
                                  tok.isWord ? (
                                    <span
                                      key={tok.id}
                                      role="button"
                                      tabIndex={0}
                                      data-lyrics-word="true"
                                      className={`${styles.lyricsWord}${
                                        selectedWord?.id === tok.id
                                          ? ` ${styles.lyricsWordActive}`
                                          : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const containerNode = lyricsContainerRef.current;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const containerRect = containerNode?.getBoundingClientRect();
                                        const scrollTop = containerNode?.scrollTop ?? 0;
                                        const scrollLeft = containerNode?.scrollLeft ?? 0;
                                        const translation = translationsMap?.get(tok.normalized) ?? null;
                                        setLyricsWordActionError('');
                                        setLyricsWordActionSuccess('');
                                        setSelectedWord({
                                          id: tok.id,
                                          surface: tok.surface,
                                          normalized: tok.normalized,
                                          translation,
                                          top: rect.bottom - (containerRect?.top ?? 0) + scrollTop,
                                          left:
                                            rect.left -
                                            (containerRect?.left ?? 0) +
                                            scrollLeft +
                                            rect.width / 2,
                                        });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          e.currentTarget.click();
                                        }
                                      }}>
                                      {tok.surface}
                                    </span>
                                  ) : (
                                    <span key={`s-${tok.id}`}>{tok.surface}</span>
                                  ),
                                )
                              : line.textRaw || ' '}
                          </p>
                        ))
                      : lyricsLines.map((line, index) => (
                          <p
                            key={`line-${index}`}
                            className={styles.lyricsLine}
                            style={{ '--line-index': index }}>
                            {line || ' '}
                          </p>
                        ))}
                    {selectedWord ? (
                      <div
                        ref={lyricsWordPopoverRef}
                        className={styles.wordPopover}
                        style={selectedWordPopoverStyle}
                        role="dialog"
                        aria-label="Word translation">
                        <div className={styles.wordPopoverHeader}>
                          <span className={styles.wordPopoverWord}>{selectedWord.surface}</span>
                          <button
                            type="button"
                            className={styles.wordPopoverAddButton}
                            onClick={addSelectedWordToFlashcards}
                            disabled={
                              isAddingLyricsWordCard ||
                              isLoadingLyricsFolders ||
                              !selectedWord.translation ||
                              !selectedLyricsFolderId
                            }
                            title={
                              selectedWord.translation
                                ? 'Добавить в карточки'
                                : 'Перевод недоступен'
                            }
                            aria-label="Добавить в карточки">
                            {isAddingLyricsWordCard ? '...' : '+'}
                          </button>
                        </div>

                        <p className={styles.wordPopoverTranslation}>
                          {selectedWord.translation ?? 'Перевод пока недоступен'}
                        </p>

                        <div className={styles.wordPopoverControls}>
                          <label
                            htmlFor="lyrics-word-folder-select"
                            className={styles.wordPopoverLabel}>
                            Папка карточек
                          </label>
                          <select
                            id="lyrics-word-folder-select"
                            className={styles.wordPopoverSelect}
                            value={selectedLyricsFolderId ?? ''}
                            onChange={(event) => {
                              setSelectedLyricsFolderId(normalizeId(event.target.value));
                              setLyricsWordActionError('');
                              setLyricsWordActionSuccess('');
                            }}
                            disabled={
                              isLoadingLyricsFolders ||
                              isAddingLyricsWordCard ||
                              lyricsFolders.length === 0
                            }>
                            <option value="" disabled>
                              {isLoadingLyricsFolders
                                ? 'Загрузка папок...'
                                : lyricsFolders.length > 0
                                ? 'Выбери папку'
                                : 'Нет доступных папок'}
                            </option>
                            {lyricsFolders.map((folder, index) => {
                              const folderId = normalizeId(folder?.id);
                              if (!folderId) return null;
                              return (
                                <option key={folderId ?? `lyrics-folder-${index}`} value={folderId}>
                                  {folder.name || 'Без названия'}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {lyricsFoldersError ? (
                          <p className={styles.wordPopoverStateError}>{lyricsFoldersError}</p>
                        ) : null}
                        {lyricsFoldersError ? (
                          <button
                            type="button"
                            className={styles.wordPopoverRetryButton}
                            onClick={loadLyricsFolders}
                            disabled={isLoadingLyricsFolders}>
                            Повторить
                          </button>
                        ) : null}
                        {lyricsWordActionError ? (
                          <p className={styles.wordPopoverStateError}>{lyricsWordActionError}</p>
                        ) : null}
                        {lyricsWordActionSuccess ? (
                          <p className={styles.wordPopoverStateSuccess}>{lyricsWordActionSuccess}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className={styles.lyricsEmpty}>Текст песни пока недоступен.</p>
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
                  YouTube-плеер недоступен для этой песни.
                </div>
              )}

              <h3 className={styles.trackTitle}>{song.title ?? 'Без названия'}</h3>
              <p className={styles.trackArtist}>{song.author ?? 'Неизвестный исполнитель'}</p>
              {youtubeUrl ? (
                <a className={styles.playerLink} href={youtubeUrl} target="_blank" rel="noreferrer">
                  Открыть на YouTube
                </a>
              ) : null}

              <div className={styles.lessonActions}>{lessonActionButtons}</div>

              <span className={styles.trackBadge}>
                {isTaskFiveStage
                  ? 'Задание 5: ввод текста'
                  : isTaskFourStage
                  ? 'Задание 4: ввод текста'
                  : isTaskThreeStage
                  ? 'Задание 3: соединение'
                  : isTaskTwoStage
                  ? 'Задание 2: соединение'
                  : isTaskOneStage
                  ? 'Задание 1: карточки'
                  : 'Режим прослушивания'}
              </span>
            </article>

            <article className={styles.infoPanel}>
              <h3 className={styles.sidebarTitle}>Детали</h3>
              <dl className={styles.metaList}>
                <div className={styles.metaRow}>
                  <dt>Исполнитель</dt>
                  <dd>{song.author ?? 'Неизвестный исполнитель'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Год</dt>
                  <dd>{song.releaseYear ?? '—'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Длительность</dt>
                  <dd>{formatDuration(song.durationSeconds)}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Обучение</dt>
                  <dd>{learningStatus}</dd>
                </div>
              </dl>
            </article>
          </aside>

          <div className={styles.lessonActionsMobile}>{lessonActionButtons}</div>
        </div>
      ) : null}

      <CompletionModal
        data={completionModal}
        onGoToMain={goToMainFromCompletionModal}
        onOpenCards={openCardsFromCompletionModal}
      />
    </section>
  );
}

export default SongLessonPage;
