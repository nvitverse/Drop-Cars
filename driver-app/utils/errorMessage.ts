/**
 * Turns any API/network error into a clear, human-friendly, translatable message
 * and resolves standard Help & Error catalog entries.
 */
import { tr } from './uiTranslate';
import { getHelpEntry } from '@/help/catalog';
import { HelpEntry } from '@/help/types';

export interface FriendlyErrorInfo {
  code: string;
  message: string;
  helpEntry: HelpEntry;
}

/**
 * Returns full error metadata including standard DC error code, friendly message, and HelpEntry.
 */
export function getFriendlyErrorInfo(error: any, fallback = 'Something went wrong. Please try again.'): FriendlyErrorInfo {
  let code = 'DC_GENERIC_ERROR';
  let message = fallback;

  if (error?.code === 'ECONNABORTED') {
    code = 'DC_NETWORK_TIMEOUT';
    message = 'The request took too long. Please check your internet and try again.';
  } else if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    code = 'DC_OFFLINE_NO_INTERNET';
    message = 'No internet connection. Please check your network and try again.';
  } else {
    const status: number | undefined = error?.response?.status;
    const detail = error?.response?.data?.detail;
    const backendCode = error?.response?.data?.code;
    const backendMessage = extractBackendMessage(detail) || error?.response?.data?.message;

    if (backendCode && typeof backendCode === 'string') {
      code = backendCode;
    }

    if (backendMessage && !looksTechnical(backendMessage)) {
      message = backendMessage;
    } else {
      switch (status) {
        case 400:
          code = code !== 'DC_GENERIC_ERROR' ? code : 'DC_GENERIC_ERROR';
          message = backendMessage || 'Some details are incorrect. Please check and try again.';
          break;
        case 401:
          code = 'DC_SESSION_EXPIRED';
          message = 'Your session has ended. Please sign in again.';
          break;
        case 402:
          code = 'DC_INSUFFICIENT_WALLET';
          message = 'Payment or deposit is required for this account.';
          break;
        case 403:
          code = 'DC_NOT_VERIFIED';
          message = 'You do not have permission or verification for this action.';
          break;
        case 404:
          message = 'We could not find what you were looking for.';
          break;
        case 409:
          code = 'DC_BOOKING_ALREADY_TAKEN';
          message = backendMessage || 'This already exists or was already assigned.';
          break;
        case 413:
          message = 'The file is too large. Please upload a smaller image.';
          break;
        case 422:
          message = backendMessage || 'Please fill all the required fields correctly.';
          break;
        case 429:
          message = 'Too many attempts. Please wait a moment and try again.';
          break;
        default:
          if (status && status >= 500) {
            message = 'Our server had a problem. Please try again in a moment.';
          } else {
            message = backendMessage || fallback;
          }
      }
    }
  }

  const helpEntry = getHelpEntry(code !== 'DC_GENERIC_ERROR' ? code : message);
  const translatedMessage = tr(message);

  return {
    code: helpEntry.code || code,
    message: translatedMessage,
    helpEntry,
  };
}

/**
 * Returns a friendly, localized error message string.
 */
export function getFriendlyError(error: any, fallback = 'Something went wrong. Please try again.'): string {
  const info = getFriendlyErrorInfo(error, fallback);
  return info.message;
}

/** FastAPI often returns detail as a string, or an array of validation objects. */
function extractBackendMessage(detail: any): string | null {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => (d && typeof d === 'object' ? d.msg : String(d)))
      .filter(Boolean);
    if (msgs.length) return msgs.join(', ');
  }
  return null;
}

/** Heuristic: hide messages that read like developer errors. */
function looksTechnical(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('status code') ||
    m.includes('traceback') ||
    m.includes('exception') ||
    m.includes('null') ||
    m.includes('undefined') ||
    m.startsWith('error:') ||
    /\bsql\b/.test(m)
  );
}

/**
 * Cleans a message that is about to be shown in an alert so it reads like plain language: no HTTP codes, no
 * "Failed to X: 400:" developer prefixes, no library text. Localizes through tr().
 */
export function plainAlertMessage(message?: string | null): string | undefined {
  if (message == null) return undefined;
  let m = String(message).trim();
  if (!m) return undefined;

  const lower = m.toLowerCase();
  if (lower.includes('network error') || lower.includes('err_network')) {
    return tr('No internet connection. Please check your network and try again.');
  }
  if (lower.includes('timeout of') || lower.includes('econnaborted')) {
    return tr('This is taking too long. Please check your internet and try again.');
  }
  const statusMatch = lower.match(/request failed with status code (\d{3})/);
  if (statusMatch) {
    const code = Number(statusMatch[1]);
    if (code === 401) return tr('Your session has ended. Please sign in again.');
    if (code === 403) return tr('You do not have permission to do this.');
    if (code === 404) return tr('We could not find what you were looking for.');
    if (code >= 500) return tr('Our server had a problem. Please try again in a moment.');
    return tr('Something did not go through. Please check the details and try again.');
  }

  // Clean raw developer prefixes
  m = m
    .replace(/^(?:[A-Za-z ]{3,40}?:\s*)?(?:HTTP\s*)?[1-5]\d{2}\s*:\s*/i, '')
    .replace(/^(?:Failed to [a-z ]+|Error|Exception|AxiosError|TypeError|ValueError)\s*:\s*/i, '')
    .replace(/^[1-5]\d{2}\s*:\s*/, '')
    .replace(/\s*\((?:status|code)[^)]*\)\s*$/i, '')
    .trim();

  if (!m || /^(undefined|null|\[object object\])$/i.test(m)) {
    return tr('Something went wrong. Please try again.');
  }
  m = m.charAt(0).toUpperCase() + m.slice(1);
  return tr(m);
}

export default getFriendlyError;
