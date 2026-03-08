import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { createArtist, fetchArtists, updateArtist } from '../../api/artists';
import {
  fetchAdminUserById,
  fetchAdminUsers,
  grantAdminUserPremium,
  revokeAdminUserPremium,
  updateAdminUserExperience,
  updateAdminUserRole,
} from '../../api/admin';
import {
  createTrackPairsTemplates,
  createTrackPairsTemplatesForTrack,
} from '../../api/pairsGame';
import {
  createSongRecord,
  createTrackFlashcardTemplates,
  fetchSongDetail,
  fetchSongLyrics,
  fetchSongsCatalog,
  updateSongRecord,
} from '../../api/songs';
import { tokenizeSongLyrics, upsertSongDictionaryBulk } from '../../api/lyrics';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Toast from '../../components/ui/Toast';
import { normalizeRole } from '../../utils/roles';
import styles from './adminConsolePage.module.css';

const LIMIT_OPTIONS = [10, 20, 50, 100];
const ROLE_OPTIONS = ['user', 'admin'];
function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function formatRole(value) {
  const normalized = normalizeRole(value) ?? 'user';
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function buildDisplayName(user) {
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

function formatDateTime(value) {
  if (typeof value !== 'string') return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function parseIntegerInput(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalIntegerInput(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return { valid: true, value: null };

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) return { valid: false, value: null };

  return { valid: true, value: parsed };
}

function parseTemplateRows(value) {
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

function normalizeDictionarySource(value) {
  if (typeof value !== 'string') return '';

  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDictionaryRows(value) {
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

function AdminConsolePage() {
  const { token, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(null);
  const [usersError, setUsersError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailError, setUserDetailError] = useState('');
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);

  const [roleInput, setRoleInput] = useState('user');
  const [premiumDaysInput, setPremiumDaysInput] = useState('30');
  const [experienceInput, setExperienceInput] = useState('');
  const [actionError, setActionError] = useState('');

  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isGrantingPremium, setIsGrantingPremium] = useState(false);
  const [isRevokingPremium, setIsRevokingPremium] = useState(false);
  const [isUpdatingExperience, setIsUpdatingExperience] = useState(false);

  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [artistsCatalog, setArtistsCatalog] = useState([]);
  const [songsCatalog, setSongsCatalog] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingSongDetail, setIsLoadingSongDetail] = useState(false);
  const [contentError, setContentError] = useState('');

  const [artistForm, setArtistForm] = useState({
    artistId: '',
    name: '',
    bio: '',
    avatarUrl: '',
  });
  const [songForm, setSongForm] = useState({
    songId: '',
    title: '',
    author: '',
    artistId: '',
    releaseYear: '',
    durationSeconds: '',
    originalLanguage: '',
    youtubeUrl: '',
    audioUrl: '',
    lyricsText: '',
    lyricsTextRu: '',
    isPublished: true,
  });
  const [flashcardsForm, setFlashcardsForm] = useState({
    trackId: '',
    level: '1',
    rows: '',
  });
  const [pairsSpecificForm, setPairsSpecificForm] = useState({
    trackId: '',
    exerciseIdx: '1',
    rows: '',
  });
  const [pairsGenericForm, setPairsGenericForm] = useState({
    trackId: '',
    exerciseIdx: '',
    rows: '',
  });
  const [lyricsDictionaryForm, setLyricsDictionaryForm] = useState({
    trackId: '',
    rows: '',
  });

  const [isSavingArtist, setIsSavingArtist] = useState(false);
  const [isSavingSong, setIsSavingSong] = useState(false);
  const [isSavingFlashcards, setIsSavingFlashcards] = useState(false);
  const [isSavingPairsSpecific, setIsSavingPairsSpecific] = useState(false);
  const [isSavingPairsGeneric, setIsSavingPairsGeneric] = useState(false);
  const [isSavingLyricsDictionary, setIsSavingLyricsDictionary] = useState(false);
  const [isTokenizingLyrics, setIsTokenizingLyrics] = useState(false);

  const canGoPrev = offset > 0;
  const hasKnownTotal = Number.isInteger(usersTotal) && usersTotal >= 0;
  const canGoNext = hasKnownTotal ? offset + limit < usersTotal : users.length >= limit;
  const currentPage = Math.floor(offset / limit) + 1;
  const selectedRole = normalizeRole(selectedUser?.role) ?? 'user';
  const selectedDisplayName = buildDisplayName(selectedUser);
  const isMutating = isUpdatingRole || isGrantingPremium || isRevokingPremium || isUpdatingExperience;
  const isMutatingContent =
    isSavingArtist ||
    isSavingSong ||
    isSavingFlashcards ||
    isSavingPairsSpecific ||
    isSavingPairsGeneric ||
    isSavingLyricsDictionary ||
    isTokenizingLyrics ||
    isLoadingSongDetail;

  const showToast = useCallback((message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toastMessage]);

  useEffect(() => {
    setActionError('');
  }, [selectedUserId]);

  const handleUnauthorizedError = useCallback(
    (error) => {
      if (error?.status !== 401) return false;
      signOut();
      navigate('/', { replace: true });
      return true;
    },
    [navigate, signOut],
  );

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUsersError('');

    try {
      const data = await fetchAdminUsers({ token, query, limit, offset });
      const items = Array.isArray(data?.items) ? data.items : [];

      setUsers(items);
      setUsersTotal(Number.isInteger(data?.total) ? data.total : null);
      setSelectedUserId((previousUserId) => {
        if (previousUserId && items.some((item) => normalizeId(item.id) === previousUserId)) {
          return previousUserId;
        }

        const firstWithId = items.find((item) => normalizeId(item.id));
        return firstWithId ? normalizeId(firstWithId.id) : null;
      });
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setUsers([]);
      setUsersTotal(null);
      setUsersError(extractErrorMessage(error, { context: 'admin' }));
      setSelectedUserId(null);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [handleUnauthorizedError, limit, offset, query, token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadUserDetail = useCallback(
    async (nextUserId) => {
      const normalizedUserId = normalizeId(nextUserId);
      if (!normalizedUserId) {
        setSelectedUser(null);
        setUserDetailError('');
        setRoleInput('user');
        setExperienceInput('');
        return null;
      }

      setIsLoadingUserDetail(true);
      setUserDetailError('');

      try {
        const detail = await fetchAdminUserById({ token, userId: normalizedUserId });
        setSelectedUser(detail);
        setRoleInput(normalizeRole(detail?.role) ?? 'user');
        setExperienceInput(Number.isInteger(detail?.experience) ? String(detail.experience) : '');
        return detail;
      } catch (error) {
        if (handleUnauthorizedError(error)) return null;
        setSelectedUser(null);
        setUserDetailError(extractErrorMessage(error, { context: 'admin' }));
        return null;
      } finally {
        setIsLoadingUserDetail(false);
      }
    },
    [handleUnauthorizedError, token],
  );

  useEffect(() => {
    loadUserDetail(selectedUserId);
  }, [loadUserDetail, selectedUserId]);

  const loadContentCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);

    try {
      const [artistsData, songsData] = await Promise.all([
        fetchArtists({ token, limit: 100, offset: 0 }),
        fetchSongsCatalog({ token }),
      ]);
      setArtistsCatalog(Array.isArray(artistsData?.items) ? artistsData.items : []);
      setSongsCatalog(Array.isArray(songsData) ? songsData : []);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setArtistsCatalog([]);
      setSongsCatalog([]);
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [handleUnauthorizedError, token]);

  useEffect(() => {
    loadContentCatalog();
  }, [loadContentCatalog]);

  useEffect(() => {
    const currentSongId = normalizeId(songForm.songId);
    if (!currentSongId) return;

    setLyricsDictionaryForm((previous) => {
      if (normalizeId(previous.trackId)) return previous;
      return { ...previous, trackId: currentSongId };
    });
  }, [songForm.songId]);

  const fillSongFormFromDetail = useCallback((detail, lyricsPayload) => {
    const fallbackLyricsText =
      typeof lyricsPayload === 'string' ? lyricsPayload : lyricsPayload?.lyricsText ?? '';
    const fallbackLyricsTextRu =
      typeof lyricsPayload === 'object' ? lyricsPayload?.lyricsTextRu ?? '' : '';

    setSongForm((previous) => ({
      ...previous,
      songId: detail?.id ?? previous.songId,
      title: detail?.title ?? '',
      author: detail?.author ?? '',
      releaseYear: Number.isInteger(detail?.releaseYear) ? String(detail.releaseYear) : '',
      durationSeconds: Number.isInteger(detail?.durationSeconds) ? String(detail.durationSeconds) : '',
      originalLanguage: detail?.originalLanguage ?? '',
      youtubeUrl: detail?.youtubeUrl ?? '',
      audioUrl: detail?.audioUrl ?? '',
      lyricsText: detail?.lyricsText ?? fallbackLyricsText ?? '',
      lyricsTextRu: detail?.lyricsTextRu ?? fallbackLyricsTextRu ?? '',
      isPublished: typeof detail?.isPublished === 'boolean' ? detail.isPublished : previous.isPublished,
    }));
  }, []);

  const loadSongIntoForm = useCallback(
    async (songId) => {
      const normalizedSongId = normalizeId(songId);
      if (!normalizedSongId) {
        setContentError('Song id is required to load song data.');
        return;
      }

      setIsLoadingSongDetail(true);
      setContentError('');

      try {
        const [detail, lyricsPayload] = await Promise.all([
          fetchSongDetail({ token, songId: normalizedSongId }),
          fetchSongLyrics({ token, songId: normalizedSongId }).catch(() => null),
        ]);
        fillSongFormFromDetail(detail, lyricsPayload);
      } catch (error) {
        if (handleUnauthorizedError(error)) return;
        setContentError(extractErrorMessage(error, { context: 'admin' }));
      } finally {
        setIsLoadingSongDetail(false);
      }
    },
    [fillSongFormFromDetail, handleUnauthorizedError, token],
  );

  const onSearchSubmit = (event) => {
    event.preventDefault();
    setOffset(0);
    setQuery(normalizeString(searchInput) ?? '');
  };

  const onClearSearch = () => {
    setSearchInput('');
    setOffset(0);
    setQuery('');
  };

  const onLimitChange = (event) => {
    const parsed = Number.parseInt(event.target.value, 10);
    setLimit(LIMIT_OPTIONS.includes(parsed) ? parsed : 20);
    setOffset(0);
  };

  const onSelectUser = (id) => {
    const normalizedUserId = normalizeId(id);
    if (!normalizedUserId) return;
    setSelectedUserId(normalizedUserId);
  };

  const detailMeta = useMemo(
    () => [
      { label: 'User ID', value: selectedUser?.id ?? 'Not set' },
      { label: 'Role', value: formatRole(selectedUser?.role) },
      { label: 'XP', value: Number.isInteger(selectedUser?.experience) ? String(selectedUser.experience) : 'Not set' },
      { label: 'Level', value: Number.isInteger(selectedUser?.level) ? String(selectedUser.level) : 'Not set' },
      { label: 'Premium', value: selectedUser?.isPremium ? 'Active' : 'Inactive' },
      { label: 'Premium until', value: formatDateTime(selectedUser?.premiumUntil) },
    ],
    [selectedUser],
  );

  const refreshCurrentUser = useCallback(async () => {
    const normalizedUserId = normalizeId(selectedUserId);
    if (!normalizedUserId) return;
    await Promise.all([loadUserDetail(normalizedUserId), loadUsers()]);
  }, [loadUserDetail, loadUsers, selectedUserId]);

  const onSubmitRole = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const normalizedNextRole = normalizeRole(roleInput);
    if (!normalizedUserId) return;
    if (!normalizedNextRole) {
      setActionError('Role is required.');
      return;
    }

    setIsUpdatingRole(true);
    setActionError('');

    try {
      await updateAdminUserRole({
        token,
        userId: normalizedUserId,
        role: normalizedNextRole,
      });
      await refreshCurrentUser();
      showToast(`Role updated to ${normalizedNextRole}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const onSubmitPremiumGrant = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const days = parseIntegerInput(premiumDaysInput);
    if (!normalizedUserId) return;
    if (!Number.isInteger(days) || days < 1) {
      setActionError('Days must be a positive integer.');
      return;
    }

    setIsGrantingPremium(true);
    setActionError('');

    try {
      await grantAdminUserPremium({
        token,
        userId: normalizedUserId,
        days,
      });
      await refreshCurrentUser();
      showToast('Premium access granted.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsGrantingPremium(false);
    }
  };

  const onRevokePremium = async () => {
    const normalizedUserId = normalizeId(selectedUserId);
    if (!normalizedUserId) return;

    setIsRevokingPremium(true);
    setActionError('');

    try {
      await revokeAdminUserPremium({
        token,
        userId: normalizedUserId,
      });
      await refreshCurrentUser();
      showToast('Premium access revoked.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsRevokingPremium(false);
    }
  };

  const onSubmitExperience = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const experience = parseIntegerInput(experienceInput);
    if (!normalizedUserId) return;
    if (!Number.isInteger(experience) || experience < 0) {
      setActionError('Experience must be a non-negative integer.');
      return;
    }

    setIsUpdatingExperience(true);
    setActionError('');

    try {
      await updateAdminUserExperience({
        token,
        userId: normalizedUserId,
        experience,
      });
      await refreshCurrentUser();
      showToast('Experience updated.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsUpdatingExperience(false);
    }
  };

  const onArtistFieldChange = (field, value) => {
    setArtistForm((previous) => ({ ...previous, [field]: value }));
  };

  const onSongFieldChange = (field, value) => {
    setSongForm((previous) => ({ ...previous, [field]: value }));
  };

  const onFlashcardsFieldChange = (field, value) => {
    setFlashcardsForm((previous) => ({ ...previous, [field]: value }));
  };

  const onPairsSpecificFieldChange = (field, value) => {
    setPairsSpecificForm((previous) => ({ ...previous, [field]: value }));
  };

  const onPairsGenericFieldChange = (field, value) => {
    setPairsGenericForm((previous) => ({ ...previous, [field]: value }));
  };

  const onLyricsDictionaryFieldChange = (field, value) => {
    setLyricsDictionaryForm((previous) => ({ ...previous, [field]: value }));
  };

  const onCreateArtist = async (event) => {
    event.preventDefault();

    const name = normalizeString(artistForm.name);
    if (!name) {
      setContentError('Artist name is required.');
      return;
    }

    setIsSavingArtist(true);
    setContentError('');

    try {
      const created = await createArtist({
        token,
        name,
        bio: artistForm.bio,
        avatarUrl: artistForm.avatarUrl,
      });
      await loadContentCatalog();
      setArtistForm((previous) => ({
        ...previous,
        artistId: created?.id ?? '',
      }));
      showToast('Artist created.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingArtist(false);
    }
  };

  const onUpdateArtist = async (event) => {
    event.preventDefault();

    const artistId = normalizeId(artistForm.artistId);
    if (!artistId) {
      setContentError('Artist ID is required for update.');
      return;
    }

    setIsSavingArtist(true);
    setContentError('');

    try {
      await updateArtist({
        token,
        artistId,
        name: artistForm.name,
        bio: artistForm.bio,
        avatarUrl: artistForm.avatarUrl,
      });
      await loadContentCatalog();
      showToast('Artist updated.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingArtist(false);
    }
  };

  const onLoadSong = async (event) => {
    event.preventDefault();
    await loadSongIntoForm(songForm.songId);
  };

  const onCreateSong = async (event) => {
    event.preventDefault();

    const releaseYearInput = parseOptionalIntegerInput(songForm.releaseYear);
    const durationSecondsInput = parseOptionalIntegerInput(songForm.durationSeconds);

    if (!releaseYearInput.valid || (releaseYearInput.value !== null && releaseYearInput.value < 0)) {
      setContentError('Release year must be a valid non-negative integer.');
      return;
    }
    if (
      !durationSecondsInput.valid ||
      (durationSecondsInput.value !== null && durationSecondsInput.value < 0)
    ) {
      setContentError('Duration must be a valid non-negative integer.');
      return;
    }

    setIsSavingSong(true);
    setContentError('');

    try {
      const created = await createSongRecord({
        token,
        payload: {
          title: songForm.title,
          author: songForm.author,
          artistId: songForm.artistId,
          releaseYear: releaseYearInput.value,
          durationSeconds: durationSecondsInput.value,
          originalLanguage: songForm.originalLanguage,
          youtubeUrl: songForm.youtubeUrl,
          audioUrl: songForm.audioUrl,
          lyricsText: songForm.lyricsText,
          lyricsTextRu: songForm.lyricsTextRu,
          isPublished: Boolean(songForm.isPublished),
        },
      });
      setSongForm((previous) => ({
        ...previous,
        songId: created?.id ?? previous.songId,
      }));
      await loadContentCatalog();
      showToast('Song created.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingSong(false);
    }
  };

  const onUpdateSong = async (event) => {
    event.preventDefault();

    const songId = normalizeId(songForm.songId);
    const releaseYearInput = parseOptionalIntegerInput(songForm.releaseYear);
    const durationSecondsInput = parseOptionalIntegerInput(songForm.durationSeconds);

    if (!songId) {
      setContentError('Song ID is required for update.');
      return;
    }
    if (!releaseYearInput.valid || (releaseYearInput.value !== null && releaseYearInput.value < 0)) {
      setContentError('Release year must be a valid non-negative integer.');
      return;
    }
    if (
      !durationSecondsInput.valid ||
      (durationSecondsInput.value !== null && durationSecondsInput.value < 0)
    ) {
      setContentError('Duration must be a valid non-negative integer.');
      return;
    }

    setIsSavingSong(true);
    setContentError('');

    try {
      await updateSongRecord({
        token,
        songId,
        payload: {
          title: songForm.title,
          author: songForm.author,
          artistId: songForm.artistId,
          releaseYear: releaseYearInput.value,
          durationSeconds: durationSecondsInput.value,
          originalLanguage: songForm.originalLanguage,
          youtubeUrl: songForm.youtubeUrl,
          audioUrl: songForm.audioUrl,
          lyricsText: songForm.lyricsText,
          lyricsTextRu: songForm.lyricsTextRu,
          isPublished: Boolean(songForm.isPublished),
        },
      });
      await loadContentCatalog();
      showToast('Song updated.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingSong(false);
    }
  };

  const onCreateFlashcardTemplates = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(flashcardsForm.trackId);
    const level = parseIntegerInput(flashcardsForm.level);
    const items = parseTemplateRows(flashcardsForm.rows);

    if (!trackId) {
      setContentError('Track ID is required for flashcard templates.');
      return;
    }
    if (!Number.isInteger(level) || level < 1) {
      setContentError('Flashcard level must be a positive integer.');
      return;
    }
    if (items.length === 0) {
      setContentError('Add template lines in format "Kyrgyz | Russian".');
      return;
    }

    setIsSavingFlashcards(true);
    setContentError('');

    try {
      const result = await createTrackFlashcardTemplates({
        token,
        trackId,
        level,
        items,
      });
      setFlashcardsForm((previous) => ({ ...previous, rows: '' }));
      showToast(
        `Flashcard templates created: ${result?.createdCount ?? items.length}.`,
      );
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingFlashcards(false);
    }
  };

  const onCreatePairsSpecificTemplates = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(pairsSpecificForm.trackId);
    const exerciseIdx = parseIntegerInput(pairsSpecificForm.exerciseIdx);
    const items = parseTemplateRows(pairsSpecificForm.rows);

    if (!trackId) {
      setContentError('Track ID is required for pairs templates.');
      return;
    }
    if (!Number.isInteger(exerciseIdx) || exerciseIdx < 1) {
      setContentError('Exercise index must be a positive integer.');
      return;
    }
    if (items.length === 0) {
      setContentError('Add template lines in format "Kyrgyz | Russian".');
      return;
    }

    setIsSavingPairsSpecific(true);
    setContentError('');

    try {
      const result = await createTrackPairsTemplates({
        token,
        trackId,
        exerciseIdx,
        items,
      });
      setPairsSpecificForm((previous) => ({ ...previous, rows: '' }));
      showToast(`Pairs templates created: ${result?.createdCount ?? items.length}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingPairsSpecific(false);
    }
  };

  const onCreatePairsGenericTemplates = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(pairsGenericForm.trackId);
    const exerciseRaw = String(pairsGenericForm.exerciseIdx ?? '').trim();
    const exerciseIdx = exerciseRaw ? parseIntegerInput(exerciseRaw) : null;
    const items = parseTemplateRows(pairsGenericForm.rows);

    if (!trackId) {
      setContentError('Track ID is required for pairs templates.');
      return;
    }
    if (exerciseRaw && (!Number.isInteger(exerciseIdx) || exerciseIdx < 1)) {
      setContentError('Exercise index must be a positive integer.');
      return;
    }
    if (items.length === 0) {
      setContentError('Add template lines in format "Kyrgyz | Russian".');
      return;
    }

    setIsSavingPairsGeneric(true);
    setContentError('');

    try {
      const result = await createTrackPairsTemplatesForTrack({
        token,
        trackId,
        exerciseIdx: exerciseRaw ? exerciseIdx : undefined,
        items,
      });
      setPairsGenericForm((previous) => ({ ...previous, rows: '' }));
      showToast(`Pairs templates created: ${result?.createdCount ?? items.length}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingPairsGeneric(false);
    }
  };

  const onUpsertLyricsDictionary = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(lyricsDictionaryForm.trackId);
    const items = parseDictionaryRows(lyricsDictionaryForm.rows);

    if (!trackId) {
      setContentError('Track ID is required for dictionary entries.');
      return;
    }
    if (items.length === 0) {
      setContentError('Add lines in format "Жанымда — рядом со мной".');
      return;
    }

    setIsSavingLyricsDictionary(true);
    setContentError('');

    try {
      const result = await upsertSongDictionaryBulk({
        token,
        songId: trackId,
        items,
        srcLang: 'kg',
        dstLang: 'ru',
      });
      setLyricsDictionaryForm((previous) => ({ ...previous, rows: '' }));
      showToast(`Dictionary rows saved: ${result?.upsertedCount ?? items.length}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingLyricsDictionary(false);
    }
  };

  const onTokenizeLyrics = async () => {
    const trackId = normalizeId(lyricsDictionaryForm.trackId) ?? normalizeId(songForm.songId);
    if (!trackId) {
      setContentError('Track ID is required to tokenize lyrics.');
      return;
    }

    setIsTokenizingLyrics(true);
    setContentError('');

    try {
      const result = await tokenizeSongLyrics({
        token,
        songId: trackId,
      });

      setLyricsDictionaryForm((previous) => ({
        ...previous,
        trackId: trackId ?? previous.trackId,
      }));

      const linesPart =
        typeof result?.linesCount === 'number' ? `${result.linesCount} lines` : 'lyrics lines';
      const tokensPart =
        typeof result?.tokensCount === 'number' ? `${result.tokensCount} tokens` : 'tokens';
      showToast(`Tokenization complete: ${linesPart}, ${tokensPart}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsTokenizingLyrics(false);
    }
  };

  if (!isAuthenticated || normalizeRole(user?.role) !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.heroBadge}>Admin area</p>
          <h2 className={styles.heroTitle}>Admin console</h2>
          <p className={styles.heroSubtitle}>
            Manage users, roles, premium subscriptions, and experience values.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/profile')}>
            Back to profile
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Users</h3>
            <p className={styles.panelSubtitle}>Search by email, nickname, or ID.</p>
          </div>

          <form className={styles.searchForm} onSubmit={onSearchSubmit}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search users..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit" className={styles.actionButton}>
              Search
            </button>
            <button type="button" className={styles.mutedButton} onClick={onClearSearch}>
              Reset
            </button>
          </form>

          <div className={styles.filtersRow}>
            <label className={styles.limitLabel}>
              Limit
              <select className={styles.select} value={limit} onChange={onLimitChange}>
                {LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.counterText}>
              {hasKnownTotal ? `${usersTotal} total` : `${users.length} loaded`}
            </p>
          </div>

          {usersError ? <p className={styles.errorText}>{usersError}</p> : null}

          {isLoadingUsers ? (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading users...</span>
            </div>
          ) : null}

          {!isLoadingUsers && users.length === 0 ? (
            <p className={styles.emptyState}>No users found for current filters.</p>
          ) : null}

          {!isLoadingUsers && users.length > 0 ? (
            <ul className={styles.userList}>
              {users.map((item, index) => {
                const itemId = normalizeId(item.id);
                const isSelected = Boolean(itemId && itemId === selectedUserId);
                const role = normalizeRole(item.role) ?? 'user';

                return (
                  <li key={itemId ?? `admin-user-${index}`}>
                    <button
                      type="button"
                      className={`${styles.userRow} ${isSelected ? styles.userRowActive : ''}`}
                      onClick={() => onSelectUser(itemId)}
                      disabled={!itemId}
                    >
                      <div className={styles.userRowMain}>
                        <p className={styles.userRowName}>{buildDisplayName(item)}</p>
                        <p className={styles.userRowEmail}>{item.email ?? 'No email'}</p>
                      </div>
                      <div className={styles.userRowMeta}>
                        <span
                          className={`${styles.roleBadge} ${
                            role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser
                          }`}
                        >
                          {formatRole(role)}
                        </span>
                        <span className={styles.userRowId}>#{item.id ?? 'n/a'}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className={styles.paginationRow}>
            <button
              type="button"
              className={styles.mutedButton}
              disabled={!canGoPrev || isLoadingUsers}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            >
              Previous
            </button>
            <span className={styles.pageText}>Page {currentPage}</span>
            <button
              type="button"
              className={styles.mutedButton}
              disabled={!canGoNext || isLoadingUsers}
              onClick={() => setOffset((prev) => prev + limit)}
            >
              Next
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>User controls</h3>
            <p className={styles.panelSubtitle}>Apply role, premium, and XP changes.</p>
          </div>

          {!selectedUserId && !isLoadingUserDetail ? (
            <p className={styles.emptyState}>Select a user from the left panel to continue.</p>
          ) : null}

          {isLoadingUserDetail ? (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading user details...</span>
            </div>
          ) : null}

          {userDetailError ? <p className={styles.errorText}>{userDetailError}</p> : null}

          {selectedUser && !isLoadingUserDetail ? (
            <div className={styles.detailContent}>
              <div className={styles.userSummary}>
                <div>
                  <h4 className={styles.userSummaryTitle}>{selectedDisplayName}</h4>
                  <p className={styles.userSummaryEmail}>{selectedUser.email ?? 'No email'}</p>
                </div>
                <div className={styles.userSummaryTags}>
                  <span
                    className={`${styles.roleBadge} ${
                      selectedRole === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser
                    }`}
                  >
                    {formatRole(selectedRole)}
                  </span>
                  <span className={styles.statusBadge}>
                    Premium: {selectedUser.isPremium ? 'On' : 'Off'}
                  </span>
                </div>
              </div>

              <div className={styles.metaGrid}>
                {detailMeta.map((meta) => (
                  <article key={meta.label} className={styles.metaCard}>
                    <p className={styles.metaLabel}>{meta.label}</p>
                    <p className={styles.metaValue}>{meta.value}</p>
                  </article>
                ))}
              </div>

              {actionError ? <p className={styles.errorText}>{actionError}</p> : null}

              <div className={styles.actionsGrid}>
                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Assign role</h5>
                  <p className={styles.actionDescription}>Set role for the selected user.</p>
                  <form className={styles.formRow} onSubmit={onSubmitRole}>
                    <select
                      className={styles.select}
                      value={roleInput}
                      onChange={(event) => setRoleInput(event.target.value)}
                      disabled={isMutating}
                    >
                      {ROLE_OPTIONS.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {formatRole(roleOption)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isUpdatingRole ? 'Saving...' : 'Save role'}
                    </button>
                  </form>
                </article>

                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Premium access</h5>
                  <p className={styles.actionDescription}>Grant or revoke premium subscription.</p>
                  <form className={styles.formRow} onSubmit={onSubmitPremiumGrant}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={styles.numberInput}
                      value={premiumDaysInput}
                      onChange={(event) => setPremiumDaysInput(event.target.value)}
                      placeholder="Days"
                      disabled={isMutating}
                    />
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isGrantingPremium ? 'Granting...' : 'Grant premium'}
                    </button>
                  </form>
                  <button
                    type="button"
                    className={`${styles.mutedButton} ${styles.dangerButton}`}
                    onClick={onRevokePremium}
                    disabled={isMutating}
                  >
                    {isRevokingPremium ? 'Revoking...' : 'Revoke premium'}
                  </button>
                </article>

                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Experience override</h5>
                  <p className={styles.actionDescription}>
                    Set a specific XP value and let backend recalculate level.
                  </p>
                  <form className={styles.formRow} onSubmit={onSubmitExperience}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={styles.numberInput}
                      value={experienceInput}
                      onChange={(event) => setExperienceInput(event.target.value)}
                      placeholder="Experience"
                      disabled={isMutating}
                    />
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isUpdatingExperience ? 'Updating...' : 'Update XP'}
                    </button>
                  </form>
                </article>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className={`${styles.panel} ${styles.contentPanel}`}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Content management</h3>
          <p className={styles.panelSubtitle}>
            Add artists, create/update songs with levels, and upload track templates.
          </p>
        </div>

        {isLoadingCatalog ? (
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading artists and songs...</span>
          </div>
        ) : null}

        {contentError ? <p className={styles.errorText}>{contentError}</p> : null}

        <div className={styles.contentGrid}>
          <article className={styles.contentCard}>
            <h4 className={styles.actionTitle}>Artists</h4>
            <p className={styles.actionDescription}>
              Create a new artist or update an existing one.
            </p>
            <form className={styles.formRow} onSubmit={onCreateArtist}>
              <label className={styles.fieldLabel} htmlFor="artist-id">
                Existing artist (for update)
              </label>
              <select
                id="artist-id"
                className={styles.select}
                value={artistForm.artistId}
                onChange={(event) => onArtistFieldChange('artistId', event.target.value)}
                disabled={isMutatingContent}
              >
                <option value="">Not selected</option>
                {artistsCatalog.map((artist, index) => (
                  <option key={artist.id ?? `artist-${index}`} value={artist.id ?? ''}>
                    {(artist.name ?? 'Unknown artist') + (artist.id ? ` (#${artist.id})` : '')}
                  </option>
                ))}
              </select>

              <input
                type="text"
                className={styles.searchInput}
                placeholder="Artist name"
                value={artistForm.name}
                onChange={(event) => onArtistFieldChange('name', event.target.value)}
                disabled={isMutatingContent}
              />
              <input
                type="url"
                className={styles.searchInput}
                placeholder="Avatar URL (optional)"
                value={artistForm.avatarUrl}
                onChange={(event) => onArtistFieldChange('avatarUrl', event.target.value)}
                disabled={isMutatingContent}
              />
              <textarea
                className={styles.textarea}
                placeholder="Artist bio (optional)"
                value={artistForm.bio}
                onChange={(event) => onArtistFieldChange('bio', event.target.value)}
                disabled={isMutatingContent}
                rows={4}
              />

              <div className={styles.buttonRow}>
                <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                  {isSavingArtist ? 'Saving...' : 'Create artist'}
                </button>
                <button
                  type="button"
                  className={styles.mutedButton}
                  onClick={onUpdateArtist}
                  disabled={isMutatingContent}
                >
                  {isSavingArtist ? 'Saving...' : 'Update artist'}
                </button>
              </div>
            </form>
          </article>

          <article className={styles.contentCard}>
            <h4 className={styles.actionTitle}>Songs and levels</h4>
            <p className={styles.actionDescription}>
              Create or update songs and assign level 1-3.
            </p>

            <form className={styles.formRow} onSubmit={onCreateSong}>
              <label className={styles.fieldLabel} htmlFor="song-select">
                Existing song
              </label>
              <select
                id="song-select"
                className={styles.select}
                value={songForm.songId}
                onChange={(event) => onSongFieldChange('songId', event.target.value)}
                disabled={isMutatingContent}
              >
                <option value="">Not selected</option>
                {songsCatalog.map((song, index) => (
                  <option key={song.id ?? `song-${index}`} value={song.id ?? ''}>
                    {(song.title ?? 'Untitled song') + (song.id ? ` (#${song.id})` : '')}
                  </option>
                ))}
              </select>

              <div className={styles.inlineRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Song ID (for update)"
                  value={songForm.songId}
                  onChange={(event) => onSongFieldChange('songId', event.target.value)}
                  disabled={isMutatingContent}
                />
                <button
                  type="button"
                  className={styles.mutedButton}
                  onClick={onLoadSong}
                  disabled={isMutatingContent}
                >
                  {isLoadingSongDetail ? 'Loading...' : 'Load song'}
                </button>
              </div>

              <input
                type="text"
                className={styles.searchInput}
                placeholder="Song title"
                value={songForm.title}
                onChange={(event) => onSongFieldChange('title', event.target.value)}
                disabled={isMutatingContent}
              />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Artist name (author)"
                value={songForm.author}
                onChange={(event) => onSongFieldChange('author', event.target.value)}
                disabled={isMutatingContent}
              />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Artist ID (optional)"
                value={songForm.artistId}
                onChange={(event) => onSongFieldChange('artistId', event.target.value)}
                disabled={isMutatingContent}
              />

              <div className={styles.inlineRow}>
                <input
                  type="number"
                  min="0"
                  className={styles.numberInput}
                  placeholder="Release year"
                  value={songForm.releaseYear}
                  onChange={(event) => onSongFieldChange('releaseYear', event.target.value)}
                  disabled={isMutatingContent}
                />
                <input
                  type="number"
                  min="0"
                  className={styles.numberInput}
                  placeholder="Duration (sec)"
                  value={songForm.durationSeconds}
                  onChange={(event) => onSongFieldChange('durationSeconds', event.target.value)}
                  disabled={isMutatingContent}
                />
              </div>

              <input
                type="text"
                className={styles.searchInput}
                placeholder="Original language (e.g. kg)"
                value={songForm.originalLanguage}
                onChange={(event) => onSongFieldChange('originalLanguage', event.target.value)}
                disabled={isMutatingContent}
              />
              <input
                type="url"
                className={styles.searchInput}
                placeholder="YouTube URL (optional)"
                value={songForm.youtubeUrl}
                onChange={(event) => onSongFieldChange('youtubeUrl', event.target.value)}
                disabled={isMutatingContent}
              />
              <input
                type="url"
                className={styles.searchInput}
                placeholder="Audio URL (optional)"
                value={songForm.audioUrl}
                onChange={(event) => onSongFieldChange('audioUrl', event.target.value)}
                disabled={isMutatingContent}
              />

              <label className={styles.fieldLabel} htmlFor="song-lyrics-kg">
                Lyrics (Kyrgyz)
              </label>
              <textarea
                id="song-lyrics-kg"
                className={styles.textarea}
                placeholder="Kyrgyz lyrics (optional)"
                value={songForm.lyricsText}
                onChange={(event) => onSongFieldChange('lyricsText', event.target.value)}
                disabled={isMutatingContent}
                rows={6}
              />

              <label className={styles.fieldLabel} htmlFor="song-lyrics-ru">
                Lyrics translation (Russian)
              </label>
              <textarea
                id="song-lyrics-ru"
                className={styles.textarea}
                placeholder="Russian translation (optional)"
                value={songForm.lyricsTextRu}
                onChange={(event) => onSongFieldChange('lyricsTextRu', event.target.value)}
                disabled={isMutatingContent}
                rows={6}
              />

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={songForm.isPublished}
                  onChange={(event) => onSongFieldChange('isPublished', event.target.checked)}
                  disabled={isMutatingContent}
                />
                Published
              </label>

              <div className={styles.buttonRow}>
                <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                  {isSavingSong ? 'Saving...' : 'Create song'}
                </button>
                <button
                  type="button"
                  className={styles.mutedButton}
                  onClick={onUpdateSong}
                  disabled={isMutatingContent}
                >
                  {isSavingSong ? 'Saving...' : 'Update song'}
                </button>
              </div>
            </form>
          </article>

          <article className={styles.contentCard}>
            <h4 className={styles.actionTitle}>Track templates</h4>
            <p className={styles.actionDescription}>
              Format lines as: <code>кыргызча | русский</code>.
            </p>

            <form className={styles.formRow} onSubmit={onCreateFlashcardTemplates}>
              <h5 className={styles.subsectionTitle}>Flashcard templates</h5>
              <div className={styles.inlineRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Track ID"
                  value={flashcardsForm.trackId}
                  onChange={(event) => onFlashcardsFieldChange('trackId', event.target.value)}
                  disabled={isMutatingContent}
                />
                <input
                  type="number"
                  min="1"
                  className={styles.numberInput}
                  placeholder="Level"
                  value={flashcardsForm.level}
                  onChange={(event) => onFlashcardsFieldChange('level', event.target.value)}
                  disabled={isMutatingContent}
                />
              </div>
              <textarea
                className={styles.textarea}
                placeholder={'салам | привет\nырахмат | спасибо'}
                value={flashcardsForm.rows}
                onChange={(event) => onFlashcardsFieldChange('rows', event.target.value)}
                disabled={isMutatingContent}
                rows={5}
              />
              <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                {isSavingFlashcards ? 'Saving...' : 'POST /tracks/{id}/flashcard-templates'}
              </button>
            </form>

            <form className={styles.formRow} onSubmit={onCreatePairsSpecificTemplates}>
              <h5 className={styles.subsectionTitle}>Pairs templates by exercise</h5>
              <div className={styles.inlineRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Track ID"
                  value={pairsSpecificForm.trackId}
                  onChange={(event) => onPairsSpecificFieldChange('trackId', event.target.value)}
                  disabled={isMutatingContent}
                />
                <input
                  type="number"
                  min="1"
                  className={styles.numberInput}
                  placeholder="Exercise idx"
                  value={pairsSpecificForm.exerciseIdx}
                  onChange={(event) => onPairsSpecificFieldChange('exerciseIdx', event.target.value)}
                  disabled={isMutatingContent}
                />
              </div>
              <textarea
                className={styles.textarea}
                placeholder={'салам | привет\nырахмат | спасибо'}
                value={pairsSpecificForm.rows}
                onChange={(event) => onPairsSpecificFieldChange('rows', event.target.value)}
                disabled={isMutatingContent}
                rows={5}
              />
              <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                {isSavingPairsSpecific
                  ? 'Saving...'
                  : 'POST /tracks/{id}/games/pairs/{idx}/templates'}
              </button>
            </form>

            <form className={styles.formRow} onSubmit={onCreatePairsGenericTemplates}>
              <h5 className={styles.subsectionTitle}>Pairs templates (generic endpoint)</h5>
              <div className={styles.inlineRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Track ID"
                  value={pairsGenericForm.trackId}
                  onChange={(event) => onPairsGenericFieldChange('trackId', event.target.value)}
                  disabled={isMutatingContent}
                />
                <input
                  type="number"
                  min="1"
                  className={styles.numberInput}
                  placeholder="Exercise idx (optional)"
                  value={pairsGenericForm.exerciseIdx}
                  onChange={(event) => onPairsGenericFieldChange('exerciseIdx', event.target.value)}
                  disabled={isMutatingContent}
                />
              </div>
              <textarea
                className={styles.textarea}
                placeholder={'салам | привет\nырахмат | спасибо'}
                value={pairsGenericForm.rows}
                onChange={(event) => onPairsGenericFieldChange('rows', event.target.value)}
                disabled={isMutatingContent}
                rows={5}
              />
              <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                {isSavingPairsGeneric ? 'Saving...' : 'POST /tracks/{id}/games/pairs/templates'}
              </button>
            </form>

            <form className={styles.formRow} onSubmit={onUpsertLyricsDictionary}>
              <h5 className={styles.subsectionTitle}>Lyrics dictionary (RU)</h5>
              <p className={styles.actionDescription}>
                Use lines like <code>Жанымда — рядом со мной</code>.
              </p>
              <p className={styles.actionDescription}>
                Flow: save Kyrgyz lyrics, run tokenize, then upload dictionary rows.
              </p>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Track ID"
                value={lyricsDictionaryForm.trackId}
                onChange={(event) => onLyricsDictionaryFieldChange('trackId', event.target.value)}
                disabled={isMutatingContent}
              />
              <textarea
                className={styles.textarea}
                placeholder={'Жанымда — рядом со мной\nКелечек — будущее'}
                value={lyricsDictionaryForm.rows}
                onChange={(event) => onLyricsDictionaryFieldChange('rows', event.target.value)}
                disabled={isMutatingContent}
                rows={5}
              />
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.mutedButton}
                  onClick={onTokenizeLyrics}
                  disabled={isMutatingContent}>
                  {isTokenizingLyrics ? 'Tokenizing...' : 'POST /lyrics/songs/{id}/tokenize'}
                </button>
                <button type="submit" className={styles.actionButton} disabled={isMutatingContent}>
                  {isSavingLyricsDictionary
                    ? 'Saving...'
                    : 'POST /lyrics/songs/{id}/dictionary/bulk'}
                </button>
              </div>
            </form>
          </article>
        </div>
      </section>

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  );
}

export default AdminConsolePage;
