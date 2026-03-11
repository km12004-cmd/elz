import { useEffect } from 'react';
import styles from './confirmDialog.module.css';

function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isProcessing = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (isProcessing) return;
        onCancel?.();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
