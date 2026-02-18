import styles from './placeholderPage.module.css';

function PlaceholderPage({ title, subtitle }) {
  return (
    <section className={styles.page}>
      <h2 className={styles.title}>{title}</h2>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </section>
  );
}

export default PlaceholderPage;

