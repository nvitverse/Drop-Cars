import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../app/api/api';

// One place that decides where a signed-in vendor goes next, so the sign-in screen, the app start-up and the "Check status" button
// can never disagree: PENDING -> waiting page, INACTIVE -> support page, ACTIVE -> terms (only when not accepted yet) -> app.
export type VendorStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';

export const TERMS_ACCEPTED_KEY = 'vendorTermsAcceptedVersion';

export function normaliseStatus(raw?: string | null): VendorStatus {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'ACTIVE') return 'ACTIVE';
  if (s === 'PENDING') return 'PENDING';
  return 'INACTIVE';
}

export async function fetchVendorStatus(): Promise<{ status: VendorStatus; name?: string; blockedReason?: string } | null> {
  try {
    const res = await api.get('/users/vendor-details/me');
    return { status: normaliseStatus(res.data?.account_status), name: res.data?.full_name };
  } catch {
    return null;
  }
}

export async function acceptedTermsVersion(): Promise<number> {
  try {
    return Number(await AsyncStorage.getItem(TERMS_ACCEPTED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export async function currentTermsVersion(): Promise<number> {
  try {
    const res = await api.get('/public/app-content/vendor_terms');
    return Number(res.data?.version) || 1;
  } catch {
    return 0; // cannot tell (offline): do not block a signed-in vendor
  }
}

/** Where to send an ACTIVE vendor: the terms page when the current version has not been accepted yet, otherwise the app. */
export async function routeForActiveVendor(): Promise<'/(terms)/terms' | '/(tabs)'> {
  const [accepted, current] = await Promise.all([acceptedTermsVersion(), currentTermsVersion()]);
  if (current > 0 && accepted < current) return '/(terms)/terms';
  return '/(tabs)';
}

export function statusPageParams(status: VendorStatus) {
  if (status === 'PENDING') return { pathname: '/(auth)/account-status' as const, params: { status: 'Pending' } };
  return { pathname: '/(auth)/account-status' as const, params: { status: 'INACTIVE' } };
}
