import { useState } from 'react';
import { createTrackPairsTemplates } from '@/entities/pairs-game/api';
import { createTrackFlashcardTemplates } from '@/entities/song/api';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import { normalizeId } from '@/shared/lib/normalizeId';
import SongPicker from './SongPicker';
import HelpGuideModal from './HelpGuideModal';
import { HELP_FLASHCARDS, HELP_PAIRS } from '../../pages/admin/lib/adminHelpContent';
import { parseIntegerInput, parseTemplateRows } from '../../pages/admin/lib/adminHelpers';
import styles from '../../pages/admin/adminConsolePage.module.css';

const LEVEL_OPTIONS = [
  { value: '1', label: 'Level 1' },
  { value: '2', label: 'Level 2' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: '5', label: 'Level 5' },
];

const EXERCISE_OPTIONS = [
  { value: '2', label: 'Exercise 2' },
  { value: '3', label: 'Exercise 3' },
  { value: '4', label: 'Exercise 4' },
  { value: '5', label: 'Exercise 5' },
];

function ExercisesTab({ token, songsCatalog, showToast, onUnauthorizedError }) {
  const [contentError, setContentError] = useState('');
  const [helpGuide, setHelpGuide] = useState(null);

  const [flashcardsForm, setFlashcardsForm] = useState({
    songId: '',
    level: '1',
    rows: '',
  });
  const [pairsForm, setPairsForm] = useState({
    songId: '',
    exerciseIdx: '2',
    rows: '',
  });

  const [isSavingFlashcards, setIsSavingFlashcards] = useState(false);
  const [isSavingPairs, setIsSavingPairs] = useState(false);

  const isMutating = isSavingFlashcards || isSavingPairs;

  const onCreateFlashcards = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(flashcardsForm.songId);
    const level = parseIntegerInput(flashcardsForm.level);
    const items = parseTemplateRows(flashcardsForm.rows);

    if (!trackId) {
      setContentError('Please select a song.');
      return;
    }
    if (!Number.isInteger(level) || level < 1) {
      setContentError('Please select a valid level.');
      return;
    }
    if (items.length === 0) {
      setContentError('Enter at least one line in the format: word - translation');
      return;
    }

    setIsSavingFlashcards(true);
    setContentError('');

    try {
      const result = await createTrackFlashcardTemplates({ token, trackId, level, items });
      setFlashcardsForm((prev) => ({ ...prev, rows: '' }));
      showToast(`Flashcards saved: ${result?.createdCount ?? items.length} cards created.`);
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingFlashcards(false);
    }
  };

  const onCreatePairs = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(pairsForm.songId);
    const exerciseIdx = parseIntegerInput(pairsForm.exerciseIdx);
    const items = parseTemplateRows(pairsForm.rows);

    if (!trackId) {
      setContentError('Please select a song.');
      return;
    }
    if (!Number.isInteger(exerciseIdx) || exerciseIdx < 2) {
      setContentError('Please select a valid exercise number.');
      return;
    }
    if (items.length === 0) {
      setContentError('Enter at least one line in the format: word - translation');
      return;
    }

    setIsSavingPairs(true);
    setContentError('');

    try {
      const result = await createTrackPairsTemplates({ token, trackId, exerciseIdx, items });
      setPairsForm((prev) => ({ ...prev, rows: '' }));
      showToast(`Pairs saved: ${result?.createdCount ?? items.length} pairs created.`);
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingPairs(false);
    }
  };

  return (
    <>
      {contentError ? <p className={styles.errorText}>{contentError}</p> : null}

      <div className={styles.contentGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Flashcards (Exercise 1) */}
        <article className={styles.contentCard}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.actionTitle}>Flashcards (Exercise 1)</h4>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => setHelpGuide(HELP_FLASHCARDS)}
              title="How to create flashcards"
            >
              ?
            </button>
          </div>
          <p className={styles.actionDescription}>
            Word cards shown to learners. Kyrgyz on front, Russian on back.
          </p>

          <form className={styles.formRow} onSubmit={onCreateFlashcards}>
            <SongPicker
              songs={songsCatalog}
              value={flashcardsForm.songId}
              onChange={(val) => setFlashcardsForm((prev) => ({ ...prev, songId: val }))}
              disabled={isMutating}
              id="fc-song"
            />

            <label className={styles.fieldLabel} htmlFor="fc-level">Difficulty level</label>
            <select
              id="fc-level"
              className={styles.select}
              value={flashcardsForm.level}
              onChange={(e) => setFlashcardsForm((prev) => ({ ...prev, level: e.target.value }))}
              disabled={isMutating}
            >
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <label className={styles.fieldLabel} htmlFor="fc-rows">
              Card pairs (one per line)
            </label>
            <textarea
              id="fc-rows"
              className={styles.textarea}
              placeholder={'салам - привет\nырахмат - спасибо\nжакшы - хороший'}
              value={flashcardsForm.rows}
              onChange={(e) => setFlashcardsForm((prev) => ({ ...prev, rows: e.target.value }))}
              disabled={isMutating}
              rows={6}
            />

            <button type="submit" className={styles.actionButton} disabled={isMutating}>
              {isSavingFlashcards ? 'Saving...' : 'Save flashcards'}
            </button>
          </form>
        </article>

        {/* Pairs Game (Exercises 2-5) */}
        <article className={styles.contentCard}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.actionTitle}>Pairs Matching Game (Exercises 2-5)</h4>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => setHelpGuide(HELP_PAIRS)}
              title="How to create pairs"
            >
              ?
            </button>
          </div>
          <p className={styles.actionDescription}>
            Matching game where learners connect Kyrgyz words with Russian translations.
          </p>

          <form className={styles.formRow} onSubmit={onCreatePairs}>
            <SongPicker
              songs={songsCatalog}
              value={pairsForm.songId}
              onChange={(val) => setPairsForm((prev) => ({ ...prev, songId: val }))}
              disabled={isMutating}
              id="pairs-song"
            />

            <label className={styles.fieldLabel} htmlFor="pairs-exercise">Exercise number</label>
            <select
              id="pairs-exercise"
              className={styles.select}
              value={pairsForm.exerciseIdx}
              onChange={(e) => setPairsForm((prev) => ({ ...prev, exerciseIdx: e.target.value }))}
              disabled={isMutating}
            >
              {EXERCISE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <label className={styles.fieldLabel} htmlFor="pairs-rows">
              Word pairs (one per line)
            </label>
            <textarea
              id="pairs-rows"
              className={styles.textarea}
              placeholder={'салам - привет\nырахмат - спасибо\nжакшы - хороший'}
              value={pairsForm.rows}
              onChange={(e) => setPairsForm((prev) => ({ ...prev, rows: e.target.value }))}
              disabled={isMutating}
              rows={6}
            />

            <button type="submit" className={styles.actionButton} disabled={isMutating}>
              {isSavingPairs ? 'Saving...' : 'Save pairs'}
            </button>
          </form>
        </article>
      </div>

      <HelpGuideModal isOpen={Boolean(helpGuide)} onClose={() => setHelpGuide(null)} guide={helpGuide} />
    </>
  );
}

export default ExercisesTab;
