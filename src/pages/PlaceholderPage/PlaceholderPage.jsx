import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchSongLevels, getDifficultyMeta } from '../../api/songs';
import { fetchArtists } from '../../api/artists';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import styles from './placeholderPage.module.css';

const FALLBACK_LEVELS = [1, 2, 3].map((difficultyLevel) => ({
  difficultyLevel,
  songsCount: 0,
  ...(getDifficultyMeta(difficultyLevel) ?? {}),
}));

const HOME_TITLE = 'Home';
const HOME_SUBTITLE =
  'Practice Kyrgyz by listening to songs, completing tasks, and earning experience.';

function getArtistInitials(name) {
  if (typeof name !== 'string') return '?';

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return '?';

  return parts
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function PlaceholderPage({ title, subtitle, showLevels, showArtists }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [levels, setLevels] = useState(FALLBACK_LEVELS);
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [levelsError, setLevelsError] = useState('');
  const [artists, setArtists] = useState([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [artistsError, setArtistsError] = useState('');
  const [failedAvatarByKey, setFailedAvatarByKey] = useState({});
  const isHomeRoute = location.pathname === '/';
  const resolvedTitle = title ?? (isHomeRoute ? HOME_TITLE : 'Coming soon');
  const resolvedSubtitle = subtitle ?? (isHomeRoute ? HOME_SUBTITLE : '');
  const resolvedShowLevels = typeof showLevels === 'boolean' ? showLevels : isHomeRoute;
  const resolvedShowArtists = typeof showArtists === 'boolean' ? showArtists : isHomeRoute;

  useEffect(() => {
    if (!resolvedShowLevels) return undefined;

    let isCancelled = false;

    const loadLevels = async () => {
      setIsLoadingLevels(true);
      setLevelsError('');

      try {
        const items = await fetchSongLevels({ token });
        if (isCancelled) return;
        setLevels(items.length > 0 ? items : FALLBACK_LEVELS);
      } catch (error) {
        if (isCancelled) return;
        setLevels(FALLBACK_LEVELS);
        setLevelsError(extractErrorMessage(error));
      } finally {
        if (!isCancelled) setIsLoadingLevels(false);
      }
    };

    loadLevels();

    return () => {
      isCancelled = true;
    };
  }, [resolvedShowLevels, token]);

  useEffect(() => {
    if (!resolvedShowArtists) return undefined;

    let isCancelled = false;

    const loadArtists = async () => {
      setIsLoadingArtists(true);
      setArtistsError('');

      try {
        const data = await fetchArtists({ token, limit: 20 });
        if (isCancelled) return;
        setArtists(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (isCancelled) return;
        setArtists([]);
        setArtistsError(extractErrorMessage(error));
      } finally {
        if (!isCancelled) setIsLoadingArtists(false);
      }
    };

    loadArtists();

    return () => {
      isCancelled = true;
    };
  }, [resolvedShowArtists, token]);

  useEffect(() => {
    setFailedAvatarByKey({});
  }, [artists]);

  const normalizedLevels = useMemo(
    () =>
      levels.map((level, index) => {
        const parsedLevel = Number.parseInt(String(level?.difficultyLevel ?? '').trim(), 10);
        const difficultyLevel =
          parsedLevel === 1 || parsedLevel === 2 || parsedLevel === 3 ? parsedLevel : index + 1;
        const fallbackMeta = getDifficultyMeta(difficultyLevel) ?? {};

        return {
          difficultyLevel,
          title: level?.title ?? fallbackMeta.title ?? 'Level',
          description: level?.description ?? fallbackMeta.description ?? '',
          songsCount:
            typeof level?.songsCount === 'number' && Number.isFinite(level.songsCount)
              ? level.songsCount
              : 0,
        };
      }),
    [levels],
  );

  const openSongsLibrary = (difficultyLevel) => {
    navigate(`/songs/levels/${encodeURIComponent(String(difficultyLevel))}`);
  };

  return (
    <section className={styles.page}>
      <h2 className={styles.title}>{resolvedTitle}</h2>
      {resolvedSubtitle ? <p className={styles.subtitle}>{resolvedSubtitle}</p> : null}
      {resolvedShowLevels ? (
        <div className={styles.levelsSection}>
          <h3 className={styles.levelsTitle}>Choose your level</h3>
          <p className={styles.levelsSubtitle}>Open the song library for a specific difficulty.</p>

          {isLoadingLevels ? <p className={styles.levelsLoading}>Loading levels...</p> : null}
          {levelsError ? <p className={styles.levelsError}>{levelsError}</p> : null}

          <div className={styles.levelsGrid}>
            {normalizedLevels.map((level) => (
              <button
                key={level.difficultyLevel}
                type="button"
                className={styles.levelCard}
                onClick={() => openSongsLibrary(level.difficultyLevel)}
              >
                <span className={styles.levelBadge}>Level {level.difficultyLevel}</span>
                <span className={styles.levelName}>{level.title}</span>
                <span className={styles.levelDescription}>{level.description}</span>
                <span className={styles.levelMeta}>{level.songsCount} songs</span>
                <span className={styles.levelAction}>Open library</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.note}>This section is being prepared and will be available soon.</p>
      )}

      {resolvedShowArtists ? (
        <div className={styles.artistsSection}>
          <h3 className={styles.artistsTitle}>Artists who collaborate with us</h3>

          {isLoadingArtists ? <p className={styles.artistsLoading}>Loading artists...</p> : null}
          {artistsError ? <p className={styles.artistsError}>{artistsError}</p> : null}

          {!isLoadingArtists && !artistsError && artists.length === 0 ? (
            <p className={styles.artistsEmpty}>Artists will appear here soon.</p>
          ) : null}

          {artists.length > 0 ? (
            <div className={styles.artistsRow} role="list" aria-label="Artists">
              {artists.map((artist, index) => {
                const artistKey =
                  artist.id ?? `${artist.name ?? 'artist'}-${index}`;
                const shouldShowAvatarImage =
                  Boolean(artist.avatarUrl) && !failedAvatarByKey[artistKey];

                return (
                  <div key={artistKey} className={styles.artistCard} role="listitem">
                    <div className={styles.artistAvatar}>
                      {shouldShowAvatarImage ? (
                        <img
                          src={artist.avatarUrl}
                          alt={artist.name ?? 'Artist avatar'}
                          className={styles.artistAvatarImage}
                          loading="lazy"
                          onError={() => {
                            setFailedAvatarByKey((previous) => ({ ...previous, [artistKey]: true }));
                          }}
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default PlaceholderPage;
