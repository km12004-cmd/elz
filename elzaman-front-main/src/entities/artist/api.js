import { ApiError, apiRequest } from '@/shared/api/client';
import { normalizeId } from '@/shared/lib/normalizeId';

const ARTISTS_BASE_PATH = '/api/artists';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
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
      if (!shouldRetryWithFallbackBody(error)) throw error;
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new ApiError('Request failed');
}

function readArtistFromResponse(data, fallbackArtistId = null) {
  const candidates = [
    data?.artist,
    data?.item,
    data?.data?.artist,
    data?.data?.item,
    data?.data,
    data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeArtist(candidate);
    if (normalized.id || normalized.name !== 'Unknown artist') {
      return {
        ...normalized,
        id: normalized.id ?? fallbackArtistId,
      };
    }
  }

  return {
    id: fallbackArtistId,
    name: 'Unknown artist',
    bio: null,
    avatarUrl: null,
    createdAt: null,
  };
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

export async function createArtist({ token, name, bio, avatarUrl } = {}) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) throw new Error('Artist name is required');

  const normalizedBio = normalizeText(bio);
  const normalizedAvatarUrl = normalizeText(avatarUrl);

  const data = await requestWithFallbackBodies(ARTISTS_BASE_PATH, {
    method: 'POST',
    token,
    bodies: [
      {
        name: normalizedName,
        bio: normalizedBio ?? null,
        avatar_url: normalizedAvatarUrl ?? null,
      },
      {
        name: normalizedName,
        bio: normalizedBio ?? null,
        image_url: normalizedAvatarUrl ?? null,
      },
      {
        name: normalizedName,
        bio: normalizedBio ?? null,
        avatarUrl: normalizedAvatarUrl ?? null,
      },
    ],
  });

  return readArtistFromResponse(data);
}

export async function updateArtist({ token, artistId, name, bio, avatarUrl } = {}) {
  const normalizedArtistId = normalizeId(artistId);
  if (!normalizedArtistId) throw new Error('Artist id is required');

  const normalizedName = normalizeText(name);
  const normalizedBio = normalizeText(bio);
  const normalizedAvatarUrl = normalizeText(avatarUrl);

  const hasPayload =
    normalizedName !== null || normalizedBio !== null || normalizedAvatarUrl !== null;
  if (!hasPayload) {
    throw new Error('At least one artist field is required');
  }

  const data = await requestWithFallbackBodies(
    `${ARTISTS_BASE_PATH}/${encodeURIComponent(normalizedArtistId)}`,
    {
      method: 'PATCH',
      token,
      bodies: [
        {
          ...(normalizedName !== null ? { name: normalizedName } : {}),
          ...(normalizedBio !== null ? { bio: normalizedBio } : {}),
          ...(normalizedAvatarUrl !== null ? { avatar_url: normalizedAvatarUrl } : {}),
        },
        {
          ...(normalizedName !== null ? { name: normalizedName } : {}),
          ...(normalizedBio !== null ? { bio: normalizedBio } : {}),
          ...(normalizedAvatarUrl !== null ? { image_url: normalizedAvatarUrl } : {}),
        },
        {
          ...(normalizedName !== null ? { name: normalizedName } : {}),
          ...(normalizedBio !== null ? { bio: normalizedBio } : {}),
          ...(normalizedAvatarUrl !== null ? { avatarUrl: normalizedAvatarUrl } : {}),
        },
      ],
    },
  );

  return readArtistFromResponse(data, normalizedArtistId);
}
