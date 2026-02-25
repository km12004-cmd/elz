import { useCallback } from 'react';
import logo from '../../../assets/images/logo.svg';
import styles from './footer.module.css';

function InstagramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M7 10v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="7" cy="7.2" r="1.1" fill="currentColor" />
      <path d="M12 17v-3.2a2.6 2.6 0 015.2 0V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 10v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
      <path d="M2 9l10 6 10-6" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Footer() {
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={styles.topLine} />

      <div className={styles.inner}>
        <div className={styles.grid}>

          {/* Logo */}
          <div className={styles.logoCol}>
            <div className={styles.logoCard}>
              <img src={logo} alt="El Zaman" className={styles.logo} />
            </div>
          </div>

          {/* About */}
          <div className={styles.aboutCol}>
            <p className={styles.greeting}>Hello, this is the website</p>
            <p className={styles.teamName}>of the El&nbsp;Zaman team.</p>
            <p className={styles.tagline}>
              We preserve the Kyrgyz language<br />
              through songs, cards, and daily practice.
            </p>
          </div>

          {/* Social links */}
          <div className={styles.connectCol}>
            <span className={styles.connectLabel}>Connect</span>
            <ul className={styles.linksList}>
              <li>
                <a
                  href="https://instagram.com/elzaman.kg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                >
                  <span className={styles.iconWrap}><InstagramIcon /></span>
                  <span>@elzaman.kg</span>
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/el-zaman-1a5a64385?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                >
                  <span className={styles.iconWrap}><LinkedInIcon /></span>
                  <span>LinkedIn</span>
                </a>
              </li>
              <li>
                <a href="mailto:elzamanfip@gmail.com" className={styles.socialLink}>
                  <span className={styles.iconWrap}><EmailIcon /></span>
                  <span>elzamanfip@gmail.com</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.bottomBar}>
          <span className={styles.credit}>Developed by Kim Eduard</span>
          <span className={styles.copy}>© 2026 El&nbsp;Zaman</span>
          <button
            type="button"
            className={styles.backToTop}
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            <ArrowUpIcon />
            <span>Back to top</span>
          </button>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
