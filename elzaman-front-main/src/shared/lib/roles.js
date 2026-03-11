function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) return false;
  }

  return null;
}

export function normalizeRole(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function isAdminUser(user) {
  if (!user || typeof user !== 'object') return false;

  const role = normalizeRole(user.role ?? user.user_role);
  if (role === 'admin') return true;

  const flags = [
    user.isAdmin,
    user.is_admin,
    user.admin,
  ];

  for (const value of flags) {
    if (normalizeBoolean(value) === true) return true;
  }

  return false;
}
