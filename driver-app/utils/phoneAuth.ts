// utils/phoneAuth.ts
//
// Firebase Phone Auth via the JS SDK's invisible-reCAPTCHA flow - web-
// reliable only, same caveat as the Customer App's utils/phoneAuth.ts.
// isPhoneAuthAvailable() gates every call site so native shows the
// existing password-login screen instead of a broken/crashing flow.
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

// A given DOM element can only ever have ONE reCAPTCHA widget rendered
// into it for that element's lifetime - grecaptcha tracks this on the
// element itself, not on the RecaptchaVerifier JS object. verifier.clear()
// un-registers the JS side but does not reliably reset grecaptcha's own
// per-element bookkeeping (confirmed live: a second sendPhoneOtp() call
// against the *same still-mounted* container - e.g. tapping "Get OTP"
// again after an earlier failed attempt, or "Resend code" - failed with
// Firebase's "reCAPTCHA has already been rendered in this element", even
// though the old verifier had already been cleared). The only reliable
// fix is to never reuse the same DOM node twice: wipe the container's
// content before every fresh render, forcing grecaptcha to treat it as a
// brand new element each time.
function getRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (_recaptchaVerifier) {
    try {
      _recaptchaVerifier.clear();
    } catch {
      // already-detached/already-failed verifiers can throw on clear() -
      // safe to ignore, we're discarding it either way.
    }
    _recaptchaVerifier = null;
  }
  const containerEl = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (containerEl) {
    containerEl.innerHTML = '';
  }
  _recaptchaVerifier = new RecaptchaVerifier(getFirebaseAuth(), containerId, { size: 'invisible' });
  return _recaptchaVerifier;
}

let _pendingConfirmation: ConfirmationResult | null = null;

/** `bareTenDigitNumber` - this backend/app is India-only, always +91. */
export async function sendPhoneOtp(bareTenDigitNumber: string, recaptchaContainerId: string): Promise<void> {
  if (!isPhoneAuthAvailable()) {
    throw new Error('Phone sign-in isn’t available on this build yet. Please use Mobile Number + Password.');
  }
  // Always a fresh verifier - see getRecaptchaVerifier's comment. Cheap
  // enough to rebuild on every "Get OTP"/"Resend code" tap; reusing one is
  // what caused the "already been rendered" and "client element has been
  // removed" failures.
  const verifier = getRecaptchaVerifier(recaptchaContainerId);
  const auth = getFirebaseAuth();
  _pendingConfirmation = await signInWithPhoneNumber(auth, `+91${bareTenDigitNumber}`, verifier);
}

/** Returns the Firebase ID token to send to
 * POST /api/users/cardriver/firebase/verify. */
export async function confirmPhoneOtp(code: string): Promise<string> {
  if (!_pendingConfirmation) {
    throw new Error('No OTP was requested yet. Please request a code first.');
  }
  const result = await _pendingConfirmation.confirm(code);
  _pendingConfirmation = null;
  return result.user.getIdToken();
}
