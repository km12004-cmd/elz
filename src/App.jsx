import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
import DashboardPage from './pages/DashboardPage';
import LoadingSpinner from './components/ui/LoadingSpinner';
import XpToast from './components/ui/XpToast';
import LevelUpModal from './components/ui/LevelUpModal';
import styles from './App.module.css';

const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistPage/PlaylistDetailPage'));
const FolderPage = lazy(() => import('./pages/CardsPage/FolderPage'));
const SongLessonPage = lazy(() => import('./pages/SongLessonPage'));
const PremiumPage = lazy(() => import('./pages/PremiumPage'));
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage'));

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
