// Shared display formatters

function parseDateSafely(raw?: string | null): Date {
  if (!raw) return new Date();
  try {
    const s = String(raw).trim();
    const isoStr = s.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:)/, '$1T');
    let d = new Date(isoStr);
    if (!isNaN(d.getTime())) return d;

    if (!/\b20\d{2}\b/.test(s)) {
      d = new Date(`${s} ${new Date().getFullYear()}`);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {}
  return new Date();
}

// Display Request/Enquiries as "DR{YYMMDD00}" (e.g. DR26090501) and confirmed Bookings as "DC..."
export function formatBookingId(id?: string | number | null, createdAt?: string | null): string {
  if (id === undefined || id === null || id === '') return '';
  const str = String(id).trim();

  // If already formatted like DR26090501 or DC1042
  if (/^DR\d{8,}/i.test(str)) return str.toUpperCase();

  // Any Request/Enquiry ID (DCbid_, dcbid_, bid_, REQ, etc.)
  if (str.toLowerCase().includes('bid') || str.toLowerCase().includes('req') || /^DR/i.test(str)) {
    const validDate = parseDateSafely(createdAt);
    const yy = String(validDate.getFullYear()).slice(-2);
    const mm = String(validDate.getMonth() + 1).padStart(2, '0');
    const dd = String(validDate.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;

    const hexPart = str.replace(/^(DCbid_|dcbid_|bid_|DR|REQ_?)/gi, '');
    const numOnly = hexPart.replace(/\D/g, '');
    let seq = '01';
    if (numOnly.length >= 2) {
      const val = parseInt(numOnly.slice(0, 4), 10);
      seq = String(val % 100).padStart(2, '0');
    } else {
      const sum = hexPart.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      seq = String(sum % 100).padStart(2, '0');
    }

    return `DR${dateStr}${seq}`;
  }

  if (/^DC\d+/i.test(str)) return str.toUpperCase();
  return `DC${str}`;
}

// Format KM limit and Trip duration/hours
export function formatKmLimitAndHours(tripDistance?: number | string | null, tripTime?: string | number | null): { kmText: string; hrsText: string; combined: string } {
  const distNum = Number(tripDistance || 0);
  const kmText = distNum > 0 ? `${distNum} KM` : '';

  let hrsText = '';
  if (tripTime) {
    const raw = String(tripTime).toLowerCase().trim();
    const isOnewayOnly = /^(oneway|one\s*way|one_way)$/i.test(raw);
    
    if (!isOnewayOnly) {
      const hMatch = raw.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
      const mMatch = raw.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
      if (hMatch) {
        const h = Number(hMatch[1]);
        const m = mMatch ? Number(mMatch[1]) : 0;
        hrsText = m > 0 ? `${h} hrs ${m} m` : `${h} hrs`;
      } else if (mMatch) {
        hrsText = `${mMatch[1]} mins`;
      } else {
        const numeric = Number(raw.replace(/[^\d.]/g, ''));
        if (!isNaN(numeric) && numeric > 0) {
          hrsText = `${numeric} hrs`;
        } else {
          // Clean out any occurrence of "oneway" or "one way"
          const cleaned = String(tripTime).replace(/\b(one\s*way|oneway|one_way)\b/gi, '').trim().replace(/^[•\s-]+|[•\s-]+$/g, '');
          hrsText = cleaned;
        }
      }
    }
  }

  let combined = '';
  if (kmText && hrsText) {
    combined = `${kmText} Limit • ${hrsText}`;
  } else if (kmText) {
    combined = `${kmText} Limit`;
  } else if (hrsText) {
    combined = hrsText;
  } else {
    combined = 'Standard Limit';
  }

  return { kmText, hrsText, combined };
}

// Backend sends raw enum values like "SEDAN_4_PLUS_1" - show "Sedan 4+1"
const ACRONYMS = new Set(['SUV', 'MUV', 'XUV', 'AC', 'EV']);

export function formatCarType(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.toUpperCase().includes('NEW_SEDAN_2022_MODEL') || s.toUpperCase().includes('NEW SEDAN 2022 MODEL')) {
    return 'Prime Sedan';
  }
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
    .replace(/(\d)\s*\+\s*(\d)/g, '$1+$2')
    .replace(/\s*\b\d{4}\s*MODEL\b/gi, '')
    .trim();
}

export function formatDateTime(raw?: string | null): string {
  if (!raw) return 'Immediate';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (isToday) {
      return `Today, ${timeStr}`;
    }
    if (isTomorrow) {
      return `Tomorrow, ${timeStr}`;
    }

    const dateStrFormatted = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });

    return `${dateStrFormatted}, ${timeStr}`;
  } catch {
    return String(raw);
  }
}
