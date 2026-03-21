import { useContext } from 'react';
import { ProgressContext } from '@/app/providers/progressContext';

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider');
  return ctx;
}
