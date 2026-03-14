import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = 'vibelink:draft:';
const DEBOUNCE_MS = 500;

export function useDraft(sessionId: string) {
  const [draft, setDraftState] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // load draft on mount
  useEffect(() => {
    mountedRef.current = true;
    const key = `${DRAFT_PREFIX}${sessionId}`;

    AsyncStorage.getItem(key).then((value) => {
      if (mountedRef.current && value) {
        setDraftState(value);
      }
    });

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId]);

  const setDraft = useCallback((text: string) => {
    setDraftState(text);

    // debounced persist
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const key = `${DRAFT_PREFIX}${sessionId}`;
      if (text.trim()) {
        AsyncStorage.setItem(key, text);
      } else {
        AsyncStorage.removeItem(key);
      }
    }, DEBOUNCE_MS);
  }, [sessionId]);

  // clear draft helper (call after sending)
  const clearDraft = useCallback(() => {
    setDraftState('');
    if (timerRef.current) clearTimeout(timerRef.current);
    const key = `${DRAFT_PREFIX}${sessionId}`;
    AsyncStorage.removeItem(key);
  }, [sessionId]);

  return { draft, setDraft, clearDraft };
}
