import { normalizeId } from '@/shared/lib/normalizeId';
import { uniqueTaskCards } from './songHelpers';

export function toPairsAnswersMap(answers) {
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

export function toPairsTemplateItems(cards) {
  return uniqueTaskCards(cards).map((card, index) => ({
    kg_text: card.kgText,
    ru_text: card.ruText,
    order: index + 1,
  }));
}

export function toOnlyCorrectPairsAnswers(answers) {
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

export function mergePairsAssignments(confirmedAnswers, draftAssignments) {
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

export function toOptionOwnersFromAssignments(assignments) {
  const optionOwners = new Map();

  Object.entries(assignments ?? {}).forEach(([pairId, optionId]) => {
    const normalizedPairId = normalizeId(pairId);
    const normalizedOptionId = normalizeId(optionId);
    if (!normalizedPairId || !normalizedOptionId) return;

    optionOwners.set(normalizedOptionId, normalizedPairId);
  });

  return optionOwners;
}

export function countResolvedPairs(items, answers) {
  const normalizedItems = Array.isArray(items) ? items : [];

  return normalizedItems.reduce((count, item) => {
    const pairId = normalizeId(item?.pairId);
    if (!pairId) return count;
    return answers?.[pairId]?.correct === true ? count + 1 : count;
  }, 0);
}

export function nextDraftMatchesWithReassignedOption({
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

export function getOptionUsageState({
  ownerPairId,
  selectedPairId,
  confirmedAnswers,
}) {
  const isUsed = Boolean(ownerPairId);
  const isUsedBySelectedPair = Boolean(ownerPairId) && ownerPairId === selectedPairId;
  const isCorrect = Boolean(ownerPairId && confirmedAnswers?.[ownerPairId]?.correct);
  const isLocked = isCorrect;
  const isLockedByAnotherPair = Boolean(ownerPairId) && ownerPairId !== selectedPairId && isLocked;

  return {
    isUsed,
    isUsedBySelectedPair,
    isCorrect,
    isLocked,
    isLockedByAnotherPair,
  };
}

export function buildConnectorPaths(boardNode, assignments, leftNodeMap, rightNodeMap) {
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
