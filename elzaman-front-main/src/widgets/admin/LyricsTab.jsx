import { useState } from 'react';
import { tokenizeSongLyrics, upsertSongDictionaryBulk } from '@/entities/lyrics/api';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import { normalizeId } from '@/shared/lib/normalizeId';
import SongPicker from './SongPicker';
import HelpGuideModal from './HelpGuideModal';
import { HELP_LYRICS } from '../../pages/admin/lib/adminHelpContent';
import { parseDictionaryRows } from '../../pages/admin/lib/adminHelpers';
import styles from '../../pages/admin/adminConsolePage.module.css';

function LyricsTab({ token, songsCatalog, showToast, onUnauthorizedError }) {
  const [contentError, setContentError] = useState('');
  const [helpGuide, setHelpGuide] = useState(null);

  const [songId, setSongId] = useState('');
  const [dictionaryRows, setDictionaryRows] = useState('');

  const [isTokenizing, setIsTokenizing] = useState(false);
  const [isSavingDictionary, setIsSavingDictionary] = useState(false);

  const isMutating = isTokenizing || isSavingDictionary;

  const onTokenize = async () => {
    const trackId = normalizeId(songId);
    if (!trackId) {
      setContentError('Please select a song first.');
      return;
    }

    setIsTokenizing(true);
    setContentError('');

    try {
      const result = await tokenizeSongLyrics({ token, songId: trackId });
      const linesPart = typeof result?.linesCount === 'number' ? `${result.linesCount} lines` : 'lyrics lines';
      const tokensPart = typeof result?.tokensCount === 'number' ? `${result.tokensCount} tokens` : 'tokens';
      showToast(`Tokenization complete: ${linesPart}, ${tokensPart}.`);
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsTokenizing(false);
    }
  };

  const onSaveDictionary = async (event) => {
    event.preventDefault();

    const trackId = normalizeId(songId);
    const items = parseDictionaryRows(dictionaryRows);

    if (!trackId) {
      setContentError('Please select a song first.');
      return;
    }
    if (items.length === 0) {
      setContentError('Enter at least one line in the format: word - translation');
      return;
    }

    setIsSavingDictionary(true);
    setContentError('');

    try {
      const result = await upsertSongDictionaryBulk({
        token,
        songId: trackId,
        items,
        srcLang: 'kg',
        dstLang: 'ru',
      });
      setDictionaryRows('');
      showToast(`Dictionary saved: ${result?.upsertedCount ?? items.length} entries.`);
    } catch (error) {
      if (onUnauthorizedError(error)) return;
      setContentError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsSavingDictionary(false);
    }
  };

  return (
    <>
      <article className={styles.contentCard}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.actionTitle}>Lyrics & Dictionary</h4>
          <button
            type="button"
            className={styles.helpButton}
            onClick={() => setHelpGuide(HELP_LYRICS)}
            title="How to manage lyrics"
          >
            ?
          </button>
        </div>
        <p className={styles.actionDescription}>
          Tokenize song lyrics and add word-by-word translations.
        </p>

        {contentError ? <p className={styles.errorText}>{contentError}</p> : null}

        <div className={styles.stepFlow}>
          {/* Step 1 */}
          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h5 className={styles.stepTitle}>Select a song</h5>
              <SongPicker
                songs={songsCatalog}
                value={songId}
                onChange={setSongId}
                disabled={isMutating}
                label=""
                id="lyrics-song"
              />
            </div>
          </div>

          {/* Step 2 */}
          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <h5 className={styles.stepTitle}>Tokenize lyrics</h5>
              <p className={styles.actionDescription}>
                Splits the song lyrics into individual words. Must be done before adding dictionary entries.
              </p>
              <button
                type="button"
                className={styles.actionButton}
                onClick={onTokenize}
                disabled={isMutating || !songId}
              >
                {isTokenizing ? 'Tokenizing...' : 'Tokenize lyrics'}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <h5 className={styles.stepTitle}>Upload dictionary</h5>
              <p className={styles.actionDescription}>
                Add word translations. One entry per line, use " - " as separator.
              </p>
              <form className={styles.formRow} onSubmit={onSaveDictionary}>
                <textarea
                  className={styles.textarea}
                  placeholder={'жанымда - рядом со мной\nкелечек - будущее\nжүрөгүм - моё сердце'}
                  value={dictionaryRows}
                  onChange={(e) => setDictionaryRows(e.target.value)}
                  disabled={isMutating}
                  rows={6}
                />
                <button type="submit" className={styles.actionButton} disabled={isMutating || !songId}>
                  {isSavingDictionary ? 'Saving...' : 'Save dictionary'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </article>

      <HelpGuideModal isOpen={Boolean(helpGuide)} onClose={() => setHelpGuide(null)} guide={helpGuide} />
    </>
  );
}

export default LyricsTab;
