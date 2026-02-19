import { useState } from 'react';
import styles from './Flashcard.module.css';

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function Flashcard({ card, onDelete, isDeleting }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const frontText = normalizeText(card?.frontText) || 'No text';
  const backText = normalizeText(card?.backText) || 'No translation';

  return (
    <article className={styles.card}>
      <p className={styles.hint}>Tap card to flip</p>

      <div
        className={styles.flipArea}
        role="button"
        tabIndex={0}
        onClick={() => setIsFlipped((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsFlipped((previous) => !previous);
          }
        }}
      >
        <div className={`${styles.flipInner} ${isFlipped ? styles.flipped : ''}`}>
          <div className={`${styles.face} ${styles.front}`}>
            <p className={styles.faceLabel}>Front side</p>
            <p className={styles.faceText}>{frontText}</p>
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <p className={styles.faceLabel}>Back side</p>
            <p className={styles.faceText}>{backText}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={styles.deleteButton}
        onClick={onDelete}
        disabled={isDeleting}
        title="Delete this card"
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </article>
  );
}

export default Flashcard;
