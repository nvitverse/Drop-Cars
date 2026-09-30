// utils/firebaseClient.ts
//
// Firebase JS SDK (modular v9+), same choice and same reasoning as the
// Customer App's utils/firebaseClient.ts: no EAS dev-client / custom
// native build pipeline confirmed for Phone Auth's native reliability, so
// @react-native-firebase/auth (a native module) isn't used here either -
// this works in Expo web/Expo Go today. See utils/phoneAuth.ts for the
// exact native-platform caveat.
//
// Config comes from EXPO_PUBLIC_* env vars (see .env.example) - never
// hardcode real project keys here.
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
