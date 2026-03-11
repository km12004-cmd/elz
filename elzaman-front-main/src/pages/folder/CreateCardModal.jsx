import { useEffect, useState } from 'react';
import styles from './CreateCardModal.module.css';

const CARD_TEXT_MAX_LENGTH = 500;

function CreateCardModal({ isSubmitting, errorMessage, onClose, onCreate }) {
  const [frontText, setFrontText] = useState('');
  const [backText, setBackText] = useState('');

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

    const created = await onCreate({
      frontText,
      backText,
    });

    if (created) {
      setFrontText('');
      setBackText('');
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
        aria-label="Create card"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.title}>Create card</h3>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="create-card-front-input">
            Front side
          </label>
          <textarea
            id="create-card-front-input"
            className={`${styles.input} ${styles.textarea}`}
            value={frontText}
            onChange={(event) => setFrontText(event.target.value)}
            maxLength={CARD_TEXT_MAX_LENGTH}
            placeholder="Word"
            autoFocus
            disabled={isSubmitting}
          />
          <span className={styles.counter}>
            {frontText.length}/{CARD_TEXT_MAX_LENGTH}
          </span>

          <label className={styles.label} htmlFor="create-card-back-input">
            Back side
          </label>
          <textarea
            id="create-card-back-input"
            className={`${styles.input} ${styles.textarea}`}
            value={backText}
            onChange={(event) => setBackText(event.target.value)}
            maxLength={CARD_TEXT_MAX_LENGTH}
            placeholder="Translation"
            disabled={isSubmitting}
          />
          <span className={styles.counter}>
            {backText.length}/{CARD_TEXT_MAX_LENGTH}
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

export default CreateCardModal;
