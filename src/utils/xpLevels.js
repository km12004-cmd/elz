// Mirror of LEVEL_THRESHOLDS in the backend (app/modules/xp/service.py).
// Index i = minimum cumulative XP to reach level (i+1).
// Level 1 = 0 XP, Level 2 = 100 XP, ... Level 11 = 10 000 XP (max).
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500, 10000];

/**
 * Given the current level (1-based) and total XP, return progress within
 * the current level as a value 0–100.
 */
export function xpFillPercent(level, xpTotal) {
  const prevThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const span = nextThreshold - prevThreshold;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((xpTotal - prevThreshold) / span) * 100)));
}
