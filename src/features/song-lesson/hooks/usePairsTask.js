import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeId } from '@/shared/lib/normalizeId';
import {
  toPairsAnswersMap,
  toOnlyCorrectPairsAnswers,
  mergePairsAssignments,
  toOptionOwnersFromAssignments,
  countResolvedPairs,
  nextDraftMatchesWithReassignedOption,
  buildConnectorPaths,
} from '@/features/song-lesson/lib/pairsLogic';

const INITIAL_STATS = { checks: 0, attempts: 0, errors: 0 };

export function usePairsTask({ isActive }) {
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [draftMatches, setDraftMatches] = useState({});
  const [wrongPairs, setWrongPairs] = useState({});
  const [selectedPairId, setSelectedPairId] = useState(null);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [connectorPaths, setConnectorPaths] = useState([]);

  const boardRef = useRef(null);
  const leftNodesRef = useRef(new Map());
  const rightNodesRef = useRef(new Map());

  const sessionId = normalizeId(session?.sessionId);
  const items = useMemo(
    () => (Array.isArray(session?.items) ? session.items : []),
    [session],
  );
  const options = useMemo(
    () => (Array.isArray(session?.options) ? session.options : []),
    [session],
  );
  const resolvedCount = useMemo(
    () => countResolvedPairs(items, answers),
    [answers, items],
  );
  const assignments = useMemo(
    () => mergePairsAssignments(answers, draftMatches),
    [answers, draftMatches],
  );
  const linkedCount = useMemo(
    () =>
      items.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId) return count;
        return assignments[pairId] ? count + 1 : count;
      }, 0),
    [assignments, items],
  );
  const pendingCount = useMemo(
    () =>
      items.reduce((count, item) => {
        const pairId = normalizeId(item?.pairId);
        if (!pairId || answers[pairId]?.correct) return count;
        return draftMatches[pairId] ? count + 1 : count;
      }, 0),
    [answers, draftMatches, items],
  );
  const optionOwners = useMemo(
    () => toOptionOwnersFromAssignments(assignments),
    [assignments],
  );
  const readyToCheck =
    items.length > 0 && linkedCount === items.length && pendingCount > 0;
  const allCorrect = items.length > 0 && resolvedCount === items.length;
  const accuracy =
    stats.attempts > 0
      ? Math.round(((stats.attempts - stats.errors) / stats.attempts) * 100)
      : 100;

  const recomputeConnectors = useCallback(() => {
    const nextPaths = buildConnectorPaths(
      boardRef.current,
      assignments,
      leftNodesRef.current,
      rightNodesRef.current,
    );
    setConnectorPaths(nextPaths);
  }, [assignments]);

  const activeConnectorPaths = isActive ? connectorPaths : [];

  useEffect(() => {
    if (!isActive) return undefined;

    recomputeConnectors();

    const onResize = () => {
      recomputeConnectors();
    };

    window.addEventListener('resize', onResize);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && boardRef.current) {
      observer = new ResizeObserver(recomputeConnectors);
      observer.observe(boardRef.current);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [isActive, recomputeConnectors]);

  const selectPairItem = useCallback(
    (pairId, { isBusy } = {}) => {
      const normalizedPairId = normalizeId(pairId);
      if (!normalizedPairId) return;
      if (isBusy) return;
      if (answers[normalizedPairId]?.correct) return;
      setSelectedPairId(normalizedPairId);
    },
    [answers],
  );

  const assignOption = useCallback(
    (optionId, { isBusy } = {}) => {
      const normalizedOptionId = normalizeId(optionId);
      const normalizedPairId = normalizeId(selectedPairId);
      if (!normalizedPairId || !normalizedOptionId) return;
      if (answers[normalizedPairId]?.correct) return;
      if (isBusy) return;

      const currentOptionOwner = optionOwners.get(normalizedOptionId);
      setDraftMatches((previous) => {
        return nextDraftMatchesWithReassignedOption({
          previousDraftMatches: previous,
          selectedPairId: normalizedPairId,
          selectedOptionId: normalizedOptionId,
          currentOptionOwner,
          confirmedAnswers: answers,
        });
      });
      setWrongPairs((previous) => {
        if (!previous[normalizedPairId]) return previous;
        const next = { ...previous };
        delete next[normalizedPairId];
        return next;
      });
    },
    [answers, optionOwners, selectedPairId],
  );

  const onBoardScroll = useCallback(() => {
    recomputeConnectors();
  }, [recomputeConnectors]);

  const registerLeftNode = useCallback((pairId, node) => {
    const normalizedPairId = normalizeId(pairId);
    if (!normalizedPairId) return;
    if (node) {
      leftNodesRef.current.set(normalizedPairId, node);
    } else {
      leftNodesRef.current.delete(normalizedPairId);
    }
  }, []);

  const registerRightNode = useCallback((optionId, node) => {
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedOptionId) return;
    if (node) {
      rightNodesRef.current.set(normalizedOptionId, node);
    } else {
      rightNodesRef.current.delete(normalizedOptionId);
    }
  }, []);

  const initSession = useCallback((sessionData) => {
    setSession(sessionData);
    setAnswers(toOnlyCorrectPairsAnswers(toPairsAnswersMap(sessionData?.answers)));
    setDraftMatches({});
    setWrongPairs({});
    setSelectedPairId(null);
    setStats(INITIAL_STATS);
    setConnectorPaths([]);
  }, []);

  const resetState = useCallback(() => {
    setSession(null);
    setAnswers({});
    setDraftMatches({});
    setWrongPairs({});
    setSelectedPairId(null);
    setStats(INITIAL_STATS);
    setConnectorPaths([]);
  }, []);

  // Process check results and update state. Returns { nextStats, allResolved }.
  const applyCheckResults = useCallback(
    (checkResults) => {
      const nextConfirmedAnswers = { ...answers };
      const nextDraft = { ...draftMatches };
      const nextWrongPairs = {};
      let errorsInThisCheck = 0;

      for (const result of checkResults) {
        if (result.isCorrect) {
          nextConfirmedAnswers[result.pairId] = {
            optionId: result.optionId,
            correct: true,
          };
          delete nextDraft[result.pairId];
        } else {
          delete nextDraft[result.pairId];
          nextWrongPairs[result.pairId] = true;
          errorsInThisCheck += 1;
        }
      }

      const nextStats = {
        checks: stats.checks + 1,
        attempts: stats.attempts + checkResults.length,
        errors: stats.errors + errorsInThisCheck,
      };
      const nextResolvedCount = countResolvedPairs(items, nextConfirmedAnswers);
      const allResolved = nextResolvedCount === items.length && items.length > 0;

      setAnswers(nextConfirmedAnswers);
      setDraftMatches(nextDraft);
      setWrongPairs(nextWrongPairs);
      setStats(nextStats);
      setSelectedPairId(null);

      return { nextStats, allResolved };
    },
    [answers, draftMatches, items, stats],
  );

  // Get pending pairs for checking
  const getPendingPairs = useCallback(() => {
    return items
      .map((item) => normalizeId(item?.pairId))
      .filter(Boolean)
      .filter((pairId) => !answers[pairId]?.correct)
      .map((pairId) => ({
        pairId,
        optionId: normalizeId(draftMatches[pairId]),
      }))
      .filter((entry) => entry.optionId);
  }, [answers, draftMatches, items]);

  return {
    sessionId,
    items,
    options,
    resolvedCount,
    linkedCount,
    pendingCount,
    allCorrect,
    readyToCheck,
    accuracy,
    stats,
    selectedPairId,
    assignments,
    optionOwners,
    wrongPairs,
    connectorPaths: activeConnectorPaths,
    answers,
    draftMatches,

    boardRef,
    selectPairItem,
    assignOption,
    onBoardScroll,
    registerLeftNode,
    registerRightNode,
    initSession,
    resetState,
    applyCheckResults,
    getPendingPairs,
  };
}
