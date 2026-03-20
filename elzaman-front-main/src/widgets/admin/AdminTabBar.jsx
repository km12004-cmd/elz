import styles from './adminTabBar.module.css';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'songs', label: 'Songs' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'lyrics', label: 'Lyrics' },
];

function AdminTabBar({ activeTab, onTabChange }) {
  return (
    <nav className={styles.tabBar} aria-label="Admin sections">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
          onClick={() => onTabChange(tab.key)}
          aria-current={activeTab === tab.key ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export default AdminTabBar;
