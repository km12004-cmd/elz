import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './header.module.css';
import { useAuth } from '../../../auth/useAuth';
import AuthModal from '../../auth/AuthModal';
import SignInForm from '../../auth/SignInForm';
import SignUpForm from '../../auth/SignUpForm';
import XpWidget from './XpWidget';

function normalizeStreak(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function formatStreakDays(value) {
  const safeValue = normalizeStreak(value);
  return `${safeValue} day${safeValue === 1 ? '' : 's'}`;
}

function Header() {
  const { isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const userMenuRef = useRef(null);

  const [authView, setAuthView] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const nickname = user?.nickname ?? 'User';
  const currentStreak = normalizeStreak(user?.streakCurrent ?? user?.streak_current);
  const streakLabel = formatStreakDays(currentStreak);

  const closeAuth = () => setAuthView(null);

  useEffect(() => {
    if (!isUserMenuOpen) return undefined;

    const onDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [isUserMenuOpen]);

  const onLogout = () => {
    setIsUserMenuOpen(false);
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.topBar}>
          <div className={styles.user}>
            {isAuthenticated && <XpWidget />}
            {isAuthenticated && (
              <Link
                to="/profile"
                className={styles.streakPill}
                aria-label={`Current streak: ${streakLabel}`}
                title={`Current streak: ${streakLabel}`}>
                <span className={styles.streakFlame} aria-hidden="true" />
                <span className={styles.streakText}>{streakLabel}</span>
              </Link>
            )}
            {!isAuthenticated ? (
              <div className={styles.authButtons}>
                <button
                  type="button"
                  className={styles.authButton}
                  onClick={() => setAuthView('signIn')}
                  title="Sign in">
                  Sign in
                </button>
                <button
                  type="button"
                  className={`${styles.authButton} ${styles.authButtonPrimary}`}
                  onClick={() => setAuthView('signUp')}
                  title="Create account">
                  Sign up
                </button>
              </div>
            ) : (
              <div className={styles.userMenu} ref={userMenuRef}>
                <button
                  type="button"
                  className={styles.userMenuTrigger}
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                  title="Open profile menu">
                  <span className={styles.nickname}>{nickname}</span>
                  {user?.avatarUrl ? (
                    <img className={styles.avatar} src={user.avatarUrl} alt={`${nickname} avatar`} />
                  ) : (
                    <span className={styles.avatarFallback}>
                      {nickname.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className={`${styles.chevron} ${isUserMenuOpen ? styles.chevronOpen : ''}`} />
                </button>

                {isUserMenuOpen ? (
                  <div className={styles.userDropdown} role="menu" aria-label="User menu">
                    <Link
                      to="/profile"
                      className={styles.userDropdownItem}
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}>
                      Profile
                    </Link>
                    <button
                      type="button"
                      className={`${styles.userDropdownItem} ${styles.userDropdownDanger}`}
                      role="menuitem"
                      onClick={onLogout}>
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className={styles.welcomeContent}>
          <h1>el zaman</h1>
          <p>Preserve the Kyrgyz language through songs, cards, and daily practice.</p>
        </div>
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
