export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  try {
    return isJson ? await response.json() : await response.text();
  } catch {
    return null;
  }
}

export async function apiRequest(
  path,
  { method = 'GET', body, token, headers: headersInit, credentials = 'include' } = {},
) {
  const headers = new Headers(headersInit);
  headers.set('accept', 'application/json');

  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'object' ? detail.message : (typeof detail === 'string' ? detail : undefined);

    throw new ApiError(message || `Request failed: ${response.status}`, {
      status: response.status,
      data,
    });
  }

  return data;
}
