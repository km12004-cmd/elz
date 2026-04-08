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

export function usePairsTask({ isActive }) {
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [draftMatches, setDraftMatches] = useState({});
  const [selectedPairId, setSelectedPairId] = useState(null);
  const [hasRevealedSolutions, setHasRevealedSolutions] = useState(false);
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
  const optionOwners = useMemo(
    () => toOptionOwnersFromAssignments(assignments),
    [assignments],
  );

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
      if (hasRevealedSolutions) return;
      if (answers[normalizedPairId]?.correct) return;
      setSelectedPairId(normalizedPairId);
    },
    [answers, hasRevealedSolutions],
  );

  const assignOption = useCallback(
    (optionId, { isBusy } = {}) => {
      const normalizedOptionId = normalizeId(optionId);
      const normalizedPairId = normalizeId(selectedPairId);
      if (!normalizedPairId || !normalizedOptionId) return;
      if (answers[normalizedPairId]?.correct) return;
      if (isBusy) return;
      if (hasRevealedSolutions) return;

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
    },
    [answers, hasRevealedSolutions, optionOwners, selectedPairId],
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
    const normalizedAnswers = toOnlyCorrectPairsAnswers(toPairsAnswersMap(sessionData?.answers));
    const sessionItems = Array.isArray(sessionData?.items) ? sessionData.items : [];

    setSession(sessionData);
    setAnswers(normalizedAnswers);
    setDraftMatches({});
    setSelectedPairId(null);
    setHasRevealedSolutions(
      countResolvedPairs(sessionItems, normalizedAnswers) === sessionItems.length &&
        sessionItems.length > 0,
    );
    setConnectorPaths([]);
  }, []);

  const resetState = useCallback(() => {
    setSession(null);
    setAnswers({});
    setDraftMatches({});
    setSelectedPairId(null);
    setHasRevealedSolutions(false);
    setConnectorPaths([]);
  }, []);

  const revealSolutions = useCallback(() => {
    const nextAnswers = items.reduce((accumulator, item) => {
      const pairId = normalizeId(item?.pairId);
      if (!pairId) return accumulator;

      return {
        ...accumulator,
        [pairId]: {
          optionId: pairId,
          correct: true,
        },
      };
    }, {});

    setAnswers(nextAnswers);
    setDraftMatches({});
    setSelectedPairId(null);
    setHasRevealedSolutions(true);
  }, [items]);

  return {
    sessionId,
    items,
    options,
    resolvedCount,
    linkedCount,
    selectedPairId,
    assignments,
    optionOwners,
    hasRevealedSolutions,
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
    revealSolutions,
  };
}
