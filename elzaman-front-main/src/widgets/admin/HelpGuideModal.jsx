import { useEffect } from 'react';
import styles from './helpGuideModal.module.css';

function HelpGuideModal({ isOpen, onClose, guide }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !guide) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => onClose?.()}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={guide.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{guide.title}</h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <p className={styles.description}>{guide.description}</p>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Input format</h4>
          <p className={styles.sectionText}>{guide.format}</p>
        </div>

        {guide.steps?.length > 0 && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Steps</h4>
            <ol className={styles.stepsList}>
              {guide.steps.map((step, i) => (
                <li key={i} className={styles.stepItem}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {guide.examples?.length > 0 && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Examples</h4>
            <pre className={styles.examplesBlock}>
              {guide.examples.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default HelpGuideModal;
