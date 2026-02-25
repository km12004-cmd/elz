import styles from './header.module.css';

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.welcomeContent}>
          <h1>el zaman</h1>
          <p>Preserve the Kyrgyz language through songs, cards, and daily practice.</p>
        </div>
      </div>
    </header>
  );
}

export default Header;
