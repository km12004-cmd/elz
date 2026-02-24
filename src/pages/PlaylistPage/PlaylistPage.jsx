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
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import Toast from '../../components/ui/Toast';
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
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [openMenuPlaylistId, setOpenMenuPlaylistId] = useState(null);

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
      setLoadError(extractErrorMessage(error, { context: 'playlists' }));
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

  useEffect(() => {
    if (!openMenuPlaylistId) return undefined;

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) {
        setOpenMenuPlaylistId(null);
        return;
      }

      if (event.target.closest('[data-playlist-menu-root="true"]')) return;
      setOpenMenuPlaylistId(null);
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpenMenuPlaylistId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuPlaylistId]);

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
      setCreateError(extractErrorMessage(error, { context: 'playlists' }));
      return false;
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const openDeleteDialog = (playlist) => {
    if (!normalizeId(playlist?.id)) return;
    setOpenMenuPlaylistId(null);
    setPlaylistToDelete(playlist);
  };

  const confirmDeletePlaylist = async () => {
    const playlistId = normalizeId(playlistToDelete?.id);
    if (!playlistId) {
      setPlaylistToDelete(null);
      return;
    }

    clearMessages();
    setDeletingPlaylistId(playlistId);

    try {
      await deletePlaylist({ token, playlistId });
      await loadPlaylists();
      setActionSuccess('Playlist deleted');
      setPlaylistToDelete(null);
    } catch (error) {
      setActionError(extractErrorMessage(error, { context: 'playlists' }));
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  const playlistToDeleteId = normalizeId(playlistToDelete?.id);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Library</p>
          <h2 className={styles.title}>My Playlists</h2>
          <p className={styles.subtitle}>Open a playlist to manage songs and keep your lessons organized.</p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
          title="Create a new playlist"
        >
          + Create Playlist
        </button>
      </header>

      <div className={styles.statusRow}>
        <span className={styles.badge}>{playlists.length} playlists</span>
      </div>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? (
        <>
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading playlists...</span>
          </div>
          <ul className={styles.playlistGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={`playlist-skeleton-${index}`}>
                <article className={styles.playlistCard}>
                  <Skeleton className={styles.skeletonIcon} />
                  <Skeleton className={styles.skeletonTitle} />
                  <Skeleton className={styles.skeletonDescription} />
                  <Skeleton className={styles.skeletonDescription} />
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!isLoading && playlists.length === 0 ? (
        <EmptyState
          kind="playlist"
          title="No playlists yet"
          description="Create your first playlist to collect songs for focused learning sessions."
          actionLabel="Create playlist"
          onAction={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
        />
      ) : null}

      {!isLoading && playlists.length > 0 ? (
        <ul className={styles.playlistGrid}>
          {playlists.map((playlist, index) => {
            const playlistId = normalizeId(playlist.id);
            const isDeleting = deletingPlaylistId === playlistId;
            const isMenuOpen = Boolean(playlistId) && openMenuPlaylistId === playlistId;

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
                    title="Open playlist"
                  >
                    <div className={styles.playlistTopRow}>
                      <span className={styles.playlistIcon} aria-hidden="true">
                        ♫
                      </span>
                      <span className={styles.playlistArrow} aria-hidden="true">
                        ↗
                      </span>
                    </div>
                    <p className={styles.playlistTitle}>{playlist.title}</p>
                    {playlist.description ? (
                      <p className={styles.playlistDescription}>{playlist.description}</p>
                    ) : (
                      <p className={styles.playlistDescriptionMuted}>No description yet</p>
                    )}
                    <p className={styles.playlistMeta}>{playlist.songsCount ?? 0} songs</p>
                  </button>

                  <div className={styles.playlistMenu} data-playlist-menu-root="true">
                    <button
                      type="button"
                      className={styles.menuTrigger}
                      onClick={() =>
                        setOpenMenuPlaylistId((previous) => (previous === playlistId ? null : playlistId))
                      }
                      disabled={isDeleting || !playlistId}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="menu"
                      title="Playlist actions"
                      aria-label="Open playlist actions"
                    >
                      ⋯
                    </button>

                    {isMenuOpen ? (
                      <div className={styles.menuDropdown} role="menu">
                        <button
                          type="button"
                          className={styles.menuDangerItem}
                          onClick={() => {
                            setOpenMenuPlaylistId(null);
                            openDeleteDialog(playlist);
                          }}
                          disabled={isDeleting}
                          role="menuitem"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

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

      <ConfirmDialog
        isOpen={Boolean(playlistToDelete)}
        title="Delete playlist"
        description={`This will remove "${playlistToDelete?.title ?? 'playlist'}" from your library.`}
        confirmLabel="Delete"
        isProcessing={Boolean(playlistToDeleteId && deletingPlaylistId === playlistToDeleteId)}
        onCancel={() => {
          if (deletingPlaylistId) return;
          setPlaylistToDelete(null);
        }}
        onConfirm={confirmDeletePlaylist}
      />

      <Toast
        type={actionError ? 'error' : 'success'}
        message={actionError || actionSuccess}
        onClose={clearMessages}
      />
    </section>
  );
}

export default PlaylistPage;
