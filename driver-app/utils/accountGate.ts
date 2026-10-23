// The server answers 403 with a bracketed code when an account must not use the app:
//   [ACCOUNT_BLOCKED]                 blocked for good / switched off by the office
//   [ACCOUNT_SUSPENDED_SUBSCRIPTION]  free Standard period + grace over, subscription needed
// Old app versions just show the readable text in front of the code; this version shows one plain screen instead.
import { router } from 'expo-router';

export type GateKind = 'blocked' | 'subscription';

let active: GateKind | null = null;
let lastAt = 0;

/** 'blocked' | 'subscription' when this axios error is one of the two account answers, else null. */
export function gateKindOf(error: any): GateKind | null {
  const status = error?.response?.status;
  if (status !== 403) return null;
  const detail = String(error?.response?.data?.detail ?? '');
  const header = String(error?.response?.headers?.['x-account-status'] ?? '').toUpperCase();
  if (detail.includes('[ACCOUNT_SUSPENDED_SUBSCRIPTION]') || header === 'SUSPENDED') return 'subscription';
  if (detail.includes('[ACCOUNT_BLOCKED]') || header === 'BLOCKED') return 'blocked';
  return null;
}

/** Show the account screen once (not again on every failing call while it is open). */
export function routeToGate(kind: GateKind): void {
  const now = Date.now();
  if (active === kind && now - lastAt < 15000) return;
  active = kind;
  lastAt = now;
  try {
    router.replace({ pathname: '/account-blocked', params: { kind } } as any);
  } catch {
    // router not ready yet - the next failing call tries again
    active = null;
  }
}

export function clearAccountGate(): void {
  active = null;
  lastAt = 0;
}
