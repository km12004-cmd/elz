import { normalizeId } from '@/shared/lib/normalizeId';
import styles from './songLesson.module.css';

function TypingTask({
  taskNumber,
  title,
  subtitle,
  rows,
  inputs,
  results,
  correctCount,
  onInputChange,
  isDisabled,
  emptyMessage,
}) {
  return (
    <div className={styles.taskPane}>
      <p className={styles.taskEyebrow}>Задание {taskNumber}</p>
      <h3 className={styles.taskTitle}>{title}</h3>
      <p className={styles.taskSubtitle}>{subtitle}</p>

      <p className={styles.pairsProgress}>
        {correctCount}/{rows.length || 0} верно
      </p>

      {rows.length > 0 ? (
        <ol className={styles.typingList}>
          {rows.map((row, index) => {
            const rowId = normalizeId(row?.rowId) ?? `typing-row-${index + 1}`;
            const rowValue = inputs[rowId] ?? '';
            const rowResult = results[rowId];
            const inputClassName = [
              styles.typingInput,
              rowResult === true ? styles.typingInputCorrect : '',
              rowResult === false ? styles.typingInputWrong : '',
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
                {rowResult === true ? <p className={styles.typingRowState}>Верно</p> : null}
                {rowResult === false ? <p className={styles.typingRowState}>Попробуй ещё</p> : null}
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
