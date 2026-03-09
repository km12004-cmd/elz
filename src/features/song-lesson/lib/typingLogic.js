import { normalizeId } from '@/shared/lib/normalizeId';
import { normalizeCardText } from './songHelpers';

export function normalizeComparableText(value) {
  if (typeof value !== 'string') return '';

  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function areEquivalentText(left, right) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

export function buildTypingRows(templates, session) {
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
