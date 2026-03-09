import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import MainLayout from '@/widgets/layout/MainLayout';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
import DashboardPage from '@/pages/dashboard';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import XpToast from '@/features/xp/ui/XpToast';
import LevelUpModal from '@/features/xp/ui/LevelUpModal';
import styles from './styles/app.module.css';

const ProfilePage = lazy(() => import('@/pages/profile'));
const PlaylistDetailPage = lazy(() => import('@/pages/playlist-detail'));
const AllFoldersPage = lazy(() => import('@/pages/cards'));
const FolderPage = lazy(() => import('@/pages/folder'));
const SongLessonPage = lazy(() => import('@/pages/song-lesson'));
const PremiumPage = lazy(() => import('@/pages/premium'));
const AdminConsolePage = lazy(() => import('@/pages/admin'));

function App() {
  return (
    <>
      <ScrollToTop />
      <XpToast />
      <LevelUpModal />
      <MainLayout>
        <Suspense
          fallback={(
            <div className={styles.routeFallback}>
              <LoadingSpinner size="lg" />
            </div>
          )}
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/cards" element={<AllFoldersPage />} />
            <Route path="/cards/:folderId" element={<FolderPage />} />
            <Route path="/songs/:songId" element={<SongLessonPage />} />
            <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/premium" element={<PremiumPage />} />
            <Route path="/admin" element={<AdminConsolePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MainLayout>
    </>
  );
}

export default App;
