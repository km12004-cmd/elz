import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  markTrackAsListened,
  startTrackLearning,
} from '../../api/songs';
import { useAuth } from '../../auth/useAuth';
import { useProgress } from '../../contexts/useProgress';
import { openSong, completeSong } from '../../api/xp';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import styles from './SongLessonPage.module.css';

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

function normalizeComparableText(value) {
  if (typeof value !== 'string') return '';

  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areEquivalentText(left, right) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

function buildTypingRows(templates, session) {
  const normalizedTemplates = Array.isArray(templates) ? templates : [];
  const sessionItems = Array.isArray(session?.items) ? session.items : [];
  const sessionOptions = Array.isArray(session?.options) ? session.options : [];

  const usedItemIndexes = new Set();
  const usedOptionIndexes = new Set();

  return normalizedTemplates
    .map((template, index) => {
      const promptRu = normalizeCardText(template?.ruText);
      const expectedKg = normalizeCardText(template?.kgText);

      let matchedPairId = null;
      for (let itemIndex = 0; itemIndex < sessionItems.length; itemIndex += 1) {
        if (usedItemIndexes.has(itemIndex)) continue;
        if (!areEquivalentText(sessionItems[itemIndex]?.leftText, expectedKg)) continue;
        usedItemIndexes.add(itemIndex);
        matchedPairId = normalizeId(sessionItems[itemIndex]?.pairId);
        break;
      }

      let matchedOptionId = null;
      for (let optionIndex = 0; optionIndex < sessionOptions.length; optionIndex += 1) {
        if (usedOptionIndexes.has(optionIndex)) continue;
        if (!areEquivalentText(sessionOptions[optionIndex]?.text, promptRu)) continue;
        usedOptionIndexes.add(optionIndex);
        matchedOptionId = normalizeId(sessionOptions[optionIndex]?.optionId);
        break;
      }

      return {
        rowId: matchedPairId ?? normalizeId(template?.id) ?? `typing-row-${index + 1}`,
        order: typeof template?.order === 'number' ? template.order : index + 1,
        promptRu,
        expectedKg,
        pairId: matchedPairId,
        optionId: matchedOptionId,
      };
    })
    .filter((row) => row.promptRu || row.expectedKg)
    .sort((left, right) => left.order - right.order);
}

function toOnlyCorrectPairsAnswers(answers) {
  if (!answers || typeof answers !== 'object') return {};

  return Object.entries(answers).reduce((accumulator, [pairId, answer]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(answer?.optionId);
    if (!normalizedPairId || !normalizedOptionId || answer?.correct !== true) return accumulator;

    return {
      ...accumulator,
      [normalizedPairId]: {
        optionId: normalizedOptionId,
        correct: true,
      },
    };
  }, {});
}

function mergePairsAssignments(confirmedAnswers, draftAssignments) {
  const merged = {};

  Object.entries(confirmedAnswers ?? {}).forEach(([pairId, answer]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(answer?.optionId);
    if (!normalizedPairId || !normalizedOptionId || answer?.correct !== true) return;
    merged[normalizedPairId] = normalizedOptionId;
  });

  Object.entries(draftAssignments ?? {}).forEach(([pairId, optionId]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedPairId || !normalizedOptionId) return;
    if (merged[normalizedPairId]) return;
    merged[normalizedPairId] = normalizedOptionId;
  });

  return merged;
}

function toOptionOwnersFromAssignments(assignments) {
  const optionOwners = new Map();

  Object.entries(assignments ?? {}).forEach(([pairId, optionId]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedPairId || !normalizedOptionId) return;

    optionOwners.set(normalizedOptionId, normalizedPairId);
  });

  return optionOwners;
}

function countResolvedPairs(items, answers) {
  const normalizedItems = Array.isArray(items) ? items : [];

  return normalizedItems.reduce((count, item) => {
    const pairId = normalizeId(item?.pairId);
    if (!pairId) return count;
    return answers?.[pairId]?.correct === true ? count + 1 : count;
  }, 0);
}

function nextDraftMatchesWithReassignedOption({
  previousDraftMatches,
  selectedPairId,
  selectedOptionId,
  currentOptionOwner,
  confirmedAnswers,
}) {
  if (!selectedPairId || !selectedOptionId) return previousDraftMatches;

  if (
    currentOptionOwner &&
    currentOptionOwner !== selectedPairId &&
    confirmedAnswers?.[currentOptionOwner]?.correct
  ) {
    return previousDraftMatches;
  }

  const next = { ...previousDraftMatches };

  if (currentOptionOwner && currentOptionOwner !== selectedPairId) {
    delete next[currentOptionOwner];
  }

  next[selectedPairId] = selectedOptionId;
  return next;
}

function getOptionUsageState({ ownerPairId, selectedPairId, confirmedAnswers }) {
  const isUsed = Boolean(ownerPairId);
  const isUsedBySelectedPair = Boolean(ownerPairId) && ownerPairId === selectedPairId;
  const isLocked = Boolean(ownerPairId && confirmedAnswers?.[ownerPairId]?.correct);
  const isLockedByAnotherPair = Boolean(ownerPairId) && ownerPairId !== selectedPairId && isLocked;

  return {
    isUsed,
    isUsedBySelectedPair,
    isLocked,
    isLockedByAnotherPair,
  };
}

function buildConnectorPaths(boardNode, assignments, leftNodeMap, rightNodeMap) {
  if (!boardNode || !assignments || typeof assignments !== 'object') return [];

  const boardRect = boardNode.getBoundingClientRect();

  return Object.entries(assignments)
    .map(([pairId, optionId]) => {
      const leftNode = leftNodeMap.get(pairId);
      const rightNode = rightNodeMap.get(optionId);
      if (!leftNode || !rightNode) return null;

      const leftRect = leftNode.getBoundingClientRect();
      const rightRect = rightNode.getBoundingClientRect();

      const startX = leftRect.right - boardRect.left;
      const startY = leftRect.top + leftRect.height / 2 - boardRect.top;
      const endX = rightRect.left - boardRect.left;
      const endY = rightRect.top + rightRect.height / 2 - boardRect.top;

      if (endX <= startX) return null;

      return {
        id: `${pairId}-${optionId}`,
        pairId,
        d: `M ${startX} ${startY} L ${endX} ${endY}`,
      };
    })
    .filter(Boolean);
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

  const [taskTwoSession, setTaskTwoSession] = useState(null);
  const [taskTwoAnswers, setTaskTwoAnswers] = useState({});
  const [taskTwoDraftMatches, setTaskTwoDraftMatches] = useState({});
  const [taskTwoWrongPairs, setTaskTwoWrongPairs] = useState({});
  const [taskTwoSelectedPairId, setTaskTwoSelectedPairId] = useState(null);
  const [taskTwoStats, setTaskTwoStats] = useState({
    checks: 0,
    attempts: 0,
    errors: 0,
  });
  const [taskTwoConnectorPaths, setTaskTwoConnectorPaths] = useState([]);

  const [pairsSession, setPairsSession] = useState(null);
  const [pairsAnswers, setPairsAnswers] = useState({});
  const [taskThreeDraftMatches, setTaskThreeDraftMatches] = useState({});
  const [taskThreeWrongPairs, setTaskThreeWrongPairs] = useState({});
  const [taskThreeSelectedPairId, setTaskThreeSelectedPairId] = useState(null);
  const [taskThreeStats, setTaskThreeStats] = useState({
    checks: 0,
    attempts: 0,
    errors: 0,
  });
  const [taskThreeConnectorPaths, setTaskThreeConnectorPaths] = useState([]);
  const [taskFourSessionId, setTaskFourSessionId] = useState(null);
  const [taskFourRows, setTaskFourRows] = useState([]);
  const [taskFourInputs, setTaskFourInputs] = useState({});
  const [taskFourResults, setTaskFourResults] = useState({});
  const [taskFiveSessionId, setTaskFiveSessionId] = useState(null);
  const [taskFiveRows, setTaskFiveRows] = useState([]);
  const [taskFiveInputs, setTaskFiveInputs] = useState({});
  const [taskFiveResults, setTaskFiveResults] = useState({});

  const [isPreparingTask, setIsPreparingTask] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [isCompletingTaskFour, setIsCompletingTaskFour] = useState(false);
  const [isCompletingTaskFive, setIsCompletingTaskFive] = useState(false);
  const [isPreparingPairs, setIsPreparingPairs] = useState(false);
  const [isSubmittingPairsAnswer, setIsSubmittingPairsAnswer] = useState(false);
  const [isFinishingPairs, setIsFinishingPairs] = useState(false);
  const [completionModal, setCompletionModal] = useState(null);

  const taskTwoBoardRef = useRef(null);
  const taskTwoLeftNodesRef = useRef(new Map());
  const taskTwoRightNodesRef = useRef(new Map());
  const taskThreeBoardRef = useRef(null);
  const taskThreeLeftNodesRef = useRef(new Map());
  const taskThreeRightNodesRef = useRef(new Map());

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

  useEffect(() => {
    setTaskCards([]);
    setTaskError('');
    setRevealedCards({});
    setExerciseOneFolderId(null);
    setTaskTwoSession(null);
    setTaskTwoAnswers({});
    setTaskTwoDraftMatches({});
    setTaskTwoWrongPairs({});
    setTaskTwoSelectedPairId(null);
    setTaskTwoStats({
      checks: 0,
      attempts: 0,
      errors: 0,
    });
    setTaskTwoConnectorPaths([]);
    setPairsSession(null);
    setPairsAnswers({});
    setTaskThreeDraftMatches({});
    setTaskThreeWrongPairs({});
    setTaskThreeSelectedPairId(null);
    setTaskThreeStats({
      checks: 0,
      attempts: 0,
      errors: 0,
    });
    setTaskThreeConnectorPaths([]);
    setTaskFourSessionId(null);
    setTaskFourRows([]);
    setTaskFourInputs({});
    setTaskFourResults({});
    setTaskFiveSessionId(null);
    setTaskFiveRows([]);
    setTaskFiveInputs({});
    setTaskFiveResults({});
    setCompletionModal(null);
    setActiveStage(LESSON_STAGE.SONG);
    setLyrics(null);
    setLyricsRu(null);
    setShowTranslation(false);
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
  const youtubeEmbedUrl = useMemo(() => toYouTubeEmbedUrl(song?.youtubeUrl), [song?.youtubeUrl]);
  const youtubeUrl = typeof song?.youtubeUrl === 'string' ? song.youtubeUrl.trim() : '';

  const isTaskOneStage = activeStage === LESSON_STAGE.TASK_1;
  const isTaskTwoStage = activeStage === LESSON_STAGE.TASK_2;
  const isTaskThreeStage = activeStage === LESSON_STAGE.TASK_3;
  const isTaskFourStage = activeStage === LESSON_STAGE.TASK_4;
  const isTaskFiveStage = activeStage === LESSON_STAGE.TASK_5;
  const toggleLyricsTranslation = useCallback(() => {
    if (!canToggleLyrics) return;
    setShowTranslation((previous) => !previous);
  }, [canToggleLyrics]);

  const taskTwoItems = useMemo(
    () => (Array.isArray(taskTwoSession?.items) ? taskTwoSession.items : []),
    [taskTwoSession?.items],
  );
  const taskTwoOptions = useMemo(
    () => (Array.isArray(taskTwoSession?.options) ? taskTwoSession.options : []),
    [taskTwoSession?.options],
  );
  const taskTwoResolvedCount = useMemo(
    () => countResolvedPairs(taskTwoItems, taskTwoAnswers),
    [taskTwoAnswers, taskTwoItems],
  );
  const taskTwoAssignments = useMemo(
    () => mergePairsAssignments(taskTwoAnswers, taskTwoDraftMatches),
    [taskTwoAnswers, taskTwoDraftMatches],
  );
  const taskTwoLinkedCount = useMemo(
    () =>
      taskTwoItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId) return count;
        return taskTwoAssignments[pairId] ? count + 1 : count;
      }, 0),
    [taskTwoAssignments, taskTwoItems],
  );
  const taskTwoPendingCount = useMemo(
    () =>
      taskTwoItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId || taskTwoAnswers[pairId]?.correct) return count;
        return taskTwoDraftMatches[pairId] ? count + 1 : count;
      }, 0),
    [taskTwoAnswers, taskTwoDraftMatches, taskTwoItems],
  );
  const taskTwoOptionOwners = useMemo(
    () => toOptionOwnersFromAssignments(taskTwoAssignments),
    [taskTwoAssignments],
  );
  const taskTwoReadyToCheck =
    taskTwoItems.length > 0 &&
    taskTwoLinkedCount === taskTwoItems.length &&
    taskTwoPendingCount > 0;
  const taskTwoAllCorrect = taskTwoItems.length > 0 && taskTwoResolvedCount === taskTwoItems.length;
  const taskTwoSessionId = normalizeId(taskTwoSession?.sessionId);
  const taskTwoAccuracy =
    taskTwoStats.attempts > 0
      ? Math.round(((taskTwoStats.attempts - taskTwoStats.errors) / taskTwoStats.attempts) * 100)
      : 100;

  const pairsSessionId = normalizeId(pairsSession?.sessionId);
  const pairsItems = useMemo(
    () => (Array.isArray(pairsSession?.items) ? pairsSession.items : []),
    [pairsSession?.items],
  );
  const pairsOptions = useMemo(
    () => (Array.isArray(pairsSession?.options) ? pairsSession.options : []),
    [pairsSession?.options],
  );
  const taskThreeResolvedCount = useMemo(
    () => countResolvedPairs(pairsItems, pairsAnswers),
    [pairsAnswers, pairsItems],
  );
  const taskThreeAssignments = useMemo(
    () => mergePairsAssignments(pairsAnswers, taskThreeDraftMatches),
    [pairsAnswers, taskThreeDraftMatches],
  );
  const taskThreeLinkedCount = useMemo(
    () =>
      pairsItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId) return count;
        return taskThreeAssignments[pairId] ? count + 1 : count;
      }, 0),
    [pairsItems, taskThreeAssignments],
  );
  const taskThreePendingCount = useMemo(
    () =>
      pairsItems.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId || pairsAnswers[pairId]?.correct) return count;
        return taskThreeDraftMatches[pairId] ? count + 1 : count;
      }, 0),
    [pairsAnswers, pairsItems, taskThreeDraftMatches],
  );
  const pairsOptionOwners = useMemo(
    () => toOptionOwnersFromAssignments(taskThreeAssignments),
    [taskThreeAssignments],
  );
  const taskThreeReadyToCheck =
    Boolean(pairsSessionId) &&
    pairsItems.length > 0 &&
    taskThreeLinkedCount === pairsItems.length &&
    taskThreePendingCount > 0;
  const taskThreeAllCorrect = pairsItems.length > 0 && taskThreeResolvedCount === pairsItems.length;
  const taskThreeAccuracy =
    taskThreeStats.attempts > 0
      ? Math.round(
          ((taskThreeStats.attempts - taskThreeStats.errors) / taskThreeStats.attempts) * 100,
        )
      : 100;

  const recomputeTaskTwoConnectors = useCallback(() => {
    const nextPaths = buildConnectorPaths(
      taskTwoBoardRef.current,
      taskTwoAssignments,
      taskTwoLeftNodesRef.current,
      taskTwoRightNodesRef.current,
    );
    setTaskTwoConnectorPaths(nextPaths);
  }, [taskTwoAssignments]);

  const recomputeTaskThreeConnectors = useCallback(() => {
    const nextPaths = buildConnectorPaths(
      taskThreeBoardRef.current,
      taskThreeAssignments,
      taskThreeLeftNodesRef.current,
      taskThreeRightNodesRef.current,
    );
    setTaskThreeConnectorPaths(nextPaths);
  }, [taskThreeAssignments]);

  useEffect(() => {
    if (!isTaskTwoStage) {
      setTaskTwoConnectorPaths([]);
      return undefined;
    }

    recomputeTaskTwoConnectors();

    const onResize = () => {
      recomputeTaskTwoConnectors();
    };

    window.addEventListener('resize', onResize);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && taskTwoBoardRef.current) {
      observer = new ResizeObserver(recomputeTaskTwoConnectors);
      observer.observe(taskTwoBoardRef.current);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [isTaskTwoStage, recomputeTaskTwoConnectors]);

  useEffect(() => {
    if (!isTaskThreeStage) {
      setTaskThreeConnectorPaths([]);
      return undefined;
    }

    recomputeTaskThreeConnectors();

    const onResize = () => {
      recomputeTaskThreeConnectors();
    };

    window.addEventListener('resize', onResize);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && taskThreeBoardRef.current) {
      observer = new ResizeObserver(recomputeTaskThreeConnectors);
      observer.observe(taskThreeBoardRef.current);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [isTaskThreeStage, recomputeTaskThreeConnectors]);

  const taskFourCorrectCount = useMemo(
    () =>
      taskFourRows.reduce((count, row) => {
        const rowId = normalizeId(row?.rowId);
        if (!rowId) return count;
        return taskFourResults[rowId] === true ? count + 1 : count;
      }, 0),
    [taskFourRows, taskFourResults],
  );

  const taskFiveCorrectCount = useMemo(
    () =>
      taskFiveRows.reduce((count, row) => {
        const rowId = normalizeId(row?.rowId);
        if (!rowId) return count;
        return taskFiveResults[rowId] === true ? count + 1 : count;
      }, 0),
    [taskFiveRows, taskFiveResults],
  );

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
    setTaskTwoSession(null);
    setTaskTwoAnswers({});
    setTaskTwoDraftMatches({});
    setTaskTwoWrongPairs({});
    setTaskTwoSelectedPairId(null);
    setTaskTwoStats({
      checks: 0,
      attempts: 0,
      errors: 0,
    });
    setTaskTwoConnectorPaths([]);
    setPairsSession(null);
    setPairsAnswers({});
    setTaskThreeDraftMatches({});
    setTaskThreeWrongPairs({});
    setTaskThreeSelectedPairId(null);
    setTaskThreeStats({
      checks: 0,
      attempts: 0,
      errors: 0,
    });
    setTaskThreeConnectorPaths([]);

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

      setTaskTwoSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      setTaskTwoAnswers(toOnlyCorrectPairsAnswers(toPairsAnswersMap(session?.answers)));
      setTaskTwoDraftMatches({});
      setTaskTwoWrongPairs({});
      setTaskTwoSelectedPairId(null);
      setTaskTwoStats({
        checks: 0,
        attempts: 0,
        errors: 0,
      });
      setTaskTwoConnectorPaths([]);
      setPairsSession(null);
      setPairsAnswers({});
      setTaskThreeDraftMatches({});
      setTaskThreeWrongPairs({});
      setTaskThreeSelectedPairId(null);
      setTaskThreeStats({
        checks: 0,
        attempts: 0,
        errors: 0,
      });
      setTaskThreeConnectorPaths([]);
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

      setPairsSession({
        ...session,
        sessionId: normalizedSessionId,
      });
      setPairsAnswers(toOnlyCorrectPairsAnswers(toPairsAnswersMap(session?.answers)));
      setTaskThreeDraftMatches({});
      setTaskThreeWrongPairs({});
      setTaskThreeSelectedPairId(null);
      setTaskThreeStats({
        checks: 0,
        attempts: 0,
        errors: 0,
      });
      setTaskThreeConnectorPaths([]);
      setTaskFourSessionId(null);
      setTaskFourRows([]);
      setTaskFourInputs({});
      setTaskFourResults({});
      setTaskFiveSessionId(null);
      setTaskFiveRows([]);
      setTaskFiveInputs({});
      setTaskFiveResults({});
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

      setTaskFourSessionId(normalizedSessionId);
      setTaskFourRows(rows);
      setTaskFourInputs({});
      setTaskFourResults({});
      setTaskFiveSessionId(null);
      setTaskFiveRows([]);
      setTaskFiveInputs({});
      setTaskFiveResults({});
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

      setTaskFiveSessionId(normalizedSessionId);
      setTaskFiveRows(rows);
      setTaskFiveInputs({});
      setTaskFiveResults({});
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

  const selectTaskTwoPairItem = (pairId) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs) return;
    if (taskTwoAnswers[normalizedPairId]?.correct) return;

    setTaskTwoSelectedPairId(normalizedPairId);
  };

  const assignTaskTwoOption = (optionId) => {
    const normalizedOptionId = normalizeId(optionId);
    const normalizedPairId = normalizeId(taskTwoSelectedPairId);
    if (!normalizedPairId || !normalizedOptionId) return;
    if (taskTwoAnswers[normalizedPairId]?.correct) return;
    if (isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs) return;

    const currentOptionOwner = taskTwoOptionOwners.get(normalizedOptionId);
    setTaskTwoDraftMatches((previous) => {
      return nextDraftMatchesWithReassignedOption({
        previousDraftMatches: previous,
        selectedPairId: normalizedPairId,
        selectedOptionId: normalizedOptionId,
        currentOptionOwner,
        confirmedAnswers: taskTwoAnswers,
      });
    });
    setTaskTwoWrongPairs((previous) => {
      if (!previous[normalizedPairId]) return previous;
      const next = { ...previous };
      delete next[normalizedPairId];
      return next;
    });
  };

  const checkTaskTwoAnswers = async () => {
    const normalizedSessionId = normalizeId(taskTwoSessionId);
    if (!normalizedSessionId || !taskTwoReadyToCheck) return;

    const pendingPairs = taskTwoItems
      .map((item) => normalizeId(item?.pairId))
      .filter(Boolean)
      .filter((pairId) => !taskTwoAnswers[pairId]?.correct)
      .map((pairId) => ({
        pairId,
        optionId: normalizeId(taskTwoDraftMatches[pairId]),
      }))
      .filter((entry) => entry.optionId);

    if (pendingPairs.length === 0) return;

    const nextConfirmedAnswers = { ...taskTwoAnswers };
    const nextDraftMatches = { ...taskTwoDraftMatches };
    const wrongPairs = {};
    let errorsInThisCheck = 0;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
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

        if (isCorrect) {
          nextConfirmedAnswers[savedPairId] = {
            optionId: savedOptionId,
            correct: true,
          };
          delete nextDraftMatches[savedPairId];
        } else {
          delete nextDraftMatches[savedPairId];
          wrongPairs[savedPairId] = true;
          errorsInThisCheck += 1;
        }
      }

      const nextStats = {
        checks: taskTwoStats.checks + 1,
        attempts: taskTwoStats.attempts + pendingPairs.length,
        errors: taskTwoStats.errors + errorsInThisCheck,
      };
      const nextResolvedCount = countResolvedPairs(taskTwoItems, nextConfirmedAnswers);

      setTaskTwoAnswers(nextConfirmedAnswers);
      setTaskTwoDraftMatches(nextDraftMatches);
      setTaskTwoWrongPairs(wrongPairs);
      setTaskTwoStats(nextStats);
      setTaskTwoSelectedPairId(null);

      if (nextResolvedCount === taskTwoItems.length && taskTwoItems.length > 0) {
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

  const registerTaskTwoLeftNode = (pairId, node) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (node) {
      taskTwoLeftNodesRef.current.set(normalizedPairId, node);
    } else {
      taskTwoLeftNodesRef.current.delete(normalizedPairId);
    }
  };

  const registerTaskTwoRightNode = (optionId, node) => {
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedOptionId) return;
    if (node) {
      taskTwoRightNodesRef.current.set(normalizedOptionId, node);
    } else {
      taskTwoRightNodesRef.current.delete(normalizedOptionId);
    }
  };

  const onTaskTwoBoardScroll = () => {
    recomputeTaskTwoConnectors();
  };

  const registerTaskThreeLeftNode = (pairId, node) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (node) {
      taskThreeLeftNodesRef.current.set(normalizedPairId, node);
    } else {
      taskThreeLeftNodesRef.current.delete(normalizedPairId);
    }
  };

  const registerTaskThreeRightNode = (optionId, node) => {
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedOptionId) return;
    if (node) {
      taskThreeRightNodesRef.current.set(normalizedOptionId, node);
    } else {
      taskThreeRightNodesRef.current.delete(normalizedOptionId);
    }
  };

  const onTaskThreeBoardScroll = () => {
    recomputeTaskThreeConnectors();
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

  const onTaskFourInputChange = (rowId, value) => {
    const normalizedRowId = normalizeId(rowId);
    if (!normalizedRowId) return;

    setTaskFourInputs((previous) => ({
      ...previous,
      [normalizedRowId]: value,
    }));
    setTaskFourResults((previous) => {
      if (!(normalizedRowId in previous)) return previous;
      const next = { ...previous };
      delete next[normalizedRowId];
      return next;
    });
  };

  const onTaskFiveInputChange = (rowId, value) => {
    const normalizedRowId = normalizeId(rowId);
    if (!normalizedRowId) return;

    setTaskFiveInputs((previous) => ({
      ...previous,
      [normalizedRowId]: value,
    }));
    setTaskFiveResults((previous) => {
      if (!(normalizedRowId in previous)) return previous;
      const next = { ...previous };
      delete next[normalizedRowId];
      return next;
    });
  };

  const completeTaskFour = async () => {
    if (taskFourRows.length === 0) return;

    const nextResults = taskFourRows.reduce((accumulator, row) => {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) return accumulator;
      const typedText = taskFourInputs[rowId] ?? '';
      accumulator[rowId] = areEquivalentText(typedText, row.expectedKg);
      return accumulator;
    }, {});

    setTaskFourResults(nextResults);

    const allCorrect = taskFourRows.every((row) => {
      const rowId = normalizeId(row?.rowId);
      return rowId ? nextResults[rowId] === true : false;
    });
    if (!allCorrect) return;

    setIsCompletingTaskFour(true);
    setTaskError('');

    try {
      if (taskFourSessionId) {
        for (const row of taskFourRows) {
          if (!row?.pairId || !row?.optionId) continue;
          await submitPairsGameAnswer({
            token,
            sessionId: taskFourSessionId,
            pairId: row.pairId,
            optionId: row.optionId,
          });
        }

        const task4FinishResult = await finishPairsGame({
          token,
          sessionId: taskFourSessionId,
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
    if (taskFiveRows.length === 0) return;

    const nextResults = taskFiveRows.reduce((accumulator, row) => {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) return accumulator;
      const typedText = taskFiveInputs[rowId] ?? '';
      accumulator[rowId] = areEquivalentText(typedText, row.expectedKg);
      return accumulator;
    }, {});

    setTaskFiveResults(nextResults);

    const allCorrect = taskFiveRows.every((row) => {
      const rowId = normalizeId(row?.rowId);
      return rowId ? nextResults[rowId] === true : false;
    });
    if (!allCorrect) return;

    setIsCompletingTaskFive(true);
    setTaskError('');

    try {
      let finishResult = null;

      if (taskFiveSessionId) {
        for (const row of taskFiveRows) {
          if (!row?.pairId || !row?.optionId) continue;
          await submitPairsGameAnswer({
            token,
            sessionId: taskFiveSessionId,
            pairId: row.pairId,
            optionId: row.optionId,
          });
        }

        finishResult = await finishPairsGame({
          token,
          sessionId: taskFiveSessionId,
        }).catch(() => null);
      }

      // Award XP: prefer song completion XP (which covers the whole lesson);
      // fall back to task 5 exercise XP if song completion fails.
      let songXpShown = false;
      if (finishResult?.passed && normalizedSongId && token) {
        try {
          const songXp = await completeSong({ token, songId: normalizedSongId });
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

      const finalCorrect = finishResult?.correct ?? taskFiveRows.length;
      const finalTotal = finishResult?.total ?? taskFiveRows.length;
      const finalErrors = Math.max(finalTotal - finalCorrect, 0);
      const finalAccuracy = finalTotal > 0 ? Math.round((finalCorrect / finalTotal) * 100) : 100;

      setCompletionModal({
        title: 'Lesson completed',
        subtitle: 'Great work. You finished all 5 exercises for this song.',
        correct: finalCorrect,
        total: finalTotal,
        errors: finalErrors,
        checks: 1,
        accuracy: finalAccuracy,
        nextCta: 'Open flashcards',
      });
    } catch (error) {
      setTaskError(extractErrorMessage(error, { context: 'songLesson' }));
    } finally {
      setIsCompletingTaskFive(false);
    }
  };

  const selectTaskThreePairItem = (pairId) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (isSubmittingPairsAnswer || isFinishingPairs || isPreparingPairs) return;
    if (pairsAnswers[normalizedPairId]?.correct) return;

    setTaskThreeSelectedPairId(normalizedPairId);
  };

  const assignTaskThreeOption = (optionId) => {
    const normalizedOptionId = normalizeId(optionId);
    const normalizedPairId = normalizeId(taskThreeSelectedPairId);
    if (!normalizedPairId || !normalizedOptionId) return;
    if (pairsAnswers[normalizedPairId]?.correct) return;
    if (isSubmittingPairsAnswer || isFinishingPairs || isPreparingPairs) return;

    const currentOptionOwner = pairsOptionOwners.get(normalizedOptionId);
    setTaskThreeDraftMatches((previous) => {
      return nextDraftMatchesWithReassignedOption({
        previousDraftMatches: previous,
        selectedPairId: normalizedPairId,
        selectedOptionId: normalizedOptionId,
        currentOptionOwner,
        confirmedAnswers: pairsAnswers,
      });
    });
    setTaskThreeWrongPairs((previous) => {
      if (!previous[normalizedPairId]) return previous;
      const next = { ...previous };
      delete next[normalizedPairId];
      return next;
    });
  };

  const checkTaskThreeAnswers = async () => {
    const normalizedSessionId = normalizeId(pairsSessionId);
    if (!normalizedSessionId || !taskThreeReadyToCheck) return;

    const pendingPairs = pairsItems
      .map((item) => normalizeId(item?.pairId))
      .filter(Boolean)
      .filter((pairId) => !pairsAnswers[pairId]?.correct)
      .map((pairId) => ({
        pairId,
        optionId: normalizeId(taskThreeDraftMatches[pairId]),
      }))
      .filter((entry) => entry.optionId);

    if (pendingPairs.length === 0) return;

    const nextConfirmedAnswers = { ...pairsAnswers };
    const nextDraftMatches = { ...taskThreeDraftMatches };
    const wrongPairs = {};
    let errorsInThisCheck = 0;

    setIsSubmittingPairsAnswer(true);
    setTaskError('');

    try {
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

        if (isCorrect) {
          nextConfirmedAnswers[savedPairId] = {
            optionId: savedOptionId,
            correct: true,
          };
          delete nextDraftMatches[savedPairId];
        } else {
          delete nextDraftMatches[savedPairId];
          wrongPairs[savedPairId] = true;
          errorsInThisCheck += 1;
        }
      }

      const nextStats = {
        checks: taskThreeStats.checks + 1,
        attempts: taskThreeStats.attempts + pendingPairs.length,
        errors: taskThreeStats.errors + errorsInThisCheck,
      };
      const nextResolvedCount = countResolvedPairs(pairsItems, nextConfirmedAnswers);

      setPairsAnswers(nextConfirmedAnswers);
      setTaskThreeDraftMatches(nextDraftMatches);
      setTaskThreeWrongPairs(wrongPairs);
      setTaskThreeStats(nextStats);
      setTaskThreeSelectedPairId(null);

      if (nextResolvedCount === pairsItems.length && pairsItems.length > 0) {
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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate(-1)}>
            Back
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
                  {taskTwoResolvedCount}/{taskTwoItems.length || 0} correct · {taskTwoLinkedCount}/
                  {taskTwoItems.length || 0} connected
                </p>

                {taskTwoItems.length > 0 && taskTwoOptions.length > 0 ? (
                  <>
                    <p className={styles.pairsHint}>
                      {taskTwoAllCorrect
                        ? 'All pairs are correct. You can continue to Exercise 3.'
                        : taskTwoSelectedPairId
                        ? 'Choose a right option for selected card, then press Check answers.'
                        : 'Select a card on the left to connect it with translation on the right.'}
                    </p>
                    <p className={styles.pairsMeta}>
                      Accuracy: {taskTwoAccuracy}% · Errors: {taskTwoStats.errors} · Checks:{' '}
                      {taskTwoStats.checks}
                    </p>

                    <div className={styles.pairsBoardWrap} ref={taskTwoBoardRef}>
                      <svg className={styles.pairsConnectorLayer} aria-hidden="true">
                        <defs>
                          <marker
                            id="pairs-arrow-task2"
                            viewBox="0 0 8 8"
                            markerWidth="8"
                            markerHeight="8"
                            refX="6.8"
                            refY="4"
                            orient="auto">
                            <path d="M 0 0 L 8 4 L 0 8 z" className={styles.pairsConnectorArrow} />
                          </marker>
                        </defs>
                        {taskTwoConnectorPaths.map((connector) => (
                          <path
                            key={connector.id}
                            d={connector.d}
                            markerEnd="url(#pairs-arrow-task2)"
                            className={`${styles.pairsConnector} ${
                              taskTwoAnswers[connector.pairId]?.correct
                                ? styles.pairsConnectorConfirmed
                                : ''
                            }`}
                          />
                        ))}
                      </svg>

                      <div className={styles.pairsBoard}>
                        <section className={styles.pairsColumn}>
                          <h4 className={styles.pairsColumnTitle}>Kyrgyz</h4>
                          <ul className={styles.pairsList} onScroll={onTaskTwoBoardScroll}>
                            {taskTwoItems.map((item, index) => {
                              const pairId = normalizeId(item?.pairId);
                              const isSelected = Boolean(
                                pairId && taskTwoSelectedPairId === pairId,
                              );
                              const isCorrect = Boolean(pairId && taskTwoAnswers[pairId]?.correct);
                              const isWrong = Boolean(pairId && taskTwoWrongPairs[pairId]);
                              const isLinked = Boolean(
                                pairId && taskTwoAssignments[pairId] && !isCorrect,
                              );

                              const pairClassName = [
                                styles.pairsButton,
                                styles.pairsLeftButton,
                                isSelected ? styles.pairsLeftButtonSelected : '',
                                isCorrect ? styles.pairsLeftButtonCorrect : '',
                                isWrong ? styles.pairsLeftButtonWrong : '',
                                isLinked ? styles.pairsLeftButtonLinked : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <li key={pairId ?? `pair-item-${index}`}>
                                  <button
                                    ref={(node) => registerTaskTwoLeftNode(pairId, node)}
                                    type="button"
                                    className={pairClassName}
                                    onClick={() => selectTaskTwoPairItem(pairId)}
                                    disabled={
                                      !pairId ||
                                      isCorrect ||
                                      isPreparingPairs ||
                                      isSubmittingPairsAnswer ||
                                      isFinishingPairs
                                    }>
                                    <span className={styles.pairsMainText}>
                                      {item.leftText || '—'}
                                    </span>
                                    {isCorrect ? (
                                      <span className={styles.pairsStateText}>Correct</span>
                                    ) : null}
                                    {isWrong ? (
                                      <span className={styles.pairsStateText}>Try again</span>
                                    ) : null}
                                    {!isCorrect && !isWrong && isLinked ? (
                                      <span className={styles.pairsStateText}>Linked</span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>

                        <section className={styles.pairsColumn}>
                          <h4 className={styles.pairsColumnTitle}>Russian options</h4>
                          <ul className={styles.pairsList} onScroll={onTaskTwoBoardScroll}>
                            {taskTwoOptions.map((option, index) => {
                              const optionId = normalizeId(option?.optionId);
                              const ownerPairId = optionId
                                ? taskTwoOptionOwners.get(optionId) ?? null
                                : null;
                              const {
                                isUsed,
                                isUsedBySelectedPair,
                                isLocked,
                                isLockedByAnotherPair,
                              } = getOptionUsageState({
                                ownerPairId,
                                selectedPairId: taskTwoSelectedPairId,
                                confirmedAnswers: taskTwoAnswers,
                              });

                              const optionClassName = [
                                styles.pairsButton,
                                styles.pairsOptionButton,
                                taskTwoSelectedPairId ? styles.pairsOptionButtonReady : '',
                                isUsed ? styles.pairsOptionButtonUsed : '',
                                isUsedBySelectedPair ? styles.pairsOptionButtonSelected : '',
                                isLocked ? styles.pairsOptionButtonLocked : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <li key={optionId ?? `option-item-${index}`}>
                                  <button
                                    ref={(node) => registerTaskTwoRightNode(optionId, node)}
                                    type="button"
                                    className={optionClassName}
                                    onClick={() => assignTaskTwoOption(optionId)}
                                    disabled={
                                      !optionId ||
                                      !taskTwoSelectedPairId ||
                                      isLockedByAnotherPair ||
                                      isPreparingPairs ||
                                      isSubmittingPairsAnswer ||
                                      isFinishingPairs
                                    }>
                                    <span className={styles.pairsMainText}>
                                      {option.text || '—'}
                                    </span>
                                    {isUsed ? (
                                      <span className={styles.pairsStateText}>
                                        {isLocked
                                          ? 'Locked'
                                          : isUsedBySelectedPair
                                          ? 'Linked'
                                          : 'Used'}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      </div>
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
                  {taskThreeResolvedCount}/{pairsItems.length || 0} correct · {taskThreeLinkedCount}
                  /{pairsItems.length || 0} connected
                </p>

                {pairsItems.length > 0 && pairsOptions.length > 0 ? (
                  <>
                    <p className={styles.pairsHint}>
                      {taskThreeAllCorrect
                        ? 'All pairs are correct. You can continue to Exercise 4.'
                        : taskThreeSelectedPairId
                        ? 'Choose a right option for selected phrase, then press Check answers.'
                        : 'Select a phrase on the left to connect it with translation.'}
                    </p>
                    <p className={styles.pairsMeta}>
                      Accuracy: {taskThreeAccuracy}% · Errors: {taskThreeStats.errors} · Checks:{' '}
                      {taskThreeStats.checks}
                    </p>

                    <div className={styles.pairsBoardWrap} ref={taskThreeBoardRef}>
                      <svg className={styles.pairsConnectorLayer} aria-hidden="true">
                        <defs>
                          <marker
                            id="pairs-arrow-task3"
                            viewBox="0 0 8 8"
                            markerWidth="8"
                            markerHeight="8"
                            refX="6.8"
                            refY="4"
                            orient="auto">
                            <path d="M 0 0 L 8 4 L 0 8 z" className={styles.pairsConnectorArrow} />
                          </marker>
                        </defs>
                        {taskThreeConnectorPaths.map((connector) => (
                          <path
                            key={connector.id}
                            d={connector.d}
                            markerEnd="url(#pairs-arrow-task3)"
                            className={`${styles.pairsConnector} ${
                              pairsAnswers[connector.pairId]?.correct
                                ? styles.pairsConnectorConfirmed
                                : ''
                            }`}
                          />
                        ))}
                      </svg>

                      <div className={styles.pairsBoard}>
                        <section className={styles.pairsColumn}>
                          <h4 className={styles.pairsColumnTitle}>Kyrgyz</h4>
                          <ul className={styles.pairsList} onScroll={onTaskThreeBoardScroll}>
                            {pairsItems.map((item, index) => {
                              const pairId = normalizeId(item?.pairId);
                              const isSelected = Boolean(
                                pairId && taskThreeSelectedPairId === pairId,
                              );
                              const isCorrect = Boolean(pairId && pairsAnswers[pairId]?.correct);
                              const isWrong = Boolean(pairId && taskThreeWrongPairs[pairId]);
                              const isLinked = Boolean(
                                pairId && taskThreeAssignments[pairId] && !isCorrect,
                              );

                              const pairClassName = [
                                styles.pairsButton,
                                styles.pairsLeftButton,
                                isSelected ? styles.pairsLeftButtonSelected : '',
                                isCorrect ? styles.pairsLeftButtonCorrect : '',
                                isWrong ? styles.pairsLeftButtonWrong : '',
                                isLinked ? styles.pairsLeftButtonLinked : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <li key={pairId ?? `pair-item-${index}`}>
                                  <button
                                    ref={(node) => registerTaskThreeLeftNode(pairId, node)}
                                    type="button"
                                    className={pairClassName}
                                    onClick={() => selectTaskThreePairItem(pairId)}
                                    disabled={
                                      !pairId ||
                                      isCorrect ||
                                      isSubmittingPairsAnswer ||
                                      isFinishingPairs ||
                                      isPreparingPairs
                                    }>
                                    <span className={styles.pairsMainText}>
                                      {item.leftText || '—'}
                                    </span>
                                    {isCorrect ? (
                                      <span className={styles.pairsStateText}>Correct</span>
                                    ) : null}
                                    {isWrong ? (
                                      <span className={styles.pairsStateText}>Try again</span>
                                    ) : null}
                                    {!isCorrect && !isWrong && isLinked ? (
                                      <span className={styles.pairsStateText}>Linked</span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>

                        <section className={styles.pairsColumn}>
                          <h4 className={styles.pairsColumnTitle}>Russian options</h4>
                          <ul className={styles.pairsList} onScroll={onTaskThreeBoardScroll}>
                            {pairsOptions.map((option, index) => {
                              const optionId = normalizeId(option?.optionId);
                              const ownerPairId = optionId
                                ? pairsOptionOwners.get(optionId) ?? null
                                : null;
                              const {
                                isUsed,
                                isUsedBySelectedPair,
                                isLocked,
                                isLockedByAnotherPair,
                              } = getOptionUsageState({
                                ownerPairId,
                                selectedPairId: taskThreeSelectedPairId,
                                confirmedAnswers: pairsAnswers,
                              });

                              const optionClassName = [
                                styles.pairsButton,
                                styles.pairsOptionButton,
                                taskThreeSelectedPairId ? styles.pairsOptionButtonReady : '',
                                isUsed ? styles.pairsOptionButtonUsed : '',
                                isUsedBySelectedPair ? styles.pairsOptionButtonSelected : '',
                                isLocked ? styles.pairsOptionButtonLocked : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <li key={optionId ?? `option-item-${index}`}>
                                  <button
                                    ref={(node) => registerTaskThreeRightNode(optionId, node)}
                                    type="button"
                                    className={optionClassName}
                                    onClick={() => assignTaskThreeOption(optionId)}
                                    disabled={
                                      !optionId ||
                                      !taskThreeSelectedPairId ||
                                      isLockedByAnotherPair ||
                                      isSubmittingPairsAnswer ||
                                      isFinishingPairs ||
                                      isPreparingPairs
                                    }>
                                    <span className={styles.pairsMainText}>
                                      {option.text || '—'}
                                    </span>
                                    {isUsed ? (
                                      <span className={styles.pairsStateText}>
                                        {isLocked
                                          ? 'Locked'
                                          : isUsedBySelectedPair
                                          ? 'Linked'
                                          : 'Used'}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className={styles.taskEmpty}>
                    No Task 3 pairs were returned for this track. Add phrase templates in DB and
                    restart this task.
                  </p>
                )}
              </div>
            ) : null}

            {isTaskFourStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 4</p>
                <h3 className={styles.taskTitle}>Type Kyrgyz translation</h3>
                <p className={styles.taskSubtitle}>
                  Write each Kyrgyz sentence. Case and punctuation are ignored.
                </p>

                <p className={styles.pairsProgress}>
                  {taskFourCorrectCount}/{taskFourRows.length || 0} correct
                </p>

                {taskFourRows.length > 0 ? (
                  <ol className={styles.typingList}>
                    {taskFourRows.map((row, index) => {
                      const rowId = normalizeId(row?.rowId) ?? `task4-row-${index + 1}`;
                      const rowValue = taskFourInputs[rowId] ?? '';
                      const rowResult = taskFourResults[rowId];
                      const inputClassName = [
                        styles.typingInput,
                        rowResult === true ? styles.typingInputCorrect : '',
                        rowResult === false ? styles.typingInputWrong : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <li key={rowId} className={styles.typingRow}>
                          <p className={styles.typingPrompt}>{row.promptRu || '—'}</p>
                          <input
                            type="text"
                            className={inputClassName}
                            value={rowValue}
                            placeholder="Type in Kyrgyz"
                            onChange={(event) => onTaskFourInputChange(rowId, event.target.value)}
                            disabled={isCompletingTaskFour || isPreparingPairs}
                          />
                          {rowResult === true ? (
                            <p className={styles.typingRowState}>Correct</p>
                          ) : null}
                          {rowResult === false ? (
                            <p className={styles.typingRowState}>Try again</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className={styles.taskEmpty}>
                    No Exercise 4 prompts were returned for this track.
                  </p>
                )}
              </div>
            ) : null}

            {isTaskFiveStage ? (
              <div className={styles.taskPane}>
                <p className={styles.taskEyebrow}>Task 5</p>
                <h3 className={styles.taskTitle}>Type short translation</h3>
                <p className={styles.taskSubtitle}>
                  Write each Kyrgyz sentence. Case and punctuation are ignored.
                </p>

                <p className={styles.pairsProgress}>
                  {taskFiveCorrectCount}/{taskFiveRows.length || 0} correct
                </p>

                {taskFiveRows.length > 0 ? (
                  <ol className={styles.typingList}>
                    {taskFiveRows.map((row, index) => {
                      const rowId = normalizeId(row?.rowId) ?? `task5-row-${index + 1}`;
                      const rowValue = taskFiveInputs[rowId] ?? '';
                      const rowResult = taskFiveResults[rowId];
                      const inputClassName = [
                        styles.typingInput,
                        rowResult === true ? styles.typingInputCorrect : '',
                        rowResult === false ? styles.typingInputWrong : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <li key={rowId} className={styles.typingRow}>
                          <p className={styles.typingPrompt}>{row.promptRu || '—'}</p>
                          <input
                            type="text"
                            className={inputClassName}
                            value={rowValue}
                            placeholder="Type in Kyrgyz"
                            onChange={(event) => onTaskFiveInputChange(rowId, event.target.value)}
                            disabled={isCompletingTaskFive || isPreparingPairs}
                          />
                          {rowResult === true ? (
                            <p className={styles.typingRowState}>Correct</p>
                          ) : null}
                          {rowResult === false ? (
                            <p className={styles.typingRowState}>Try again</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className={styles.taskEmpty}>
                    No Exercise 5 prompts were returned for this track.
                  </p>
                )}
              </div>
            ) : null}

            {!isTaskOneStage &&
            !isTaskTwoStage &&
            !isTaskThreeStage &&
            !isTaskFourStage &&
            !isTaskFiveStage ? (
              <>
                <div className={styles.lyricsHeader}>
                  <div className={styles.lyricsHeading}>
                    <p className={styles.lyricsTitle}>Lyrics</p>
                    {activeLyricsLanguage ? (
                      <span className={styles.lyricsTag}>
                        {activeLyricsLanguage === 'ru' ? 'Russian' : 'Kyrgyz'}
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
                      {showTranslation ? 'Show Kyrgyz' : 'Translate'}
                    </button>
                  ) : null}
                </div>
                {lyricsLines.length > 0 ? (
                  <div
                    key={`lyrics-${activeLyricsLanguage ?? 'none'}-${
                      showTranslation ? 'ru' : 'kg'
                    }`}
                    className={`${styles.lyricsList} ${styles.lyricsListAnimated}`}
                    data-i18n-skip="true">
                    {lyricsLines.map((line, index) => (
                      <p
                        key={`line-${index}`}
                        className={styles.lyricsLine}
                        style={{ '--line-index': index }}>
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
                        onClick={
                          taskTwoAllCorrect ? startTaskThreeFromTaskTwo : checkTaskTwoAnswers
                        }
                        disabled={
                          taskTwoAllCorrect
                            ? isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                            : !taskTwoReadyToCheck ||
                              isPreparingPairs ||
                              isSubmittingPairsAnswer ||
                              isFinishingPairs
                        }>
                        {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                          ? 'Checking...'
                          : taskTwoAllCorrect
                          ? 'Start exercise 3'
                          : 'Check answers'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={startTaskThreeFromTaskTwo}
                        disabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}>
                        {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                          ? 'Preparing...'
                          : 'Open exercise 3'}
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_1)}
                      disabled={isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs}>
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
                        onClick={
                          taskThreeAllCorrect ? startTaskFourFromTaskThree : checkTaskThreeAnswers
                        }
                        disabled={
                          taskThreeAllCorrect
                            ? isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                            : !taskThreeReadyToCheck ||
                              isPreparingPairs ||
                              isSubmittingPairsAnswer ||
                              isFinishingPairs
                        }>
                        {isPreparingPairs || isSubmittingPairsAnswer || isFinishingPairs
                          ? 'Checking...'
                          : taskThreeAllCorrect
                          ? 'Start exercise 4'
                          : 'Check answers'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={startTaskFourFromTaskThree}
                        disabled={isPreparingPairs || isFinishingPairs || isSubmittingPairsAnswer}>
                        Open exercise 4
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_2)}
                      disabled={isFinishingPairs || isSubmittingPairsAnswer || isPreparingPairs}>
                      Back to task 2
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
                        isCompletingTaskFour || isPreparingPairs || taskFourRows.length === 0
                      }>
                      {isCompletingTaskFour || isPreparingPairs
                        ? 'Preparing...'
                        : 'Check answers & start exercise 5'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_3)}
                      disabled={isCompletingTaskFour || isPreparingPairs}>
                      Back to task 3
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
                        isCompletingTaskFive || isPreparingPairs || taskFiveRows.length === 0
                      }>
                      {isCompletingTaskFive || isPreparingPairs ? 'Finishing...' : 'Finish lesson'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveStage(LESSON_STAGE.TASK_4)}
                      disabled={isCompletingTaskFive || isPreparingPairs}>
                      Back to task 4
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
                    {isPreparingTask ? 'Preparing...' : 'Ready to learn'}
                  </button>
                ) : null}
              </div>

              <span className={styles.trackBadge}>
                {isTaskFiveStage
                  ? 'Exercise 5: typing'
                  : isTaskFourStage
                  ? 'Exercise 4: typing'
                  : isTaskThreeStage
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

      {completionModal ? (
        <div className={styles.completionModalBackdrop} role="presentation">
          <article
            className={styles.completionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-modal-title">
            <p className={styles.completionModalEyebrow}>Lesson complete</p>
            <h3 id="completion-modal-title" className={styles.completionModalTitle}>
              {completionModal.title}
            </h3>
            <p className={styles.completionModalSubtitle}>{completionModal.subtitle}</p>

            <dl className={styles.completionStats}>
              <div className={styles.completionStatItem}>
                <dt>Accuracy</dt>
                <dd>{completionModal.accuracy}%</dd>
              </div>
              <div className={styles.completionStatItem}>
                <dt>Correct</dt>
                <dd>
                  {completionModal.correct}/{completionModal.total}
                </dd>
              </div>
              <div className={styles.completionStatItem}>
                <dt>Mistakes</dt>
                <dd>{completionModal.errors}</dd>
              </div>
              <div className={styles.completionStatItem}>
                <dt>Checks</dt>
                <dd>{completionModal.checks}</dd>
              </div>
            </dl>

            <div className={styles.completionModalActions}>
              <button
                type="button"
                className={styles.secondaryActionButton}
                onClick={openCardsFromCompletionModal}>
                {completionModal.nextCta}
              </button>
              <button
                type="button"
                className={styles.primaryActionButton}
                onClick={goToMainFromCompletionModal}>
                Back to main screen
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

export default SongLessonPage;
