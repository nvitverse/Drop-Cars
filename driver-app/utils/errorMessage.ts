/**
 * Turns any API/network error into a clear, human-friendly message.
 * Avoids showing users raw text like "Request failed with status code 402".
 */
export function getFriendlyError(error: any, fallback = 'Something went wrong. Please try again.'): string {
  // No response = network/timeout problem
  if (error?.code === 'ECONNABORTED') {
    return 'The request took too long. Please check your internet and try again.';
  }
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'No internet connection. Please check your network and try again.';
  }

  const status: number | undefined = error?.response?.status;
  const detail = error?.response?.data?.detail;

  // Prefer a clean, human-readable message the backend sent.
  const backendMessage = extractBackendMessage(detail) || error?.response?.data?.message;
  if (backendMessage && !looksTechnical(backendMessage)) {
    return backendMessage;
  }

  switch (status) {
    case 400:
      return backendMessage || 'Some details are incorrect. Please check and try again.';
    case 401:
      return 'Incorrect mobile number or password.';
    case 402:
      return 'Payment is pending for this account. Please complete the registration fee.';
    case 403:
      return 'You do not have permission to do this.';
    case 404:
      return 'We could not find what you were looking for.';
    case 409:
      return backendMessage || 'This already exists. It may be a duplicate.';
    case 413:
      return 'The file is too large. Please upload a smaller image.';
    case 422:
      return backendMessage || 'Please fill all the required fields correctly.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      if (status && status >= 500) {
        return 'Our server had a problem. Please try again in a moment.';
      }
      return backendMessage || fallback;
  }
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
 * "Failed to X: 400:" developer prefixes, no library text. Messages that were already plain pass through unchanged.
 */
export function plainAlertMessage(message?: string | null): string | undefined {
  if (message == null) return undefined;
  let m = String(message).trim();
  if (!m) return undefined;

  const lower = m.toLowerCase();
  if (lower.includes('network error') || lower.includes('err_network')) {
    return 'No internet connection. Please check your network and try again.';
  }
  if (lower.includes('timeout of') || lower.includes('econnaborted')) {
    return 'This is taking too long. Please check your internet and try again.';
  }
  const statusMatch = lower.match(/request failed with status code (\d{3})/);
  if (statusMatch) {
    const code = Number(statusMatch[1]);
    if (code === 401) return 'Your session has ended. Please sign in again.';
    if (code === 403) return 'You do not have permission to do this.';
    if (code === 404) return 'We could not find what you were looking for.';
    if (code >= 500) return 'Our server had a problem. Please try again in a moment.';
    return 'Something did not go through. Please check the details and try again.';
  }

  // "Failed to start trip: 400: Incorrect trip start code..." -> keep only the human part after the codes
  m = m
    .replace(/^(?:[A-Za-z ]{3,40}?:\s*)?(?:HTTP\s*)?[1-5]\d{2}\s*:\s*/i, '')
    .replace(/^(?:Failed to [a-z ]+|Error|Exception|AxiosError|TypeError|ValueError)\s*:\s*/i, '')
    .replace(/^[1-5]\d{2}\s*:\s*/, '')
    .replace(/\s*\((?:status|code)[^)]*\)\s*$/i, '')
    .trim();
  if (!m || /^(undefined|null|\[object object\])$/i.test(m)) return 'Something went wrong. Please try again.';
  // first letter capital, sentence ends with a full stop for consistency
  m = m.charAt(0).toUpperCase() + m.slice(1);
  return m;
}

export default getFriendlyError;
