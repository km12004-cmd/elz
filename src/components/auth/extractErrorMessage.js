export function extractErrorMessage(error) {
  const data = error?.data;
  const detail = data?.detail;
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this resource.';
  if (status === 404) return 'Requested data was not found.';

  if (typeof data === 'string' && data.trim()) return data;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => (item && typeof item === 'object' ? item.msg : null))
      .filter(Boolean)
      .join(', ');

    if (message) return message;
  }

  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;

  return 'Something went wrong. Please try again.';
}
