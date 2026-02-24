import { apiRequest } from './client';

const ARTISTS_BASE_PATH = '/api/artists';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
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
    const value = normalizeId(object[key]);
    if (value) return value;
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

function readArtistsCollection(data) {
  const directCollection = readCollection(data, ['items', 'artists', 'results']);
  if (directCollection.length > 0) return directCollection;

  const object = asObject(data);
  if (!object) return [];

  const nestedData = asObject(object.data);
  if (nestedData) {
    const nestedCollection = readCollection(nestedData, ['items', 'artists', 'results']);
    if (nestedCollection.length > 0) return nestedCollection;
  }

  return [];
}

function normalizeArtist(value) {
  const artist = asObject(value) ?? {};

  return {
    id: pickFirstId(artist, ['id', 'artist_id', 'artistId']),
    name: pickFirstString(artist, ['name', 'title']) ?? 'Unknown artist',
    bio: pickFirstString(artist, ['bio', 'description']),
    avatarUrl: pickFirstString(artist, ['avatar_url', 'avatarUrl', 'image_url', 'imageUrl']),
    createdAt: pickFirstString(artist, ['created_at', 'createdAt']),
  };
}

function normalizeLimit(value) {
  const parsed = normalizeInteger(value);
  if (parsed === null) return DEFAULT_LIMIT;
  if (parsed < 1) return 1;
  if (parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
}

function normalizeOffset(value) {
  const parsed = normalizeInteger(value);
  if (parsed === null || parsed < 0) return 0;
  return parsed;
}

export async function fetchArtists({ token, limit = DEFAULT_LIMIT, offset = 0, query } = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedOffset = normalizeOffset(offset);
  const normalizedQuery = normalizeText(query);

  const params = new URLSearchParams();
  params.set('limit', String(normalizedLimit));
  params.set('offset', String(normalizedOffset));
  if (normalizedQuery) params.set('q', normalizedQuery);

  const path = `${ARTISTS_BASE_PATH}?${params.toString()}`;
  const data = await apiRequest(path, { token });

  const items = readArtistsCollection(data).map(normalizeArtist);

  return {
    items,
    total: normalizeInteger(data?.total),
    limit: normalizeInteger(data?.limit) ?? normalizedLimit,
    offset: normalizeInteger(data?.offset) ?? normalizedOffset,
  };
}
