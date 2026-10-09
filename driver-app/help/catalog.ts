import { HelpEntry } from './types';

/**
 * Standardized Help & Error Catalog for Driver App.
 *
 * Tone principles:
 * - Natural spoken language (conversational Tamil / clear English).
 * - Honest, respectful, solution-oriented.
 * - Always gives clear, numbered next steps so drivers don't need to call the office.
 * - Under 90 chars on screen, full detail inside the HelpSheet popup.
 */
export const DRIVER_HELP_CATALOG: Record<string, HelpEntry> = {
  DC_ACCOUNT_INACTIVE: {
    code: 'DC_ACCOUNT_INACTIVE',
    title: 'Account is Inactive',
    what: 'You cannot go online or accept bookings right now.',
    why: 'One or more required vehicle or driver documents (RC, FC, Insurance, or DL) have expired or your account was temporarily paused by the office.',
    steps: [
      'Open Settings > Documents and check which document has an expired tag.',
      'Take a clear, well-lit photo of your renewed document.',
      'Upload the new photo — our team reviews it promptly during working hours.',
      'Once verified, your account will be activated automatically.',
    ],
    action: {
      label: 'Update Documents',
      route: '/documents-review',
    },
    severity: 'blocking',
    contact: true,
  },

  DC_DOC_REJECTED: {
    code: 'DC_DOC_REJECTED',
    title: 'Document Needs Re-upload',
    what: 'A submitted document could not be approved by the verification team.',
    why: 'Usually happens if the photo is blurry, edges are cut off, text is not readable, or the document has expired.',
    steps: [
      'Open the Documents screen to see the specific reason given by the verification team.',
      'Place your original document on a flat surface with good lighting.',
      'Ensure all four corners are visible without any camera flash glare.',
      'Upload the new photo and wait for verification.',
    ],
    action: {
      label: 'View Documents',
      route: '/documents-review',
    },
    severity: 'warning',
    contact: true,
  },

  DC_DOC_WAITING: {
    code: 'DC_DOC_WAITING',
    title: 'Document Verification in Progress',
    what: 'Your document is submitted and is waiting for office verification.',
    why: 'Our team verifies every document for passenger safety and compliance before activating full booking access.',
    steps: [
      'Verification usually takes 30 to 60 minutes during business hours (8 AM - 9 PM).',
      'You will receive a notification as soon as verification is complete.',
      'If it has been more than 2 hours, tap WhatsApp Support below with your Driver ID.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_NOT_VERIFIED: {
    code: 'DC_NOT_VERIFIED',
    title: 'Account Verification Pending',
    what: 'Your basic profile is active, but full verification is pending.',
    why: 'Certain premium outstation trips and high-value bookings require full identity verification (Aadhaar/DL verification).',
    steps: [
      'You can still accept standard local and eligible bookings.',
      'Complete your profile and upload any pending KYC documents.',
      'Contact support if you need priority verification for upcoming outstation trips.',
    ],
    action: {
      label: 'Check Profile',
      route: '/car-driver/profile',
    },
    severity: 'info',
    contact: true,
  },

  DC_INSUFFICIENT_WALLET: {
    code: 'DC_INSUFFICIENT_WALLET',
    title: 'Low Wallet Balance',
    what: 'You cannot accept this booking because your wallet balance is below the required minimum.',
    why: 'A small security commission hold is placed on your wallet when accepting a trip. This hold is settled after the trip is successfully completed.',
    steps: [
      'Open the Wallet tab to see your current balance and required deposit.',
      'Tap "Recharge Wallet" and choose UPI / GPay / PhonePe.',
      'Add sufficient balance to cover the commission hold.',
      'Return to the Bookings screen and accept the ride.',
    ],
    action: {
      label: 'Recharge Wallet',
      route: '/(tabs)/wallet',
    },
    severity: 'blocking',
    contact: false,
  },

  DC_PAYOUT_HELD: {
    code: 'DC_PAYOUT_HELD',
    title: 'Payout Request on Hold',
    what: 'Your withdrawal request is being processed or temporarily on hold.',
    why: 'Payouts are verified against completed trip records and banking details to prevent duplicate transfers.',
    steps: [
      'Payouts are processed daily in regular settlement cycles.',
      'Check that your bank account or UPI ID in Profile is accurate and active.',
      'If your payout has been pending for over 24 hours, contact our accounts team.',
    ],
    action: {
      label: 'Check Wallet',
      route: '/(tabs)/wallet',
    },
    severity: 'warning',
    contact: true,
  },

  DC_BOOKING_CANCELLED: {
    code: 'DC_BOOKING_CANCELLED',
    title: 'Booking Cancelled',
    what: 'This booking is no longer available.',
    why: 'The customer or the booking owner cancelled the ride before pickup.',
    steps: [
      'Any wallet commission held for this trip has been immediately refunded to your wallet.',
      'Refresh the bookings list to view newly available trips in your area.',
      'Keep your status "Online" to receive nearby trip notifications.',
    ],
    action: {
      label: 'View Available Trips',
      route: '/(tabs)',
    },
    severity: 'info',
    contact: false,
  },

  DC_BOOKING_ALREADY_TAKEN: {
    code: 'DC_BOOKING_ALREADY_TAKEN',
    title: 'Booking Already Accepted',
    what: 'Another nearby driver accepted this booking just before you.',
    why: 'Bookings are broadcasted to multiple qualified drivers in the zone; the first driver to tap Accept receives the assignment.',
    steps: [
      'No money was deducted from your wallet.',
      'Stay on the home screen to see fresh booking enquiries as soon as they drop.',
      'Ensure high-speed internet and sound alerts are on for fastest response.',
    ],
    action: {
      label: 'Back to Home',
      route: '/(tabs)',
    },
    severity: 'info',
    contact: false,
  },

  DC_ACCEPT_FAILED: {
    code: 'DC_ACCEPT_FAILED',
    title: 'Could Not Accept Booking',
    what: 'Your request to accept this trip could not be processed.',
    why: 'This can happen if your network signal dipped, the booking expired, or another driver accepted simultaneously.',
    steps: [
      'Check your mobile network and ensure GPS is active.',
      'Pull down the home screen to refresh the available trip list.',
      'If your wallet balance is sufficient, try accepting another active trip.',
    ],
    severity: 'warning',
    contact: false,
  },

  DC_INVALID_OTP: {
    code: 'DC_INVALID_OTP',
    title: 'Incorrect OTP Code',
    what: 'The start trip OTP entered does not match the customer code.',
    why: 'The customer receives a 4-digit secret OTP on their phone when the cab arrives. Entering an incorrect code blocks trip start.',
    steps: [
      'Kindly ask the customer to check the latest SMS or customer app screen.',
      'Ensure the customer provides the 4-digit "Start Trip OTP" (not login OTP).',
      'Re-enter the code carefully and tap Verify.',
    ],
    severity: 'warning',
    contact: false,
  },

  DC_EXPIRED_OTP: {
    code: 'DC_EXPIRED_OTP',
    title: 'OTP Expired',
    what: 'The verification OTP is no longer valid.',
    why: 'OTPs automatically expire after 10 minutes for security reasons.',
    steps: [
      'Tap "Resend OTP" to generate a fresh verification code.',
      'Wait 30 seconds for the new SMS to arrive on the customer’s phone.',
      'Enter the latest code received.',
    ],
    severity: 'warning',
    contact: false,
  },

  DC_TRIP_START_BLOCKED: {
    code: 'DC_TRIP_START_BLOCKED',
    title: 'Cannot Start Trip',
    what: 'The app cannot start the trip meter right now.',
    why: 'Trip start requires three things: valid Customer OTP, start odometer reading & photo, and accurate GPS location at the pickup point.',
    steps: [
      'Make sure you are at or near the pickup location with GPS enabled.',
      'Enter the correct 4-digit customer OTP.',
      'Enter the exact opening odometer KM and take a clear photo of the dashboard.',
      'Tap Start Trip.',
    ],
    severity: 'blocking',
    contact: true,
  },

  DC_TRIP_END_BLOCKED: {
    code: 'DC_TRIP_END_BLOCKED',
    title: 'Cannot Complete Trip',
    what: 'Trip closing details are incomplete.',
    why: 'To generate the final bill and release wallet holds, closing KM, toll/parking receipts, and collection method must be entered.',
    steps: [
      'Enter the final odometer reading (must be higher than opening KM).',
      'Enter any actual toll or parking amounts paid if not included in package.',
      'Confirm the total cash or digital payment collected from the customer.',
      'Tap Complete Trip.',
    ],
    severity: 'blocking',
    contact: true,
  },

  DC_SUBSCRIPTION_EXPIRED: {
    code: 'DC_SUBSCRIPTION_EXPIRED',
    title: 'Subscription Expired',
    what: 'Your daily or monthly partner plan has ended.',
    why: 'An active subscription allows you to receive priority booking notifications and 0% commission benefits.',
    steps: [
      'Open the Subscription screen to view renewal options.',
      'Select a daily, weekly, or monthly plan.',
      'Pay via UPI or deduct from your active wallet balance.',
      'Your account will immediately resume receiving priority bookings.',
    ],
    action: {
      label: 'Renew Subscription',
      route: '/subscription',
    },
    severity: 'warning',
    contact: false,
  },

  DC_PERMISSIONS_OFF: {
    code: 'DC_PERMISSIONS_OFF',
    title: 'Permissions or Sound Turned Off',
    what: 'You might miss new booking sirens and notifications.',
    why: 'Android battery optimizers or muted sound settings can silence incoming trip alerts when the app is in the background.',
    steps: [
      'Open Settings > Sound & Alerts inside the app.',
      'Ensure "Loud Horn" alert tone is selected and volume is max.',
      'Enable "Display over other apps" (Floating Bubble) permission in phone Settings.',
      'Turn off Battery Optimization for Drop Cars Driver App in phone settings.',
    ],
    action: {
      label: 'Open Sound Settings',
      route: '/(tabs)/settings',
    },
    severity: 'warning',
    contact: false,
  },

  DC_OFFLINE_NO_INTERNET: {
    code: 'DC_OFFLINE_NO_INTERNET',
    title: 'No Internet Connection',
    what: 'The app cannot reach the server right now.',
    why: 'Mobile data or WiFi signal is weak or disconnected.',
    steps: [
      'Check your phone status bar to ensure Mobile Data is turned on.',
      'Toggle Airplane Mode on for 5 seconds and turn it back off.',
      'Move to an area with better mobile network coverage.',
      'Saved data is being displayed safely while offline.',
    ],
    severity: 'warning',
    contact: false,
  },

  DC_NETWORK_TIMEOUT: {
    code: 'DC_NETWORK_TIMEOUT',
    title: 'Request Timed Out',
    what: 'The server took too long to respond.',
    why: 'Slow mobile network or high network latency caused the request to time out.',
    steps: [
      'Please wait a few seconds and tap "Try again".',
      'If you were making a payment, check your wallet first before recharging again.',
      'Ensure you have active 4G / 5G data.',
    ],
    severity: 'warning',
    contact: false,
  },

  DC_GPS_OFF: {
    code: 'DC_GPS_OFF',
    title: 'GPS / Location is Turned Off',
    what: 'Your current location is needed to receive nearby bookings.',
    why: 'Drop Cars assigns trips to the closest available drivers based on accurate GPS location.',
    steps: [
      'Swipe down your phone’s notification bar and turn on Location (GPS).',
      'Set Location Mode to "High Accuracy".',
      'Grant "Allow all the time" or "While using the app" permission.',
      'Return to the Driver app to refresh your position.',
    ],
    severity: 'blocking',
    contact: false,
  },

  DC_UPDATE_REQUIRED: {
    code: 'DC_UPDATE_REQUIRED',
    title: 'App Update Required',
    what: 'A new version of Drop Cars Driver App is available.',
    why: 'This update includes important security fixes, new booking features, and fare enhancements.',
    steps: [
      'Tap "Update Now" to download the latest version.',
      'The update takes less than a minute and keeps your saved login.',
      'After updating, reopen the app to continue accepting rides.',
    ],
    action: {
      label: 'Check for Updates',
      route: '/(tabs)/settings',
    },
    severity: 'blocking',
    contact: true,
  },

  DC_SESSION_EXPIRED: {
    code: 'DC_SESSION_EXPIRED',
    title: 'Session Expired',
    what: 'Your secure login session has ended.',
    why: 'Sessions expire periodically for your account safety or if you logged in on another device.',
    steps: [
      'Tap Sign In below.',
      'Enter your registered mobile number and password / OTP.',
      'You will be returned directly to your driver dashboard.',
    ],
    action: {
      label: 'Sign In Again',
      route: '/login',
    },
    severity: 'blocking',
    contact: false,
  },

  DC_GENERIC_ERROR: {
    code: 'DC_GENERIC_ERROR',
    title: 'Something Went Wrong',
    what: 'An unexpected issue occurred while processing your request.',
    why: 'Could be a temporary server sync glitch or network fluctuation.',
    steps: [
      'Wait a moment and try the action again.',
      'Close and reopen the app if the problem continues.',
      'If the error persists, tap Call Support or WhatsApp with the error code shown below.',
    ],
    severity: 'warning',
    contact: true,
  },
};

/**
 * Resolves a HelpEntry by code or maps a backend detail string to a matching entry.
 */
export function getHelpEntry(codeOrDetail?: string | null): HelpEntry {
  if (!codeOrDetail) return DRIVER_HELP_CATALOG.DC_GENERIC_ERROR;

  // Direct code match
  if (DRIVER_HELP_CATALOG[codeOrDetail]) {
    return DRIVER_HELP_CATALOG[codeOrDetail];
  }

  const s = String(codeOrDetail).toLowerCase();

  if (s.includes('inactive') || s.includes('blocked') || s.includes('deactivated')) {
    return DRIVER_HELP_CATALOG.DC_ACCOUNT_INACTIVE;
  }
  if (s.includes('rejected') || s.includes('document') && s.includes('invalid')) {
    return DRIVER_HELP_CATALOG.DC_DOC_REJECTED;
  }
  if (s.includes('waiting') || s.includes('pending verification')) {
    return DRIVER_HELP_CATALOG.DC_DOC_WAITING;
  }
  if (s.includes('not verified') || s.includes('verification required')) {
    return DRIVER_HELP_CATALOG.DC_NOT_VERIFIED;
  }
  if (s.includes('wallet') || s.includes('balance') || s.includes('deposit') || s.includes('insufficient')) {
    return DRIVER_HELP_CATALOG.DC_INSUFFICIENT_WALLET;
  }
  if (s.includes('payout') || s.includes('withdrawal')) {
    return DRIVER_HELP_CATALOG.DC_PAYOUT_HELD;
  }
  if (s.includes('cancelled') || s.includes('canceled')) {
    return DRIVER_HELP_CATALOG.DC_BOOKING_CANCELLED;
  }
  if (s.includes('already taken') || s.includes('already accepted') || s.includes('assigned to another')) {
    return DRIVER_HELP_CATALOG.DC_BOOKING_ALREADY_TAKEN;
  }
  if (s.includes('otp') || s.includes('pin')) {
    if (s.includes('expired')) return DRIVER_HELP_CATALOG.DC_EXPIRED_OTP;
    return DRIVER_HELP_CATALOG.DC_INVALID_OTP;
  }
  if (s.includes('start trip') || s.includes('odometer') || s.includes('start code')) {
    return DRIVER_HELP_CATALOG.DC_TRIP_START_BLOCKED;
  }
  if (s.includes('end trip') || s.includes('complete trip') || s.includes('close trip')) {
    return DRIVER_HELP_CATALOG.DC_TRIP_END_BLOCKED;
  }
  if (s.includes('subscription') || s.includes('plan expired')) {
    return DRIVER_HELP_CATALOG.DC_SUBSCRIPTION_EXPIRED;
  }
  if (s.includes('gps') || s.includes('location')) {
    return DRIVER_HELP_CATALOG.DC_GPS_OFF;
  }
  if (s.includes('network') || s.includes('internet') || s.includes('offline') || s.includes('connection')) {
    return DRIVER_HELP_CATALOG.DC_OFFLINE_NO_INTERNET;
  }
  if (s.includes('timeout') || s.includes('timed out')) {
    return DRIVER_HELP_CATALOG.DC_NETWORK_TIMEOUT;
  }
  if (s.includes('session') || s.includes('unauthorized') || s.includes('login')) {
    return DRIVER_HELP_CATALOG.DC_SESSION_EXPIRED;
  }

  // Fallback
  return {
    ...DRIVER_HELP_CATALOG.DC_GENERIC_ERROR,
    what: codeOrDetail.length < 120 ? codeOrDetail : DRIVER_HELP_CATALOG.DC_GENERIC_ERROR.what,
  };
}
