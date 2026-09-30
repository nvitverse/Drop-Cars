// Server-driven app text: the first-login cards and the Terms & Conditions are edited by the admin (Admin App > App Content)
// and served by GET /api/public/app-content/{key}?lang=xx. The last copy is cached on the phone so the screens work offline,
// and the built-in locale text is the final fallback - a network problem never leaves the driver with an empty screen.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import axiosInstance from '@/app/api/axiosInstance';

export interface OnboardingStep {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  description: string;
}
export interface OnboardingContent { version: number; steps: OnboardingStep[] }
export interface TermsContent { version: number; title: string; body: string; summary?: string; full_url?: string; lang_used?: string }

export const HAS_SEEN_WELCOME_KEY = 'hasSeenDriverWelcome';
export const WELCOME_SEEN_VERSION_KEY = 'welcomeSeenVersion';

const cacheKey = (key: string, lang: string) => `@app_content_${key}_${lang}`;

export async function getCachedContent<T>(key: string, lang: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(key, lang));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchContent<T>(key: string, lang: string, timeoutMs = 7000): Promise<T | null> {
  try {
    const base = axiosInstance.defaults.baseURL || '';
    const res = await axios.get(`${base}/api/public/app-content/${key}`, { params: { lang }, timeout: timeoutMs });
    if (res.data && typeof res.data === 'object') {
      AsyncStorage.setItem(cacheKey(key, lang), JSON.stringify(res.data)).catch(() => {});
      return res.data as T;
    }
  } catch {
    // offline / server busy - the cached copy is used
  }
  return getCachedContent<T>(key, lang);
}

/** Cached copy first (instant), then the fresh one. `fallback` is used until either arrives. */
export function useAppContent<T>(key: string, lang: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    getCachedContent<T>(key, lang).then((c) => { if (alive && c) setData((prev) => prev ?? c); });
    fetchContent<T>(key, lang).then((c) => { if (alive && c) setData(c); });
    return () => { alive = false; };
  }, [key, lang]);
  return data;
}

/** Show the first-login cards to a new driver - and again after the admin publishes a new version (new terms / safety rules). */
export async function needsWelcome(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(HAS_SEEN_WELCOME_KEY).catch(() => null);
  if (seen !== 'true') return true;
  const seenVersion = parseInt((await AsyncStorage.getItem(WELCOME_SEEN_VERSION_KEY).catch(() => null)) || '0', 10) || 0;
  const latest = await fetchContent<OnboardingContent>('driver_onboarding', 'en', 4000);
  return !!latest && latest.version > seenVersion;
}

export async function markWelcomeSeen(version: number | undefined): Promise<void> {
  await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true').catch(() => {});
  if (version) await AsyncStorage.setItem(WELCOME_SEEN_VERSION_KEY, String(version)).catch(() => {});
}
