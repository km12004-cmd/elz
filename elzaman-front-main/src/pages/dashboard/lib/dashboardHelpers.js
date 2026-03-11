export function getArtistInitials(name) {
  if (typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function countCards(folder) {
  if (typeof folder?.cardsCount === 'number') return folder.cardsCount;
  if (Array.isArray(folder?.cards)) return folder.cards.length;
  return 0;
}

export function normalizeStreak(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function formatStreakDays(value) {
  const safeValue = normalizeStreak(value);
  return `${safeValue} day${safeValue === 1 ? '' : 's'}`;
}

export function hasPremiumAccess(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'on', 'active'].includes(normalized);
}
