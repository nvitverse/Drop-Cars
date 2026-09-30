// utils/firebaseClient.ts
//
// Firebase JS SDK (modular v9+), not @react-native-firebase. This app has
// no EAS dev-client / custom native build pipeline set up yet (no
// eas.json, confirmed) - @react-native-firebase/auth is a native module
// that cannot run in Expo Go and would silently crash on "native module
// not found" the moment anyone opens this app without a custom dev
// client. The JS SDK works today in Expo web (this session's actual
// preview/testing surface) and in Expo Go for Google Sign-In; only Phone
// Auth's reCAPTCHA step is web-reliable without a native module - see
// utils/phoneAuth.ts's module docstring for the exact native-platform
// caveat and what migrating to @react-native-firebase would take.
//
// All values below are read from EXPO_PUBLIC_* env vars (Expo inlines
// EXPO_PUBLIC_-prefixed vars into the client bundle at build time - see
// .env.example) so no real secret is hardcoded here. isFirebaseConfigured()
// lets every call site fail with a clear, honest message instead of a
// cryptic Firebase SDK error when the project hasn't been created yet.
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

/** Lazy init - only actually calls initializeApp() the first time
 * something needs it, so importing this module never throws just because
 * the app hasn't opened a sign-in screen yet. */
export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured yet. Set EXPO_PUBLIC_FIREBASE_* env vars ' +
      '(see .env.example) from Firebase Console -> Project Settings -> General -> Your apps.'
    );
  }
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  if (!_auth) {
    _auth = getAuth(_app);
  }
  return _auth;
}
