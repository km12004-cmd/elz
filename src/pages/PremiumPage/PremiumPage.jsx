import { Link } from 'react-router-dom';
import styles from './premiumPage.module.css';

const FREE_FEATURES = [
  'Access to core lessons and flashcards',
  'Daily progress tracking and streaks',
  'Limited number of songs and practice sets',
  'Standard learning pace without extra tools',
];

const PREMIUM_FEATURES = [
  'Full access to all lessons, songs, and exercises',
  'Advanced flashcards and curated study collections',
  'Priority access to new learning content',
  'Faster progress with expanded practice options',
];

function PremiumPage() {
  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.heroBadge}>el zaman premium</p>
        <h2 className={styles.heroTitle}>Choose the plan that matches your learning goals</h2>
        <div className={styles.heroActions}>
          <Link to="/" className={styles.backButton}>
            Back to Home
          </Link>
        </div>
      </div>

      <div className={styles.plansGrid}>
        <article className={styles.planCard}>
          <p className={styles.planLabel}>Free Plan</p>
          <h3 className={styles.planTitle}>Free</h3>
          <p className={styles.planPrice}>0 KGS / month</p>
          <p className={styles.planDescription}>
            A solid starting point for building daily language habits and exploring the platform.
          </p>
          <ul className={styles.featureList}>
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                {feature}
              </li>
            ))}
          </ul>
          <p className={styles.planNote}>Best for new learners who want to start at no cost.</p>
        </article>

        <article className={`${styles.planCard} ${styles.planCardPremium}`}>
          <p className={styles.planLabel}>Premium Plan</p>
          <h3 className={styles.planTitle}>Premium</h3>
          <p className={styles.planPrice}>249 KGS / month</p>
          <p className={styles.planDescription}>
            Designed for consistent learners who want maximum content access and faster results.
          </p>
          <ul className={styles.featureList}>
            {PREMIUM_FEATURES.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                {feature}
              </li>
            ))}
          </ul>
          <p className={styles.planNote}>Best for focused learners who want full access and depth.</p>
        </article>
      </div>
    </section>
  );
}

export default PremiumPage;
