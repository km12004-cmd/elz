import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { fetchArtists } from '@/entities/artist/api';
import { fetchSongsCatalog } from '@/entities/song/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useI18n } from '@/features/i18n/hooks/useI18n';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import Toast from '@/shared/ui/Toast';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import { normalizeRole } from '@/shared/lib/roles';
import AdminTabBar from '@/widgets/admin/AdminTabBar';
import UsersTab from '@/widgets/admin/UsersTab';
import SongsTab from '@/widgets/admin/SongsTab';
import ExercisesTab from '@/widgets/admin/ExercisesTab';
import LyricsTab from '@/widgets/admin/LyricsTab';
import styles from './adminConsolePage.module.css';

function AdminConsolePage() {
  const { token, isAuthenticated, user, signOut } = useAuth();
  const { locale } = useI18n();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('users');
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [artistsCatalog, setArtistsCatalog] = useState([]);
  const [songsCatalog, setSongsCatalog] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const showToast = useCallback((message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleUnauthorizedError = useCallback(
    (error) => {
      if (error?.status !== 401) return false;
      signOut();
      navigate('/', { replace: true });
      return true;
    },
    [navigate, signOut],
  );

  const loadContentCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError('');

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
      setCatalogError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [handleUnauthorizedError, token]);

  useEffect(() => {
    loadContentCatalog();
  }, [loadContentCatalog]);

  if (!isAuthenticated || normalizeRole(user?.role) !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const needsCatalog = activeTab !== 'users';

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.heroBadge}>Admin area</p>
          <h2 className={styles.heroTitle}>Admin console</h2>
          <p className={styles.heroSubtitle}>
            Manage users, songs, exercises, and lyrics.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/profile')}>
            Back to profile
          </button>
        </div>
      </div>

      <AdminTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {needsCatalog && isLoadingCatalog ? (
        <div className={styles.loadingRow}>
          <LoadingSpinner size="sm" />
          <span>Loading catalog...</span>
        </div>
      ) : null}

      {needsCatalog && catalogError ? (
        <p className={styles.errorText}>{catalogError}</p>
      ) : null}

      {activeTab === 'users' && (
        <UsersTab
          token={token}
          locale={locale}
          showToast={showToast}
          onUnauthorizedError={handleUnauthorizedError}
        />
      )}

      {activeTab === 'songs' && !isLoadingCatalog && (
        <SongsTab
          token={token}
          artistsCatalog={artistsCatalog}
          songsCatalog={songsCatalog}
          showToast={showToast}
          onUnauthorizedError={handleUnauthorizedError}
          onCatalogChange={loadContentCatalog}
        />
      )}

      {activeTab === 'exercises' && !isLoadingCatalog && (
        <ExercisesTab
          token={token}
          songsCatalog={songsCatalog}
          showToast={showToast}
          onUnauthorizedError={handleUnauthorizedError}
        />
      )}

      {activeTab === 'lyrics' && !isLoadingCatalog && (
        <LyricsTab
          token={token}
          songsCatalog={songsCatalog}
          showToast={showToast}
          onUnauthorizedError={handleUnauthorizedError}
        />
      )}

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  );
}

export default AdminConsolePage;
