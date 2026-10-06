import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '@/locales/en.json';
import ta from '@/locales/ta.json';
import te from '@/locales/te.json';
import hi from '@/locales/hi.json';

const LANGUAGE_STORAGE_KEY = 'appLanguage';

export type LanguageCode = 'en' | 'ta' | 'te' | 'hi';

// Each language's own name, written in its own script (standard convention
// for a language picker) - also embedded per-locale as `languageNames` in
// case a screen wants to read it straight from the active dictionary.
export const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'hi', label: 'हिन्दी' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dictionaries: Record<LanguageCode, any> = { en, ta, te, hi };

function isLanguageCode(value: string | null): value is LanguageCode {
  return value === 'en' || value === 'ta' || value === 'te' || value === 'hi';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNested(obj: any, keyPath: string): any {
  return keyPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  /** Flat-key string lookup with optional {placeholder} interpolation, e.g. t('booking.acceptFor', { amount: 450 }). */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Raw dictionary for the current language - use for non-string shapes like welcome.steps (an array). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  translations: any;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');

  // Restore the saved language choice on launch (defaults to English if none saved).
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguageCode(saved)) {
          setLanguageState(saved);
        }
      } catch {
        // Ignore storage errors; keep the default English.
      }
    })();
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
  };

  const translations = dictionaries[language] || dictionaries.en;

  const t = (key: string, params?: Record<string, string | number>): string => {
    let value = getNested(translations, key);
    if (value === undefined) {
      // Fall back to English so a missing key never renders blank.
      value = getNested(dictionaries.en, key);
    }
    if (typeof value !== 'string') {
      return key;
    }
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = (value as string).replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      });
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
