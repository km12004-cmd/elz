import { useState } from 'react';
import styles from './header.module.css';
import { Link } from 'react-router-dom';
import { SearchInput } from '../../ui/SearchSong';
import { useAuth } from '../../../auth/useAuth';
import AuthModal from '../../auth/AuthModal';
import SignInForm from '../../auth/SignInForm';
import SignUpForm from '../../auth/SignUpForm';

function Header({ isSidebarOpen, onMenuClick }) {
  const { isAuthenticated, user } = useAuth();
  const [authView, setAuthView] = useState(null);
  const nickname = user?.nickname ?? 'User';

  const closeAuth = () => setAuthView(null);

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={`${styles.menuButton} ${isSidebarOpen ? styles.menuButtonActive : ''}`}
          onClick={onMenuClick}
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isSidebarOpen}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={styles.search}>
          <SearchInput />
        </div>

        <div className={styles.user}>
          {!isAuthenticated ? (
            <div className={styles.authButtons}>
              <button
                type="button"
                className={styles.authButton}
                onClick={() => setAuthView('signIn')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`${styles.authButton} ${styles.authButtonPrimary}`}
                onClick={() => setAuthView('signUp')}
              >
                Sign up
              </button>
            </div>
          ) : (
            <Link to="/profile" className={styles.userLink}>
              <span className={styles.nickname}>{nickname}</span>
              {user?.avatarUrl ? (
                <img
                  className={styles.avatar}
                  src={user.avatarUrl}
                  alt={`${nickname} avatar`}
                />
              ) : (
                <span className={styles.avatarFallback}>
                  {nickname.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          )}
        </div>
      </div>

      <div className={styles.welcomeContent}>
        <h1>el zaman</h1>
        <p>Preserve the Kyrgyz language through songs and games</p>
      </div>

      <AuthModal isOpen={authView === 'signIn'} title="Sign in" onClose={closeAuth}>
        <SignInForm onSuccess={closeAuth} onSwitchToSignUp={() => setAuthView('signUp')} />
      </AuthModal>

      <AuthModal isOpen={authView === 'signUp'} title="Sign up" onClose={closeAuth}>
        <SignUpForm onSuccess={closeAuth} onSwitchToSignIn={() => setAuthView('signIn')} />
      </AuthModal>
    </header>
  );
}

export default Header;
