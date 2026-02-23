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
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }

    const detail = errorData?.detail;
    const errorCode = typeof detail === 'object' ? detail.error_code : undefined;
    const message = typeof detail === 'object' ? detail.message : (typeof detail === 'string' ? detail : undefined);

    const error = new Error(message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.errorCode = errorCode;
    error.detail = detail;
    error.data = errorData;
    throw error;
  }

  return data;
}
