import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSongLevels, getDifficultyMeta } from '../../api/songs';
import { fetchArtists } from '../../api/artists';
import { fetchPlaylists, fetchPlaylistDetail, createPlaylist, deletePlaylist } from '../../api/playlists';
import { fetchFlashcardFolders, createFlashcardFolder, deleteFlashcardFolder } from '../../api/flashcards';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Toast from '../../components/ui/Toast';
import CreatePlaylistModal from '../PlaylistPage/CreatePlaylistModal';
import CreateFolderModal from '../CardsPage/CreateFolderModal';
import styles from './dashboardPage.module.css';

const FALLBACK_LEVELS = [1, 2, 3].map((difficultyLevel) => ({
  difficultyLevel,
  songsCount: 0,
  ...(getDifficultyMeta(difficultyLevel) ?? {}),
}));

function getArtistInitials(name) {
  if (typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function countCards(folder) {
  if (typeof folder?.cardsCount === 'number') return folder.cardsCount;
  if (Array.isArray(folder?.cards)) return folder.cards.length;
  return 0;
}

const FOLDER_NAME_MAX_LENGTH = 60;
const PLAYLIST_TITLE_MAX_LENGTH = 60;
const PLAYLIST_DESCRIPTION_MAX_LENGTH = 200;

function DashboardPage() {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Levels state
  const [levels, setLevels] = useState(FALLBACK_LEVELS);
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [levelsError, setLevelsError] = useState('');

  // Artists state
  const [artists, setArtists] = useState([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [artistsError, setArtistsError] = useState('');
  const [failedAvatarByKey, setFailedAvatarByKey] = useState({});

  // Playlists state
  const [playlists, setPlaylists] = useState([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [playlistsError, setPlaylistsError] = useState('');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [createPlaylistError, setCreatePlaylistError] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [deletingPlaylistId, setDeletingPlaylistId] = useState(null);

  // Folders state
  const [folders, setFolders] = useState([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState('');
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolderId, setDeletingFolderId] = useState(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  };

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Load levels
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingLevels(true);
      setLevelsError('');
      try {
        const items = await fetchSongLevels({ token });
        if (!cancelled) setLevels(items.length > 0 ? items : FALLBACK_LEVELS);
      } catch (error) {
        if (!cancelled) {
          setLevels(FALLBACK_LEVELS);
          setLevelsError(extractErrorMessage(error, { context: 'home' }));
        }
      } finally {
        if (!cancelled) setIsLoadingLevels(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  // Load artists
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingArtists(true);
      setArtistsError('');
      try {
        const data = await fetchArtists({ token, limit: 20 });
        if (!cancelled) setArtists(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) {
          setArtists([]);
          setArtistsError(extractErrorMessage(error, { context: 'home' }));
        }
      } finally {
        if (!cancelled) setIsLoadingArtists(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => { setFailedAvatarByKey({}); }, [artists]);

  // Load playlists
  const loadPlaylists = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingPlaylists(true);
    setPlaylistsError('');
    try {
      const baseItems = await fetchPlaylists({ token });
      const withCounts = await Promise.all(
        baseItems.map(async (playlist) => {
          const playlistId = normalizeId(playlist.id);
          if (!playlistId || typeof playlist.songsCount === 'number') return playlist;
          try {
            const detail = await fetchPlaylistDetail({ token, playlistId });
            return { ...playlist, songsCount: detail.songs.length };
          } catch {
            return { ...playlist, songsCount: 0 };
          }
        }),
      );
      setPlaylists(withCounts);
    } catch (error) {
      setPlaylists([]);
      setPlaylistsError(extractErrorMessage(error, { context: 'playlists' }));
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => { loadPlaylists(); }, [loadPlaylists]);

  // Load folders
  const loadFolders = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingFolders(true);
    setFoldersError('');
    try {
      const items = await fetchFlashcardFolders({ token });
      setFolders(items);
    } catch (error) {
      setFolders([]);
      setFoldersError(extractErrorMessage(error, { context: 'cards' }));
    } finally {
      setIsLoadingFolders(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // Normalize levels
  const normalizedLevels = useMemo(
    () =>
      levels.map((level, index) => {
        const parsed = Number.parseInt(String(level?.difficultyLevel ?? '').trim(), 10);
        const difficultyLevel = parsed === 1 || parsed === 2 || parsed === 3 ? parsed : index + 1;
        const fallbackMeta = getDifficultyMeta(difficultyLevel) ?? {};
        return {
          difficultyLevel,
          title: level?.title ?? fallbackMeta.title ?? 'Level',
          description: level?.description ?? fallbackMeta.description ?? '',
          songsCount: typeof level?.songsCount === 'number' && Number.isFinite(level.songsCount) ? level.songsCount : 0,
        };
      }),
    [levels],
  );

  // Playlist actions
  const handleCreatePlaylist = async ({ title, description }) => {
    const normalizedTitle = normalizeText(title);
    const normalizedDescription = normalizeText(description);
    if (!normalizedTitle) { setCreatePlaylistError('Playlist title is required'); return false; }
    if (normalizedTitle.length > PLAYLIST_TITLE_MAX_LENGTH) { setCreatePlaylistError(`Title must be ${PLAYLIST_TITLE_MAX_LENGTH} characters or less`); return false; }
    if (normalizedDescription.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) { setCreatePlaylistError(`Description must be ${PLAYLIST_DESCRIPTION_MAX_LENGTH} characters or less`); return false; }
    const isDuplicate = playlists.some((p) => normalizeText(p.title).toLowerCase() === normalizedTitle.toLowerCase());
    if (isDuplicate) { setCreatePlaylistError('A playlist with this title already exists'); return false; }

    setIsCreatingPlaylist(true);
    setCreatePlaylistError('');
    try {
      await createPlaylist({ token, title: normalizedTitle, description: normalizedDescription });
      await loadPlaylists();
      showToast('Playlist created');
      setIsCreatePlaylistOpen(false);
      return true;
    } catch (error) {
      setCreatePlaylistError(extractErrorMessage(error, { context: 'playlists' }));
      return false;
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const confirmDeletePlaylist = async () => {
    const playlistId = normalizeId(playlistToDelete?.id);
    if (!playlistId) { setPlaylistToDelete(null); return; }
    setDeletingPlaylistId(playlistId);
    try {
      await deletePlaylist({ token, playlistId });
      await loadPlaylists();
      showToast('Playlist deleted');
      setPlaylistToDelete(null);
    } catch (error) {
      showToast(extractErrorMessage(error, { context: 'playlists' }), 'error');
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  // Folder actions
  const handleCreateFolder = async (rawName) => {
    const name = normalizeText(rawName);
    if (!name) { setCreateFolderError('Folder name is required'); return false; }
    if (name.length > FOLDER_NAME_MAX_LENGTH) { setCreateFolderError(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`); return false; }
    const isDuplicate = folders.some((f) => normalizeText(f.name).toLowerCase() === name.toLowerCase());
    if (isDuplicate) { setCreateFolderError('A folder with this name already exists'); return false; }

    setIsCreatingFolder(true);
    setCreateFolderError('');
    try {
      const created = await createFlashcardFolder({ token, name });
      setFolders((prev) => [created, ...prev]);
      showToast('Folder created');
      setIsCreateFolderOpen(false);
      return true;
    } catch (error) {
      setCreateFolderError(extractErrorMessage(error, { context: 'cards' }));
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const confirmDeleteFolder = async () => {
    const folderId = normalizeId(folderToDelete?.id);
    if (!folderId) { setFolderToDelete(null); return; }
    setDeletingFolderId(folderId);
    try {
      await deleteFlashcardFolder({ token, folderId });
      setFolders((prev) => prev.filter((f) => normalizeId(f.id) !== folderId));
      showToast('Folder deleted');
      setFolderToDelete(null);
    } catch (error) {
      showToast(extractErrorMessage(error, { context: 'cards' }), 'error');
    } finally {
      setDeletingFolderId(null);
    }
  };

  const LEVEL_COLORS = ['#f5e6ff', '#e8f5e9', '#fff3e0'];

  return (
    <div className={styles.dashboard}>
      {/* Song Levels */}
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Choose your level</h2>
          <p className={styles.blockSubtitle}>Open the song library for a specific difficulty.</p>
        </div>
        {isLoadingLevels && <p className={styles.loadingText}>Loading levels...</p>}
        {levelsError && <p className={styles.errorText}>{levelsError}</p>}
        <div className={styles.levelsGrid}>
          {normalizedLevels.map((level, i) => (
            <button
              key={level.difficultyLevel}
              type="button"
              className={styles.levelCard}
              style={{ background: LEVEL_COLORS[i % LEVEL_COLORS.length] }}
              onClick={() => navigate(`/songs/levels/${encodeURIComponent(String(level.difficultyLevel))}`)}
            >
              <span className={styles.levelBadge}>Level {level.difficultyLevel}</span>
              <span className={styles.levelName}>{level.title}</span>
              <span className={styles.levelDescription}>{level.description}</span>
              <span className={styles.levelMeta}>{level.songsCount} songs</span>
            </button>
          ))}
        </div>
      </section>

      {/* Artists */}
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Artists who collaborate with us</h2>
        </div>
        {isLoadingArtists && <p className={styles.loadingText}>Loading artists...</p>}
        {artistsError && <p className={styles.errorText}>{artistsError}</p>}
        {!isLoadingArtists && !artistsError && artists.length === 0 && (
          <p className={styles.emptyText}>Artists will appear here soon.</p>
        )}
        {artists.length > 0 && (
          <div className={styles.artistsRow} role="list" aria-label="Artists">
            {artists.map((artist, index) => {
              const key = artist.id ?? `${artist.name ?? 'artist'}-${index}`;
              const showImg = Boolean(artist.avatarUrl) && !failedAvatarByKey[key];
              return (
                <div key={key} className={styles.artistCard} role="listitem">
                  <div className={styles.artistAvatar}>
                    {showImg ? (
                      <img
                        src={artist.avatarUrl}
                        alt={artist.name ?? 'Artist avatar'}
                        className={styles.artistAvatarImage}
                        loading="lazy"
                        onError={() => setFailedAvatarByKey((prev) => ({ ...prev, [key]: true }))}
                      />
                    ) : (
                      <span className={styles.artistAvatarFallback} aria-hidden="true">
                        {getArtistInitials(artist.name)}
                      </span>
                    )}
                  </div>
                  <p className={styles.artistName}>{artist.name ?? 'Unknown artist'}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Playlists */}
      {isAuthenticated && (
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <div>
              <h2 className={styles.blockTitle}>My Playlists</h2>
              <p className={styles.blockSubtitle}>Organize songs for focused learning sessions.</p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { setCreatePlaylistError(''); setIsCreatePlaylistOpen(true); }}
            >
              + Create Playlist
            </button>
          </div>
          {playlistsError && <p className={styles.errorText}>{playlistsError}</p>}
          {isLoadingPlaylists && (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading playlists...</span>
            </div>
          )}
          {!isLoadingPlaylists && playlists.length === 0 && (
            <EmptyState
              kind="playlist"
              title="No playlists yet"
              description="Create your first playlist to collect songs."
              actionLabel="Create playlist"
              onAction={() => { setCreatePlaylistError(''); setIsCreatePlaylistOpen(true); }}
            />
          )}
          {!isLoadingPlaylists && playlists.length > 0 && (
            <div className={styles.itemGrid}>
              {playlists.map((playlist, index) => {
                const id = normalizeId(playlist.id);
                return (
                  <article key={id ?? `pl-${index}`} className={styles.itemCard}>
                    <button
                      type="button"
                      className={styles.itemMainButton}
                      onClick={() => id && navigate(`/playlists/${id}`)}
                      disabled={!id}
                    >
                      <span className={styles.itemIcon}>&#9835;</span>
                      <p className={styles.itemTitle}>{playlist.title}</p>
                      <p className={styles.itemMeta}>{playlist.songsCount ?? 0} songs</p>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => setPlaylistToDelete(playlist)}
                      title="Delete playlist"
                    >
                      &times;
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Flashcard Folders */}
      {isAuthenticated && (
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <div>
              <h2 className={styles.blockTitle}>My Flashcards</h2>
              <p className={styles.blockSubtitle}>Build compact decks and review vocabulary.</p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { setCreateFolderError(''); setIsCreateFolderOpen(true); }}
            >
              + Create Folder
            </button>
          </div>
          {foldersError && <p className={styles.errorText}>{foldersError}</p>}
          {isLoadingFolders && (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading folders...</span>
            </div>
          )}
          {!isLoadingFolders && folders.length === 0 && (
            <EmptyState
              kind="folder"
              title="No folders created"
              description="Create your first folder to organize cards."
              actionLabel="Create folder"
              onAction={() => { setCreateFolderError(''); setIsCreateFolderOpen(true); }}
            />
          )}
          {!isLoadingFolders && folders.length > 0 && (
            <div className={styles.itemGrid}>
              {folders.map((folder, index) => {
                const id = normalizeId(folder.id);
                return (
                  <article key={id ?? `fl-${index}`} className={styles.itemCard}>
                    <button
                      type="button"
                      className={styles.itemMainButton}
                      onClick={() => id && navigate(`/cards/${id}`)}
                      disabled={!id}
                    >
                      <span className={styles.itemIcon}>&#128193;</span>
                      <p className={styles.itemTitle}>{folder.name}</p>
                      <p className={styles.itemMeta}>{countCards(folder)} cards</p>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => setFolderToDelete(folder)}
                      title="Delete folder"
                    >
                      &times;
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Modals */}
      {isCreatePlaylistOpen && (
        <CreatePlaylistModal
          isSubmitting={isCreatingPlaylist}
          errorMessage={createPlaylistError}
          titleMaxLength={PLAYLIST_TITLE_MAX_LENGTH}
          descriptionMaxLength={PLAYLIST_DESCRIPTION_MAX_LENGTH}
          onClose={() => { if (!isCreatingPlaylist) { setIsCreatePlaylistOpen(false); setCreatePlaylistError(''); } }}
          onCreate={handleCreatePlaylist}
        />
      )}

      {isCreateFolderOpen && (
        <CreateFolderModal
          isSubmitting={isCreatingFolder}
          errorMessage={createFolderError}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          onClose={() => { if (!isCreatingFolder) { setIsCreateFolderOpen(false); setCreateFolderError(''); } }}
          onCreate={handleCreateFolder}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(playlistToDelete)}
        title="Delete playlist"
        description={`This will remove "${playlistToDelete?.title ?? 'playlist'}" from your library.`}
        confirmLabel="Delete"
        isProcessing={Boolean(deletingPlaylistId)}
        onCancel={() => { if (!deletingPlaylistId) setPlaylistToDelete(null); }}
        onConfirm={confirmDeletePlaylist}
      />

      <ConfirmDialog
        isOpen={Boolean(folderToDelete)}
        title="Delete folder"
        description={`This will remove "${folderToDelete?.name ?? 'folder'}" and all cards inside it.`}
        confirmLabel="Delete"
        isProcessing={Boolean(deletingFolderId)}
        onCancel={() => { if (!deletingFolderId) setFolderToDelete(null); }}
        onConfirm={confirmDeleteFolder}
      />

      <Toast
        type={toastType}
        message={toastMessage}
        onClose={() => setToastMessage('')}
      />
    </div>
  );
}

export default DashboardPage;
