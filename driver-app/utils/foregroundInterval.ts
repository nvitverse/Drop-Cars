import { AppState } from 'react-native';

/**
 * setInterval that only ticks while the app is on screen. Every tick that reaches the server costs money, and while the
 * app is in the background nobody is looking at the result (push notifications cover new bookings / chat messages).
 * When the app comes back to the front it refreshes once straight away, then carries on.
 * Returns the cleanup function - use it exactly like clearInterval.
 */
export function setForegroundInterval(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    if (timer) return;
    timer = setInterval(fn, ms);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  if (AppState.currentState === 'active') start();

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      fn();
      start();
    } else {
      stop();
    }
  });

  return () => {
    stop();
    sub.remove();
  };
}
