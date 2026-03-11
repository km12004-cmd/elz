import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { fetchProgress } from '@/entities/xp/api';
import { ProgressContext } from './progressContext';

const DEFAULT_PROGRESS = {
  level: 1,
  xpTotal: 0,
  nextLevelThreshold: 100,
  xpToNextLevel: 100,
};

export function ProgressProvider({ children }) {
  const { isAuthenticated, token } = useAuth();
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [xpNotification, setXpNotification] = useState(null);
  const [levelUpNotification, setLevelUpNotification] = useState(null);

  // Ref kept in sync so applyXpResult can read current level without stale closure
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Fetch progress when authenticated. The widget is hidden when signed out,
  // so stale state while unauthenticated is harmless.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    fetchProgress({ token })
      .then((data) => { if (!cancelled) setProgress(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, token]);

  // Exposed so consumers can imperatively refresh (e.g. after manual profile fetch)
  const refreshProgress = useCallback(async (authToken) => {
    try {
      const data = await fetchProgress({ token: authToken });
      setProgress(data);
    } catch {
      // Silently ignore
    }
  }, []);

  const applyXpResult = useCallback(({
    applied,
    xpDelta = 0,
    newXp = null,
    newLevel = null,
    nextLevelThreshold = null,
    xpToNextLevel = null,
  } = {}) => {
    if (!applied) {
      setXpNotification({ type: 'duplicate', delta: 0 });
      return;
    }

    const prevLevel = progressRef.current.level;

    setProgress((prev) => ({
      level: newLevel ?? prev.level,
      xpTotal: newXp ?? prev.xpTotal,
      nextLevelThreshold: nextLevelThreshold ?? prev.nextLevelThreshold,
      xpToNextLevel: xpToNextLevel ?? prev.xpToNextLevel,
    }));

    if (xpDelta > 0) {
      setXpNotification({ type: 'awarded', delta: xpDelta });
    }

    if (newLevel !== null && newLevel > prevLevel) {
      setLevelUpNotification({ newLevel });
    }
  }, []);

  const dismissXpNotification = useCallback(() => setXpNotification(null), []);
  const dismissLevelUpNotification = useCallback(() => setLevelUpNotification(null), []);

  return (
    <ProgressContext.Provider
      value={{
        progress,
        refreshProgress,
        applyXpResult,
        xpNotification,
        levelUpNotification,
        dismissXpNotification,
        dismissLevelUpNotification,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}
