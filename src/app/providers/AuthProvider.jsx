import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProfile, loginUser, logoutUser, refreshUser, registerUser } from '@/shared/api/auth';
import { decodeJwtPayload } from '@/shared/lib/jwt';
import { AuthContext } from './auth-context';

const STORAGE_KEY = 'elzaman_auth';
const AUTH_SESSION_DAYS = 15;
const AUTH_SESSION_TTL_MS = AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000;
const AUTH_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const EMPTY_AUTH = { token: null, user: null, sessionStartedAt: null };
const PLACEHOLDER_STRINGS = new Set([
  'not provided',
  'not-provided',
  'not_provided',
  'n/a',
  'null',
  'undefined',
]);

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadStoredAuth() {
  const stored = safeParseJson(localStorage.getItem(STORAGE_KEY));
  if (!stored || typeof stored !== 'object') return EMPTY_AUTH;

  const token = typeof stored.token === 'string' ? stored.token : null;
  const user = stored.user && typeof stored.user === 'object' ? stored.user : null;
  const rawStartedAt = Number(stored.sessionStartedAt);
  const sessionStartedAt = Number.isFinite(rawStartedAt) && rawStartedAt > 0 ? rawStartedAt : Date.now();

  if (!token) return EMPTY_AUTH;

  if (Date.now() - sessionStartedAt >= AUTH_SESSION_TTL_MS) {
    localStorage.removeItem(STORAGE_KEY);
    return EMPTY_AUTH;
  }

  return { token, user, sessionStartedAt };
}

function persistAuth({ token, user, sessionStartedAt }) {
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const resolvedStartedAt =
    Number.isFinite(Number(sessionStartedAt)) && Number(sessionStartedAt) > 0
      ? Number(sessionStartedAt)
      : Date.now();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      user: user ?? null,
      sessionStartedAt: resolvedStartedAt,
    }),
  );
}

function nicknameFromEmail(email) {
  if (typeof email !== 'string') return null;
  const [name] = email.split('@');
  return name || null;
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (!trimmed) continue;
    if (PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) continue;

    return trimmed;
  }

  return null;
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) return false;

  return null;
}

function pickFirstBoolean(...values) {
  for (const value of values) {
    const parsed = toBoolean(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toNonNegativeInteger(value) {
  if (!Number.isFinite(value)) return null;

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : null;
}

function toIdString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized >= 0 ? String(normalized) : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function pickFirstId(...values) {
  for (const value of values) {
    const normalized = toIdString(value);
    if (normalized) return normalized;
  }

  return null;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function mergeUserHints(...hints) {
  const merged = {};

  for (const hint of hints) {
    const normalizedHint = asObject(hint);
    if (normalizedHint) Object.assign(merged, normalizedHint);
  }

  return Object.keys(merged).length ? merged : null;
}

function normalizeUser({ email, userHint, tokenPayload, previousUser } = {}) {
  const normalizedHint = asObject(userHint);
  const normalizedPreviousUser = asObject(previousUser);
  const normalizedPayload = asObject(tokenPayload);
  const tokenUser = asObject(normalizedPayload?.user);
  const streakCurrent = toNonNegativeInteger(
    pickFirstNumber(
      normalizedHint?.streakCurrent,
      normalizedHint?.streak_current,
      normalizedPayload?.streakCurrent,
      normalizedPayload?.streak_current,
      tokenUser?.streakCurrent,
      tokenUser?.streak_current,
      normalizedPreviousUser?.streakCurrent,
      normalizedPreviousUser?.streak_current,
    ),
  );
  const streakBest = toNonNegativeInteger(
    pickFirstNumber(
      normalizedHint?.streakBest,
      normalizedHint?.streak_best,
      normalizedPayload?.streakBest,
      normalizedPayload?.streak_best,
      tokenUser?.streakBest,
      tokenUser?.streak_best,
      normalizedPreviousUser?.streakBest,
      normalizedPreviousUser?.streak_best,
      streakCurrent,
    ),
  );
  const isPremium =
    pickFirstBoolean(
      normalizedHint?.isPremium,
      normalizedHint?.is_premium,
      normalizedPayload?.isPremium,
      normalizedPayload?.is_premium,
      tokenUser?.isPremium,
      tokenUser?.is_premium,
      normalizedPreviousUser?.isPremium,
      normalizedPreviousUser?.is_premium,
    ) ?? false;

  const resolvedEmail = pickFirstString(
    normalizedHint?.email,
    normalizedHint?.email_address,
    email,
    normalizedPayload?.email,
    normalizedPayload?.user_email,
    tokenUser?.email,
    normalizedPreviousUser?.email,
  );

  const tokenNickname =
    normalizedPayload?.nickname ??
    tokenUser?.nickname ??
    normalizedPayload?.username ??
    tokenUser?.username ??
    normalizedPayload?.sub;

  const tokenAvatarUrl =
    normalizedPayload?.avatar_url ??
    normalizedPayload?.avatarUrl ??
    tokenUser?.avatar_url ??
    tokenUser?.avatarUrl;
  const explicitRole = pickFirstString(
    normalizedHint?.role,
    normalizedHint?.user_role,
    normalizedPayload?.role,
    normalizedPayload?.user_role,
    tokenUser?.role,
    tokenUser?.user_role,
    normalizedPreviousUser?.role,
  );
  const roleFromFlags = pickFirstBoolean(
    normalizedHint?.isAdmin,
    normalizedHint?.is_admin,
    normalizedPayload?.isAdmin,
    normalizedPayload?.is_admin,
    tokenUser?.isAdmin,
    tokenUser?.is_admin,
    normalizedPreviousUser?.isAdmin,
    normalizedPreviousUser?.is_admin,
  );
  const role = explicitRole ? explicitRole.toLowerCase() : roleFromFlags ? 'admin' : 'user';

  return {
    id: pickFirstId(
      normalizedHint?.id,
      normalizedHint?.userId,
      normalizedHint?.user_id,
      normalizedPayload?.id,
      normalizedPayload?.userId,
      normalizedPayload?.user_id,
      tokenUser?.id,
      tokenUser?.userId,
      tokenUser?.user_id,
      normalizedPreviousUser?.id,
      normalizedPreviousUser?.userId,
      normalizedPreviousUser?.user_id,
    ),
    email: resolvedEmail,
    nickname: pickFirstString(
      normalizedHint?.nickname,
      tokenNickname,
      normalizedPreviousUser?.nickname,
      nicknameFromEmail(resolvedEmail),
      'User',
    ),
    avatarUrl: pickFirstString(
      normalizedHint?.avatarUrl,
      normalizedHint?.avatar_url,
      tokenAvatarUrl,
      normalizedPreviousUser?.avatarUrl,
    ),
    firstName: pickFirstString(
      normalizedHint?.firstName,
      normalizedHint?.first_name,
      normalizedPayload?.firstName,
      normalizedPayload?.first_name,
      tokenUser?.firstName,
      tokenUser?.first_name,
      normalizedPreviousUser?.firstName,
    ),
    lastName: pickFirstString(
      normalizedHint?.lastName,
      normalizedHint?.last_name,
      normalizedPayload?.lastName,
      normalizedPayload?.last_name,
      tokenUser?.lastName,
      tokenUser?.last_name,
      normalizedPreviousUser?.lastName,
    ),
    gender: pickFirstString(
      normalizedHint?.gender,
      normalizedPayload?.gender,
      tokenUser?.gender,
      normalizedPreviousUser?.gender,
    ),
    birthDate: pickFirstString(
      normalizedHint?.birthDate,
      normalizedHint?.birth_date,
      normalizedPayload?.birthDate,
      normalizedPayload?.birth_date,
      tokenUser?.birthDate,
      tokenUser?.birth_date,
      normalizedPreviousUser?.birthDate,
    ),
    registeredAt: pickFirstString(
      normalizedHint?.registeredAt,
      normalizedHint?.registered_at,
      normalizedHint?.createdAt,
      normalizedHint?.created_at,
      normalizedHint?.['created-at'],
      normalizedPayload?.registeredAt,
      normalizedPayload?.registered_at,
      normalizedPayload?.createdAt,
      normalizedPayload?.created_at,
      tokenUser?.registeredAt,
      tokenUser?.registered_at,
      tokenUser?.createdAt,
      tokenUser?.created_at,
      normalizedPreviousUser?.createdAt,
      normalizedPreviousUser?.created_at,
      normalizedPreviousUser?.registeredAt,
    ),
    streakCurrent,
    streakBest,
    streakLastLocalDate: pickFirstString(
      normalizedHint?.streakLastLocalDate,
      normalizedHint?.streak_last_local_date,
      normalizedPayload?.streakLastLocalDate,
      normalizedPayload?.streak_last_local_date,
      tokenUser?.streakLastLocalDate,
      tokenUser?.streak_last_local_date,
      normalizedPreviousUser?.streakLastLocalDate,
      normalizedPreviousUser?.streak_last_local_date,
    ),
    role,
    isAdmin: role === 'admin',
    experience: toNonNegativeInteger(
      pickFirstNumber(
        normalizedHint?.experience,
        normalizedHint?.xp_total,
        normalizedHint?.xpTotal,
        normalizedHint?.xp,
        normalizedPayload?.experience,
        normalizedPayload?.xp_total,
        normalizedPayload?.xpTotal,
        normalizedPayload?.xp,
        tokenUser?.experience,
        tokenUser?.xp_total,
        tokenUser?.xpTotal,
        tokenUser?.xp,
        normalizedPreviousUser?.experience,
        normalizedPreviousUser?.xp_total,
        normalizedPreviousUser?.xpTotal,
        normalizedPreviousUser?.xp,
      ),
    ),
    level: toNonNegativeInteger(
      pickFirstNumber(
        normalizedHint?.level,
        normalizedPayload?.level,
        tokenUser?.level,
        normalizedPreviousUser?.level,
      ),
    ),
    premiumUntil: pickFirstString(
      normalizedHint?.premiumUntil,
      normalizedHint?.premium_until,
      normalizedHint?.premium_expires_at,
      normalizedHint?.premiumExpiresAt,
      normalizedPayload?.premiumUntil,
      normalizedPayload?.premium_until,
      normalizedPayload?.premium_expires_at,
      normalizedPayload?.premiumExpiresAt,
      tokenUser?.premiumUntil,
      tokenUser?.premium_until,
      tokenUser?.premium_expires_at,
      tokenUser?.premiumExpiresAt,
      normalizedPreviousUser?.premiumUntil,
      normalizedPreviousUser?.premium_until,
      normalizedPreviousUser?.premium_expires_at,
      normalizedPreviousUser?.premiumExpiresAt,
    ),
    isPremium,
  };
}

export function AuthProvider({ children }) {
  const [{ token, user, sessionStartedAt }, setAuth] = useState(() => loadStoredAuth());
  const isAuthenticated = Boolean(token || user);

  useEffect(() => {
    persistAuth({ token, user, sessionStartedAt });
  }, [token, user, sessionStartedAt]);

  useEffect(() => {
    if (!token) return undefined;

    const startedAt = Number(sessionStartedAt);
    const remainingMs =
      Number.isFinite(startedAt) && startedAt > 0
        ? AUTH_SESSION_TTL_MS - (Date.now() - startedAt)
        : 0;
    const timeoutMs = Math.max(0, remainingMs);

    const timerId = window.setTimeout(() => {
      setAuth((prev) => (prev.token === token ? EMPTY_AUTH : prev));
    }, timeoutMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [token, sessionStartedAt]);

  useEffect(() => {
    if (!token) return undefined;

    let isCancelled = false;

    const hydrateProfile = async () => {
      try {
        const profileUser = await fetchProfile({ token });
        if (!profileUser || isCancelled) return;

        const tokenPayload = decodeJwtPayload(token);
        setAuth((prev) => {
          if (prev.token !== token) return prev;

          return {
            token: prev.token,
            user: normalizeUser({
              email: prev.user?.email ?? profileUser?.email ?? null,
              userHint: mergeUserHints(prev.user, profileUser),
              tokenPayload,
              previousUser: prev.user,
            }),
            sessionStartedAt: prev.sessionStartedAt,
          };
        });
      } catch {
        // noop: keep existing local auth snapshot when profile endpoint fails.
      }
    };

    hydrateProfile();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    let isCancelled = false;

    const refreshAuth = async () => {
      try {
        const { token: refreshedToken, user: refreshedUser } = await refreshUser({ token });
        if (isCancelled) return;

        if (!refreshedToken && !refreshedUser) return;

        setAuth((prev) => {
          if (prev.token !== token) return prev;

          const nextToken = refreshedToken ?? prev.token;
          const tokenPayload = decodeJwtPayload(nextToken);

          return {
            token: nextToken,
            user: refreshedUser
              ? normalizeUser({
                  email: prev.user?.email ?? refreshedUser?.email ?? null,
                  userHint: mergeUserHints(prev.user, refreshedUser),
                  tokenPayload,
                  previousUser: prev.user,
                })
              : prev.user,
            sessionStartedAt: prev.sessionStartedAt ?? Date.now(),
          };
        });
      } catch {
        // noop: keep current token when refresh endpoint is unavailable.
      }
    };

    refreshAuth();
    const intervalId = window.setInterval(refreshAuth, AUTH_REFRESH_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  const signOut = useCallback(() => {
    const activeToken = token;
    setAuth(EMPTY_AUTH);
    logoutUser({ token: activeToken }).catch(() => {
      // noop: user is already signed out on the client.
    });
  }, [token]);

  const signIn = useCallback(async ({ email, password, userHint } = {}) => {
    // loginUser теперь бросает ошибку с errorCode и нормальным message
    // Не перехватываем её здесь — пусть долетит до компонента формы логина
    const { token: nextToken, user: responseUser } = await loginUser({ email, password });
    
    let profileUser = null;
    if (nextToken) {
      try {
        profileUser = await fetchProfile({ token: nextToken });
      } catch {
        // Профиль не удалось загрузить — не критично
      }
    }
    
    const tokenPayload = decodeJwtPayload(nextToken);
    const mergedUserHint = mergeUserHints(responseUser, profileUser, userHint);

    setAuth((prev) => ({
      token: nextToken,
      user: normalizeUser({
        email,
        userHint: mergedUserHint,
        tokenPayload,
        previousUser: prev.user,
      }),
      sessionStartedAt: Date.now(),
    }));

    return nextToken;
  }, []);

  const signUp = useCallback(
    async (payload) => {
      const response = await registerUser(payload);
      const responseUser =
        response && typeof response === 'object'
          ? response.user ?? response.profile ?? response.account ?? null
          : null;

      await signIn({
        email: payload.email,
        password: payload.password,
        userHint: mergeUserHints(responseUser, {
          firstName: payload.first_name,
          lastName: payload.last_name,
          nickname: payload.nickname,
          email: payload.email,
          gender: payload.gender,
          birthDate: payload.birth_date,
          registeredAt: new Date().toISOString(),
        }),
      });

      return response;
    },
    [signIn],
  );

  const setUser = useCallback((nextUser) => {
    setAuth((prev) => ({ ...prev, user: nextUser }));
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated,
      signIn,
      signUp,
      signOut,
      setUser,
    }),
    [token, user, isAuthenticated, signIn, signUp, signOut, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
