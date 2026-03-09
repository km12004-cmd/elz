import { useCallback, useEffect, useState } from 'react';
import { createArtist, fetchArtists, updateArtist } from '@/entities/artist/api';
import {
  createTrackPairsTemplates,
  createTrackPairsTemplatesForTrack,
} from '@/entities/pairs-game/api';
import {
  createSongRecord,
  createTrackFlashcardTemplates,
  fetchSongDetail,
  fetchSongLyrics,
  fetchSongsCatalog,
  updateSongRecord,
} from '@/entities/song/api';
import { tokenizeSongLyrics, upsertSongDictionaryBulk } from '@/entities/lyrics/api';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import { normalizeId } from '@/shared/lib/normalizeId';
import {
  normalizeString,
  parseOptionalIntegerInput,
  parseIntegerInput,
  parseTemplateRows,
  parseDictionaryRows,
} from '../../pages/admin/lib/adminHelpers';
import styles from '../../pages/admin/adminConsolePage.module.css';

function ContentManagementPanel({ token, showToast, onUnauthorizedError }) {
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

  const isMutatingContent =
    isSavingArtist ||
    isSavingSong ||
    isSavingFlashcards ||
    isSavingPairsSpecific ||
    isSavingPairsGeneric ||
    isSavingLyricsDictionary ||
    isTokenizingLyrics ||
    isLoadingSongDetail;

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
      if (onUnauthorizedError(error)) return;
      setArtistsCatalog([]);
      setSongsCatalog([]);
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [onUnauthorizedError, token]);

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
        if (onUnauthorizedError(error)) return;
        setContentError(extractErrorMessage(error, { context: 'admin' }));
      } finally {
        setIsLoadingSongDetail(false);
      }
    },
    [fillSongFormFromDetail, onUnauthorizedError, token],
  );

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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
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
      setContentError('Add lines in format "\u0416\u0430\u043d\u044b\u043c\u0434\u0430 \u2014 \u0440\u044f\u0434\u043e\u043c \u0441\u043e \u043c\u043d\u043e\u0439".');
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
      if (onUnauthorizedError(error)) return;
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
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsTokenizingLyrics(false);
    }
  };

  return (
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
  );
}

export default ContentManagementPanel;
