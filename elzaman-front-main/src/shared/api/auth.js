import { apiRequest } from '@/shared/api/client';

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function isUserLike(value) {
  const user = asObject(value);
  if (!user) return false;

  return Boolean(
    user.email ??
      user.nickname ??
      user.first_name ??
      user.firstName ??
      user.last_name ??
      user.lastName ??
      user.birth_date ??
      user.birthDate ??
      user.gender ??
      user.avatar_url ??
      user.avatarUrl ??
      user.streak_current ??
      user.streakCurrent,
  );
}

function readToken(data) {
  return (
    data.token ??
    data.access_token ??
    data.accessToken ??
    data.jwt ??
    data.accessJwt ??
    data.data?.token ??
    data.data?.access_token ??
    data.data?.accessToken
  );
}

function readUser(data) {
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
    if (isUserLike(candidate)) return candidate;
  }

  return null;
}

function isRetriableProfileStatus(status) {
  return status === 400 || status === 404 || status === 405 || status === 422;
}

export async function registerUser(payload) {
  return apiRequest('/api/auth/register', { method: 'POST', body: payload });
}

export async function loginUser({ email, password }) {
  let data;
  try {
    data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  } catch (err) {
    // Пробрасываем понятную ошибку с бэкенда
    const detail = err?.detail ?? err?.response?.detail ?? err?.data?.detail;
    if (detail) {
      const message = typeof detail === 'object' ? detail.message : detail;
      const errorCode = typeof detail === 'object' ? detail.error_code : undefined;
      const error = new Error(message || 'Ошибка входа');
      error.errorCode = errorCode || 'UNKNOWN';
      throw error;
    }
    throw err;
  }

  if (typeof data === 'string') return { token: data.trim() || null, user: null, raw: data };
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected login response');
  }

  const token = readToken(data);
  const user = readUser(data);

  if (typeof token === 'string' || user || data.ok === true || data.user_id) {
    return { token: typeof token === 'string' ? token.trim() || null : null, user, raw: data };
  }

  throw new Error('Unexpected login response');
}

export async function fetchProfile({ token } = {}) {
  const profilePaths = ['/api/profile', '/api/auth/me'];
  let lastError = null;

  for (const path of profilePaths) {
    try {
      const data = await apiRequest(path, { token });
      if (!data || typeof data !== 'object') {
        lastError = new Error('Unexpected profile response');
        continue;
      }

      const user = readUser(data);
      if (user) return user;

      lastError = new Error('Unexpected profile response');
    } catch (err) {
      lastError = err;

      const status = Number(err?.status);
      if (!Number.isInteger(status) || !isRetriableProfileStatus(status)) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Unexpected profile response');
}

export async function logoutUser({ token } = {}) {
  return apiRequest('/api/auth/logout', { method: 'POST', token });
}

export async function refreshUser({ token } = {}) {
  const data = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    token,
  });

  if (typeof data === 'string') {
    return { token: data.trim() || null, user: null, raw: data };
  }

  if (!data || typeof data !== 'object') {
    return { token: null, user: null, raw: data ?? null };
  }

  return {
    token: typeof readToken(data) === 'string' ? readToken(data).trim() || null : null,
    user: readUser(data),
    raw: data,
  };
}
