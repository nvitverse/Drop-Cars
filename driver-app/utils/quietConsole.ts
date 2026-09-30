// Global console silencer: keep only warnings and errors
// This file is imported once at app bootstrap

// Preserve original warn/error just in case
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
const originalLog = console.log.bind(console);

// Silence verbose logs BUT keep notification logs
// eslint-disable-next-line @typescript-eslint/no-empty-function
console.log = (message: any, ...args: any[]) => {
  // Allow notification-related logs to pass through
  if (typeof message === 'string' && (
    message.includes('🔔') || 
    message.includes('📱') || 
    message.includes('NOTIFICATION') ||
    message.includes('notification')
  )) {
    originalLog(message, ...args);
  }
  // Block all other logs
};
// eslint-disable-next-line @typescript-eslint/no-empty-function
console.info = () => {};
// eslint-disable-next-line @typescript-eslint/no-empty-function
console.debug = () => {};

// Ensure warn/error remain intact
console.warn = originalWarn;
console.error = originalError;

export {};

