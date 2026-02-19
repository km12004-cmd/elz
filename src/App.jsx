import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import PlaceholderPage from './pages/PlaceholderPage';
import ProfilePage from './pages/ProfilePage';
import PlaylistPage, { PlaylistDetailPage } from './pages/PlaylistPage';
import CardsPage, { FolderPage } from './pages/CardsPage';

const placeholderRoutes = [
  { path: '/grammar', title: 'Grammar' },
  { path: '/achievements', title: 'Achievements' },
];

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route
          path="/"
          element={
            <PlaceholderPage
              title="Home"
              subtitle="Preserve the Kyrgyz language through songs and games."
            />
          }
        />
        {placeholderRoutes.map(({ path, title }) => (
          <Route key={path} path={path} element={<PlaceholderPage title={title} />} />
        ))}
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/cards/:folderId" element={<FolderPage />} />
        <Route path="/playlists" element={<PlaylistPage />} />
        <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
        <Route path="/playlist" element={<PlaylistPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
