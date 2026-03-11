import { normalizeId } from '@/shared/lib/normalizeId';
import { getOptionUsageState } from '@/features/song-lesson/lib/pairsLogic';
import styles from './songLesson.module.css';

function PairsTask({
  taskNumber,
  title,
  items,
  options,
  resolvedCount,
  linkedCount,
  allCorrect,
  accuracy,
  stats,
  selectedPairId,
  assignments,
  optionOwners,
  wrongPairs,
  connectorPaths,
  confirmedAnswers,
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
        {resolvedCount}/{items.length || 0} верно · {linkedCount}/{items.length || 0} связано
      </p>

      <p className={styles.pairsHint}>
        {allCorrect
          ? successMessage
          : selectedPairId
          ? 'Выбери правильный вариант, затем нажми «Проверить».'
          : 'Выбери слово слева, чтобы соединить с переводом справа.'}
      </p>
      <p className={styles.pairsMeta}>
        Точность: {accuracy}% · Ошибки: {stats.errors} · Проверки: {stats.checks}
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
                confirmedAnswers[connector.pairId]?.correct ? styles.pairsConnectorConfirmed : ''
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
                const isCorrect = Boolean(pairId && confirmedAnswers[pairId]?.correct);
                const isWrong = Boolean(pairId && wrongPairs[pairId]);
                const isLinked = Boolean(pairId && assignments[pairId] && !isCorrect);

                const pairClassName = [
                  styles.pairsButton,
                  styles.pairsLeftButton,
                  isSelected ? styles.pairsLeftButtonSelected : '',
                  isCorrect ? styles.pairsLeftButtonCorrect : '',
                  isWrong ? styles.pairsLeftButtonWrong : '',
                  isLinked ? styles.pairsLeftButtonLinked : '',
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
                      disabled={!pairId || isCorrect || isDisabled}>
                      <span className={styles.pairsMainText}>{item.leftText || '—'}</span>
                      {isCorrect ? <span className={styles.pairsStateText}>Верно</span> : null}
                      {isWrong ? <span className={styles.pairsStateText}>Ещё раз</span> : null}
                      {!isCorrect && !isWrong && isLinked ? (
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
                const { isUsed, isUsedBySelectedPair, isLocked, isLockedByAnotherPair } =
                  getOptionUsageState({
                    ownerPairId,
                    selectedPairId,
                    confirmedAnswers,
                  });

                const optionClassName = [
                  styles.pairsButton,
                  styles.pairsOptionButton,
                  selectedPairId ? styles.pairsOptionButtonReady : '',
                  isUsed ? styles.pairsOptionButtonUsed : '',
                  isUsedBySelectedPair ? styles.pairsOptionButtonSelected : '',
                  isLocked ? styles.pairsOptionButtonLocked : '',
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
                      disabled={!optionId || !selectedPairId || isLockedByAnotherPair || isDisabled}>
                      <span className={styles.pairsMainText}>{option.text || '—'}</span>
                      {isUsed ? (
                        <span className={styles.pairsStateText}>
                          {isLocked ? 'Locked' : isUsedBySelectedPair ? 'Linked' : 'Used'}
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
