import styles from './toast.module.css';

function Toast({ type = 'info', message, onClose }) {
  if (!message) return null;

  const toneClass =
    type === 'error'
      ? styles.toastError
      : type === 'success'
        ? styles.toastSuccess
        : styles.toastInfo;

  return (
    <div className={styles.toastViewport} aria-live="polite" aria-atomic="true">
      <div className={`${styles.toast} ${toneClass}`} role="status">
        <p className={styles.message}>{message}</p>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close notification">
          ✕
        </button>
      </div>
    </div>
  );
}

export default Toast;
