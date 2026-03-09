function base64UrlToBase64(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = atob(base64UrlToBase64(parts[1]));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

