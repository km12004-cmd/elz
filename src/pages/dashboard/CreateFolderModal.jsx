import { useEffect, useState } from 'react';
import styles from './CreateFolderModal.module.css';

function CreateFolderModal({
  isSubmitting,
  errorMessage,
  maxLength,
  onClose,
  onCreate,
}) {
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const created = await onCreate(folderName);
    if (created) {
      setFolderName('');
    }
  };

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (isSubmitting) return;
        onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Create folder"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.title}>Create folder</h3>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="create-folder-name-input">
            Name
          </label>
          <input
            id="create-folder-name-input"
            className={styles.input}
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="e.g. Verbs"
            maxLength={maxLength}
            autoFocus
            disabled={isSubmitting}
          />
          <span className={styles.counter}>
            {folderName.length}/{maxLength}
          </span>

          {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}

          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFolderModal;
