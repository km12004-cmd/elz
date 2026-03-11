import { normalizeRole } from '@/shared/lib/roles';

export function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function formatRole(value) {
  const normalized = normalizeRole(value) ?? 'user';
  return normalized[0].toUpperCase() + normalized.slice(1);
}

export function buildDisplayName(user) {
  const firstName = normalizeString(user?.firstName);
  const lastName = normalizeString(user?.lastName);
  const nickname = normalizeString(user?.nickname);
  const email = normalizeString(user?.email);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  if (fullName) return fullName;
  if (nickname) return nickname;
  if (email) return email;
  return 'Unnamed user';
}

export function formatDateTime(value, locale = 'en-US') {
  if (typeof value !== 'string') return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function parseIntegerInput(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseOptionalIntegerInput(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return { valid: true, value: null };

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) return { valid: false, value: null };

  return { valid: true, value: parsed };
}

export function parseTemplateRows(value) {
  const lines = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];

  lines.forEach((line) => {
    const delimiter =
      line.includes('|') ? '|' : line.includes(';') ? ';' : line.includes('\t') ? '\t' : null;
    if (!delimiter) return;

    const delimiterIndex = line.indexOf(delimiter);
    if (delimiterIndex < 1) return;

    const kgText = line.slice(0, delimiterIndex).trim();
    const ruText = line.slice(delimiterIndex + 1).trim();
    if (!kgText || !ruText) return;

    items.push({
      kgText,
      ruText,
      order: items.length + 1,
    });
  });

  return items;
}

export function normalizeDictionarySource(value) {
  if (typeof value !== 'string') return '';

  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDictionaryRows(value) {
  const lines = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];

  lines.forEach((line) => {
    const separatorMatch = line.match(/\s*(?:—|–|-)\s*/u);
    if (!separatorMatch || typeof separatorMatch.index !== 'number') return;

    const separatorStart = separatorMatch.index;
    const separatorLength = separatorMatch[0].length;

    const sourceText = line.slice(0, separatorStart).trim();
    const translation = line.slice(separatorStart + separatorLength).trim();
    const normalized = normalizeDictionarySource(sourceText);

    if (!sourceText || !translation || !normalized) return;

    items.push({
      sourceText,
      normalized,
      translation,
    });
  });

  return items;
}
