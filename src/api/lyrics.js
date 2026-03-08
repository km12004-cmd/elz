import { ApiError, apiRequest } from './client';

const LYRICS_BASE = '/api/lyrics';

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

function normalizeBulkDictionaryItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const sourceText = normalizeText(
        item?.sourceText ?? item?.surface ?? item?.src ?? item?.normalized,
      );
      const translatedText = normalizeText(
        item?.translation ?? item?.ruText ?? item?.dstText ?? item?.dst_text,
      );
      if (!sourceText || !translatedText) return null;

      return {
        src: sourceText,
        dstText: translatedText,
      };
    })
    .filter(Boolean);
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
      if (!shouldRetryWithFallbackBody(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new ApiError('Request failed');
}

export async function fetchTokenizedLyrics({ token, songId }) {
  const data = await apiRequest(`${LYRICS_BASE}/songs/${songId}`, { token });
  const raw = data && typeof data === 'object' ? data : {};
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  return {
    songId: raw.song_id ?? songId,
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.line_no ?? line.lineNo ?? 0,
      textRaw: line.text_raw ?? line.textRaw ?? '',
      tokens: Array.isArray(line.tokens)
        ? line.tokens.map((t) => ({
            id: t.id,
            idx: t.idx,
            surface: t.surface ?? '',
            normalized: t.normalized ?? '',
            isWord: Boolean(t.is_word ?? t.isWord),
          }))
        : [],
    })),
  };
}

export async function tokenizeSongLyrics({ token, songId } = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) {
    throw new Error('Song id is required');
  }

  const data = await apiRequest(
    `${LYRICS_BASE}/songs/${encodeURIComponent(normalizedSongId)}/tokenize`,
    {
      method: 'POST',
      token,
    },
  );

  return {
    songId: normalizeId(data?.song_id ?? data?.songId) ?? normalizedSongId,
    linesCount:
      typeof data?.lines_count === 'number'
        ? data.lines_count
        : typeof data?.linesCount === 'number'
        ? data.linesCount
        : null,
    tokensCount:
      typeof data?.tokens_count === 'number'
        ? data.tokens_count
        : typeof data?.tokensCount === 'number'
        ? data.tokensCount
        : null,
  };
}

export async function fetchSongTranslations({ token, songId, lang = 'ru' }) {
  const data = await apiRequest(
    `${LYRICS_BASE}/songs/${songId}/translations?lang=${encodeURIComponent(lang)}`,
    { token },
  );
  const raw = data && typeof data === 'object' ? data : {};
  const translations = Array.isArray(raw.translations)
    ? raw.translations
    : Array.isArray(raw.items)
    ? raw.items
    : [];

  const map = new Map();
  for (const entry of translations) {
    const sourceFallback =
      typeof entry?.src === 'string' ? entry.src : typeof entry?.source === 'string' ? entry.source : '';
    const normalized = normalizeText(entry?.normalized ?? sourceFallback)?.toLocaleLowerCase() ?? '';
    const translation = normalizeText(
      entry?.translation ?? entry?.dst_text ?? entry?.dstText ?? entry?.text ?? null,
    );
    if (normalized && translation) {
      map.set(normalized, translation);
    }
  }
  return map;
}

export async function upsertSongDictionaryBulk({
  token,
  songId,
  items,
  srcLang = 'kg',
  dstLang = 'ru',
} = {}) {
  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) {
    throw new Error('Song id is required');
  }

  const normalizedSrcLang = normalizeText(srcLang) ?? 'kg';
  const normalizedDstLang = normalizeText(dstLang) ?? 'ru';
  const preparedItems = normalizeBulkDictionaryItems(items);
  if (preparedItems.length === 0) {
    throw new Error('At least one dictionary row is required');
  }

  const data = await requestWithFallbackBodies(
    `${LYRICS_BASE}/songs/${encodeURIComponent(normalizedSongId)}/dictionary/bulk`,
    {
      method: 'POST',
      token,
      bodies: [
        {
          src_lang: normalizedSrcLang,
          dst_lang: normalizedDstLang,
          items: preparedItems.map((item) => ({
            src: item.src,
            dst_text: item.dstText,
          })),
        },
        {
          srcLang: normalizedSrcLang,
          dstLang: normalizedDstLang,
          items: preparedItems.map((item) => ({
            src: item.src,
            dstText: item.dstText,
          })),
        },
        {
          src_lang: normalizedSrcLang,
          dst_lang: normalizedDstLang,
          translations: preparedItems.map((item) => ({
            src: item.src,
            dst_text: item.dstText,
          })),
        },
      ],
    },
  );

  const upsertedCount =
    data?.upserted_count ??
    data?.upsertedCount ??
    data?.created_count ??
    data?.createdCount ??
    preparedItems.length;

  return {
    songId: normalizedSongId,
    upsertedCount:
      typeof upsertedCount === 'number' && Number.isFinite(upsertedCount)
        ? upsertedCount
        : preparedItems.length,
  };
}
