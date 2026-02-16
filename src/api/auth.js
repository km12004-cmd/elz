import { apiRequest } from './client';

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
  return data.user ?? data.profile ?? data.account ?? data.data?.user ?? data.data?.profile ?? null;
}

export async function registerUser(payload) {
  return apiRequest('/api/register', { method: 'POST', body: payload });
}

export async function loginUser({ email, password }) {
  const data = await apiRequest('/api/login', {
    method: 'POST',
    body: { email, password },
  });

  if (typeof data === 'string') return { token: data, user: null, raw: data };
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected login response');
  }

  const token = readToken(data);
  const user = readUser(data);

  if (typeof token === 'string' || user || data.ok === true || data.user_id) {
    return { token: typeof token === 'string' ? token : null, user, raw: data };
  }

  throw new Error('Unexpected login response');
}

export async function fetchProfile({ token } = {}) {
  const data = await apiRequest('/api/profile', { token });

  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected profile response');
  }

  return readUser(data);
}

export async function logoutUser({ token } = {}) {
  return apiRequest('/api/logout', { method: 'POST', token });
}
