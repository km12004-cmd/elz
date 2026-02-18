import {
  DEFAULT_FILTERS,
  FILTER_QUERY_PARAM_KEYS,
  IELTS_OPTIONS,
  LEVEL_ALIASES,
  TOEFL_OPTIONS,
} from '../constants/filters.js';
import {
  DEFAULT_ITEMS_PER_PAGE,
  DEFAULT_PAGE_NUMBER,
} from '../constants/pagination.js';

const VALID_IELTS_VALUES = new Set(
  IELTS_OPTIONS.map((option) => option.value).filter(Boolean),
);

const VALID_TOEFL_VALUES = new Set(
  TOEFL_OPTIONS.map((option) => option.value).filter(Boolean),
);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLevel(level) {
  const normalized = normalizeString(level).toLowerCase();
  if (!normalized) return '';

  return LEVEL_ALIASES[normalized] ?? '';
}

function normalizeIelts(value) {
  const normalized = normalizeString(value).replace(',', '.');
  if (!normalized) return '';

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return '';

  const canonical = parsed.toFixed(1);
  return VALID_IELTS_VALUES.has(canonical) ? canonical : '';
}

function normalizeToefl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return '';

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) return '';

  const canonical = String(parsed);
  return VALID_TOEFL_VALUES.has(canonical) ? canonical : '';
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return fallback;
  }

  return numeric;
}

/**
 * @param {import('../types/filters.js').FiltersState | null | undefined} filters
 * @returns {import('../types/filters.js').NormalizedFilters}
 */
export function normalizeFilters(filters) {
  const source =
    filters && typeof filters === 'object' ? filters : DEFAULT_FILTERS;

  const normalized = {
    [FILTER_QUERY_PARAM_KEYS.QUERY]: normalizeString(
      source[FILTER_QUERY_PARAM_KEYS.QUERY] ?? source.search,
    ),
    [FILTER_QUERY_PARAM_KEYS.COUNTRY]: normalizeString(
      source[FILTER_QUERY_PARAM_KEYS.COUNTRY],
    ),
    [FILTER_QUERY_PARAM_KEYS.CITY]: normalizeString(
      source[FILTER_QUERY_PARAM_KEYS.CITY],
    ),
    [FILTER_QUERY_PARAM_KEYS.LEVEL]: normalizeLevel(
      source[FILTER_QUERY_PARAM_KEYS.LEVEL],
    ),
    [FILTER_QUERY_PARAM_KEYS.IELTS]: normalizeIelts(
      source[FILTER_QUERY_PARAM_KEYS.IELTS],
    ),
    [FILTER_QUERY_PARAM_KEYS.TOEFL]: normalizeToefl(
      source[FILTER_QUERY_PARAM_KEYS.TOEFL],
    ),
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== ''),
  );
}

/**
 * @param {import('../types/filters.js').FiltersState | null | undefined} filters
 * @param {number | string} [page]
 * @param {number | string} [limit]
 */
export function buildQueryParams(
  filters,
  page = DEFAULT_PAGE_NUMBER,
  limit = DEFAULT_ITEMS_PER_PAGE,
) {
  const normalizedFilters = normalizeFilters(filters);
  const queryParams = new URLSearchParams();

  Object.entries(normalizedFilters).forEach(([key, value]) => {
    if (value !== '') {
      queryParams.set(key, value);
    }
  });

  queryParams.set(
    FILTER_QUERY_PARAM_KEYS.PAGE,
    String(normalizePositiveInteger(page, DEFAULT_PAGE_NUMBER)),
  );
  queryParams.set(
    FILTER_QUERY_PARAM_KEYS.LIMIT,
    String(normalizePositiveInteger(limit, DEFAULT_ITEMS_PER_PAGE)),
  );

  return queryParams.toString();
}
