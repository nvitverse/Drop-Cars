// Shared display formatters

// Backend sends raw enum values like "SEDAN_4_PLUS_1" - show "Sedan 4+1"
const ACRONYMS = new Set(['SUV', 'MUV', 'XUV', 'AC', 'EV']);

export function formatCarType(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/_PLUS_/gi, '+')
    .split('_')
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (/^\d/.test(word) || word.includes('+')) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/(\d)\s*\+\s*(\d)/g, '$1+$2');
}
