import { apiRequest } from '@/shared/api/client';

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeAchievement(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const code = typeof raw.code === 'string' ? raw.code : null;
  if (!code) return null;

  return {
    code,
    title: typeof raw.title === 'string' ? raw.title : code,
    titleRu: typeof (raw.title_ru ?? raw.titleRu) === 'string' ? (raw.title_ru ?? raw.titleRu) : null,
    description: typeof raw.description === 'string' ? raw.description : '',
    descriptionRu:
      typeof (raw.description_ru ?? raw.descriptionRu) === 'string'
        ? (raw.description_ru ?? raw.descriptionRu)
        : null,
    category: typeof raw.category === 'string' ? raw.category : 'other',
    threshold: typeof raw.threshold === 'number' ? raw.threshold : 0,
    xpReward: typeof (raw.xp_reward ?? raw.xpReward) === 'number' ? (raw.xp_reward ?? raw.xpReward) : 25,
    unlocked: raw.unlocked === true,
    unlockedAt:
      typeof (raw.unlocked_at ?? raw.unlockedAt) === 'string'
        ? (raw.unlocked_at ?? raw.unlockedAt)
        : null,
  };
}

export async function fetchAchievements({ token } = {}) {
  const data = await apiRequest('/api/achievements', { token });
  const source = asObject(data?.data) ?? asObject(data) ?? {};
  const rawItems = Array.isArray(source.achievements) ? source.achievements : [];

  return rawItems.map(normalizeAchievement).filter(Boolean);
}
