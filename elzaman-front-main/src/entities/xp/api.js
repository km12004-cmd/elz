import { apiRequest } from '@/shared/api/client';

function normalizeInteger(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  return null;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

export async function fetchProgress({ token } = {}) {
  const data = await apiRequest('/api/progress', { token });
  const source = asObject(data?.data) ?? asObject(data) ?? {};
  return {
    level: normalizeInteger(source.level) ?? 1,
    xpTotal: normalizeInteger(source.xp_total ?? source.xpTotal) ?? 0,
    nextLevelThreshold: normalizeInteger(source.next_level_threshold ?? source.nextLevelThreshold) ?? 100,
    xpToNextLevel: normalizeInteger(source.xp_to_next_level ?? source.xpToNextLevel) ?? 100,
  };
}

export async function openSong({ token, songId } = {}) {
  if (!songId) throw new Error('songId is required');
  await apiRequest(`/api/songs/${encodeURIComponent(songId)}/open`, { method: 'POST', token });
}

export async function completeSong({ token, songId, totalErrors } = {}) {
  if (!songId) throw new Error('songId is required');
  const body = typeof totalErrors === 'number' ? { total_errors: totalErrors } : undefined;
  const data = await apiRequest(`/api/songs/${encodeURIComponent(songId)}/complete`, {
    method: 'POST',
    token,
    body,
  });
  const source = asObject(data?.data) ?? asObject(data) ?? {};
  const rawAchievements = Array.isArray(source.unlocked_achievements ?? source.unlockedAchievements)
    ? (source.unlocked_achievements ?? source.unlockedAchievements)
    : [];
  return {
    applied: normalizeBoolean(source.applied) === true,
    xpDelta: normalizeInteger(source.xp_delta ?? source.xpDelta) ?? 0,
    newXp: normalizeInteger(source.new_xp ?? source.newXp) ?? null,
    newLevel: normalizeInteger(source.new_level ?? source.newLevel) ?? null,
    nextLevelThreshold: normalizeInteger(source.next_level_threshold ?? source.nextLevelThreshold) ?? null,
    xpToNextLevel: normalizeInteger(source.xp_to_next_level ?? source.xpToNextLevel) ?? null,
    unlockedAchievements: rawAchievements,
  };
}
