import { ApiError, apiRequest } from './client';

const SONGS_BASE_PATH = '/api/songs';

const LEVEL_META = {
  1: { title: 'Beginner', description: 'Basic vocabulary and simple grammar patterns.' },
  2: { title: 'Intermediate', description: 'Richer vocabulary and more complex phrases.' },
  3: { title: 'Expert', description: 'Advanced lyrics with nuanced language structures.' },
};

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

function normalizeDifficultyLevel(value) {
  const level = normalizeInteger(value);
  return level === 1 || level === 2 || level === 3 ? level : null;
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
    difficultyLevel: normalizeDifficultyLevel(
      song.difficulty_level ??
        song.difficultyLevel ??
        song.difficulty ??
        song.difficulty_id ??
        song.difficultyId ??
        song.level ??
        song.level_id,
    ),
    releaseYear: normalizeInteger(song.release_year ?? song.releaseYear ?? song.year),
    durationSeconds: normalizeInteger(song.duration_seconds ?? song.durationSeconds ?? song.duration),
    originalLanguage: pickFirstString(song, ['original_language', 'originalLanguage', 'language']),
    isPublished: normalizeBoolean(song.is_published ?? song.isPublished),
  };
}

function levelsFromSongs(songs) {
  const songsByLevel = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
  ]);

  songs.forEach((song) => {
    const normalizedLevel = normalizeDifficultyLevel(song?.difficultyLevel);
    if (!normalizedLevel) return;

    songsByLevel.set(normalizedLevel, (songsByLevel.get(normalizedLevel) ?? 0) + 1);
  });

  return [1, 2, 3].map((difficultyLevel) => ({
    difficultyLevel,
    title: LEVEL_META[difficultyLevel].title,
    description: LEVEL_META[difficultyLevel].description,
    songsCount: songsByLevel.get(difficultyLevel) ?? 0,
  }));
}

function filterSongsByDifficulty(songs, difficultyLevel) {
  const songsWithKnownDifficulty = songs.filter((song) => normalizeDifficultyLevel(song.difficultyLevel));
  if (songsWithKnownDifficulty.length === 0) return songs;

  return songs.filter((song) => normalizeDifficultyLevel(song.difficultyLevel) === difficultyLevel);
}

async function fetchAllSongs({ token } = {}) {
  const data = await requestFirstAvailable(
    [`${SONGS_BASE_PATH}`, `${SONGS_BASE_PATH}/list`, `${SONGS_BASE_PATH}/all`],
    { token },
  );

  return normalizeSongsCollection(data);
}

function normalizeLevelItem(value, index) {
  const level = asObject(value) ?? {};

  const difficultyLevel =
    normalizeDifficultyLevel(
      level.difficulty_level ?? level.difficultyLevel ?? level.level ?? level.level_id ?? level.id,
    ) ?? (index === 0 || index === 1 || index === 2 ? index + 1 : null);

  if (!difficultyLevel) return null;

  const songsCount =
    normalizeInteger(
      level.songs_count ??
        level.songsCount ??
        level.count ??
        level.total ??
        level.total_songs ??
        level.totalSongs,
    ) ?? 0;

  return {
    difficultyLevel,
    title: pickFirstString(level, ['title', 'name', 'label']) ?? LEVEL_META[difficultyLevel].title,
    description:
      pickFirstString(level, ['description', 'subtitle', 'hint']) ??
      LEVEL_META[difficultyLevel].description,
    songsCount,
  };
}

export function getDifficultyMeta(difficultyLevel) {
  const normalizedLevel = normalizeDifficultyLevel(difficultyLevel);
  if (!normalizedLevel) return null;

  return {
    difficultyLevel: normalizedLevel,
    ...LEVEL_META[normalizedLevel],
  };
}

export async function fetchSongLevels({ token } = {}) {
  try {
    const data = await requestFirstAvailable(
      [`${SONGS_BASE_PATH}/levels`, `${SONGS_BASE_PATH}/difficulty-levels`],
      { token },
    );
    const collection = readCollection(data, ['levels', 'items', 'data', 'results']);

    const levelsMap = new Map();

    collection.forEach((item, index) => {
      const normalized = normalizeLevelItem(item, index);
      if (!normalized) return;
      levelsMap.set(normalized.difficultyLevel, normalized);
    });

    return [1, 2, 3].map((difficultyLevel) => {
      const fromApi = levelsMap.get(difficultyLevel);
      if (fromApi) return fromApi;

      return {
        difficultyLevel,
        title: LEVEL_META[difficultyLevel].title,
        description: LEVEL_META[difficultyLevel].description,
        songsCount: 0,
      };
    });
  } catch (error) {
    if (!isRetriableRouteError(error)) {
      throw error;
    }
  }

  const songs = await fetchAllSongs({ token });
  return levelsFromSongs(songs);
}

export async function fetchSongsByDifficulty({ token, difficultyLevel } = {}) {
  const normalizedLevel = normalizeDifficultyLevel(difficultyLevel);
  if (!normalizedLevel) throw new Error('Difficulty level must be 1, 2, or 3');

  try {
    const data = await requestFirstAvailable(
      [
        `${SONGS_BASE_PATH}/levels/${normalizedLevel}`,
        `${SONGS_BASE_PATH}?difficulty_level=${normalizedLevel}`,
        `${SONGS_BASE_PATH}?difficultyLevel=${normalizedLevel}`,
        `${SONGS_BASE_PATH}?level=${normalizedLevel}`,
        `${SONGS_BASE_PATH}?level_id=${normalizedLevel}`,
      ],
      { token },
    );
    const normalizedSongs = normalizeSongsCollection(data);
    const filteredSongs = filterSongsByDifficulty(normalizedSongs, normalizedLevel);

    if (filteredSongs.length > 0) return filteredSongs;
  } catch (error) {
    if (!isRetriableRouteError(error)) {
      throw error;
    }
  }

  const songs = await fetchAllSongs({ token });
  return filterSongsByDifficulty(songs, normalizedLevel);
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
  };
}

export async function fetchSongLyrics({ token, songId } = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) throw new Error('Song id is required');

  const data = await apiRequest(`${SONGS_BASE_PATH}/${encodeURIComponent(normalizedSongId)}/lyrics`, {
    token,
  });

  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed || null;
  }

  const object = asObject(data);
  if (!object) return null;

  return (
    pickFirstString(object, ['lyrics_text', 'lyricsText', 'lyrics', 'text', 'content']) ??
    pickFirstString(object.data, ['lyrics_text', 'lyricsText', 'lyrics', 'text', 'content']) ??
    null
  );
}
