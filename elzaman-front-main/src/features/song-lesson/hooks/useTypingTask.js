import { useCallback, useMemo, useRef, useState } from 'react';
import { normalizeId } from '@/shared/lib/normalizeId';
import { areEquivalentText } from '@/features/song-lesson/lib/typingLogic';

export function useTypingTask() {
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [inputs, setInputs] = useState({});
  const [results, setResults] = useState({});
  const [stats, setStats] = useState({ checks: 0, errors: 0 });
  const wrongRowsRef = useRef(new Set());

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
    setStats({ checks: 0, errors: 0 });
    wrongRowsRef.current = new Set();
  }, []);

  const resetState = useCallback(() => {
    setSessionId(null);
    setRows([]);
    setInputs({});
    setResults({});
    setStats({ checks: 0, errors: 0 });
    wrongRowsRef.current = new Set();
  }, []);

  // Check all answers, returns { nextResults, allCorrect, newErrors, nextStats }
  const checkAllAnswers = useCallback(() => {
    const nextResults = rows.reduce((accumulator, row) => {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) return accumulator;
      const typedText = inputs[rowId] ?? '';
      accumulator[rowId] = areEquivalentText(typedText, row.expectedKg);
      return accumulator;
    }, {});

    setResults(nextResults);

    let newErrors = 0;
    for (const row of rows) {
      const rowId = normalizeId(row?.rowId);
      if (!rowId) continue;
      if (nextResults[rowId] === false && !wrongRowsRef.current.has(rowId)) {
        wrongRowsRef.current.add(rowId);
        newErrors += 1;
      }
    }

    const nextStats = {
      checks: stats.checks + 1,
      errors: stats.errors + newErrors,
    };
    setStats(nextStats);

    const allCorrect = rows.every((row) => {
      const rowId = normalizeId(row?.rowId);
      return rowId ? nextResults[rowId] === true : false;
    });

    return { nextResults, allCorrect, newErrors, nextStats };
  }, [inputs, rows, stats]);

  return {
    sessionId,
    rows,
    inputs,
    results,
    correctCount,
    stats,
    onInputChange,
    initSession,
    resetState,
    checkAllAnswers,
  };
}
