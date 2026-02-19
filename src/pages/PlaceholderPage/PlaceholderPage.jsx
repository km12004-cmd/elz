import styles from './placeholderPage.module.css';

function PlaceholderPage({ title, subtitle }) {
  return (
    <section className={styles.page}>
      <div className={styles.icon} aria-hidden="true">
        ✨
      </div>
      <h2 className={styles.title}>{title}</h2>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      <p className={styles.note}>This section is being prepared and will be available soon.</p>
    </section>
  );
}

export default PlaceholderPage;
