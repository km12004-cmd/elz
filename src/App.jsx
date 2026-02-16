import { useEffect, useState } from 'react';
import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import PlaceholderPage from './pages/PlaceholderPage';
import ProfilePage from './pages/ProfilePage';

const placeholderRoutes = [
  { path: '/playlist', title: 'Playlist' },
  { path: '/cards', title: 'Cards' },
  { path: '/grammar', title: 'Grammar' },
  { path: '/achievements', title: 'Achievements' },
];

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isSidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarOpen]);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <button
        type="button"
        className={`app-overlay ${isSidebarOpen ? 'app-overlay-visible' : ''}`}
        onClick={closeSidebar}
        aria-label="Close menu"
      />

      <div className="main-content">
        <Header isSidebarOpen={isSidebarOpen} onMenuClick={toggleSidebar} />

        <div className="page-content">
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
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
