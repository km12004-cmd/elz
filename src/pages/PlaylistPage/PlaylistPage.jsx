import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylistDetail,
  fetchPlaylists,
} from '../../api/playlists';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import CreatePlaylistModal from './CreatePlaylistModal';
import styles from './PlaylistPage.module.css';

const PLAYLIST_TITLE_MAX_LENGTH = 60;
const PLAYLIST_DESCRIPTION_MAX_LENGTH = 200;

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

function PlaylistPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [playlists, setPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [createError, setCreateError] = useState('');

  const [deletingPlaylistId, setDeletingPlaylistId] = useState(null);

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadPlaylists = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const baseItems = await fetchPlaylists({ token });

      const withCounts = await Promise.all(
        baseItems.map(async (playlist) => {
          const playlistId = normalizeId(playlist.id);
          if (!playlistId) return playlist;

          if (typeof playlist.songsCount === 'number') return playlist;

          try {
            const detail = await fetchPlaylistDetail({ token, playlistId });
            return {
              ...playlist,
              songsCount: detail.songs.length,
            };
          } catch {
            return {
              ...playlist,
              songsCount: 0,
            };
          }
        }),
      );

      setPlaylists(withCounts);
    } catch (error) {
      setPlaylists([]);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

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

  const handleCreatePlaylist = async ({ title, description }) => {
    const normalizedTitle = normalizeText(title);
    const normalizedDescription = normalizeText(description);

    if (!normalizedTitle) {
      setCreateError('Playlist title is required');
      return false;
    }

    if (normalizedTitle.length > PLAYLIST_TITLE_MAX_LENGTH) {
      setCreateError(`Title must be ${PLAYLIST_TITLE_MAX_LENGTH} characters or less`);
      return false;
    }

    if (normalizedDescription.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
      setCreateError(`Description must be ${PLAYLIST_DESCRIPTION_MAX_LENGTH} characters or less`);
      return false;
    }

    const isDuplicate = playlists.some(
      (playlist) => normalizeText(playlist.title).toLowerCase() === normalizedTitle.toLowerCase(),
    );

    if (isDuplicate) {
      setCreateError('A playlist with this title already exists');
      return false;
    }

    setIsCreatingPlaylist(true);
    setCreateError('');
    clearMessages();

    try {
      await createPlaylist({
        token,
        title: normalizedTitle,
        description: normalizedDescription,
      });

      await loadPlaylists();
      setActionSuccess('Playlist created');
      setIsCreateModalOpen(false);
      return true;
    } catch (error) {
      setCreateError(extractErrorMessage(error));
      return false;
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const handleDeletePlaylist = async (playlist) => {
    const playlistId = normalizeId(playlist?.id);
    if (!playlistId) return;

    const confirmed = window.confirm(`Delete playlist "${playlist.title}"?`);
    if (!confirmed) return;

    clearMessages();
    setDeletingPlaylistId(playlistId);

    try {
      await deletePlaylist({ token, playlistId });
      await loadPlaylists();
      setActionSuccess('Playlist deleted');
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Library</p>
          <h2 className={styles.title}>My Playlists</h2>
          <p className={styles.subtitle}>Open a playlist to view songs and add new tracks.</p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
        >
          Create Playlist
        </button>
      </header>

      {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
      {actionSuccess ? <p className={styles.successText}>{actionSuccess}</p> : null}
      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? <p className={styles.mutedText}>Loading playlists...</p> : null}
      {!isLoading && playlists.length === 0 ? (
        <p className={styles.mutedText}>No playlists yet</p>
      ) : null}

      <ul className={styles.playlistGrid}>
        {playlists.map((playlist, index) => {
          const playlistId = normalizeId(playlist.id);
          const isDeleting = deletingPlaylistId === playlistId;

          return (
            <li key={playlistId ?? `playlist-${index}`}>
              <article className={styles.playlistCard}>
                <button
                  type="button"
                  className={styles.playlistMainButton}
                  onClick={() => {
                    if (!playlistId) return;
                    navigate(`/playlists/${playlistId}`);
                  }}
                  disabled={!playlistId}
                >
                  <p className={styles.playlistTitle}>{playlist.title}</p>
                  {playlist.description ? (
                    <p className={styles.playlistDescription}>{playlist.description}</p>
                  ) : null}
                  <p className={styles.playlistMeta}>{playlist.songsCount ?? 0} songs</p>
                </button>

                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => handleDeletePlaylist(playlist)}
                  disabled={isDeleting || !playlistId}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </article>
            </li>
          );
        })}
      </ul>

      {isCreateModalOpen ? (
        <CreatePlaylistModal
          isSubmitting={isCreatingPlaylist}
          errorMessage={createError}
          titleMaxLength={PLAYLIST_TITLE_MAX_LENGTH}
          descriptionMaxLength={PLAYLIST_DESCRIPTION_MAX_LENGTH}
          onClose={() => {
            if (isCreatingPlaylist) return;
            setIsCreateModalOpen(false);
            setCreateError('');
          }}
          onCreate={handleCreatePlaylist}
        />
      ) : null}
    </section>
  );
}

export default PlaylistPage;
