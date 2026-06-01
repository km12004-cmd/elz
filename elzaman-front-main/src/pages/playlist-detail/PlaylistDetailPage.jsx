import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addSongToPlaylist,
  fetchPlaylistDetail,
  removeSongFromPlaylist,
} from '@/entities/playlist/api';
import { fetchSongsCatalog } from '@/entities/song/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import EmptyState from '@/shared/ui/EmptyState';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import Skeleton from '@/shared/ui/Skeleton';
import Toast from '@/shared/ui/Toast';
import { normalizeId } from '@/shared/lib/normalizeId';
import styles from './PlaylistDetailPage.module.css';

const EMPTY_ITEMS = [];
const SEARCH_RESULTS_LIMIT = 24;

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractYouTubeVideoId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) return trimmed;

  const parsed = (() => {
    try {
      return new URL(trimmed);
    } catch {
      try {
        return new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    }
  })();

  if (!parsed) return null;

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'youtu.be') {
    const shortId = parsed.pathname.split('/').filter(Boolean)[0];
    return idPattern.test(shortId ?? '') ? shortId : null;
  }

  if (hostname.endsWith('youtube.com') || hostname === 'youtube-nocookie.com') {
    const watchId = parsed.searchParams.get('v');
    if (idPattern.test(watchId ?? '')) return watchId;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const candidates = [
      pathParts[0] === 'embed' ? pathParts[1] : null,
      pathParts[0] === 'shorts' ? pathParts[1] : null,
      pathParts[0] === 'live' ? pathParts[1] : null,
    ];
    const firstValid = candidates.find((item) => idPattern.test(item ?? ''));
    return firstValid ?? null;
  }

  return null;
}

function toYouTubeEmbedUrl(value) {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
}

function songMatchesSearch(song, normalizedQuery) {
  if (!normalizedQuery) return true;

  const title = normalizeText(song?.title).toLowerCase();
  const author = normalizeText(song?.author).toLowerCase();

  return title.includes(normalizedQuery) || author.includes(normalizedQuery);
}

function formatDuration(seconds) {
  const durationSeconds = parsePositiveInteger(seconds);
  if (!durationSeconds) return null;

  const minutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function enrichSong(song, fallbackSong) {
  const source = song && typeof song === 'object' ? song : {};
  const fallback = fallbackSong && typeof fallbackSong === 'object' ? fallbackSong : {};

  const durationSeconds = parsePositiveInteger(
    source.durationSeconds ??
      source.duration_seconds ??
      source.duration ??
      fallback.durationSeconds ??
      fallback.duration_seconds ??
      fallback.duration,
  );

  return {
    ...fallback,
    ...source,
    id: normalizeId(source.id) ?? normalizeId(fallback.id),
    title: normalizeText(source.title) || normalizeText(fallback.title) || 'Untitled song',
    author:
      normalizeText(source.author) ||
      normalizeText(source.artist) ||
      normalizeText(fallback.author) ||
      normalizeText(fallback.artist) ||
      null,
    addedAt:
      normalizeText(source.addedAt) ||
      normalizeText(source.added_at) ||
      normalizeText(fallback.addedAt) ||
      normalizeText(fallback.added_at) ||
      null,
    durationSeconds,
    youtubeUrl:
      normalizeText(source.youtubeUrl) ||
      normalizeText(source.youtube_url) ||
      normalizeText(fallback.youtubeUrl) ||
      normalizeText(fallback.youtube_url) ||
      null,
  };
}

function PlaylistDetailPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { playlistId } = useParams();

  const [playlistDetail, setPlaylistDetail] = useState(null);
  const [songsCatalog, setSongsCatalog] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [songSearchQuery, setSongSearchQuery] = useState('');

  const [addingSongId, setAddingSongId] = useState(null);
  const [removingSongId, setRemovingSongId] = useState(null);
  const [songToRemove, setSongToRemove] = useState(null);
  const [openSongMenuId, setOpenSongMenuId] = useState(null);

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
      setLoadError(extractErrorMessage(error, { context: 'playlistDetail' }));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedPlaylistId, token]);

  const loadSongsCatalog = useCallback(async () => {
    setIsCatalogLoading(true);

    try {
      const catalog = await fetchSongsCatalog({ token });
      setSongsCatalog(Array.isArray(catalog) ? catalog : []);
    } catch {
      setSongsCatalog([]);
    } finally {
      setIsCatalogLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  useEffect(() => {
    loadSongsCatalog();
  }, [loadSongsCatalog]);

  useEffect(() => {
    if (!actionError && !actionSuccess) return undefined;

    const timer = setTimeout(() => {
      setActionError('');
      setActionSuccess('');
    }, 3200);

    return () => clearTimeout(timer);
  }, [actionError, actionSuccess]);

  useEffect(() => {
    if (!openSongMenuId) return undefined;

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) {
        setOpenSongMenuId(null);
        return;
      }

      if (event.target.closest('[data-song-menu-root="true"]')) return;
      setOpenSongMenuId(null);
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpenSongMenuId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openSongMenuId]);

  const clearMessages = () => {
    setActionError('');
    setActionSuccess('');
  };

  const songs = Array.isArray(playlistDetail?.songs) ? playlistDetail.songs : EMPTY_ITEMS;
  const availableSongs = Array.isArray(playlistDetail?.availableSongs)
    ? playlistDetail.availableSongs
    : EMPTY_ITEMS;

  const songsCatalogById = useMemo(() => {
    const mapping = new Map();

    songsCatalog.forEach((song) => {
      const songId = normalizeId(song?.id);
      if (!songId) return;
      mapping.set(songId, song);
    });

    return mapping;
  }, [songsCatalog]);

  const playlistSongs = useMemo(
    () =>
      songs.map((song) => {
        const songId = normalizeId(song?.id);
        return enrichSong(song, songId ? songsCatalogById.get(songId) : null);
      }),
    [songs, songsCatalogById],
  );

  const searchableAvailableSongs = useMemo(
    () =>
      availableSongs
        .map((song) => {
          const songId = normalizeId(song?.id);
          return enrichSong(song, songId ? songsCatalogById.get(songId) : null);
        })
        .filter((song) => normalizeId(song?.id)),
    [availableSongs, songsCatalogById],
  );

  const songsInPlaylist = useMemo(
    () => new Set(playlistSongs.map((song) => normalizeId(song.id)).filter(Boolean)),
    [playlistSongs],
  );

  const normalizedSongSearchQuery = normalizeText(songSearchQuery).toLowerCase();
  const hasSongSearchQuery = Boolean(normalizedSongSearchQuery);

  const filteredAvailableSongs = useMemo(() => {
    if (!hasSongSearchQuery) return EMPTY_ITEMS;

    return searchableAvailableSongs
      .filter((song) => songMatchesSearch(song, normalizedSongSearchQuery))
      .slice(0, SEARCH_RESULTS_LIMIT);
  }, [hasSongSearchQuery, normalizedSongSearchQuery, searchableAvailableSongs]);

  const filteredPlaylistSongs = useMemo(
    () =>
      hasSongSearchQuery
        ? playlistSongs.filter((song) => songMatchesSearch(song, normalizedSongSearchQuery))
        : playlistSongs,
    [hasSongSearchQuery, normalizedSongSearchQuery, playlistSongs],
  );

  const combinedSongCards = useMemo(() => {
    const playlistCards = filteredPlaylistSongs.map((song) => ({ mode: 'playlist', song }));
    if (!hasSongSearchQuery) return playlistCards;

    const availableCards = filteredAvailableSongs.map((song) => ({ mode: 'available', song }));
    return [...playlistCards, ...availableCards];
  }, [filteredAvailableSongs, filteredPlaylistSongs, hasSongSearchQuery]);

  const artistSuggestions = useMemo(() => {
    const artistCounts = new Map();

    searchableAvailableSongs.forEach((song) => {
      const artistName = normalizeText(song?.author);
      if (!artistName) return;
      artistCounts.set(artistName, (artistCounts.get(artistName) ?? 0) + 1);
    });

    return Array.from(artistCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([name, songsCount]) => ({ name, songsCount }));
  }, [searchableAvailableSongs]);

  const totalPlaylistDurationSeconds = useMemo(
    () =>
      playlistSongs.reduce(
        (total, song) => total + (parsePositiveInteger(song?.durationSeconds) ?? 0),
        0,
      ),
    [playlistSongs],
  );

  const playlistArtistCount = useMemo(() => {
    const artists = new Set();

    playlistSongs.forEach((song) => {
      const artistName = normalizeText(song?.author);
      if (!artistName) return;
      artists.add(artistName.toLowerCase());
    });

    return artists.size;
  }, [playlistSongs]);

  const latestAddedDate = useMemo(() => {
    let latestDate = null;

    playlistSongs.forEach((song) => {
      const rawDate = normalizeText(song?.addedAt);
      if (!rawDate) return;

      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) return;

      if (!latestDate || parsedDate > latestDate) {
        latestDate = parsedDate;
      }
    });

    return latestDate ? formatDate(latestDate) : null;
  }, [playlistSongs]);

  const availableSongsCount = searchableAvailableSongs.length;
  const isSearchResultsCapped =
    hasSongSearchQuery && filteredAvailableSongs.length === SEARCH_RESULTS_LIMIT;

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
    } catch (error) {
      setActionError(extractErrorMessage(error, { context: 'playlistDetail' }));
    } finally {
      setAddingSongId(null);
    }
  };

  const confirmRemoveSong = async () => {
    const normalizedSongId = parsePositiveInteger(songToRemove?.id);
    if (!normalizedPlaylistId || !normalizedSongId) {
      setSongToRemove(null);
      return;
    }

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
      setOpenSongMenuId(null);
      setSongToRemove(null);
    } catch (error) {
      setActionError(extractErrorMessage(error, { context: 'playlistDetail' }));
    } finally {
      setRemovingSongId(null);
    }
  };

  const songToRemoveId = normalizeId(songToRemove?.id);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/playlists')}>
            Back to playlists
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => {
              loadPlaylist();
              loadSongsCatalog();
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <p className={styles.eyebrow}>Playlist</p>
        <h2 className={styles.title}>{playlistDetail?.playlist?.title ?? 'Playlist'}</h2>
        {playlistDetail?.playlist?.description ? (
          <p className={styles.subtitle}>{playlistDetail.playlist.description}</p>
        ) : null}
        <p className={styles.metaText}>Manage songs by title or artist, then add them in one click.</p>

        <div className={styles.statsGrid}>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Songs in playlist</p>
            <p className={styles.statValue}>{playlistSongs.length}</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Artists covered</p>
            <p className={styles.statValue}>{playlistArtistCount}</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Total duration</p>
            <p className={styles.statValue}>{formatDuration(totalPlaylistDurationSeconds) ?? '--:--'}</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Last added</p>
            <p className={styles.statValue}>{latestAddedDate ?? 'No songs yet'}</p>
          </article>
        </div>
      </header>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? (
        <>
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading playlist...</span>
          </div>
          <ul className={styles.songList}>
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={`playlist-song-skeleton-${index}`} className={styles.songSkeleton}>
                <Skeleton className={styles.skeletonTitle} />
                <Skeleton className={styles.skeletonMeta} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!isLoading ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Songs</h3>

          <div className={styles.searchRow}>
            <label className={styles.fieldLabel} htmlFor="playlist-available-search">
              Search in unlocked songs
            </label>
            <input
              id="playlist-available-search"
              className={styles.input}
              type="text"
              value={songSearchQuery}
              onChange={(event) => setSongSearchQuery(event.target.value)}
              placeholder="Type song title or artist name"
            />
          </div>

          {availableSongsCount === 0 ? (
            <p className={styles.mutedText}>No unlocked songs available</p>
          ) : null}

          {availableSongsCount > 0 && !hasSongSearchQuery ? (
            <div className={styles.discoveryPanel}>
              <p className={styles.mutedText}>Type in the search field above to see matching songs.</p>
              {isCatalogLoading ? <p className={styles.mutedText}>Loading artists...</p> : null}
              {artistSuggestions.length > 0 ? (
                <>
                  <p className={styles.fieldLabel}>Popular artists</p>
                  <div className={styles.artistChips}>
                    {artistSuggestions.map((artist) => (
                      <button
                        key={artist.name}
                        type="button"
                        className={styles.artistChip}
                        onClick={() => setSongSearchQuery(artist.name)}
                      >
                        <span>{artist.name}</span>
                        <span className={styles.artistChipCount}>{artist.songsCount}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {hasSongSearchQuery ? (
            <p className={styles.resultsMeta}>
              Showing {combinedSongCards.length}
              {isSearchResultsCapped ? '+' : ''} cards
            </p>
          ) : null}

          {!hasSongSearchQuery && playlistSongs.length === 0 ? (
            <EmptyState
              kind="playlist"
              title="No songs yet"
              description="Use search by title or artist to add your first track."
            />
          ) : null}

          {hasSongSearchQuery && combinedSongCards.length === 0 ? (
            <p className={styles.mutedText}>No songs match your search</p>
          ) : null}

          {combinedSongCards.length > 0 ? (
            <ul className={styles.songList}>
              {combinedSongCards.map(({ mode, song }, index) => {
                const songId = normalizeId(song.id);
                const isPlaylistSong = mode === 'playlist';
                const isAdded = Boolean(songId && songsInPlaylist.has(songId));
                const isAdding = Boolean(songId && addingSongId === songId);
                const youtubeEmbedUrl = toYouTubeEmbedUrl(song.youtubeUrl);
                const songAddedAt = formatDate(song.addedAt);
                const songMeta = [
                  normalizeText(song.author) || 'Unknown artist',
                  formatDuration(song.durationSeconds),
                ]
                  .filter(Boolean)
                  .join(' • ');

                return (
                  <li key={`${mode}-${songId ?? index}`} className={styles.songItem}>
                    <div className={styles.songMedia}>
                      {youtubeEmbedUrl ? (
                        <iframe
                          className={styles.songPlayerFrame}
                          src={youtubeEmbedUrl}
                          title={`YouTube player for ${song.title}`}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      ) : (
                        <div className={styles.songPlayerFallback}>No YouTube preview</div>
                      )}
                    </div>

                    <div className={styles.songHeader}>
                      <div className={styles.songMain}>
                        <p className={styles.songTitle}>{song.title}</p>
                        <p className={styles.songMeta}>{songMeta}</p>
                        {isPlaylistSong && songAddedAt ? (
                          <p className={styles.songSecondaryMeta}>Added: {songAddedAt}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.songActions}>
                      {isPlaylistSong ? (
                        <div className={styles.songMenu} data-song-menu-root="true">
                          <button
                            type="button"
                            className={styles.songMenuTrigger}
                            onClick={() =>
                              setOpenSongMenuId((previous) => (previous === songId ? null : songId))
                            }
                            disabled={!songId || removingSongId === songId}
                            aria-expanded={Boolean(songId && openSongMenuId === songId)}
                            aria-haspopup="menu"
                            aria-label={`Open actions for ${song.title}`}
                            title="Song actions"
                          >
                            ⋯
                          </button>

                          {songId && openSongMenuId === songId ? (
                            <div className={styles.songMenuDropdown} role="menu">
                              <button
                                type="button"
                                className={styles.songMenuItemDanger}
                                onClick={() => {
                                  setOpenSongMenuId(null);
                                  setSongToRemove(song);
                                }}
                                disabled={removingSongId === songId}
                                role="menuitem"
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.plusButton}
                          onClick={() => addSong(songId)}
                          disabled={!songId || isAdded || isAdding}
                          title={
                            isAdded
                              ? 'Song is already in playlist'
                              : isAdding
                                ? 'Adding song...'
                                : `Add "${song.title}" to playlist`
                          }
                          aria-label={
                            isAdded
                              ? `Song ${song.title} is already added`
                              : isAdding
                                ? `Adding ${song.title}`
                                : `Add ${song.title} to playlist`
                          }
                        >
                          {isAdded ? '✓' : isAdding ? '...' : '+'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(songToRemove)}
        title="Remove song"
        description={`Remove "${songToRemove?.title ?? 'song'}" from this playlist?`}
        confirmLabel="Remove"
        isProcessing={Boolean(songToRemoveId && removingSongId === songToRemoveId)}
        onCancel={() => {
          if (removingSongId) return;
          setSongToRemove(null);
        }}
        onConfirm={confirmRemoveSong}
      />

      <Toast
        type={actionError ? 'error' : 'success'}
        message={actionError || actionSuccess}
        onClose={clearMessages}
      />
    </section>
  );
}

export default PlaylistDetailPage;
