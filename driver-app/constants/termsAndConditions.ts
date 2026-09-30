// Shared Terms & Conditions text for the Driver Partner App.
//
// As of the 4-language pass, the actual English text lives in
// locales/en.json (terms.body) alongside its Tamil/Telugu/Hindi
// translations - WelcomeScreen.tsx and app/(tabs)/settings.tsx now read it
// via useLanguage().t('terms.body') so it switches with the app's language.
// TERMS_AND_CONDITIONS below is kept as a byte-for-byte re-export of the
// English copy for any other/legacy English-only consumer; it must stay in
// sync with locales/en.json (enforced by importing from it directly, not by
// hand-copying) so there is still exactly one place to edit the English
// legal text.
import en from '@/locales/en.json';

export const TERMS_AND_CONDITIONS: string = en.terms.body;
