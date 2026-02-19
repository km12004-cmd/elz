import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../Header';
import Sidebar from '../Sidebar';
import styles from './mainLayout.module.css';

const MOBILE_MEDIA_QUERY = '(max-width: 900px)';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebarCollapsed';

function getInitialMobileState() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getInitialCollapsedState() {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function MainLayout({ children }) {
  const [isMobile, setIsMobile] = useState(getInitialMobileState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialCollapsedState);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onMediaQueryChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setIsMobileSidebarOpen(false);
    };

    setIsMobile(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onMediaQueryChange);
    } else {
      mediaQuery.addListener(onMediaQueryChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', onMediaQueryChange);
      } else {
        mediaQuery.removeListener(onMediaQueryChange);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // localStorage is optional; ignore unavailable environments.
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isMobile || !isMobileSidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, isMobileSidebarOpen]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!isMobile) return;
    setIsMobileSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const handleDesktopToggle = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const handleMobileMenuToggle = () => {
    if (!isMobile) return;
    setIsMobileSidebarOpen((prev) => !prev);
  };

  return (
    <div className={styles.appShell}>
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggle={handleDesktopToggle}
        isMobile={isMobile}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <button
        type="button"
        className={`${styles.overlay} ${isMobile && isMobileSidebarOpen ? styles.overlayVisible : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
        aria-label="Close menu"
        aria-hidden={!isMobile || !isMobileSidebarOpen}
        tabIndex={!isMobile || !isMobileSidebarOpen ? -1 : 0}
      />

      <div className={styles.content}>
        <Header
          isSidebarOpen={isMobileSidebarOpen}
          onMenuClick={handleMobileMenuToggle}
        />

        <main className={styles.pageFrame}>
          <div key={location.pathname} className={styles.pageTransition}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
