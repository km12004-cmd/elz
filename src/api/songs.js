import { ApiError, apiRequest } from './client';

const SONGS_BASE_PATH = '/api/songs';
const TRACKS_BASE_PATH = '/api/tracks';

const RETRIABLE_ROUTE_STATUSES = [404, 405, 422];

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
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

function normalizeTrackLevel(value) {
  const level = normalizeInteger(value);
  return typeof level === 'number' && level >= 1 ? level : null;
}

function normalizeOptionalPositiveId(value) {
  const asInteger = normalizeInteger(value);
  if (typeof asInteger === 'number') {
    return asInteger > 0 ? String(asInteger) : null;
  }

  const asId = normalizeId(value);
  return asId && asId !== '0' ? asId : null;
}

function isRetriableRouteError(error) {
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;

  return status ? RETRIABLE_ROUTE_STATUSES.includes(status) : false;
}

async function requestFirstAvailable(paths, options) {
  let lastError = null;

  for (const path of paths) {
    try {
      return await apiRequest(path, options);
    } catch (error) {
      lastError = error;

      if (!isRetriableRouteError(error)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  throw new ApiError('Request failed');
}

function shouldRetryWithFallbackBody(error) {
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;

  return error instanceof ApiError || status === 400 || status === 422;
}

async function requestWithFallbackBodies(path, { method = 'POST', token, bodies } = {}) {
  if (!Array.isArray(bodies) || bodies.length === 0) {
    return apiRequest(path, { method, token });
  }

  let lastError = null;

  for (const body of bodies) {
    try {
      return await apiRequest(path, { method, token, body });
    } catch (error) {
      if (!shouldRetryWithFallbackBody(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new ApiError('Request failed');
}

function pickFirstString(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = normalizeText(object[key]);
    if (value) return value;
  }

  return null;
}

function pickFirstId(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const id = normalizeId(object[key]);
    if (id) return id;
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

function readSongsCollection(data) {
  const collection = readCollection(data, ['songs', 'items', 'data', 'results']);
  if (collection.length > 0) return collection;

  const object = asObject(data);
  if (!object) return [];

  const nestedData = asObject(object.data);
  if (nestedData) {
    const nestedCollection = readCollection(nestedData, ['songs', 'items', 'results']);
    if (nestedCollection.length > 0) return nestedCollection;
  }

  return [];
}

function readTrackCardsCollection(data) {
  const directCollection = readCollection(data, ['items', 'cards', 'templates', 'results']);
  if (directCollection.length > 0) return directCollection;

  const object = asObject(data);
  if (!object) return [];

  const nestedData = asObject(object.data);
  if (nestedData) {
    const nestedCollection = readCollection(nestedData, ['items', 'cards', 'templates', 'results']);
    if (nestedCollection.length > 0) return nestedCollection;
  }

  return [];
}

function normalizeSongsCollection(data) {
  return readSongsCollection(data)
    .map(normalizeSong)
    .filter((song) => normalizeId(song.id));
}

function normalizeSong(value) {
  const song = asObject(value) ?? {};

  return {
    id: pickFirstId(song, ['song_id', 'songId', 'id']),
    title: pickFirstString(song, ['title', 'name']) ?? 'Untitled song',
    author: pickFirstString(song, ['author', 'artist', 'performer']),
    releaseYear: normalizeInteger(song.release_year ?? song.releaseYear ?? song.year),
    durationSeconds: normalizeInteger(song.duration_seconds ?? song.durationSeconds ?? song.duration),
    originalLanguage: pickFirstString(song, ['original_language', 'originalLanguage', 'language']),
    isPublished: normalizeBoolean(song.is_published ?? song.isPublished),
    youtubeUrl: pickFirstString(song, ['youtube_url', 'youtubeUrl', 'youtube', 'youtube_link']),
    audioUrl: pickFirstString(song, ['audio_url', 'audioUrl', 'audio']),
  };
}

function normalizeTrackProgress(value, fallbackTrackId) {
  const source = asObject(value?.data) ?? asObject(value) ?? {};

  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? fallbackTrackId,
    status: pickFirstString(source, ['status']),
    unlockedLevel: normalizeInteger(source.unlocked_level ?? source.unlockedLevel) ?? 0,
    unlockedGame: normalizeInteger(source.unlocked_game ?? source.unlockedGame) ?? 0,
    folderId: normalizeOptionalPositiveId(source.folder_id ?? source.folderId),
    cardsAdded: normalizeInteger(source.cards_added ?? source.cardsAdded) ?? 0,
    cardsExisting: normalizeInteger(source.cards_existing ?? source.cardsExisting) ?? 0,
  };
}

function normalizeTrackCard(value, index, fallbackLevel) {
  const card = asObject(value) ?? {};
  const order = normalizeInteger(card.order) ?? index + 1;

  return {
    id: pickFirstId(card, ['id', 'card_id', 'flashcard_id']) ?? `track-card-${order}-${index}`,
    level: normalizeTrackLevel(card.level) ?? fallbackLevel ?? null,
    order,
    kgText:
      pickFirstString(card, ['kg_text', 'kgText', 'front_text', 'frontText', 'prompt_text', 'promptText']) ??
      '',
    ruText:
      pickFirstString(card, ['ru_text', 'ruText', 'back_text', 'backText', 'answer_text', 'answerText']) ??
      '',
  };
}

function normalizeTrackCards(data, { fallbackLevel } = {}) {
  return readTrackCardsCollection(data)
    .map((item, index) => normalizeTrackCard(item, index, fallbackLevel))
    .filter((card) => card.kgText || card.ruText)
    .sort((left, right) => left.order - right.order);
}

function normalizeOptionalBoolean(value) {
  if (typeof value === 'boolean') return value;
  const parsed = normalizeBoolean(value);
  return parsed !== null ? parsed : null;
}

function normalizeTrackTemplateInputItem(value, index) {
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

function readSongFromResponse(data, fallbackSongId = null) {
  const candidates = [
    data?.song,
    data?.item,
    data?.data?.song,
    data?.data?.item,
    data?.data,
    data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSong(candidate);
    if (normalized.id || normalized.title !== 'Untitled song') {
      return {
        ...normalized,
        id: normalized.id ?? fallbackSongId,
      };
    }
  }

  return {
    id: fallbackSongId,
    title: 'Untitled song',
    author: null,
    releaseYear: null,
    durationSeconds: null,
    originalLanguage: null,
    isPublished: null,
    youtubeUrl: null,
    audioUrl: null,
  };
}

function normalizeCreatedTemplatesResult(data, fallbackTrackId, fallbackLevel) {
  const source = asObject(data?.data) ?? asObject(data) ?? {};

  return {
    trackId: pickFirstId(source, ['track_id', 'trackId', 'id']) ?? fallbackTrackId,
    level:
      normalizeTrackLevel(source.level ?? source.level_idx ?? source.levelIdx) ?? fallbackLevel,
    createdIds: readCollection(source, ['created_ids', 'createdIds', 'ids'])
      .map(normalizeId)
      .filter(Boolean),
    createdCount:
      normalizeInteger(source.created_count ?? source.createdCount ?? source.count) ?? 0,
  };
}

function buildSongBodies(payload) {
  const normalizedTitle = normalizeText(payload?.title);
  const normalizedAuthor = normalizeText(payload?.author);
  const normalizedArtistId = normalizeOptionalPositiveId(payload?.artistId ?? payload?.artist_id);
  const normalizedReleaseYear = normalizeInteger(payload?.releaseYear ?? payload?.release_year);
  const normalizedDurationSeconds = normalizeInteger(
    payload?.durationSeconds ?? payload?.duration_seconds ?? payload?.duration,
  );
  const normalizedOriginalLanguage = normalizeText(
    payload?.originalLanguage ?? payload?.original_language ?? payload?.language,
  );
  const normalizedYoutubeUrl = normalizeText(
    payload?.youtubeUrl ?? payload?.youtube_url ?? payload?.youtube,
  );
  const normalizedAudioUrl = normalizeText(payload?.audioUrl ?? payload?.audio_url ?? payload?.audio);
  const normalizedLyricsText = normalizeText(
    payload?.lyricsText ?? payload?.lyrics_text ?? payload?.lyrics,
  );
  const normalizedLyricsTextRu = normalizeText(
    payload?.lyricsTextRu ?? payload?.lyrics_text_ru ?? payload?.lyricsRu ?? payload?.lyrics_ru,
  );
  const normalizedIsPublished = normalizeOptionalBoolean(
    payload?.isPublished ?? payload?.is_published,
  );

  const snakeBody = {
    ...(normalizedTitle !== null ? { title: normalizedTitle } : {}),
    ...(normalizedAuthor !== null ? { author: normalizedAuthor } : {}),
    ...(normalizedArtistId !== null ? { artist_id: normalizedArtistId } : {}),
    ...(normalizedReleaseYear !== null ? { release_year: normalizedReleaseYear } : {}),
    ...(normalizedDurationSeconds !== null ? { duration_seconds: normalizedDurationSeconds } : {}),
    ...(normalizedOriginalLanguage !== null ? { original_language: normalizedOriginalLanguage } : {}),
    ...(normalizedIsPublished !== null ? { is_published: normalizedIsPublished } : {}),
    ...(normalizedYoutubeUrl !== null ? { youtube_url: normalizedYoutubeUrl } : {}),
    ...(normalizedAudioUrl !== null ? { audio_url: normalizedAudioUrl } : {}),
    ...(normalizedLyricsText !== null ? { lyrics_text: normalizedLyricsText } : {}),
    ...(normalizedLyricsTextRu !== null ? { lyrics_text_ru: normalizedLyricsTextRu } : {}),
  };

  const camelBody = {
    ...(normalizedTitle !== null ? { title: normalizedTitle } : {}),
    ...(normalizedAuthor !== null ? { author: normalizedAuthor } : {}),
    ...(normalizedArtistId !== null ? { artistId: normalizedArtistId } : {}),
    ...(normalizedReleaseYear !== null ? { releaseYear: normalizedReleaseYear } : {}),
    ...(normalizedDurationSeconds !== null ? { durationSeconds: normalizedDurationSeconds } : {}),
    ...(normalizedOriginalLanguage !== null ? { originalLanguage: normalizedOriginalLanguage } : {}),
    ...(normalizedIsPublished !== null ? { isPublished: normalizedIsPublished } : {}),
    ...(normalizedYoutubeUrl !== null ? { youtubeUrl: normalizedYoutubeUrl } : {}),
    ...(normalizedAudioUrl !== null ? { audioUrl: normalizedAudioUrl } : {}),
    ...(normalizedLyricsText !== null ? { lyricsText: normalizedLyricsText } : {}),
    ...(normalizedLyricsTextRu !== null ? { lyricsTextRu: normalizedLyricsTextRu } : {}),
  };

  return { snakeBody, camelBody };
}

async function fetchAllSongs({ token } = {}) {
  const data = await requestFirstAvailable(
    [`${SONGS_BASE_PATH}`, `${SONGS_BASE_PATH}/list`, `${SONGS_BASE_PATH}/all`],
    { token },
  );

  return normalizeSongsCollection(data);
}

export async function fetchSongsCatalog({ token } = {}) {
  return fetchAllSongs({ token });
}

export async function fetchSongDetail({ token, songId } = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) throw new Error('Song id is required');

  const data = await apiRequest(`${SONGS_BASE_PATH}/${encodeURIComponent(normalizedSongId)}`, { token });
  const source = asObject(data?.song) ?? asObject(data?.data) ?? asObject(data) ?? {};
  const normalized = normalizeSong(source);

  return {
    ...normalized,
    id: normalized.id ?? normalizedSongId,
    lyricsText: pickFirstString(source, ['lyrics_text', 'lyricsText', 'lyrics']) ?? null,
    lyricsTextRu:
      pickFirstString(source, ['lyrics_text_ru', 'lyricsTextRu', 'lyrics_ru', 'lyricsRu']) ??
      null,
  };
}

export async function fetchSongLyrics({ token, songId } = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) throw new Error('Song id is required');

  const data = await apiRequest(`${SONGS_BASE_PATH}/${encodeURIComponent(normalizedSongId)}/lyrics`, {
    token,
  });

  const lyricsKeys = ['lyrics_text', 'lyricsText', 'lyrics', 'text', 'content'];
  const lyricsRuKeys = ['lyrics_text_ru', 'lyricsTextRu', 'lyrics_ru', 'lyricsRu', 'text_ru'];

  if (typeof data === 'string') {
    const trimmed = data.trim();
    return {
      lyricsText: trimmed || null,
      lyricsTextRu: null,
    };
  }

  const object = asObject(data);
  if (!object) return null;

  const nested = asObject(object.data);
  const lyricsText = pickFirstString(object, lyricsKeys) ?? pickFirstString(nested, lyricsKeys) ?? null;
  const lyricsTextRu =
    pickFirstString(object, lyricsRuKeys) ?? pickFirstString(nested, lyricsRuKeys) ?? null;

  if (!lyricsText && !lyricsTextRu) return null;

  return { lyricsText, lyricsTextRu };
}

export async function fetchTrackLearningState({ token, trackId } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const data = await apiRequest(`${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/learning-state`, {
    token,
  });

  const normalized = normalizeTrackProgress(data, normalizedTrackId);

  return {
    trackId: normalized.trackId ?? normalizedTrackId,
    status: normalized.status ?? 'not_started',
    unlockedLevel: normalized.unlockedLevel,
    unlockedGame: normalized.unlockedGame,
    folderId: normalized.folderId,
  };
}

export async function markTrackAsListened({ token, trackId, percent = 100, secondsListened } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const normalizedPercent = Math.min(100, Math.max(0, normalizeInteger(percent) ?? 100));
  const normalizedSeconds = Math.max(
    0,
    normalizeInteger(secondsListened) ?? 0,
  );

  const data = await requestWithFallbackBodies(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/listened`,
    {
      method: 'POST',
      token,
      bodies: [
        { percent: normalizedPercent, seconds_listened: normalizedSeconds },
        { percent: normalizedPercent, secondsListened: normalizedSeconds },
      ],
    },
  );

  const normalized = normalizeTrackProgress(data, normalizedTrackId);

  return {
    trackId: normalized.trackId ?? normalizedTrackId,
    status: normalized.status ?? 'listened',
    unlockedLevel: normalized.unlockedLevel,
    unlockedGame: normalized.unlockedGame,
    folderId: normalized.folderId,
  };
}

export async function startTrackLearning({ token, trackId } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const data = await apiRequest(`${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/start-learning`, {
    method: 'POST',
    token,
  });

  const normalized = normalizeTrackProgress(data, normalizedTrackId);

  return {
    trackId: normalized.trackId ?? normalizedTrackId,
    status: normalized.status ?? 'in_progress',
    unlockedLevel: normalized.unlockedLevel,
    unlockedGame: normalized.unlockedGame,
    folderId: normalized.folderId,
    cardsAdded: normalized.cardsAdded,
    cardsExisting: normalized.cardsExisting,
  };
}

export async function fetchTrackFlashcardTemplates({ token, trackId, level = 1 } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const normalizedLevel = normalizeTrackLevel(level);
  if (!normalizedLevel) throw new Error('Level must be greater than or equal to 1');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/flashcard-templates?level=${encodeURIComponent(
      normalizedLevel,
    )}`,
    {
      token,
    },
  );

  return normalizeTrackCards(data, { fallbackLevel: normalizedLevel });
}

export async function fetchTrackLevelCards({ token, trackId, level } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const normalizedLevel = normalizeTrackLevel(level);
  if (!normalizedLevel) throw new Error('Level must be greater than or equal to 1');

  const data = await apiRequest(
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/levels/${encodeURIComponent(
      normalizedLevel,
    )}/cards`,
    {
      token,
    },
  );

  return normalizeTrackCards(data, { fallbackLevel: normalizedLevel });
}

export async function createSongRecord({ token, payload } = {}) {
  const { snakeBody, camelBody } = buildSongBodies(payload);
  if (!normalizeText(snakeBody.title) && !normalizeText(camelBody.title)) {
    throw new Error('Song title is required');
  }

  const data = await requestWithFallbackBodies(SONGS_BASE_PATH, {
    method: 'POST',
    token,
    bodies: [snakeBody, camelBody],
  });

  return readSongFromResponse(data);
}

export async function updateSongRecord({ token, songId, payload } = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) throw new Error('Song id is required');

  const { snakeBody, camelBody } = buildSongBodies(payload);
  if (Object.keys(snakeBody).length === 0 && Object.keys(camelBody).length === 0) {
    throw new Error('At least one song field is required');
  }

  const data = await requestWithFallbackBodies(
    `${SONGS_BASE_PATH}/${encodeURIComponent(normalizedSongId)}`,
    {
      method: 'PATCH',
      token,
      bodies: [snakeBody, camelBody],
    },
  );

  return readSongFromResponse(data, normalizedSongId);
}

export async function createTrackFlashcardTemplates({ token, trackId, level = 1, items } = {}) {
  const normalizedTrackId = normalizeId(trackId);
  if (!normalizedTrackId) throw new Error('Track id is required');

  const normalizedLevel = normalizeTrackLevel(level);
  if (!normalizedLevel) throw new Error('Level must be greater than or equal to 1');

  const normalizedItems = Array.isArray(items)
    ? items.map(normalizeTrackTemplateInputItem).filter(Boolean)
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
    `${TRACKS_BASE_PATH}/${encodeURIComponent(normalizedTrackId)}/flashcard-templates`,
    {
      method: 'POST',
      token,
      bodies: [
        { level: normalizedLevel, items: normalizedItems },
        { level_idx: normalizedLevel, items: normalizedItems },
        { level: normalizedLevel, items: camelItems },
      ],
    },
  );

  return normalizeCreatedTemplatesResult(data, normalizedTrackId, normalizedLevel);
}
