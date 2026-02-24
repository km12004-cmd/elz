const ERROR_MESSAGES_BY_CONTEXT = {
  default: {
    fallback: 'Something went wrong. Please try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have access to this resource.',
    404: 'Requested data was not found.',
  },
  signIn: {
    fallback: 'We could not sign you in. Please try again.',
    401: 'You entered an incorrect email or password.',
    403: 'Your account cannot sign in right now.',
    404: 'Sign-in service is unavailable right now.',
  },
  signUp: {
    fallback: 'We could not create your account. Please try again.',
    401: 'Your sign-up session expired. Please try again.',
    403: 'Sign-up is not available for this account.',
    404: 'Sign-up service is unavailable right now.',
  },
  home: {
    fallback: 'We could not load home data. Please try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have access to home content.',
    404: 'Home data was not found.',
  },
  placeholder: {
    fallback: 'We could not load this page. Please try again.',
    401: 'Your session has expired. Please sign in again to open this page.',
    403: 'You do not have access to this page.',
    404: 'This page data was not found.',
  },
  songsLevel: {
    fallback: 'We could not load songs for this level. Please try again.',
    401: 'Your session has expired. Please sign in again to load songs.',
    403: 'You do not have access to this song level.',
    404: 'Songs for this level were not found.',
  },
  songLesson: {
    fallback: 'We could not complete this lesson request. Please try again.',
    401: 'Your session has expired. Please sign in again to continue this lesson.',
    403: 'You do not have access to this lesson.',
    404: 'This lesson was not found.',
  },
  cards: {
    fallback: 'We could not complete the folder request. Please try again.',
    401: 'Your session has expired. Please sign in again to manage folders.',
    403: 'You do not have access to flashcard folders.',
    404: 'Flashcard folders were not found.',
  },
  folder: {
    fallback: 'We could not complete the card request. Please try again.',
    401: 'Your session has expired. Please sign in again to manage cards.',
    403: 'You do not have access to this folder.',
    404: 'This folder was not found.',
  },
  playlists: {
    fallback: 'We could not complete the playlist request. Please try again.',
    401: 'Your session has expired. Please sign in again to manage playlists.',
    403: 'You do not have access to playlists.',
    404: 'Playlists were not found.',
  },
  playlistDetail: {
    fallback: 'We could not complete the request for this playlist. Please try again.',
    401: 'Your session has expired. Please sign in again to manage this playlist.',
    403: 'You do not have access to this playlist.',
    404: 'This playlist was not found.',
  },
};

function resolveContextMessages(context) {
  if (typeof context !== 'string') return ERROR_MESSAGES_BY_CONTEXT.default;
  return ERROR_MESSAGES_BY_CONTEXT[context] ?? ERROR_MESSAGES_BY_CONTEXT.default;
}

function statusMessage(messages, status) {
  if (typeof status !== 'number' || !Number.isFinite(status)) return null;
  return messages[String(status)] ?? null;
}

export function extractErrorMessage(error, { context = 'default' } = {}) {
  const data = error?.data;
  const detail = data?.detail;
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status)
      ? error.status
      : null;
  const messages = resolveContextMessages(context);
  const mappedStatusMessage = statusMessage(messages, status);

  if (mappedStatusMessage) return mappedStatusMessage;

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
  return messages.fallback;
}
