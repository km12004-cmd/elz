import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/useAuth';
import { useI18n } from '../../../contexts/useI18n';
import { useTheme } from '../../../contexts/useTheme';
import { normalizeRole } from '../../../utils/roles';
import styles from './header.module.css';

const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'ru', code: 'RU', title: 'Russian' },
  { value: 'en', code: 'EN', title: 'English' },
]);

function Header() {
  const { isAuthenticated, user, signOut } = useAuth();
  const { language, setLanguage } = useI18n();
  const { isDarkTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const userMenuRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const nickname = user?.nickname ?? 'User';
  const nextThemeLabel = isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme';
  const canAccessAdminConsole = normalizeRole(user?.role) === 'admin';

  useEffect(() => {
    if (!isUserMenuOpen) return undefined;

    const onDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false);
    };

    document.addEventListener('pointerdown', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isUserMenuOpen]);

  const onLogout = () => {
    setIsUserMenuOpen(false);
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerContent}>
          <div className={styles.welcomeContent}>
            <h1>el zaman</h1>
            <p>Preserve the Kyrgyz language through songs, cards, and daily practice.</p>
          </div>

          <div className={styles.headerControls}>
            <div className={styles.languageSwitch} role="group" aria-label="Interface language">
              {LANGUAGE_OPTIONS.map((option) => {
                const isActive = language === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.languageButton} ${
                      isActive ? styles.languageButtonActive : ''
                    }`}
                    onClick={() => setLanguage(option.value)}
                    aria-pressed={isActive}
                    aria-label={option.title}
                    title={option.title}>
                    <span className={styles.languageButtonText} data-i18n-skip="true">
                      {option.code}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`${styles.themeToggle} ${isDarkTheme ? styles.themeToggleDark : ''}`}
              onClick={toggleTheme}
              aria-label={nextThemeLabel}
              title={nextThemeLabel}>
              <span className={styles.themeIconSun} aria-hidden="true" />
              <span className={styles.themeIconMoon} aria-hidden="true" />
              <span className={styles.themeToggleThumb} aria-hidden="true" />
            </button>

            {isAuthenticated ? (
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
                    <img
                      className={styles.avatar}
                      src={user.avatarUrl}
                      alt={`${nickname} avatar`}
                      width="31"
                      height="31"
                      decoding="async"
                    />
                  ) : (
                    <span className={styles.avatarFallback}>
                      {nickname.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`${styles.chevron} ${isUserMenuOpen ? styles.chevronOpen : ''}`}
                  />
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
                    {canAccessAdminConsole ? (
                      <Link
                        to="/admin"
                        className={styles.userDropdownItem}
                        role="menuitem"
                        onClick={() => setIsUserMenuOpen(false)}>
                        Admin console
                      </Link>
                    ) : null}
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
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
