import { normalizeId } from '@/shared/lib/normalizeId';

export const PREMIUM_LOCKED_SONG_COUNT = 4;

export function getPremiumLockedSongIds(songs, lockedCount = PREMIUM_LOCKED_SONG_COUNT) {
  if (!Array.isArray(songs) || lockedCount <= 0) {
    return new Set();
  }

  return new Set(
    songs
      .slice(0, lockedCount)
      .map((song) => normalizeId(song?.id))
      .filter(Boolean),
  );
}

export function isPremiumLockedSong({ songs, songId, hasPremiumAccess }) {
  if (hasPremiumAccess) return false;

  const normalizedSongId = normalizeId(songId);
  if (!normalizedSongId) return false;

  return getPremiumLockedSongIds(songs).has(normalizedSongId);
}
