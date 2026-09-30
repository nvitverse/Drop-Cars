// utils/phoneAuth.ts
//
// Firebase Phone Auth via the JS SDK's invisible-reCAPTCHA flow. This is
// reliably supported on WEB ONLY - the JS SDK's RecaptchaVerifier needs a
// real DOM element/iframe to render its challenge, which doesn't exist in
// a native iOS/Android runtime. On native, Google's own guidance is to use
// @react-native-firebase/auth (a native module) instead, which needs an
// EAS dev-client build - infra this app doesn't have yet (no eas.json).
//
// Rather than ship code that silently fails on native, isPhoneAuthAvailable()
// gates the call sites so the UI shows an honest "not available on this
// build yet, use Mobile Number + Password" message on native - the exact
// same honest-failure pattern this app already uses for loginWithEmail/
// loginWithGoogle before they were wired to a real backend.
import { Platform } from 'react-native';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebaseClient';

export function isPhoneAuthAvailable(): boolean {
  return Platform.OS === 'web' && isFirebaseConfigured();
}

let _recaptchaVerifier: RecaptchaVerifier | null = null;

/** Must be called after the container `<div id={containerId}>` (web only)
 * has actually mounted - pass the id of an invisible/hidden View's DOM
 * node. Re-uses one verifier instance across calls (Firebase's own
 * recommendation - creating a new one per OTP request leaks reCAPTCHA
 * widget instances). */
function getRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (!_recaptchaVerifier) {
    _recaptchaVerifier = new RecaptchaVerifier(getFirebaseAuth(), containerId, { size: 'invisible' });
  }
  return _recaptchaVerifier;
}

let _pendingConfirmation: ConfirmationResult | null = null;

/** Step 1: send the OTP. `phoneNumber` must be E.164 (+91XXXXXXXXXX) -
 * callers pass the bare 10-digit number, this prefixes +91 (matches this
 * backend's India-only phone format everywhere else in the codebase). */
export async function sendPhoneOtp(bareTenDigitNumber: string, recaptchaContainerId: string): Promise<void> {
  if (!isPhoneAuthAvailable()) {
    throw new Error('Phone sign-in isn’t available on this build yet. Please use Mobile Number + Password.');
  }
  const verifier = getRecaptchaVerifier(recaptchaContainerId);
  const auth = getFirebaseAuth();
  _pendingConfirmation = await signInWithPhoneNumber(auth, `+91${bareTenDigitNumber}`, verifier);
}

/** Step 2: confirm the 6-digit code the user received, returns the
 * Firebase ID token to send to POST /api/auth/firebase/verify. */
export async function confirmPhoneOtp(code: string): Promise<string> {
  if (!_pendingConfirmation) {
    throw new Error('No OTP was requested yet. Please request a code first.');
  }
  const result = await _pendingConfirmation.confirm(code);
  _pendingConfirmation = null;
  return result.user.getIdToken();
}
