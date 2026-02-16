import styles from './sidebar.module.css';
import logo from '../../../assets/images/logo.svg';
import linkedin from '../../../assets/images/linkedin.svg';
import instagram from '../../../assets/images/instagram.svg';
import { NavLink } from 'react-router-dom';

const sections = [
  { name: 'HOME', to: '/' },
  { name: 'PLAYLIST', to: '/playlist' },
  { name: 'CARDS', to: '/cards' },
  { name: 'GRAMMAR', to: '/grammar' },
  { name: 'ACHIEVEMENTS', to: '/achievements' },
];

function Sidebar({ isOpen, onClose }) {
  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.logoWrapper}>
        <img className={styles.logo} src={logo} alt="logo" />
        <span className={styles.logoText}>el zaman</span>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.sectons}>
          {sections.map(({ name, to }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `${styles.section} ${isActive ? styles.active : ''}`
                }
              >
                {name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ul className={styles.socialMediaWrapper}>
        <li>
          <a href="https://www.linkedin.com/in/el-zaman-1a5a64385?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app">
            <img className={styles.socialMediaIcon} src={linkedin} alt="linkedin" />
          </a>
        </li>
        <li>
          <a href="https://www.instagram.com/elzaman.kg/">
            <img className={styles.socialMediaIcon} src={instagram} alt="inst" />
          </a>
        </li>
      </ul>
    </aside>
  );
}

export default Sidebar;
