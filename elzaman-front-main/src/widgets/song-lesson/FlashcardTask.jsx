import { normalizeId } from '@/shared/lib/normalizeId';
import styles from './songLesson.module.css';

function FlashcardTask({ cards, revealedCards, onToggleCard }) {
  return (
    <div className={styles.taskPane}>
      <p className={styles.taskEyebrow}>Задание 1</p>
      <h3 className={styles.taskTitle}>Нажимай и запоминай карточки</h3>
      <p className={styles.taskSubtitle}>
        Открой каждую карточку, чтобы увидеть перевод, затем нажми ОК для перехода к заданию 2.
      </p>

      {cards.length > 0 ? (
        <ul className={styles.taskCardsGrid}>
          {cards.map((card, index) => {
            const cardId = normalizeId(card.id) ?? `task-card-${index}`;
            const isRevealed = Boolean(revealedCards[cardId]);

            return (
              <li key={cardId}>
                <article className={styles.taskCard}>
                  <p className={styles.taskCardHint}>Нажми, чтобы перевернуть</p>

                  <div
                    className={styles.taskFlipArea}
                    role="button"
                    tabIndex={0}
                    onClick={() => onToggleCard(cardId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onToggleCard(cardId);
                      }
                    }}>
                    <div
                      className={`${styles.taskFlipInner} ${
                        isRevealed ? styles.taskFlipInnerFlipped : ''
                      }`}>
                      <div className={`${styles.taskFace} ${styles.taskFaceFront}`}>
                        <p className={styles.taskFaceLabel}>KG</p>
                        <p className={styles.taskFaceText}>{card.kgText || '—'}</p>
                      </div>
                      <div className={`${styles.taskFace} ${styles.taskFaceBack}`}>
                        <p className={styles.taskFaceLabel}>RU</p>
                        <p className={styles.taskFaceText}>{card.ruText || '—'}</p>
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.taskEmpty}>
          Для этого трека ещё нет подготовленных карточек.
        </p>
      )}
    </div>
  );
}

export default FlashcardTask;
