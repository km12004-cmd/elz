import styles from './songLesson.module.css';

function CompletionModal({ data, onGoToMain, onOpenCards }) {
  if (!data) return null;

  return (
    <div className={styles.completionModalBackdrop} role="presentation">
      <article
        className={styles.completionModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-modal-title">
        <p className={styles.completionModalEyebrow}>Урок завершён</p>
        <h3 id="completion-modal-title" className={styles.completionModalTitle}>
          {data.title}
        </h3>
        <p className={styles.completionModalSubtitle}>{data.subtitle}</p>

        <dl className={styles.completionStats}>
          <div className={styles.completionStatItem}>
            <dt>Точность</dt>
            <dd>{data.accuracy}%</dd>
          </div>
          <div className={styles.completionStatItem}>
            <dt>Правильно</dt>
            <dd>
              {data.correct}/{data.total}
            </dd>
          </div>
          <div className={styles.completionStatItem}>
            <dt>Ошибки</dt>
            <dd>{data.errors}</dd>
          </div>
          <div className={styles.completionStatItem}>
            <dt>Проверки</dt>
            <dd>{data.checks}</dd>
          </div>
        </dl>

        <div className={styles.completionModalActions}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={onOpenCards}>
            {data.nextCta}
          </button>
          <button
            type="button"
            className={styles.primaryActionButton}
            onClick={onGoToMain}>
            На главную
          </button>
        </div>
      </article>
    </div>
  );
}

export default CompletionModal;
