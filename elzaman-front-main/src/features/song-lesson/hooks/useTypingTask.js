import { useCallback, useMemo, useState } from 'react';
import { normalizeId } from '@/shared/lib/normalizeId';
import { areEquivalentText } from '@/features/song-lesson/lib/typingLogic';

export function useTypingTask() {
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [inputs, setInputs] = useState({});
  const [results, setResults] = useState({});

  const correctCount = useMemo(
    () =>
      rows.reduce((count, row) => {
        const rowId = normalizeId(row?.rowId);
        if (!rowId) return count;
        return results[rowId] === true ? count + 1 : count;
      }, 0),
    [rows, results],
  );

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
  }, []);

  const initSession = useCallback((newSessionId, newRows) => {
    setSessionId(newSessionId);
    setRows(newRows);
    setInputs({});
    setResults({});
  }, []);

  const resetState = useCallback(() => {
    setSessionId(null);
    setRows([]);
    setInputs({});
    setResults({});
  }, []);

  // Check all answers, returns { nextResults, allCorrect }
  const checkAllAnswers = useCallback(() => {
    const nextResults = rows.reduce((accumulator, row) => {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) return accumulator;
      const typedText = inputs[rowId] ?? '';
      accumulator[rowId] = areEquivalentText(typedText, row.expectedKg);
      return accumulator;
    }, {});

    setResults(nextResults);

    const allCorrect = rows.every((row) => {
      const rowId = normalizeId(row?.rowId);
      return rowId ? nextResults[rowId] === true : false;
    });

    return { nextResults, allCorrect };
  }, [inputs, rows]);

  return {
    sessionId,
    rows,
    inputs,
    results,
    correctCount,
    onInputChange,
    initSession,
    resetState,
    checkAllAnswers,
  };
}
