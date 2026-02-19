import { NavLink } from 'react-router-dom';
import styles from './sidebar.module.css';
import logo from '../../../assets/images/logo.svg';
import linkedin from '../../../assets/images/linkedin.svg';
import instagram from '../../../assets/images/instagram.svg';

const sections = [
  { name: 'Home', to: '/', icon: 'home' },
  { name: 'Playlists', to: '/playlists', icon: 'playlist' },
  { name: 'Cards', to: '/cards', icon: 'cards' },
  { name: 'Achievements', to: '/achievements', icon: 'trophy' },
];

function SidebarIcon({ type }) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  };

  if (type === 'playlist') {
    return (
      <svg {...commonProps}>
        <path d="M5 6H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 18H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="17" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'cards') {
    return (
      <svg {...commonProps}>
        <rect x="4" y="7" width="13" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 4H19C20.1046 4 21 4.89543 21 6V14" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'trophy') {
    return (
      <svg {...commonProps}>
        <path d="M8 5H16V8.5C16 11.5376 13.5376 14 10.5 14C7.46243 14 5 11.5376 5 8.5V5H8Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 7H18C18.5523 7 19 7.44772 19 8V8.2C19 10.2987 17.2987 12 15.2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 7H3C2.44772 7 2 7.44772 2 8V8.2C2 10.2987 3.70131 12 5.8 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10.5 14V18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 20H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 10.5L12 4L20 10.5V19C20 19.5523 19.5523 20 19 20H5C4.44772 20 4 19.5523 4 19V10.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 20V13H15V20" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SidebarChevron({ direction = 'left' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {direction === 'right' ? (
        <path
          d="M10 6L16 12L10 18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M14 6L8 12L14 18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function Sidebar({ collapsed, onToggle, isMobile, isOpen, onCloseMobile }) {
  const isCollapsed = collapsed && !isMobile;

  const handleNavItemClick = () => {
    if (isMobile) {
      onCloseMobile?.();
    }
  };

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''} ${
        isMobile && isOpen ? styles.open : ''
      }`}
    >
      <div className={styles.brandHeader}>
        <div className={styles.brandBlock}>
          <img className={styles.logo} src={logo} alt="logo" />
          <span className={`${styles.logoText} ${isCollapsed ? styles.logoTextHidden : ''}`}>
            el zaman
          </span>
        </div>

        <button
          type="button"
          className={styles.toggleBtn}
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={!isCollapsed}
        >
          <SidebarChevron direction={isCollapsed ? 'right' : 'left'} />
        </button>
      </div>

      <div className={styles.separator} />

      <nav className={styles.nav}>
        <ul className={styles.sections}>
          {sections.map(({ name, to, icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={handleNavItemClick}
                title={isCollapsed ? name : undefined}
                data-label={name}
                data-collapsed={isCollapsed ? 'true' : 'false'}
                className={({ isActive }) => `${styles.section} ${isActive ? styles.active : ''}`}
              >
                <span className={styles.iconBox}>
                  <SidebarIcon type={icon} />
                </span>
                <span className={`${styles.label} ${isCollapsed ? styles.labelHidden : ''}`}>
                  {name}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ul className={styles.socialMediaWrapper}>
        <li>
          <a
            href="https://www.linkedin.com/in/el-zaman-1a5a64385?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
            title={isCollapsed ? 'LinkedIn' : undefined}
          >
            <img className={styles.socialMediaIcon} src={linkedin} alt="linkedin" />
          </a>
        </li>
        <li>
          <a
            href="https://www.instagram.com/elzaman.kg/"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            title={isCollapsed ? 'Instagram' : undefined}
          >
            <img className={styles.socialMediaIcon} src={instagram} alt="instagram" />
          </a>
        </li>
      </ul>
    </aside>
  );
}

export default Sidebar;
