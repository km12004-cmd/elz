import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProfile, loginUser, logoutUser, registerUser } from '../api/auth';
import { decodeJwtPayload } from '../utils/jwt';
import { AuthContext } from './auth-context';

const STORAGE_KEY = 'elzaman_auth';
const EMPTY_AUTH = { token: null, user: null };

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

  return { token, user };
}

function persistAuth({ token, user }) {
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      user: user ?? null,
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
    if (trimmed) return trimmed;
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

function hasRequiredProfileFields(value) {
  const user = asObject(value);
  if (!user) return false;

  return Boolean(
    user.email &&
      user.nickname &&
      user.firstName &&
      user.lastName &&
      user.gender &&
      user.birthDate &&
      user.registeredAt,
  );
}

function normalizeUser({ email, userHint, tokenPayload, previousUser } = {}) {
  const normalizedHint = asObject(userHint);
  const normalizedPreviousUser = asObject(previousUser);
  const normalizedPayload = asObject(tokenPayload);
  const tokenUser = asObject(normalizedPayload?.user);

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

  return {
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
  };
}

export function AuthProvider({ children }) {
  const [{ token, user }, setAuth] = useState(() => loadStoredAuth());
  const isAuthenticated = Boolean(token || user);
  const needsProfileHydration = Boolean(token && !hasRequiredProfileFields(user));

  useEffect(() => {
    persistAuth({ token, user });
  }, [token, user]);

  useEffect(() => {
    if (!needsProfileHydration || !token) return undefined;

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
  }, [needsProfileHydration, token]);

  const signOut = useCallback(() => {
    const activeToken = token;
    setAuth(EMPTY_AUTH);
    logoutUser({ token: activeToken }).catch(() => {
      // noop: user is already signed out on the client.
    });
  }, [token]);

  const signIn = useCallback(async ({ email, password, userHint } = {}) => {
    const { token: nextToken, user: responseUser } = await loginUser({ email, password });
    const profileUser = nextToken ? await fetchProfile({ token: nextToken }).catch(() => null) : null;
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
