import { ApiError, apiRequest } from '@/shared/api/client';
import { normalizeId } from '@/shared/lib/normalizeId';

const TRACKS_BASE_PATH = '/api/tracks';
const PAIRS_GAMES_BASE_PATH = '/api/games/pairs';

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeInteger(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeExerciseIdx(value) {
  const numeric = normalizeInteger(value);
  if (!numeric || numeric < 1) return null;
  return numeric;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return null;
}

function pickFirstId(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const candidate = normalizeId(object[key]);
    if (candidate) return candidate;
  }

  return null;
}

function pickFirstString(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const candidate = normalizeText(object[key]);
    if (candidate) return candidate;
  }

  return null;
}

function readCollection(data, keys) {
  if (Array.isArray(data)) return data;

  const object = asObject(data);
  if (!object) return [];

  for (const key of keys) {
    if (Array.isArray(object[key])) return object[key];
  }

  return [];
}

function toBodyId(value) {
  const integer = normalizeInteger(value);
  if (typeof integer === 'number') return integer;
  return normalizeId(value);
}

function shouldRetryWithFallbackBody(error) {
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;

  return error instanceof ApiError || status === 400 || status === 422;
}

async function requestWithFallbackBodies(requestFactory, bodies) {
  if (!Array.isArray(bodies) || bodies.length === 0) {
    return requestFactory(undefined);
  }

  let lastError = null;

  for (const body of bodies) {
    try {
      return await requestFactory(body);
    } catch (error) {
      if (!shouldRetryWithFallbackBody(error)) throw error;
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new ApiError('Request failed');
}

function normalizePairsItem(value) {
  const item = asObject(value) ?? {};
  const pairId = pickFirstId(item, ['pair_id', 'pairId', 'id']);
  if (!pairId) return null;

  return {
    pairId,
    leftText: pickFirstString(item, ['left', 'kg_text', 'kgText', 'text']) ?? '',
  };
}

function normalizePairsOption(value) {
  const option = asObject(value) ?? {};
  const optionId = pickFirstId(option, ['option_id', 'optionId', 'id']);
  if (!optionId) return null;

  return {
    optionId,
    text: pickFirstString(option, ['text', 'ru_text', 'ruText']) ?? '',
  };
}

function normalizePairsAnswer(value) {
  const answer = asObject(value) ?? {};
  const pairId = pickFirstId(answer, ['pair_id', 'pairId']);
  const optionId = pickFirstId(answer, ['option_id', 'optionId', 'chosen_option_id', 'chosenOptionId']);
  if (!pairId || !optionId) return null;

  return {
    pairId,
    optionId,
    correct: normalizeBoolean(answer.correct ?? answer.is_correct ?? answer.isCorrect) === true,
    answeredAt: pickFirstString(answer, ['answered_at', 'answeredAt']),
  };
}

function normalizePairsTemplate(value, index) {
  const item = asObject(value) ?? {};
  const id = pickFirstId(item, ['id', 'pair_id', 'pairId']) ?? `pairs-template-${index}`;
  const order = normalizeInteger(item.order ?? item.order_idx ?? item.orderIdx) ?? index + 1;

  return {
    id,
    exercise:
      normalizeExerciseIdx(item.exercise ?? item.exercise_idx ?? item.exerciseIdx) ?? null,
    order,
    kgText: pickFirstString(item, ['kg_text', 'kgText', 'left', 'text']) ?? '',
    ruText: pickFirstString(item, ['ru_text', 'ruText', 'right', 'translation']) ?? '',
  };
}

function normalizePairsTemplatesCollection(data) {
  const source = asObject(data?.data) ?? asObject(data) ?? data;

  return readCollection(source, ['items', 'pairs', 'templates', 'results'])
    .map(normalizePairsTemplate)
    .filter((item) => item.kgText || item.ruText)
    .sort((left, right) => left.order - right.order);
}

function normalizeStartPayload(data, fallbackTrackId, fallbackExerciseIdx) {
  const source = asObject(data?.data) ?? asObject(data) ?? {};

  const items = readCollection(source, ['items', 'pairs', 'left_items', 'leftItems'])
    .map(normalizePairsItem)
    .filter(Boolean);
  const options = readCollection(source, ['options', 'right_items', 'rightItems'])
    .map(normalizePairsOption)
    .filter(Boolean);
  const answers = readCollection(source, ['answers', 'attempts'])
    .map(normalizePairsAnswer)
    .filter(Boolean);

  return {
    sessionId: pickFirstId(source, ['session_id', 'sessionId', 'id']),
    trackId: pickFirstId(source, ['track_id', 'trackId']) ?? fallbackTrackId,
    exercise:
      normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx) ??
      fallbackExerciseIdx,
    items,
    options,
    answers,
    status: pickFirstString(source, ['status']),
  };
}

function normalizeTemplateInputItem(value, index) {
  const item = asObject(value) ?? {};

  const kgText = normalizeText(item.kg_text ?? item.kgText ?? item.left ?? item.text);
  const ruText = normalizeText(item.ru_text ?? item.ruText ?? item.right ?? item.translation);
  if (!kgText || !ruText) return null;

  return {
    kg_text: kgText,
    ru_text: ruText,
    order: normalizeInteger(item.order ?? item.order_idx ?? item.orderIdx) ?? index + 1,
  };
}

function normalizeCreateTemplatesResult(data, fallbackTrackId, fallbackExerciseIdx) {
  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? fallbackTrackId,
    exercise:
      normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx) ??
      fallbackExerciseIdx,
    createdIds: readCollection(source, ['created_ids', 'createdIds', 'ids'])
      .map(normalizeId)
      .filter(Boolean),
    createdCount:
      normalizeInteger(source.created_count ?? source.createdCount ?? source.count) ?? 0,
  };
}

function normalizeCreateTemplatesGenericResult(data, fallbackTrackId, fallbackExerciseIdx = null) {
  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? fallbackTrackId,
    exercise:
      normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx) ??
      fallbackExerciseIdx,
    createdIds: readCollection(source, ['created_ids', 'createdIds', 'ids'])
      .map(normalizeId)
      .filter(Boolean),
    createdCount:
      normalizeInteger(source.created_count ?? source.createdCount ?? source.count) ?? 0,
  };
}

export async function fetchTrackPairsTemplates({ token, trackId, exerciseIdx } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');
  const normalizedExerciseIdx = normalizeExerciseIdx(exerciseIdx);
  if (!normalizedExerciseIdx) throw new Error('Exercise index is required');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/${encodeURIComponent(
      normalizedExerciseIdx,
    )}/templates`,
    {
      token,
    },
  );

  return normalizePairsTemplatesCollection(data);
}

export async function createTrackPairsTemplates({ token, trackId, exerciseIdx, items } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');
  const normalizedExerciseIdx = normalizeExerciseIdx(exerciseIdx);
  if (!normalizedExerciseIdx) throw new Error('Exercise index is required');

  const normalizedItems = Array.isArray(items)
    ? items.map(normalizeTemplateInputItem).filter(Boolean)
    : [];
  if (normalizedItems.length === 0) {
    throw new Error('Template items are required');
  }

  const data = await requestWithFallbackBodies(
    (body) =>
      apiRequest(
        `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/${encodeURIComponent(
          normalizedExerciseIdx,
        )}/templates`,
        {
          method: 'POST',
          token,
          body,
        },
      ),
    [{ items: normalizedItems }],
  );

  return normalizeCreateTemplatesResult(data, normalizedTrackId, normalizedExerciseIdx);
}

export async function createTrackPairsTemplatesForTrack({
  token,
  trackId,
  exerciseIdx,
  items,
} = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const normalizedExerciseIdx =
    exerciseIdx === undefined || exerciseIdx === null || String(exerciseIdx).trim() === ''
      ? null
      : normalizeExerciseIdx(exerciseIdx);
  if (exerciseIdx !== undefined && exerciseIdx !== null && normalizedExerciseIdx === null) {
    throw new Error('Exercise index is invalid');
  }

  const normalizedItems = Array.isArray(items)
    ? items.map(normalizeTemplateInputItem).filter(Boolean)
    : [];
  if (normalizedItems.length === 0) {
    throw new Error('Template items are required');
  }

  const camelItems = normalizedItems.map((item) => ({
    kgText: item.kg_text,
    ruText: item.ru_text,
    order: item.order,
  }));

  const data = await requestWithFallbackBodies(
    (body) =>
      apiRequest(
        `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/templates`,
        {
          method: 'POST',
          token,
          body,
        },
      ),
    [
      {
        ...(normalizedExerciseIdx !== null ? { exercise: normalizedExerciseIdx } : {}),
        items: normalizedItems,
      },
      {
        ...(normalizedExerciseIdx !== null ? { exercise_idx: normalizedExerciseIdx } : {}),
        items: normalizedItems,
      },
      {
        ...(normalizedExerciseIdx !== null ? { exercise: normalizedExerciseIdx } : {}),
        items: camelItems,
      },
    ],
  );

  return normalizeCreateTemplatesGenericResult(data, normalizedTrackId, normalizedExerciseIdx);
}

export async function deleteTrackPairsTemplates({ token, trackId } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/templates`,
    { method: 'DELETE', token },
  );

  const source = asObject(data?.data) ?? asObject(data) ?? {};
  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? normalizedTrackId,
    exercise: normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx) ?? null,
    deletedCount: normalizeInteger(source.deleted_count ?? source.deletedCount ?? source.count) ?? 0,
  };
}

export async function deleteTrackPairsTemplatesByExercise({ token, trackId, exerciseIdx } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');
  const normalizedExerciseIdx = normalizeExerciseIdx(exerciseIdx);
  if (!normalizedExerciseIdx) throw new Error('Exercise index is required');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/${encodeURIComponent(normalizedExerciseIdx)}/templates`,
    { method: 'DELETE', token },
  );

  const source = asObject(data?.data) ?? asObject(data) ?? {};
  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? normalizedTrackId,
    exercise: normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx) ?? normalizedExerciseIdx,
    deletedCount: normalizeInteger(source.deleted_count ?? source.deletedCount ?? source.count) ?? 0,
  };
}

export async function startTrackPairsGame({ token, trackId, exerciseIdx } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');
  const normalizedExerciseIdx = normalizeExerciseIdx(exerciseIdx);
  if (!normalizedExerciseIdx) throw new Error('Exercise index is required');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/games/pairs/${encodeURIComponent(
      normalizedExerciseIdx,
    )}/start`,
    {
      method: 'POST',
      token,
    },
  );

  const normalized = normalizeStartPayload(data, normalizedTrackId, normalizedExerciseIdx);

  return {
    sessionId: normalized.sessionId,
    trackId: normalized.trackId ?? normalizedTrackId,
    exercise: normalized.exercise ?? normalizedExerciseIdx,
    items: normalized.items,
    options: normalized.options,
    answers: normalized.answers,
    status: normalized.status,
  };
}

export async function submitPairsGameAnswer({ token, sessionId, pairId, optionId } = {}) {
  const normalizedSessionId = normalizeId(sessionId);
  const normalizedPairId = normalizeId(pairId);
  const normalizedOptionId = normalizeId(optionId);

  if (!normalizedSessionId) throw new Error('Session id is required');
  if (!normalizedPairId) throw new Error('Pair id is required');
  if (!normalizedOptionId) throw new Error('Option id is required');

  const bodyPairId = toBodyId(normalizedPairId);
  const bodyOptionId = toBodyId(normalizedOptionId);

  const data = await requestWithFallbackBodies(
    (body) =>
      apiRequest(`${PAIRS_GAMES_BASE_PATH}/${encodeURIComponent(normalizedSessionId)}/answer`, {
        method: 'POST',
        token,
        body,
      }),
    [
      { pair_id: bodyPairId, option_id: bodyOptionId },
      { pairId: bodyPairId, optionId: bodyOptionId },
    ],
  );

  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    pairId: pickFirstId(source, ['pair_id', 'pairId']) ?? normalizedPairId,
    optionId:
      pickFirstId(source, ['option_id', 'optionId', 'chosen_option_id', 'chosenOptionId']) ??
      normalizedOptionId,
    correct: normalizeBoolean(source.correct ?? source.is_correct ?? source.isCorrect) === true,
  };
}

export async function finishPairsGame({ token, sessionId } = {}) {
  const normalizedSessionId = normalizeId(sessionId);
  if (!normalizedSessionId) throw new Error('Session id is required');

  const data = await apiRequest(`${PAIRS_GAMES_BASE_PATH}/${encodeURIComponent(normalizedSessionId)}/finish`, {
    method: 'POST',
    token,
  });

  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    correct: normalizeInteger(source.correct ?? source.correct_count ?? source.correctCount) ?? 0,
    total: normalizeInteger(source.total ?? source.total_count ?? source.totalCount) ?? 0,
    passed: normalizeBoolean(source.passed) === true,
    xpApplied: normalizeBoolean(source.xp_applied ?? source.xpApplied) === true,
    xpDelta: normalizeInteger(source.xp_delta ?? source.xpDelta) ?? 0,
    newXp: normalizeInteger(source.new_xp ?? source.newXp) ?? null,
    newLevel: normalizeInteger(source.new_level ?? source.newLevel) ?? null,
    nextLevelThreshold: normalizeInteger(source.next_level_threshold ?? source.nextLevelThreshold) ?? null,
    xpToNextLevel: normalizeInteger(source.xp_to_next_level ?? source.xpToNextLevel) ?? null,
  };
}

export async function fetchPairsGameSession({ token, sessionId } = {}) {
  const normalizedSessionId = normalizeId(sessionId);
  if (!normalizedSessionId) throw new Error('Session id is required');

  const data = await apiRequest(`${PAIRS_GAMES_BASE_PATH}/${encodeURIComponent(normalizedSessionId)}`, {
    token,
  });

  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    sessionId: pickFirstId(source, ['session_id', 'sessionId', 'id']) ?? normalizedSessionId,
    trackId: pickFirstId(source, ['track_id', 'trackId']),
    exercise: normalizeExerciseIdx(source.exercise ?? source.exercise_idx ?? source.exerciseIdx),
    status: pickFirstString(source, ['status']),
    answeredCount:
      normalizeInteger(source.answered_count ?? source.answeredCount ?? source.answered) ?? 0,
    total: normalizeInteger(source.total ?? source.total_count ?? source.totalCount) ?? 0,
    remaining: normalizeInteger(source.remaining ?? source.left) ?? 0,
    answers: readCollection(source, ['answers', 'attempts']).map(normalizePairsAnswer).filter(Boolean),
  };
}
