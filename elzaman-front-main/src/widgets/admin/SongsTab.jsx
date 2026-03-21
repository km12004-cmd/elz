import { useCallback, useState } from 'react';
import { createArtist, updateArtist } from '@/entities/artist/api';
import {
  createSongRecord,
  fetchSongDetail,
  fetchSongLyrics,
  updateSongRecord,
} from '@/entities/song/api';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import { normalizeId } from '@/shared/lib/normalizeId';
import HelpGuideModal from './HelpGuideModal';
import { HELP_ARTISTS, HELP_SONGS } from '../../pages/admin/lib/adminHelpContent';
import {
  normalizeString,
  parseOptionalIntegerInput,
} from '../../pages/admin/lib/adminHelpers';
import styles from '../../pages/admin/adminConsolePage.module.css';

function SongsTab({ token, artistsCatalog, songsCatalog, showToast, onUnauthorizedError, onCatalogChange }) {
  const [contentError, setContentError] = useState('');
  const [isLoadingSongDetail, setIsLoadingSongDetail] = useState(false);
  const [helpGuide, setHelpGuide] = useState(null);

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

  const [isSavingArtist, setIsSavingArtist] = useState(false);
  const [isSavingSong, setIsSavingSong] = useState(false);

  const isMutating = isSavingArtist || isSavingSong || isLoadingSongDetail;

  const onArtistFieldChange = (field, value) => {
    setArtistForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSongFieldChange = (field, value) => {
    setSongForm((prev) => ({ ...prev, [field]: value }));
  };

  const fillSongFormFromDetail = useCallback((detail, lyricsPayload) => {
    const fallbackLyricsText =
      typeof lyricsPayload === 'string' ? lyricsPayload : lyricsPayload?.lyricsText ?? '';
    const fallbackLyricsTextRu =
      typeof lyricsPayload === 'object' ? lyricsPayload?.lyricsTextRu ?? '' : '';

    setSongForm((prev) => ({
      ...prev,
      songId: detail?.id ?? prev.songId,
      title: detail?.title ?? '',
      author: detail?.author ?? '',
      releaseYear: Number.isInteger(detail?.releaseYear) ? String(detail.releaseYear) : '',
      durationSeconds: Number.isInteger(detail?.durationSeconds) ? String(detail.durationSeconds) : '',
      originalLanguage: detail?.originalLanguage ?? '',
      youtubeUrl: detail?.youtubeUrl ?? '',
      audioUrl: detail?.audioUrl ?? '',
      lyricsText: detail?.lyricsText ?? fallbackLyricsText ?? '',
      lyricsTextRu: detail?.lyricsTextRu ?? fallbackLyricsTextRu ?? '',
      isPublished: typeof detail?.isPublished === 'boolean' ? detail.isPublished : prev.isPublished,
    }));
  }, []);

  const loadSongIntoForm = useCallback(
    async (songId) => {
      const id = normalizeId(songId);
      if (!id) {
        setContentError('Select a song to load.');
        return;
      }

      setIsLoadingSongDetail(true);
      setContentError('');

      try {
        const [detail, lyricsPayload] = await Promise.all([
          fetchSongDetail({ token, songId: id }),
          fetchSongLyrics({ token, songId: id }).catch(() => null),
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
      await onCatalogChange();
      setArtistForm((prev) => ({ ...prev, artistId: created?.id ?? '' }));
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
      setContentError('Select an artist to update.');
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
      await onCatalogChange();
      showToast('Artist updated.');
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingArtist(false);
    }
  };

  const onCreateSong = async (event) => {
    event.preventDefault();
    const releaseYearInput = parseOptionalIntegerInput(songForm.releaseYear);
    const durationSecondsInput = parseOptionalIntegerInput(songForm.durationSeconds);

    if (!releaseYearInput.valid || (releaseYearInput.value !== null && releaseYearInput.value < 0)) {
      setContentError('Release year must be a valid non-negative integer.');
      return;
    }
    if (!durationSecondsInput.valid || (durationSecondsInput.value !== null && durationSecondsInput.value < 0)) {
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
      setSongForm((prev) => ({ ...prev, songId: created?.id ?? prev.songId }));
      await onCatalogChange();
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
      setContentError('Select a song to update.');
      return;
    }
    if (!releaseYearInput.valid || (releaseYearInput.value !== null && releaseYearInput.value < 0)) {
      setContentError('Release year must be a valid non-negative integer.');
      return;
    }
    if (!durationSecondsInput.valid || (durationSecondsInput.value !== null && durationSecondsInput.value < 0)) {
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
      await onCatalogChange();
      showToast('Song updated.');
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingSong(false);
    }
  };

  return (
    <>
      <div className={styles.contentGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Artists */}
        <article className={styles.contentCard}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.actionTitle}>Artists</h4>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => setHelpGuide(HELP_ARTISTS)}
              title="How to manage artists"
            >
              ?
            </button>
          </div>
          <p className={styles.actionDescription}>Create or update artist profiles.</p>

          {contentError ? <p className={styles.errorText}>{contentError}</p> : null}

          <form className={styles.formRow} onSubmit={onCreateArtist}>
            <label className={styles.fieldLabel} htmlFor="artist-select">
              Select existing artist (for update)
            </label>
            <select
              id="artist-select"
              className={styles.select}
              value={artistForm.artistId}
              onChange={(e) => onArtistFieldChange('artistId', e.target.value)}
              disabled={isMutating}
            >
              <option value="">Not selected</option>
              {artistsCatalog.map((artist, i) => (
                <option key={artist.id ?? `a-${i}`} value={artist.id ?? ''}>
                  {(artist.name ?? 'Unknown') + (artist.id ? ` (#${artist.id})` : '')}
                </option>
              ))}
            </select>

            <input
              type="text"
              className={styles.searchInput}
              placeholder="Artist name"
              value={artistForm.name}
              onChange={(e) => onArtistFieldChange('name', e.target.value)}
              disabled={isMutating}
            />
            <input
              type="url"
              className={styles.searchInput}
              placeholder="Avatar URL (optional)"
              value={artistForm.avatarUrl}
              onChange={(e) => onArtistFieldChange('avatarUrl', e.target.value)}
              disabled={isMutating}
            />
            <textarea
              className={styles.textarea}
              placeholder="Artist bio (optional)"
              value={artistForm.bio}
              onChange={(e) => onArtistFieldChange('bio', e.target.value)}
              disabled={isMutating}
              rows={3}
            />

            <div className={styles.buttonRow}>
              <button type="submit" className={styles.actionButton} disabled={isMutating}>
                {isSavingArtist ? 'Saving...' : 'Create artist'}
              </button>
              <button
                type="button"
                className={styles.mutedButton}
                onClick={onUpdateArtist}
                disabled={isMutating}
              >
                {isSavingArtist ? 'Saving...' : 'Update artist'}
              </button>
            </div>
          </form>
        </article>

        {/* Songs */}
        <article className={styles.contentCard}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.actionTitle}>Songs</h4>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => setHelpGuide(HELP_SONGS)}
              title="How to manage songs"
            >
              ?
            </button>
          </div>
          <p className={styles.actionDescription}>Create or update songs in the catalog.</p>

          <form className={styles.formRow} onSubmit={onCreateSong}>
            <label className={styles.fieldLabel} htmlFor="song-select">Select existing song</label>
            <select
              id="song-select"
              className={styles.select}
              value={songForm.songId}
              onChange={(e) => onSongFieldChange('songId', e.target.value)}
              disabled={isMutating}
            >
              <option value="">Not selected</option>
              {songsCatalog.map((song, i) => (
                <option key={song.id ?? `s-${i}`} value={song.id ?? ''}>
                  {(song.title ?? 'Untitled') + (song.id ? ` (#${song.id})` : '')}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={styles.mutedButton}
              onClick={() => loadSongIntoForm(songForm.songId)}
              disabled={isMutating}
              style={{ marginBottom: 8 }}
            >
              {isLoadingSongDetail ? 'Loading...' : 'Load selected song'}
            </button>

            <input type="text" className={styles.searchInput} placeholder="Song title" value={songForm.title} onChange={(e) => onSongFieldChange('title', e.target.value)} disabled={isMutating} />
            <input type="text" className={styles.searchInput} placeholder="Artist name" value={songForm.author} onChange={(e) => onSongFieldChange('author', e.target.value)} disabled={isMutating} />

            <label className={styles.fieldLabel} htmlFor="song-artist-select">Artist (optional)</label>
            <select
              id="song-artist-select"
              className={styles.select}
              value={songForm.artistId}
              onChange={(e) => onSongFieldChange('artistId', e.target.value)}
              disabled={isMutating}
            >
              <option value="">Auto-create from name</option>
              {artistsCatalog.map((artist, i) => (
                <option key={artist.id ?? `sa-${i}`} value={artist.id ?? ''}>
                  {(artist.name ?? 'Unknown') + (artist.id ? ` (#${artist.id})` : '')}
                </option>
              ))}
            </select>

            <div className={styles.inlineRow}>
              <input type="number" min="0" className={styles.numberInput} placeholder="Release year" value={songForm.releaseYear} onChange={(e) => onSongFieldChange('releaseYear', e.target.value)} disabled={isMutating} />
              <input type="number" min="0" className={styles.numberInput} placeholder="Duration (sec)" value={songForm.durationSeconds} onChange={(e) => onSongFieldChange('durationSeconds', e.target.value)} disabled={isMutating} />
            </div>

            <input type="text" className={styles.searchInput} placeholder="Original language (e.g. kg)" value={songForm.originalLanguage} onChange={(e) => onSongFieldChange('originalLanguage', e.target.value)} disabled={isMutating} />
            <input type="url" className={styles.searchInput} placeholder="YouTube URL (optional)" value={songForm.youtubeUrl} onChange={(e) => onSongFieldChange('youtubeUrl', e.target.value)} disabled={isMutating} />
            <input type="url" className={styles.searchInput} placeholder="Audio URL (optional)" value={songForm.audioUrl} onChange={(e) => onSongFieldChange('audioUrl', e.target.value)} disabled={isMutating} />

            <label className={styles.fieldLabel} htmlFor="song-lyrics-kg">Lyrics (Kyrgyz)</label>
            <textarea id="song-lyrics-kg" className={styles.textarea} placeholder="Kyrgyz lyrics (optional)" value={songForm.lyricsText} onChange={(e) => onSongFieldChange('lyricsText', e.target.value)} disabled={isMutating} rows={6} />

            <label className={styles.fieldLabel} htmlFor="song-lyrics-ru">Lyrics translation (Russian)</label>
            <textarea id="song-lyrics-ru" className={styles.textarea} placeholder="Russian translation (optional)" value={songForm.lyricsTextRu} onChange={(e) => onSongFieldChange('lyricsTextRu', e.target.value)} disabled={isMutating} rows={6} />

            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={songForm.isPublished} onChange={(e) => onSongFieldChange('isPublished', e.target.checked)} disabled={isMutating} />
              Published
            </label>

            <div className={styles.buttonRow}>
              <button type="submit" className={styles.actionButton} disabled={isMutating}>
                {isSavingSong ? 'Saving...' : 'Create song'}
              </button>
              <button type="button" className={styles.mutedButton} onClick={onUpdateSong} disabled={isMutating}>
                {isSavingSong ? 'Saving...' : 'Update song'}
              </button>
            </div>
          </form>
        </article>
      </div>

      <HelpGuideModal isOpen={Boolean(helpGuide)} onClose={() => setHelpGuide(null)} guide={helpGuide} />
    </>
  );
}

export default SongsTab;
