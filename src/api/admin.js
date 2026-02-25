import { apiRequest } from './client';

const ADMIN_USERS_BASE_PATH = '/api/admin/users';
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

function normalizeString(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeInteger(value) {
  const numeric =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);

  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'active', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'inactive', 'off'].includes(normalized)) return false;
  }

  return null;
}

function pickFirstString(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = normalizeString(object[key]);
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

function pickFirstInteger(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = normalizeInteger(object[key]);
    if (value !== null) return value;
  }

  return null;
}

function pickFirstBoolean(source, keys) {
  const object = asObject(source);
  if (!object) return null;

  for (const key of keys) {
    const value = normalizeBoolean(object[key]);
    if (value !== null) return value;
  }

  return null;
}

function normalizeRole(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : 'user';
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

function normalizePositiveInteger(value, fieldName) {
  const parsed = normalizeInteger(value);
  if (parsed === null || parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const parsed = normalizeInteger(value);
  if (parsed === null || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
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

function readUsersCollection(data) {
  const direct = readCollection(data, ['users', 'items', 'results']);
  if (direct.length > 0) return direct;

  const object = asObject(data);
  if (!object) return [];

  const nestedData = asObject(object.data);
  if (!nestedData) return [];

  return readCollection(nestedData, ['users', 'items', 'results']);
}

function readPaginationInteger(source, keys, fallback) {
  const value = pickFirstInteger(source, keys);
  if (value !== null) return value;

  const object = asObject(source);
  const nestedData = asObject(object?.data);
  const nestedValue = pickFirstInteger(nestedData, keys);
  return nestedValue !== null ? nestedValue : fallback;
}

function readTotal(data, fallback = null) {
  const total = readPaginationInteger(data, ['total', 'count'], fallback);
  if (total === null) return null;
  return Math.max(0, total);
}

function normalizeAdminUser(value) {
  const source = asObject(value) ?? {};
  const role = normalizeRole(
    pickFirstString(source, ['role', 'user_role', 'userRole']) ??
      pickFirstString(source?.data, ['role', 'user_role', 'userRole']),
  );
  const experience = pickFirstInteger(source, [
    'experience',
    'xp_total',
    'xpTotal',
    'xp',
    'total_experience',
    'totalExperience',
  ]);

  return {
    id: pickFirstId(source, ['id', 'user_id', 'userId']),
    email: pickFirstString(source, ['email', 'email_address', 'username']),
    nickname: pickFirstString(source, ['nickname', 'display_name', 'displayName']),
    firstName: pickFirstString(source, ['first_name', 'firstName']),
    lastName: pickFirstString(source, ['last_name', 'lastName']),
    role,
    experience,
    level: pickFirstInteger(source, ['level', 'current_level', 'currentLevel']),
    isPremium:
      pickFirstBoolean(source, [
        'is_premium',
        'isPremium',
        'premium_active',
        'premiumActive',
        'has_premium',
        'hasPremium',
      ]) ?? false,
    premiumUntil: pickFirstString(source, [
      'premium_until',
      'premiumUntil',
      'premium_expires_at',
      'premiumExpiresAt',
      'premium_end_date',
      'premiumEndDate',
    ]),
    createdAt: pickFirstString(source, ['created_at', 'createdAt', 'registered_at', 'registeredAt']),
    updatedAt: pickFirstString(source, ['updated_at', 'updatedAt']),
  };
}

function isAdminUserLike(user) {
  if (!user || typeof user !== 'object') return false;

  return Boolean(
    user.id ||
      user.email ||
      user.nickname ||
      user.firstName ||
      user.lastName ||
      Number.isInteger(user.experience) ||
      Number.isInteger(user.level) ||
      user.premiumUntil ||
      user.createdAt ||
      user.updatedAt ||
      user.role !== 'user' ||
      user.isPremium,
  );
}

function readUserFromResponse(data) {
  const candidates = [
    data?.user,
    data?.profile,
    data?.account,
    data?.data?.user,
    data?.data?.profile,
    data?.data?.account,
    data?.data,
    data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAdminUser(candidate);
    if (isAdminUserLike(normalized)) return normalized;
  }

  return null;
}

async function mutateAdminUser(path, { method, token, body } = {}) {
  const data = await apiRequest(path, { method, token, body });
  return readUserFromResponse(data);
}

export async function fetchAdminUsers({ token, query, limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedOffset = normalizeOffset(offset);
  const normalizedQuery = normalizeString(query);

  const params = new URLSearchParams();
  params.set('limit', String(normalizedLimit));
  params.set('offset', String(normalizedOffset));
  if (normalizedQuery) params.set('q', normalizedQuery);

  const data = await apiRequest(`${ADMIN_USERS_BASE_PATH}?${params.toString()}`, { token });
  const items = readUsersCollection(data)
    .map(normalizeAdminUser)
    .filter(isAdminUserLike);

  return {
    items,
    total: readTotal(data),
    limit: readPaginationInteger(data, ['limit', 'page_size', 'pageSize'], normalizedLimit),
    offset: readPaginationInteger(data, ['offset', 'skip'], normalizedOffset),
  };
}

export async function fetchAdminUserById({ token, userId } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new Error('User id is required');

  const data = await apiRequest(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(normalizedUserId)}`,
    { token },
  );
  const user = readUserFromResponse(data);
  if (!user) throw new Error('Unexpected admin user response');

  return {
    ...user,
    id: user.id ?? normalizedUserId,
  };
}

export async function updateAdminUserRole({ token, userId, role } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new Error('User id is required');

  const normalizedRole = normalizeString(role);
  if (!normalizedRole) throw new Error('Role is required');

  return mutateAdminUser(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(normalizedUserId)}/role`,
    {
      method: 'PATCH',
      token,
      body: { role: normalizedRole.toLowerCase() },
    },
  );
}

export async function grantAdminUserPremium({ token, userId, days } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new Error('User id is required');

  const normalizedDays = normalizePositiveInteger(days, 'Days');

  return mutateAdminUser(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(normalizedUserId)}/premium`,
    {
      method: 'POST',
      token,
      body: { days: normalizedDays },
    },
  );
}

export async function revokeAdminUserPremium({ token, userId } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new Error('User id is required');

  return mutateAdminUser(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(normalizedUserId)}/premium`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export async function updateAdminUserExperience({ token, userId, experience } = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new Error('User id is required');

  const normalizedExperience = normalizeNonNegativeInteger(experience, 'Experience');

  return mutateAdminUser(
    `${ADMIN_USERS_BASE_PATH}/${encodeURIComponent(normalizedUserId)}/xp`,
    {
      method: 'PUT',
      token,
      body: { experience: normalizedExperience },
    },
  );
}
