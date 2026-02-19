import styles from './loadingSpinner.module.css';

function LoadingSpinner({ size = 'md', label = 'Loading' }) {
  const sizeClass =
    size === 'sm' ? styles.spinnerSm : size === 'lg' ? styles.spinnerLg : styles.spinnerMd;

  return (
    <span className={styles.wrapper} role="status" aria-live="polite" aria-label={label}>
      <span className={`${styles.spinner} ${sizeClass}`} />
    </span>
  );
}

export default LoadingSpinner;
