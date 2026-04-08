import { useCallback, useState } from 'react';
import { normalizeId } from '@/shared/lib/normalizeId';
import { areEquivalentText } from '@/features/song-lesson/lib/typingLogic';

export function useTypingTask() {
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [inputs, setInputs] = useState({});
  const [results, setResults] = useState({});
  const [hasReviewedAnswers, setHasReviewedAnswers] = useState(false);

  const onInputChange = useCallback((rowId, value) => {
    const normalizedRowId = normalizeId(rowId);
    if (!normalizedRowId) return;

    setInputs((previous) => ({
      ...previous,
      [normalizedRowId]: value,
    }));
    setResults((previous) => {
      if (!(normalizedRowId in previous)) return previous;
      const next = { ...previous };
      delete next[normalizedRowId];
      return next;
    });
    setHasReviewedAnswers(false);
  }, []);

  const initSession = useCallback((newSessionId, newRows) => {
    setSessionId(newSessionId);
    setRows(newRows);
    setInputs({});
    setResults({});
    setHasReviewedAnswers(false);
  }, []);

  const resetState = useCallback(() => {
    setSessionId(null);
    setRows([]);
    setInputs({});
    setResults({});
    setHasReviewedAnswers(false);
  }, []);

  const revealAnswers = useCallback(() => {
    const nextResults = rows.reduce((accumulator, row) => {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) return accumulator;
      const typedText = inputs[rowId] ?? '';
      accumulator[rowId] = areEquivalentText(typedText, row.expectedKg);
      return accumulator;
    }, {});

    setResults(nextResults);
    setHasReviewedAnswers(true);
    return nextResults;
  }, [inputs, rows]);

  return {
    sessionId,
    rows,
    inputs,
    results,
    hasReviewedAnswers,
    onInputChange,
    initSession,
    resetState,
    revealAnswers,
  };
}
