import { normalizeId } from '@/shared/lib/normalizeId';
import { getOptionUsageState } from '@/features/song-lesson/lib/pairsLogic';
import styles from './songLesson.module.css';

function PairsTask({
  taskNumber,
  title,
  items,
  resolvedCount,
  options,
  linkedCount,
  incorrectCount,
  hasCheckedAnswers,
  hasIncorrectAnswers,
  hasRevealedSolutions,
  selectedPairId,
  assignments,
  confirmedAnswers,
  reviewResults,
  optionOwners,
  connectorPaths,
  onSelectPairItem,
  onAssignOption,
  boardRef,
  onBoardScroll,
  registerLeftNode,
  registerRightNode,
  isDisabled,
  successMessage,
  emptyMessage,
}) {
  const arrowMarkerId = `pairs-arrow-task${taskNumber}`;

  if (items.length === 0 || options.length === 0) {
    return (
      <div className={styles.taskPane}>
        <p className={styles.taskEyebrow}>Задание {taskNumber}</p>
        <h3 className={styles.taskTitle}>{title}</h3>
        <p className={styles.taskEmpty}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.taskPane}>
      <p className={styles.taskEyebrow}>Задание {taskNumber}</p>
      <h3 className={styles.taskTitle}>{title}</h3>

      <p className={styles.pairsProgress}>
        {hasRevealedSolutions
          ? 'Правильные ответы показаны'
          : hasCheckedAnswers
          ? hasIncorrectAnswers
            ? `Верно: ${resolvedCount}/${items.length || 0}. Ошибок: ${incorrectCount}`
            : `Все верно: ${resolvedCount}/${items.length || 0}`
          : `Связано: ${linkedCount}/${items.length || 0}`}
      </p>

      <p className={styles.pairsHint}>
        {hasRevealedSolutions
          ? successMessage
          : hasCheckedAnswers
          ? hasIncorrectAnswers
            ? 'Правильные связи сохранены. Нажми "Попробовать еще раз", чтобы исправить ошибки.'
            : 'Все ответы верные. Можно переходить дальше.'
          : selectedPairId
          ? 'Выбери вариант справа, чтобы увидеть связь.'
          : 'Выбери слово слева, чтобы соединить с переводом справа.'}
      </p>

      <div className={styles.pairsBoardWrap} ref={boardRef}>
        <svg className={styles.pairsConnectorLayer} aria-hidden="true">
          <defs>
            <marker
              id={arrowMarkerId}
              viewBox="0 0 8 8"
              markerWidth="8"
              markerHeight="8"
              refX="6.8"
              refY="4"
              orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" className={styles.pairsConnectorArrow} />
            </marker>
          </defs>
          {connectorPaths.map((connector) => (
            <path
              key={connector.id}
              d={connector.d}
              markerEnd={`url(#${arrowMarkerId})`}
              className={`${styles.pairsConnector} ${
                hasRevealedSolutions ? styles.pairsConnectorConfirmed : ''
              }`}
            />
          ))}
        </svg>

        <div className={styles.pairsBoard}>
          <section className={styles.pairsColumn}>
            <h4 className={styles.pairsColumnTitle}>Кыргызча</h4>
            <ul className={styles.pairsList} onScroll={onBoardScroll}>
              {items.map((item, index) => {
                const pairId = normalizeId(item?.pairId);
                const isSelected = Boolean(pairId && selectedPairId === pairId);
                const isLinked = Boolean(pairId && assignments[pairId]);
                const isCorrect = Boolean(pairId && confirmedAnswers[pairId]?.correct);
                const isWrong = Boolean(pairId && reviewResults[pairId]?.correct === false);

                const pairClassName = [
                  styles.pairsButton,
                  styles.pairsLeftButton,
                  isSelected ? styles.pairsLeftButtonSelected : '',
                  isCorrect ? styles.pairsLeftButtonCorrect : '',
                  isWrong ? styles.pairsLeftButtonWrong : '',
                  isLinked && !isCorrect && !isWrong ? styles.pairsLeftButtonLinked : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li key={pairId ?? `pair-item-${index}`}>
                    <button
                      ref={(node) => registerLeftNode(pairId, node)}
                      type="button"
                      className={pairClassName}
                      onClick={() => onSelectPairItem(pairId)}
                      disabled={!pairId || hasRevealedSolutions || hasCheckedAnswers || isDisabled}>
                      <span className={styles.pairsMainText}>{item.leftText || '—'}</span>
                      {hasRevealedSolutions && isLinked ? (
                        <span className={styles.pairsStateText}>Ответ</span>
                      ) : isCorrect ? (
                        <span className={styles.pairsStateText}>Верно</span>
                      ) : isWrong ? (
                        <span className={styles.pairsStateText}>Ошибка</span>
                      ) : null}
                      {!hasRevealedSolutions && !isCorrect && !isWrong && isLinked ? (
                        <span className={styles.pairsStateText}>Связано</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.pairsColumn}>
            <h4 className={styles.pairsColumnTitle}>Варианты (русский)</h4>
            <ul className={styles.pairsList} onScroll={onBoardScroll}>
              {options.map((option, index) => {
                const optionId = normalizeId(option?.optionId);
                const ownerPairId = optionId ? optionOwners.get(optionId) ?? null : null;
                const {
                  isUsed,
                  isUsedBySelectedPair,
                  isLockedByAnotherPair,
                  isCorrect,
                  isWrong,
                } =
                  getOptionUsageState({
                    ownerPairId,
                    selectedPairId,
                    confirmedAnswers,
                    reviewResults,
                  });

                const optionClassName = [
                  styles.pairsButton,
                  styles.pairsOptionButton,
                  selectedPairId && !hasCheckedAnswers ? styles.pairsOptionButtonReady : '',
                  isUsed && !isCorrect && !isWrong ? styles.pairsOptionButtonUsed : '',
                  isUsedBySelectedPair ? styles.pairsOptionButtonSelected : '',
                  isCorrect ? styles.pairsOptionButtonLocked : '',
                  isWrong ? styles.pairsOptionButtonWrong : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li key={optionId ?? `option-item-${index}`}>
                    <button
                      ref={(node) => registerRightNode(optionId, node)}
                      type="button"
                      className={optionClassName}
                      onClick={() => onAssignOption(optionId)}
                      disabled={
                        !optionId ||
                        !selectedPairId ||
                        hasRevealedSolutions ||
                        hasCheckedAnswers ||
                        isLockedByAnotherPair ||
                        isDisabled
                      }>
                      <span className={styles.pairsMainText}>{option.text || '—'}</span>
                      {hasRevealedSolutions && isUsed ? (
                        <span className={styles.pairsStateText}>Ответ</span>
                      ) : isCorrect ? (
                        <span className={styles.pairsStateText}>Верно</span>
                      ) : isWrong ? (
                        <span className={styles.pairsStateText}>Ошибка</span>
                      ) : isUsed ? (
                        <span className={styles.pairsStateText}>
                          {isUsedBySelectedPair ? 'Связано' : 'Занято'}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PairsTask;
