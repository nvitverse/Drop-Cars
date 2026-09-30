type Listener = (reason: string) => void;

const listeners = new Set<Listener>();

export function emitSessionExpired(reason: string = 'Session expired'): void {
  for (const l of Array.from(listeners)) {
    try { l(reason); } catch {}
  }
}

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}


