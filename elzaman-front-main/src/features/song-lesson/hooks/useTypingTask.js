import { useCallback, useState } from 'react';
import { normalizeId } from '@/shared/lib/normalizeId';

export function useTypingTask() {
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [inputs, setInputs] = useState({});
  const [hasReviewedAnswers, setHasReviewedAnswers] = useState(false);

  const onInputChange = useCallback((rowId, value) => {
    const normalizedRowId = normalizeId(rowId);
    if (!normalizedRowId) return;

    setInputs((previous) => ({
      ...previous,
      [normalizedRowId]: value,
    }));
    setHasReviewedAnswers(false);
  }, []);

  const initSession = useCallback((newSessionId, newRows) => {
    setSessionId(newSessionId);
    setRows(newRows);
    setInputs({});
    setHasReviewedAnswers(false);
  }, []);

  const resetState = useCallback(() => {
    setSessionId(null);
    setRows([]);
    setInputs({});
    setHasReviewedAnswers(false);
  }, []);

  const revealAnswers = useCallback(() => {
    setHasReviewedAnswers(true);
  }, []);

  return {
    sessionId,
    rows,
    inputs,
    hasReviewedAnswers,
    onInputChange,
    initSession,
    resetState,
    revealAnswers,
  };
}
