import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Header / badge numbers that must never flash "0" while a screen is still loading.
 * - On mount the last real numbers (saved on this phone) are put back at once and `ready` becomes true.
 * - If there is nothing saved yet (first launch), `ready` stays false until the first fetch ends - show a shimmer until then.
 * - Call `markFresh()` when a fetch of these numbers succeeded; pass `false` when that response was filtered/searched and must
 *   not overwrite the remembered overall numbers.
 */
export function useRememberedCounts(
  key: string,
  values: Record<string, any>,
  setters: Record<string, (v: any) => void>,
) {
  const [ready, setReady] = useState(false);
  const fresh = useRef(false);
  const settersRef = useRef(setters);
  settersRef.current = setters;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw || !alive || fresh.current) return;
        const saved = JSON.parse(raw);
        Object.keys(settersRef.current).forEach((k) => {
          if (saved[k] !== undefined) settersRef.current[k](saved[k]);
        });
        setReady(true);
      } catch {
        /* nothing saved yet */
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  const snapshot = JSON.stringify(values);
  useEffect(() => {
    if (!fresh.current) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(key, snapshot).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [key, snapshot]);

  const markFresh = useCallback((cacheable: boolean = true) => {
    if (cacheable) fresh.current = true;
    setReady(true);
  }, []);

  return { ready, markFresh };
}
