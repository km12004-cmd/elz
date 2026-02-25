import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import { PlaylistDetailPage } from './pages/PlaylistPage';
import { FolderPage } from './pages/CardsPage';
import SongsLevelPage from './pages/SongsLevelPage';
import SongLessonPage from './pages/SongLessonPage';
import PremiumPage from './pages/PremiumPage';
import XpToast from './components/ui/XpToast';
import LevelUpModal from './components/ui/LevelUpModal';

function App() {
  return (
    <>
      <XpToast />
      <LevelUpModal />
      <MainLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cards/:folderId" element={<FolderPage />} />
          <Route path="/songs/levels/:difficultyLevel" element={<SongsLevelPage />} />
          <Route path="/songs/:songId" element={<SongLessonPage />} />
          <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/premium" element={<PremiumPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </>
  );
}

export default App;
