import { ApiError, apiRequest } from './client';

const PLAYLISTS_BASE_PATH = '/api/playlists';

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

function normalizeInteger(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(numeric) ? numeric : null;
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

function pickFirstString(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

function normalizePlaylist(value) {
  const playlist = asObject(value) ?? {};

  return {
    id: pickFirstId(playlist, ['id', 'playlist_id', 'playlistId']),
    title: pickFirstString(playlist, ['title', 'name']) ?? 'Untitled playlist',
    description: pickFirstString(playlist, ['description']),
    songsCount:
      normalizeInteger(
        playlist.songs_count ?? playlist.song_count ?? playlist.tracks_count ?? playlist.items_count,
      ) ?? null,
  };
}

function normalizeSong(value) {
  const song = asObject(value) ?? {};

  return {
    id: pickFirstId(song, ['id', 'song_id', 'songId']),
    title: pickFirstString(song, ['title', 'name']) ?? 'Untitled song',
    author: pickFirstString(song, ['author', 'artist', 'performer']),
    audioUrl: pickFirstString(song, ['audio_url', 'audioUrl']),
    youtubeUrl: pickFirstString(song, ['youtube_url', 'youtubeUrl', 'youtube', 'youtube_link']),
    durationSeconds: normalizeInteger(song.duration_seconds ?? song.durationSeconds ?? song.duration),
    position:
      typeof song.position === 'number' && Number.isFinite(song.position)
        ? song.position
        : null,
    addedAt: pickFirstString(song, ['added_at', 'addedAt', 'created_at', 'createdAt']),
  };
}

function normalizePositiveInteger(value, fieldName) {
  const normalizedRaw =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  const numeric = Number.isInteger(normalizedRaw) && normalizedRaw > 0 ? normalizedRaw : null;

  if (!numeric) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numeric;
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

export async function fetchPlaylists({ token } = {}) {
  const data = await apiRequest(PLAYLISTS_BASE_PATH, { token });
  const playlists =
    Array.isArray(data?.playlists) ? data.playlists : Array.isArray(data?.items) ? data.items : [];

  return playlists.map(normalizePlaylist);
}

export async function createPlaylist({ token, title, description } = {}) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedTitle) throw new Error('Playlist title is required');

  const normalizedDescription = typeof description === 'string' ? description.trim() : '';

  const data = await withFallbackBodies(
    (body) =>
      apiRequest(PLAYLISTS_BASE_PATH, {
        method: 'POST',
        token,
        body,
      }),
    [
      {
        title: normalizedTitle,
        description: normalizedDescription || null,
      },
      {
        name: normalizedTitle,
        description: normalizedDescription || null,
      },
    ],
  );

  const playlistId = pickFirstId(data, ['playlist_id', 'playlistId', 'id']);
  if (!playlistId) throw new Error('Unexpected create playlist response');

  return {
    id: playlistId,
    title: normalizedTitle,
    description: normalizedDescription || null,
    songsCount: 0,
  };
}

export async function fetchPlaylistDetail({ token, playlistId } = {}) {
  const normalizedPlaylistId = normalizeId(playlistId);
  if (!normalizedPlaylistId) throw new Error('Playlist id is required');

  const data = await apiRequest(`${PLAYLISTS_BASE_PATH}/${encodeURIComponent(normalizedPlaylistId)}`, {
    token,
  });

  const playlist = normalizePlaylist(data?.playlist ?? data);
  const songs = Array.isArray(data?.songs) ? data.songs.map(normalizeSong) : [];
  const availableSongs = Array.isArray(data?.available_songs)
    ? data.available_songs.map(normalizeSong)
    : [];

  return {
    playlist: {
      ...playlist,
      id: playlist.id ?? normalizedPlaylistId,
      songsCount: songs.length,
    },
    songs,
    availableSongs,
  };
}

export async function addSongToPlaylist({ token, playlistId, songId } = {}) {
  const normalizedPlaylistId = normalizeId(playlistId);
  if (!normalizedPlaylistId) throw new Error('Playlist id is required');

  const normalizedSongId = normalizePositiveInteger(songId, 'Song id');

  return withFallbackBodies(
    (body) =>
      apiRequest(`${PLAYLISTS_BASE_PATH}/${encodeURIComponent(normalizedPlaylistId)}/songs`, {
        method: 'POST',
        token,
        body,
      }),
    [{ song_id: normalizedSongId }, { songId: normalizedSongId }, { id: normalizedSongId }],
  );
}

export async function removeSongFromPlaylist({ token, playlistId, songId } = {}) {
  const normalizedPlaylistId = normalizeId(playlistId);
  if (!normalizedPlaylistId) throw new Error('Playlist id is required');

  const normalizedSongId = normalizePositiveInteger(songId, 'Song id');

  return apiRequest(
    `${PLAYLISTS_BASE_PATH}/${encodeURIComponent(normalizedPlaylistId)}/songs/${encodeURIComponent(normalizedSongId)}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export async function deletePlaylist({ token, playlistId } = {}) {
  const normalizedPlaylistId = normalizeId(playlistId);
  if (!normalizedPlaylistId) throw new Error('Playlist id is required');

  return apiRequest(`${PLAYLISTS_BASE_PATH}/${encodeURIComponent(normalizedPlaylistId)}`, {
    method: 'DELETE',
    token,
  });
}
