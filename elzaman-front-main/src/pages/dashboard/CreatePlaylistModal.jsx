import { useEffect, useState } from 'react';
import styles from './CreatePlaylistModal.module.css';

function CreatePlaylistModal({
  isSubmitting,
  errorMessage,
  titleMaxLength,
  descriptionMaxLength,
  onClose,
  onCreate,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

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

    const created = await onCreate({ title, description });
    if (created) {
      setTitle('');
      setDescription('');
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
        aria-label="Create playlist"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.title}>Create playlist</h3>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="create-playlist-title-input">
            Title
          </label>
          <input
            id="create-playlist-title-input"
            className={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Road trip"
            maxLength={titleMaxLength}
            autoFocus
            disabled={isSubmitting}
          />
          <span className={styles.counter}>
            {title.length}/{titleMaxLength}
          </span>

          <label className={styles.label} htmlFor="create-playlist-description-input">
            Description
          </label>
          <textarea
            id="create-playlist-description-input"
            className={`${styles.input} ${styles.textarea}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional short description"
            maxLength={descriptionMaxLength}
            disabled={isSubmitting}
          />
          <span className={styles.counter}>
            {description.length}/{descriptionMaxLength}
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

export default CreatePlaylistModal;
