import { ApiError, apiRequest } from '@/shared/api/client';
import { normalizeId } from '@/shared/lib/normalizeId';

const FLASHCARDS_BASE_PATH = '/api/flashcards';
const FLASHCARD_FOLDERS_BASE_PATH = `${FLASHCARDS_BASE_PATH}/folders`;
const CARD_TEXT_MAX_LENGTH = 500;
const FLASHCARDS_SUFFIX_PATTERN = /\s*-\s*flashcards$/i;

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeFolderName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';

  const withoutSuffix = normalized.replace(FLASHCARDS_SUFFIX_PATTERN, '').trim();
  return withoutSuffix || normalized;
}

function normalizeInteger(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(numeric) ? numeric : null;
}

function pickFirstId(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = normalizeId(object[key]);
    if (value) return value;
  }

  return null;
}

function pickFirstString(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];
    if (typeof value !== 'string') continue;

    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }

  return null;
}

function shouldRetryWithFallback(error) {
  return error instanceof ApiError && (error.status === 400 || error.status === 422);
}

async function withFallbackBodies(requestFactory, bodies) {
  let lastError = null;

  for (const body of bodies) {
    try {
      return await requestFactory(body);
    } catch (error) {
      if (!shouldRetryWithFallback(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to process API request');
}

function readCollection(data) {
  if (Array.isArray(data)) return data;

  const object = asObject(data);
  if (!object) return [];

  if (Array.isArray(object.items)) return object.items;
  if (Array.isArray(object.folders)) return object.folders;
  if (Array.isArray(object.data)) return object.data;

  return [];
}

function readFolderEntity(data) {
  if (!data || Array.isArray(data)) return null;

  const object = asObject(data);
  if (!object) return null;

  return asObject(object.folder) ?? asObject(object.data) ?? asObject(object.item) ?? object;
}

function readCardEntity(data) {
  if (!data || Array.isArray(data)) return null;

  const object = asObject(data);
  if (!object) return null;

  return asObject(object.card) ?? asObject(object.data) ?? asObject(object.item) ?? object;
}

function normalizeFlashcard(value) {
  const flashcard = asObject(value) ?? {};

  return {
    id: pickFirstId(flashcard, ['flashcard_id', 'flashcardId', 'id']),
    promptText: pickFirstString(flashcard, ['prompt_text', 'promptText', 'prompt']) ?? '',
    answerText: pickFirstString(flashcard, ['answer_text', 'answerText', 'answer']) ?? '',
    sourceType: pickFirstString(flashcard, ['source_type', 'sourceType']),
    stage: normalizeInteger(flashcard.stage),
    nextDueAt: pickFirstString(flashcard, ['next_due_at', 'nextDueAt']),
  };
}

function normalizeFolderCard(value) {
  const card = asObject(value) ?? {};

  return {
    id: pickFirstId(card, ['card_id', 'flashcard_id', 'id']),
    frontText:
      pickFirstString(card, ['front_text', 'frontText', 'prompt_text', 'promptText', 'front']) ?? '',
    backText:
      pickFirstString(card, ['back_text', 'backText', 'answer_text', 'answerText', 'back']) ?? '',
    createdAt: pickFirstString(card, ['created_at', 'createdAt']) ?? null,
  };
}

function normalizeFolder(value) {
  const folder = asObject(value) ?? {};
  const cards = readCollection(folder.cards ?? folder.items).map(normalizeFolderCard);
  const rawName = pickFirstString(folder, ['name', 'title']);
  const normalizedName = normalizeFolderName(rawName);

  return {
    id: pickFirstId(folder, ['folder_id', 'folderId', 'id']),
    name: normalizedName || 'Untitled folder',
    cards,
    cardsCount:
      normalizeInteger(folder.cards_count ?? folder.cardsCount ?? folder.items_count ?? folder.itemsCount) ??
      cards.length,
  };
}

function normalizeCardText(value, fieldName) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > CARD_TEXT_MAX_LENGTH) {
    throw new Error(`${fieldName} must be at most ${CARD_TEXT_MAX_LENGTH} characters`);
  }

  return normalized;
}

export async function fetchDueFlashcards({ token } = {}) {
  const data = await apiRequest(`${FLASHCARDS_BASE_PATH}/due`, { token });
  const items = Array.isArray(data?.items) ? data.items : [];

  return items.map(normalizeFlashcard);
}

export async function reviewFlashcard({ token, flashcardId, correct } = {}) {
  const normalizedFlashcardId = normalizeId(flashcardId);
  if (!normalizedFlashcardId) throw new Error('Flashcard id is required');
  if (typeof correct !== 'boolean') throw new Error('Correct flag must be a boolean');

  const data = await apiRequest(
    `${FLASHCARDS_BASE_PATH}/${encodeURIComponent(normalizedFlashcardId)}/review`,
    {
      method: 'POST',
      token,
      body: { correct },
    },
  );

  return {
    flashcardId: pickFirstId(data, ['flashcard_id', 'flashcardId', 'id']) ?? normalizedFlashcardId,
    stage: normalizeInteger(data?.stage),
    nextDueAt: pickFirstString(data, ['next_due_at', 'nextDueAt']),
  };
}

export async function fetchFlashcardFolders({ token } = {}) {
  const data = await apiRequest(FLASHCARD_FOLDERS_BASE_PATH, { token });

  return readCollection(data)
    .map(normalizeFolder)
    .filter((folder) => normalizeId(folder.id))
    .map((folder) => ({
      ...folder,
      cards: [],
    }));
}

export async function createFlashcardFolder({ token, name } = {}) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new Error('Folder name is required');
  }

  const data = await withFallbackBodies(
    (body) =>
      apiRequest(FLASHCARD_FOLDERS_BASE_PATH, {
        method: 'POST',
        token,
        body,
      }),
    [{ name: normalizedName }, { title: normalizedName }],
  );

  const normalized = normalizeFolder(readFolderEntity(data) ?? data);

  return {
    ...normalized,
    id: normalized.id ?? pickFirstId(data, ['folder_id', 'folderId', 'id']),
    name: normalized.name || normalizeFolderName(normalizedName) || normalizedName,
    cards: [],
    cardsCount: typeof normalized.cardsCount === 'number' ? normalized.cardsCount : 0,
  };
}

export async function deleteFlashcardFolder({ token, folderId } = {}) {
  const normalizedFolderId = normalizeId(folderId);
  if (!normalizedFolderId) {
    throw new Error('Folder id is required');
  }

  return apiRequest(`${FLASHCARD_FOLDERS_BASE_PATH}/${encodeURIComponent(normalizedFolderId)}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchFlashcardFolderDetail({ token, folderId } = {}) {
  const normalizedFolderId = normalizeId(folderId);
  if (!normalizedFolderId) {
    throw new Error('Folder id is required');
  }

  const data = await apiRequest(`${FLASHCARD_FOLDERS_BASE_PATH}/${encodeURIComponent(normalizedFolderId)}`, {
    token,
  });

  const normalizedFolder = normalizeFolder(readFolderEntity(data) ?? data);
  const cards = Array.isArray(data?.cards)
    ? data.cards.map(normalizeFolderCard)
    : normalizedFolder.cards;

  return {
    ...normalizedFolder,
    id: normalizedFolder.id ?? normalizedFolderId,
    cards,
    cardsCount: cards.length,
  };
}

export async function createFlashcardInFolder({ token, folderId, frontText, backText } = {}) {
  const normalizedFolderId = normalizeId(folderId);
  if (!normalizedFolderId) {
    throw new Error('Folder id is required');
  }

  const normalizedFrontText = normalizeCardText(frontText, 'Front text');
  const normalizedBackText = normalizeCardText(backText, 'Back text');

  const data = await withFallbackBodies(
    (body) =>
      apiRequest(`${FLASHCARD_FOLDERS_BASE_PATH}/${encodeURIComponent(normalizedFolderId)}/cards`, {
        method: 'POST',
        token,
        body,
      }),
    [
      { front: normalizedFrontText, back: normalizedBackText },
      { front_text: normalizedFrontText, back_text: normalizedBackText },
      { prompt_text: normalizedFrontText, answer_text: normalizedBackText },
    ],
  );

  const normalized = normalizeFolderCard(readCardEntity(data) ?? data);

  return {
    ...normalized,
    id: normalized.id ?? pickFirstId(data, ['card_id', 'flashcard_id', 'id']) ?? null,
    frontText: normalized.frontText || normalizedFrontText,
    backText: normalized.backText || normalizedBackText,
  };
}

export async function deleteFlashcardInFolder({ token, folderId, cardId } = {}) {
  const normalizedFolderId = normalizeId(folderId);
  const normalizedCardId = normalizeId(cardId);

  if (!normalizedFolderId) {
    throw new Error('Folder id is required');
  }

  if (!normalizedCardId) {
    throw new Error('Card id is required');
  }

  return apiRequest(
    `${FLASHCARD_FOLDERS_BASE_PATH}/${encodeURIComponent(normalizedFolderId)}/cards/${encodeURIComponent(normalizedCardId)}`,
    {
      method: 'DELETE',
      token,
    },
  );
}
