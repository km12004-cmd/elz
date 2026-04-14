import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchArtists } from '@/entities/artist/api';
import { fetchSongsCatalog } from '@/entities/song/api';
import {
  fetchPlaylists,
  fetchPlaylistDetail,
  createPlaylist,
  deletePlaylist,
} from '@/entities/playlist/api';
import {
  fetchFlashcardFolders,
  createFlashcardFolder,
  deleteFlashcardFolder,
} from '@/entities/flashcard/api';
import { fetchAchievements } from '@/entities/achievements/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import EmptyState from '@/shared/ui/EmptyState';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import Toast from '@/shared/ui/Toast';
import XpWidget from '@/widgets/layout/Header/XpWidget';
import AuthModal from '@/features/auth/ui/AuthModal';
import SignInForm from '@/features/auth/ui/SignInForm';
import SignUpForm from '@/features/auth/ui/SignUpForm';
import GuestScreen from '@/widgets/dashboard/GuestScreen';
import CreatePlaylistModal from './CreatePlaylistModal';
import CreateFolderModal from './CreateFolderModal';
import { normalizeId } from '@/shared/lib/normalizeId';
import { getPremiumLockedSongIds } from '@/shared/lib/premiumSongs';
import {
  getArtistInitials,
  normalizeText,
  countCards,
  normalizeStreak,
  formatStreakDays,
  hasPremiumAccess,
} from './lib/dashboardHelpers';
import styles from './dashboardPage.module.css';

const FOLDER_NAME_MAX_LENGTH = 60;
const PLAYLIST_TITLE_MAX_LENGTH = 60;
const PLAYLIST_DESCRIPTION_MAX_LENGTH = 200;

function DashboardPage() {
  const { token, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  // Songs state
  const [songs, setSongs] = useState([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);
  const [songsError, setSongsError] = useState('');

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

  // Achievements state
  const [achievements, setAchievements] = useState([]);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [authView, setAuthView] = useState(null);

  const currentStreak = normalizeStreak(user?.streakCurrent ?? user?.streak_current);
  const streakLabel = formatStreakDays(currentStreak);
  const isPremiumUser = hasPremiumAccess(user?.isPremium ?? user?.is_premium);
  const premiumButtonLabel = isPremiumUser ? 'Premium on' : 'Buy Premium';
  const premiumButtonTitle = isPremiumUser ? 'Premium is active' : 'Go to premium plans';
  const lockedSongIds = useMemo(() => getPremiumLockedSongIds(songs), [songs]);
  const closeAuth = () => setAuthView(null);

  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  };

  const handleUnauthorizedError = useCallback(
    (error) => {
      if (error?.status !== 401) return false;
      setAuthView('signIn');
      signOut();
      return true;
    },
    [signOut],
  );

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Load songs
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isAuthenticated) {
        setSongs([]);
        setSongsError('');
        setIsLoadingSongs(false);
        return;
      }
      setIsLoadingSongs(true);
      setSongsError('');
      try {
        const data = await fetchSongsCatalog({ token });
        if (!cancelled) setSongs(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) {
          setSongs([]);
          setSongsError(extractErrorMessage(error, { context: 'songs' }));
        }
      } finally {
        if (!cancelled) setIsLoadingSongs(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  // Load artists
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isAuthenticated) {
        setArtists([]);
        setArtistsError('');
        setIsLoadingArtists(false);
        return;
      }
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
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  useEffect(() => {
    setFailedAvatarByKey({});
  }, [artists]);

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
      if (handleUnauthorizedError(error)) return;
      setPlaylists([]);
      setPlaylistsError(extractErrorMessage(error, { context: 'playlists' }));
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [token, isAuthenticated, handleUnauthorizedError]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  // Load folders
  const loadFolders = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingFolders(true);
    setFoldersError('');
    try {
      const items = await fetchFlashcardFolders({ token });
      setFolders(items);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setFolders([]);
      setFoldersError(extractErrorMessage(error, { context: 'cards' }));
    } finally {
      setIsLoadingFolders(false);
    }
  }, [token, isAuthenticated, handleUnauthorizedError]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Load achievements
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setAchievements([]);
      return undefined;
    }
    fetchAchievements({ token })
      .then((items) => { if (!cancelled) setAchievements(items); })
      .catch(() => { if (!cancelled) setAchievements([]); });
    return () => { cancelled = true; };
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) return;
    setPlaylists([]);
    setPlaylistsError('');
    setFolders([]);
    setFoldersError('');
  }, [isAuthenticated]);

  // Playlist actions
  const handleCreatePlaylist = async ({ title, description }) => {
    const normalizedTitle = normalizeText(title);
    const normalizedDescription = normalizeText(description);
    if (!normalizedTitle) {
      setCreatePlaylistError('Playlist title is required');
      return false;
    }
    if (normalizedTitle.length > PLAYLIST_TITLE_MAX_LENGTH) {
      setCreatePlaylistError(`Title must be ${PLAYLIST_TITLE_MAX_LENGTH} characters or less`);
      return false;
    }
    if (normalizedDescription.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
      setCreatePlaylistError(
        `Description must be ${PLAYLIST_DESCRIPTION_MAX_LENGTH} characters or less`,
      );
      return false;
    }
    const isDuplicate = playlists.some(
      (p) => normalizeText(p.title).toLowerCase() === normalizedTitle.toLowerCase(),
    );
    if (isDuplicate) {
      setCreatePlaylistError('A playlist with this title already exists');
      return false;
    }

    setIsCreatingPlaylist(true);
    setCreatePlaylistError('');
    try {
      await createPlaylist({ token, title: normalizedTitle, description: normalizedDescription });
      await loadPlaylists();
      showToast('Playlist created');
      setIsCreatePlaylistOpen(false);
      return true;
    } catch (error) {
      if (handleUnauthorizedError(error)) return false;
      setCreatePlaylistError(extractErrorMessage(error, { context: 'playlists' }));
      return false;
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const confirmDeletePlaylist = async () => {
    const playlistId = normalizeId(playlistToDelete?.id);
    if (!playlistId) {
      setPlaylistToDelete(null);
      return;
    }
    setDeletingPlaylistId(playlistId);
    try {
      await deletePlaylist({ token, playlistId });
      await loadPlaylists();
      showToast('Playlist deleted');
      setPlaylistToDelete(null);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      showToast(extractErrorMessage(error, { context: 'playlists' }), 'error');
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  // Folder actions
  const handleCreateFolder = async (rawName) => {
    const name = normalizeText(rawName);
    if (!name) {
      setCreateFolderError('Folder name is required');
      return false;
    }
    if (name.length > FOLDER_NAME_MAX_LENGTH) {
      setCreateFolderError(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`);
      return false;
    }
    const isDuplicate = folders.some(
      (f) => normalizeText(f.name).toLowerCase() === name.toLowerCase(),
    );
    if (isDuplicate) {
      setCreateFolderError('A folder with this name already exists');
      return false;
    }

    setIsCreatingFolder(true);
    setCreateFolderError('');
    try {
      const created = await createFlashcardFolder({ token, name });
      setFolders((prev) => [created, ...prev]);
      showToast('Folder created');
      setIsCreateFolderOpen(false);
      return true;
    } catch (error) {
      if (handleUnauthorizedError(error)) return false;
      setCreateFolderError(extractErrorMessage(error, { context: 'cards' }));
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const confirmDeleteFolder = async () => {
    const folderId = normalizeId(folderToDelete?.id);
    if (!folderId) {
      setFolderToDelete(null);
      return;
    }
    setDeletingFolderId(folderId);
    try {
      await deleteFlashcardFolder({ token, folderId });
      setFolders((prev) => prev.filter((f) => normalizeId(f.id) !== folderId));
      showToast('Folder deleted');
      setFolderToDelete(null);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      showToast(extractErrorMessage(error, { context: 'cards' }), 'error');
    } finally {
      setDeletingFolderId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <GuestScreen
        authView={authView}
        setAuthView={setAuthView}
        toastType={toastType}
        toastMessage={toastMessage}
        setToastMessage={setToastMessage}
      />
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Songs */}
      <section className={`${styles.block} ${styles.songsSection}`}>
        <div className={styles.blockHeader}>
          <div>
            <h2 className={styles.blockTitle}>Songs</h2>
            {!isPremiumUser ? (
              <p className={styles.blockSubtitle}>The latest 4 songs are available with Premium.</p>
            ) : null}
          </div>
        </div>
        {isLoadingSongs && (
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading songs...</span>
          </div>
        )}
        {songsError && <p className={styles.errorText}>{songsError}</p>}
        {!isLoadingSongs && !songsError && songs.length === 0 && (
          <p className={styles.emptyText}>Songs will appear here soon.</p>
        )}
        {!isLoadingSongs && songs.length > 0 && (
          <div className={`${styles.itemGrid} ${styles.songsGrid}`}>
            {songs.map((song, index) => {
              const id = normalizeId(song.id);
              const isSongLocked = Boolean(id) && !isPremiumUser && lockedSongIds.has(id);
              return (
                <article
                  key={id ?? `song-${index}`}
                  className={`${styles.itemCard} ${isSongLocked ? styles.songCardLocked : ''}`}>
                  <button
                    type="button"
                    className={styles.itemMainButton}
                    onClick={() => {
                      if (!id) return;
                      if (isSongLocked) {
                        navigate('/premium');
                        return;
                      }
                      navigate(`/songs/${id}`);
                    }}
                    disabled={!id}
                    title={isSongLocked ? 'Premium subscription is required to study this song.' : undefined}>
                    <p className={styles.itemTitle}>{song.title}</p>
                    {song.author && <p className={styles.itemMeta}>{song.author}</p>}
                    {isSongLocked ? (
                      <span className={styles.songPremiumBadge}>Available with Premium</span>
                    ) : null}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Playlists */}
      <section className={`${styles.block} ${styles.playlistsSection}`}>
        <div className={styles.blockHeader}>
          <div>
            <h2 className={styles.blockTitle}>My Playlists</h2>
            <p className={styles.blockSubtitle}>Organize songs for focused learning sessions.</p>
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setCreatePlaylistError('');
                setIsCreatePlaylistOpen(true);
              }}>
              + Create Playlist
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setAuthView('signIn')}>
              Sign in to create
            </button>
          )}
        </div>
        {!isAuthenticated ? (
          <EmptyState
            kind="playlist"
            title="Sign in to create playlists"
            description="Save favorite songs and build your learning sessions."
            actionLabel="Sign in"
            onAction={() => setAuthView('signIn')}
          />
        ) : (
          <>
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
                onAction={() => {
                  setCreatePlaylistError('');
                  setIsCreatePlaylistOpen(true);
                }}
              />
            )}
            {!isLoadingPlaylists && playlists.length > 0 && (
              <div className={`${styles.itemGrid} ${styles.collectionGrid}`}>
                {playlists.map((playlist, index) => {
                  const id = normalizeId(playlist.id);
                  return (
                    <article key={id ?? `pl-${index}`} className={styles.itemCard}>
                      <button
                        type="button"
                        className={styles.itemMainButton}
                        onClick={() => id && navigate(`/playlists/${id}`)}
                        disabled={!id}>
                        <span className={styles.itemIcon}>&#9835;</span>
                        <p className={styles.itemTitle}>{playlist.title}</p>
                        <p className={styles.itemMeta}>{playlist.songsCount ?? 0} songs</p>
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => setPlaylistToDelete(playlist)}
                        title="Delete playlist">
                        &times;
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Profile & Progress */}
      <section className={`${styles.block} ${styles.profileSection}`}>
        <div className={styles.blockHeader}>
          <div>
            <h2 className={styles.blockTitle}>Profile & progress</h2>
            <p className={styles.blockSubtitle}>Track your level, streak, and premium status.</p>
          </div>
        </div>

        {isAuthenticated ? (
          <div className={styles.profileSplitRow}>
            <div className={styles.profileLeft}>
              <div className={styles.profileAuthRow}>
                <XpWidget />
                <Link
                  to="/profile"
                  className={styles.streakPill}
                  aria-label={`Current streak: ${streakLabel}`}
                  title={`Current streak: ${streakLabel}`}>
                  <span className={styles.streakFlame} aria-hidden="true" />
                  <span className={styles.streakText}>{streakLabel}</span>
                </Link>
              </div>

              <Link
                to="/premium"
                className={`${styles.premiumLink} ${styles.profilePremiumLink} ${
                  isPremiumUser ? styles.premiumLinkOn : ''
                }`}
                title={premiumButtonTitle}>
                {premiumButtonLabel}
              </Link>
            </div>

            <div className={styles.profileDividerVertical} />

            <div className={styles.profileRight}>
              <div className={styles.achievementsPreviewHeader}>
                <h3 className={styles.achievementsPreviewTitle}>Achievements</h3>
                {achievements.length > 0 && (
                  <span className={styles.achievementsPreviewCount}>
                    {achievements.filter((a) => a.unlocked).length}/{achievements.length}
                  </span>
                )}
              </div>

              <Link to="/profile" className={styles.viewAllAchievements}>
                View all achievements
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.profileTopRow}>
              <div className={styles.authButtons}>
                <button
                  type="button"
                  className={styles.authButton}
                  onClick={() => setAuthView('signIn')}>
                  Sign in
                </button>
                <button
                  type="button"
                  className={`${styles.authButton} ${styles.authButtonPrimary}`}
                  onClick={() => setAuthView('signUp')}>
                  Sign up
                </button>
              </div>
            </div>
            <p className={styles.guestProfileHint}>
              Sign in to save playlists, flashcards, streak, and account progress.
            </p>

            <Link
              to="/premium"
              className={`${styles.premiumLink} ${styles.profilePremiumLink} ${
                isPremiumUser ? styles.premiumLinkOn : ''
              }`}
              title={premiumButtonTitle}>
              {premiumButtonLabel}
            </Link>
          </>
        )}
      </section>

      {/* Flashcard Folders */}
      <section className={`${styles.block} ${styles.foldersSection}`}>
        <div className={styles.blockHeader}>
          <div>
            <h2 className={styles.blockTitle}>My Flashcards</h2>
            <p className={styles.blockSubtitle}>Build compact decks and review vocabulary.</p>
          </div>
          {isAuthenticated ? (
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  setCreateFolderError('');
                  setIsCreateFolderOpen(true);
                }}>
                + Create Folder
              </button>
              {folders.length > 0 && (
                <Link to="/cards" className={styles.viewAllButton}>
                  View all
                </Link>
              )}
            </div>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setAuthView('signIn')}>
              Sign in to create
            </button>
          )}
        </div>
        {!isAuthenticated ? (
          <EmptyState
            kind="folder"
            title="Sign in to create flashcards"
            description="Build folders and keep your vocabulary decks organized."
            actionLabel="Sign in"
            onAction={() => setAuthView('signIn')}
          />
        ) : (
          <>
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
                onAction={() => {
                  setCreateFolderError('');
                  setIsCreateFolderOpen(true);
                }}
              />
            )}
            {!isLoadingFolders && folders.length > 0 && (
              <div className={`${styles.itemGrid} ${styles.foldersGrid}`}>
                {folders.slice(0, 6).map((folder, index) => {
                  const id = normalizeId(folder.id);
                  return (
                    <article key={id ?? `fl-${index}`} className={styles.itemCard}>
                      <button
                        type="button"
                        className={styles.itemMainButton}
                        onClick={() => id && navigate(`/cards/${id}`)}
                        disabled={!id}>
                        <span className={styles.itemIcon}>&#128193;</span>
                        <p className={styles.itemTitle}>{folder.name}</p>
                        <p className={styles.itemMeta}>{countCards(folder)} cards</p>
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => setFolderToDelete(folder)}
                        title="Delete folder">
                        &times;
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Artists */}
      <section className={`${styles.block} ${styles.artistsSection}`}>
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
                        width="92"
                        height="92"
                        loading="lazy"
                        decoding="async"
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

      {/* Modals */}
      {isCreatePlaylistOpen && (
        <CreatePlaylistModal
          isSubmitting={isCreatingPlaylist}
          errorMessage={createPlaylistError}
          titleMaxLength={PLAYLIST_TITLE_MAX_LENGTH}
          descriptionMaxLength={PLAYLIST_DESCRIPTION_MAX_LENGTH}
          onClose={() => {
            if (!isCreatingPlaylist) {
              setIsCreatePlaylistOpen(false);
              setCreatePlaylistError('');
            }
          }}
          onCreate={handleCreatePlaylist}
        />
      )}

      {isCreateFolderOpen && (
        <CreateFolderModal
          isSubmitting={isCreatingFolder}
          errorMessage={createFolderError}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          onClose={() => {
            if (!isCreatingFolder) {
              setIsCreateFolderOpen(false);
              setCreateFolderError('');
            }
          }}
          onCreate={handleCreateFolder}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(playlistToDelete)}
        title="Delete playlist"
        description={`This will remove "${
          playlistToDelete?.title ?? 'playlist'
        }" from your library.`}
        confirmLabel="Delete"
        isProcessing={Boolean(deletingPlaylistId)}
        onCancel={() => {
          if (!deletingPlaylistId) setPlaylistToDelete(null);
        }}
        onConfirm={confirmDeletePlaylist}
      />

      <ConfirmDialog
        isOpen={Boolean(folderToDelete)}
        title="Delete folder"
        description={`This will remove "${
          folderToDelete?.name ?? 'folder'
        }" and all cards inside it.`}
        confirmLabel="Delete"
        isProcessing={Boolean(deletingFolderId)}
        onCancel={() => {
          if (!deletingFolderId) setFolderToDelete(null);
        }}
        onConfirm={confirmDeleteFolder}
      />

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />

      <AuthModal isOpen={authView === 'signIn'} title="Sign in" onClose={closeAuth}>
        <SignInForm onSuccess={closeAuth} onSwitchToSignUp={() => setAuthView('signUp')} />
      </AuthModal>

      <AuthModal isOpen={authView === 'signUp'} title="Sign up" onClose={closeAuth}>
        <SignUpForm onSuccess={closeAuth} onSwitchToSignIn={() => setAuthView('signIn')} />
      </AuthModal>
    </div>
  );
}

export default DashboardPage;
