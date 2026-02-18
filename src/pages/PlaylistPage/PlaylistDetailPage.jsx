import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addSongToPlaylist,
  fetchPlaylistDetail,
  removeSongFromPlaylist,
} from '../../api/playlists';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import styles from './PlaylistDetailPage.module.css';

const EMPTY_ITEMS = [];

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function PlaylistDetailPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { playlistId } = useParams();

  const [playlistDetail, setPlaylistDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [manualSongId, setManualSongId] = useState('');

  const [addingSongId, setAddingSongId] = useState(null);
  const [removingSongId, setRemovingSongId] = useState(null);

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const normalizedPlaylistId = normalizeId(playlistId);

  const loadPlaylist = useCallback(async () => {
    if (!normalizedPlaylistId) {
      setPlaylistDetail(null);
      setLoadError('Invalid playlist id');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const detail = await fetchPlaylistDetail({
        token,
        playlistId: normalizedPlaylistId,
      });
      setPlaylistDetail(detail);
    } catch (error) {
      setPlaylistDetail(null);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedPlaylistId, token]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  useEffect(() => {
    if (!actionError && !actionSuccess) return undefined;

    const timer = setTimeout(() => {
      setActionError('');
      setActionSuccess('');
    }, 3200);

    return () => clearTimeout(timer);
  }, [actionError, actionSuccess]);

  const clearMessages = () => {
    setActionError('');
    setActionSuccess('');
  };

  const songs = Array.isArray(playlistDetail?.songs) ? playlistDetail.songs : EMPTY_ITEMS;
  const availableSongs = Array.isArray(playlistDetail?.availableSongs)
    ? playlistDetail.availableSongs
    : EMPTY_ITEMS;

  const songsInPlaylist = useMemo(
    () => new Set(songs.map((song) => normalizeId(song.id)).filter(Boolean)),
    [songs],
  );

  const filteredAvailableSongs = useMemo(() => {
    const normalizedQuery = normalizeText(songSearchQuery).toLowerCase();
    if (!normalizedQuery) return availableSongs;

    return availableSongs.filter((song) =>
      normalizeText(song?.title).toLowerCase().includes(normalizedQuery),
    );
  }, [availableSongs, songSearchQuery]);

  const addSong = async (songId) => {
    const normalizedSongId = parsePositiveInteger(songId);

    if (!normalizedPlaylistId || !normalizedSongId) {
      setActionError('Song id must be a positive integer');
      return;
    }

    clearMessages();
    setAddingSongId(String(normalizedSongId));

    try {
      await addSongToPlaylist({
        token,
        playlistId: normalizedPlaylistId,
        songId: normalizedSongId,
      });

      await loadPlaylist();
      setActionSuccess('Song added to playlist');
      setManualSongId('');
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setAddingSongId(null);
    }
  };

  const removeSong = async (songId) => {
    const normalizedSongId = parsePositiveInteger(songId);
    if (!normalizedPlaylistId || !normalizedSongId) return;

    clearMessages();
    setRemovingSongId(String(normalizedSongId));

    try {
      await removeSongFromPlaylist({
        token,
        playlistId: normalizedPlaylistId,
        songId: normalizedSongId,
      });

      await loadPlaylist();
      setActionSuccess('Song removed from playlist');
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setRemovingSongId(null);
    }
  };

  const handleManualAdd = async (event) => {
    event.preventDefault();
    await addSong(manualSongId);
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/playlists')}>
            Back
          </button>
          <button type="button" className={styles.ghostButton} onClick={loadPlaylist} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <p className={styles.eyebrow}>Playlist</p>
        <h2 className={styles.title}>{playlistDetail?.playlist?.title ?? 'Playlist'}</h2>
        {playlistDetail?.playlist?.description ? (
          <p className={styles.subtitle}>{playlistDetail.playlist.description}</p>
        ) : null}
      </header>

      {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
      {actionSuccess ? <p className={styles.successText}>{actionSuccess}</p> : null}
      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? <p className={styles.mutedText}>Loading playlist...</p> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Songs in playlist</h3>
        {!isLoading && songs.length === 0 ? (
          <p className={styles.mutedText}>This playlist has no songs yet</p>
        ) : null}

        <ul className={styles.songList}>
          {songs.map((song, index) => {
            const songId = normalizeId(song.id);

            return (
              <li key={songId ?? `song-${index}`} className={styles.songItem}>
                <div className={styles.songMain}>
                  <p className={styles.songTitle}>{song.title}</p>
                  <p className={styles.songMeta}>
                    {songId ? `Song id: ${songId}` : 'No song id'}
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => removeSong(songId)}
                  disabled={!songId || removingSongId === songId}
                >
                  {removingSongId === songId ? 'Removing...' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Add songs</h3>

        <form className={styles.addByIdForm} onSubmit={handleManualAdd}>
          <label className={styles.fieldLabel} htmlFor="add-song-by-id-input">
            Add by song id
          </label>
          <div className={styles.addByIdRow}>
            <input
              id="add-song-by-id-input"
              className={styles.input}
              value={manualSongId}
              onChange={(event) => setManualSongId(event.target.value)}
              placeholder="e.g. 42"
              inputMode="numeric"
              disabled={Boolean(addingSongId)}
            />
            <button type="submit" className={styles.primaryButton} disabled={Boolean(addingSongId)}>
              {addingSongId ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>

        <div className={styles.searchRow}>
          <label className={styles.fieldLabel} htmlFor="playlist-available-search">
            Search unlocked songs
          </label>
          <input
            id="playlist-available-search"
            className={styles.input}
            type="text"
            value={songSearchQuery}
            onChange={(event) => setSongSearchQuery(event.target.value)}
            placeholder="Search by title"
          />
        </div>

        {!isLoading && availableSongs.length === 0 ? (
          <p className={styles.mutedText}>No unlocked songs available</p>
        ) : null}

        {!isLoading && availableSongs.length > 0 && filteredAvailableSongs.length === 0 ? (
          <p className={styles.mutedText}>No songs match your search</p>
        ) : null}

        <ul className={styles.songList}>
          {filteredAvailableSongs.map((song, index) => {
            const songId = normalizeId(song.id);
            const isAdded = Boolean(songId && songsInPlaylist.has(songId));
            const isAdding = Boolean(songId && addingSongId === songId);

            return (
              <li key={songId ?? `available-song-${index}`} className={styles.songItem}>
                <div className={styles.songMain}>
                  <p className={styles.songTitle}>{song.title}</p>
                  <p className={styles.songMeta}>{songId ? `Song id: ${songId}` : 'No song id'}</p>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => addSong(songId)}
                  disabled={!songId || isAdded || isAdding}
                >
                  {isAdded ? 'Added' : isAdding ? 'Adding...' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

export default PlaylistDetailPage;
