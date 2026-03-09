import { useEffect, useState } from 'react';
import styles from './Flashcard.module.css';

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function Flashcard({ card, onDelete, isDeleting }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const frontText = normalizeText(card?.frontText) || 'No text';
  const backText = normalizeText(card?.backText) || 'No translation';

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) {
        setIsMenuOpen(false);
        return;
      }

      if (event.target.closest('[data-card-menu-root="true"]')) return;
      setIsMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <article className={styles.card}>
      <div className={styles.headerRow}>
        <p className={styles.hint}>Tap card to flip</p>
        <div className={styles.cardMenu} data-card-menu-root="true">
          <button
            type="button"
            className={styles.menuTrigger}
            onClick={() => setIsMenuOpen((previous) => !previous)}
            disabled={isDeleting}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            title="Card actions"
            aria-label="Open card actions"
          >
            ⋯
          </button>

          {isMenuOpen ? (
            <div className={styles.menuDropdown} role="menu">
              <button
                type="button"
                className={styles.menuDangerItem}
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete?.();
                }}
                disabled={isDeleting}
                role="menuitem"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

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
    </article>
  );
}

export default Flashcard;
