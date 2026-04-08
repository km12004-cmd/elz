import { normalizeId } from '@/shared/lib/normalizeId';
import styles from './songLesson.module.css';

function TypingTask({
  taskNumber,
  title,
  subtitle,
  rows,
  inputs,
  hasReviewedAnswers,
  onInputChange,
  isDisabled,
  emptyMessage,
}) {
  return (
    <div className={styles.taskPane}>
      <p className={styles.taskEyebrow}>Задание {taskNumber}</p>
      <h3 className={styles.taskTitle}>{title}</h3>
      <p className={styles.taskSubtitle}>{subtitle}</p>

      {rows.length > 0 ? (
        <ol className={styles.typingList}>
          {rows.map((row, index) => {
            const rowId = normalizeId(row?.rowId) ?? `typing-row-${index + 1}`;
            const rowValue = inputs[rowId] ?? '';
            const inputClassName = [
              styles.typingInput,
              hasReviewedAnswers ? styles.typingInputReviewed : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li key={rowId} className={styles.typingRow}>
                <p className={styles.typingPrompt}>{row.promptRu || '—'}</p>
                <input
                  type="text"
                  className={inputClassName}
                  value={rowValue}
                  placeholder="Введи на кыргызском"
                  onChange={(event) => onInputChange(rowId, event.target.value)}
                  disabled={isDisabled}
                />
                {hasReviewedAnswers ? (
                  <p className={styles.typingAnswer}>
                    Правильный ответ: {row.expectedKg || '—'}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.taskEmpty}>{emptyMessage}</p>
      )}
    </div>
  );
}

export default TypingTask;
