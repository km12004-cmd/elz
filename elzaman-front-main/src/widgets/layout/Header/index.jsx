import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useI18n } from '@/features/i18n/hooks/useI18n';
import { useTheme } from '@/features/theme/hooks/useTheme';
import { normalizeRole } from '@/shared/lib/roles';
import styles from './header.module.css';

const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'ru', code: 'RU', titleKey: 'Russian' },
  { value: 'en', code: 'EN', titleKey: 'English' },
  { value: 'ky', code: 'KY', titleKey: 'Kyrgyz' },
]);

function Header() {
  const { isAuthenticated, user, signOut } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { isDarkTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const languageMenuRef = useRef(null);
  const userMenuRef = useRef(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const nickname = user?.nickname ?? 'User';
  const nextThemeLabel = isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme';
  const canAccessAdminConsole = normalizeRole(user?.role) === 'admin';
  const currentLanguageOption =
    LANGUAGE_OPTIONS.find((option) => option.value === language) ?? LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!isLanguageMenuOpen && !isUserMenuOpen) return undefined;

    const onDocumentClick = (event) => {
      if (!languageMenuRef.current?.contains(event.target)) {
        setIsLanguageMenuOpen(false);
      }
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsLanguageMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isLanguageMenuOpen, isUserMenuOpen]);

  const onLogout = () => {
    setIsUserMenuOpen(false);
    signOut();
    navigate('/', { replace: true });
  };

  const onToggleLanguageMenu = () => {
    setIsUserMenuOpen(false);
    setIsLanguageMenuOpen((prev) => !prev);
  };

  const onSelectLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    setIsLanguageMenuOpen(false);
  };

  const onToggleUserMenu = () => {
    setIsLanguageMenuOpen(false);
    setIsUserMenuOpen((prev) => !prev);
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
            <div className={styles.languageMenu} ref={languageMenuRef}>
              <button
                type="button"
                className={`${styles.languageTrigger} ${
                  isLanguageMenuOpen ? styles.languageTriggerOpen : ''
                }`}
                onClick={onToggleLanguageMenu}
                aria-haspopup="menu"
                aria-expanded={isLanguageMenuOpen}
                aria-label={t('Interface language')}
                title={t('Interface language')}>
                <span className={styles.languageTriggerCurrent} data-i18n-skip="true">
                  {currentLanguageOption.code}
                </span>
                <span className={styles.languageTriggerChevron} aria-hidden="true" />
              </button>

              {isLanguageMenuOpen ? (
                <div
                  className={styles.languageDropdown}
                  role="menu"
                  aria-label={t('Interface language')}>
                  <p className={styles.languageDropdownLabel}>{t('Interface language')}</p>
                  <div className={styles.languageDropdownList}>
                    {LANGUAGE_OPTIONS.map((option) => {
                      const isActive = language === option.value;
                      const title = t(option.titleKey);

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`${styles.languageOption} ${
                            isActive ? styles.languageOptionActive : ''
                          }`}
                          onClick={() => onSelectLanguage(option.value)}
                          role="menuitemradio"
                          aria-checked={isActive}
                          title={title}>
                          <span className={styles.languageOptionCode} data-i18n-skip="true">
                            {option.code}
                          </span>
                          <span className={styles.languageOptionTitle}>{title}</span>
                          {isActive ? (
                            <span className={styles.languageOptionMarker} aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
                  onClick={onToggleUserMenu}
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
