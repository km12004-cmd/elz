import { normalizeId } from '@/shared/lib/normalizeId';
import {
  createFlashcardFolder,
  createFlashcardInFolder,
} from '@/entities/flashcard/api';

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, '0')}`;
}

export function extractYouTubeVideoId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) return trimmed;

  const parsed = (() => {
    try {
      return new URL(trimmed);
    } catch {
      try {
        return new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    }
  })();

  if (!parsed) return null;

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'youtu.be') {
    const shortId = parsed.pathname.split('/').filter(Boolean)[0];
    return idPattern.test(shortId ?? '') ? shortId : null;
  }

  if (hostname.endsWith('youtube.com') || hostname === 'youtube-nocookie.com') {
    const watchId = parsed.searchParams.get('v');
    if (idPattern.test(watchId ?? '')) return watchId;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const candidates = [
      pathParts[0] === 'embed' ? pathParts[1] : null,
      pathParts[0] === 'shorts' ? pathParts[1] : null,
      pathParts[0] === 'live' ? pathParts[1] : null,
    ];

    const firstValid = candidates.find((item) => idPattern.test(item ?? ''));
    return firstValid ?? null;
  }

  return null;
}

export function toYouTubeEmbedUrl(value) {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function isRetriableRouteError(error) {
  const status =
    typeof error?.status === 'number' && Number.isFinite(error.status) ? error.status : null;
  return status === 404 || status === 405 || status === 422;
}

export function formatLearningStatus(status) {
  if (typeof status !== 'string' || !status.trim()) return 'Не начато';

  const normalized = status.trim().toLowerCase();
  if (normalized === 'not_started') return 'Не начато';
  if (normalized === 'listened') return 'Прослушано';
  if (normalized === 'in_progress') return 'В процессе';
  if (normalized === 'completed') return 'Завершено';

  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function normalizeCardText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function uniqueTaskCards(cards) {
  if (!Array.isArray(cards)) return [];

  const unique = [];
  const signatures = new Set();

  cards.forEach((card) => {
    const kgText = normalizeCardText(card?.kgText);
    const ruText = normalizeCardText(card?.ruText);
    if (!kgText || !ruText) return;

    const signature = `${kgText}\u0000${ruText}`;
    if (signatures.has(signature)) return;

    signatures.add(signature);
    unique.push({ ...card, kgText, ruText });
  });

  return unique;
}

export async function createSongFolderFromCards({ token, songTitle, cards } = {}) {
  const normalizedName = normalizeCardText(songTitle);
  const folderName = normalizedName || 'Урок по песне';
  const preparedCards = uniqueTaskCards(cards);

  const createdFolder = await createFlashcardFolder({ token, name: folderName });
  const folderId = normalizeId(createdFolder?.id);
  if (!folderId) return null;

  for (const card of preparedCards) {
    await createFlashcardInFolder({
      token,
      folderId,
      frontText: card.kgText,
      backText: card.ruText,
    });
  }

  return folderId;
}

export function pickAvailableFolderId(folders, ...candidates) {
  const preparedFolders = Array.isArray(folders) ? folders : [];
  const availableIds = new Set(
    preparedFolders.map((folder) => normalizeId(folder?.id)).filter(Boolean),
  );

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeId(candidate);
    if (normalizedCandidate && availableIds.has(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return normalizeId(preparedFolders[0]?.id);
}
