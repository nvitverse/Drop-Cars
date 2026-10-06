// Staff Performance System for Drop Cars Admin (Staff) App
// Tracks response times, star ratings, mandatory comments, and daily performance ledgers.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PerformanceResponseRecord {
  enquiryId: number;
  seconds: number;
  stars: number;
  isLate: boolean;
  timestamp: number;
  respondedVia: 'call' | 'whatsapp' | 'stage' | 'confirm';
  note?: string;
  hasNote?: boolean;
  customerName?: string;
  route?: string;
}

export interface StaffDailyPerformance {
  staffId: string;
  date: string; // YYYY-MM-DD
  enquiriesAnsweredOnTime: number; // <= 120 min
  enquiriesAnsweredLate: number; // > 120 min
  totalAnswered: number;
  totalResponseSeconds: number;
  starCounts: { [stars: number]: number }; // 5, 4, 3, 2, 1, 0
  missedCount: number; // untouched older than 2h
  commentsPendingCount: number; // answered without >= 3 chars note
  feedbackTasksDone: number;
  feedbackTasksPending: number;
  responses: PerformanceResponseRecord[];
  acknowledgment?: {
    type: 'acknowledged' | 'will_improve';
    timestamp: number;
  };
}

/**
 * Star Scale (time from enquiry received -> first call/WhatsApp/response action):
 * ≤ 5 min (300 s): ★★★★★ (5)
 * ≤ 15 min (900 s): ★★★★ (4)
 * ≤ 30 min (1800 s): ★★★ (3)
 * ≤ 60 min (3600 s): ★★ (2)
 * 60–120 min (7200 s): ★ (1)
 * > 120 min: Missed (0 stars, counted as "late" if answered afterwards)
 */
export function starsForSeconds(seconds: number): {
  stars: number;
  label: string;
  starString: string;
  isMissed: boolean;
  isLate: boolean;
} {
  const safeSec = Math.max(0, Math.floor(seconds));

  if (safeSec <= 300) {
    return { stars: 5, label: '5 Stars (Instant)', starString: '★★★★★', isMissed: false, isLate: false };
  }
  if (safeSec <= 900) {
    return { stars: 4, label: '4 Stars (Fast)', starString: '★★★★', isMissed: false, isLate: false };
  }
  if (safeSec <= 1800) {
    return { stars: 3, label: '3 Stars (Good)', starString: '★★★', isMissed: false, isLate: false };
  }
  if (safeSec <= 3600) {
    return { stars: 2, label: '2 Stars (Average)', starString: '★★', isMissed: false, isLate: false };
  }
  if (safeSec <= 7200) {
    return { stars: 1, label: '1 Star (Slow)', starString: '★', isMissed: false, isLate: false };
  }
  return { stars: 0, label: 'Late Response (Missed)', starString: 'Missed (0★)', isMissed: true, isLate: true };
}

/**
 * Render star icons as text string (e.g. 5 -> "★★★★★", 3 -> "★★★")
 */
export function renderStars(stars: number): string {
  if (stars <= 0) return '0★';
  return '★'.repeat(Math.min(5, Math.max(1, Math.round(stars))));
}

/**
 * Format duration into clean human-friendly English
 */
export function formatDurationFriendly(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  if (safeSec < 60) return `${safeSec}s`;
  const mins = Math.floor(safeSec / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hrs`;
}

/**
 * Standard IST Timestamp Parser
 */
export function parseIstTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const raw = value.trim();
  if (raw.includes('T') && (raw.endsWith('Z') || raw.includes('+'))) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? 0 : ms;
  }
  const isoLike = raw.replace(' ', 'T') + '+05:30';
  const ms = Date.parse(isoLike);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Format enquiry received time: "10:30 AM (5 min ago)"
 */
export function formatEnquiryReceivedTime(createdAt: string | null | undefined): string {
  const ts = parseIstTimestamp(createdAt);
  if (!ts) return 'Unknown';

  const date = new Date(ts);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  const diffMs = Math.max(0, Date.now() - ts);
  const diffMin = Math.floor(diffMs / 60000);

  let agoStr = '';
  if (diffMin < 1) {
    agoStr = 'just now';
  } else if (diffMin < 60) {
    agoStr = `${diffMin}m ago`;
  } else if (diffMin < 24 * 60) {
    const diffHrs = Math.floor(diffMin / 60);
    agoStr = diffHrs === 1 ? '1h ago' : `${diffHrs}h ago`;
  }

  if (isToday) {
    return agoStr ? `Today, ${timeStr} (${agoStr})` : `Today, ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
    return `${dateStr}, ${timeStr}`;
  }
}

/**
 * Format pickup date and time: "Mon, 21 Sep, 09:40 AM"
 */
export function formatPickupDateTime(travelDate?: string | null, travelTime?: string | null): string {
  if (!travelDate && !travelTime) return 'Today (Immediate)';

  let formattedDate = travelDate || 'Today';
  const trimmed = travelDate ? travelDate.trim() : '';

  if (trimmed) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      try {
        const parts = trimmed.split('-');
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        formattedDate = d.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      } catch {}
    } else if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(trimmed)) {
      try {
        const parts = trimmed.split(/[/-]/);
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        formattedDate = d.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      } catch {}
    }
  }

  if (travelTime && travelTime.trim()) {
    return `${formattedDate}, ${travelTime.trim()}`;
  }
  return formattedDate;
}

/**
 * Check if a lead has a future pickup date & time (> 2 hours from current time) needing follow-up
 */
export function isFutureLead(travelDate?: string | null, travelTime?: string | null): boolean {
  if (!travelDate) return false;
  const trimmed = travelDate.trim();
  if (!trimmed) return false;

  let targetDate: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } else if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[/-]/);
    targetDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  } else {
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      targetDate = new Date(parsed);
    }
  }

  if (!targetDate || isNaN(targetDate.getTime())) return false;

  if (travelTime && travelTime.trim()) {
    const timeStr = travelTime.trim().toLowerCase();
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3];
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      targetDate.setHours(12, 0, 0, 0);
    }
  } else {
    targetDate.setHours(23, 59, 59, 999);
  }

  // Pickup is > 2 hours in the future from current time
  return targetDate.getTime() > Date.now() + 2 * 60 * 60 * 1000;
}

/**
 * Helper to get local per-staff, per-day ledger key
 */
export function getPerformanceKey(staffId: string = 'default', dateStr?: string): string {
  const today = dateStr || new Date().toISOString().split('T')[0];
  const safeStaff = (staffId || 'staff').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `dropcars_perf_${safeStaff}_${today}`;
}

/**
 * Retrieve Daily Performance Record
 */
export async function getDailyPerformance(staffId: string = 'Admin', dateStr?: string): Promise<StaffDailyPerformance> {
  const today = dateStr || new Date().toISOString().split('T')[0];
  const key = getPerformanceKey(staffId, today);

  const initial: StaffDailyPerformance = {
    staffId,
    date: today,
    enquiriesAnsweredOnTime: 0,
    enquiriesAnsweredLate: 0,
    totalAnswered: 0,
    totalResponseSeconds: 0,
    starCounts: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    missedCount: 0,
    commentsPendingCount: 0,
    feedbackTasksDone: 0,
    feedbackTasksPending: 0,
    responses: [],
  };

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...initial,
        ...parsed,
        starCounts: { ...initial.starCounts, ...(parsed.starCounts || {}) },
        responses: Array.isArray(parsed.responses) ? parsed.responses : [],
      };
    }
  } catch {}

  return initial;
}

/**
 * Save Daily Performance Record
 */
export async function saveDailyPerformance(perf: StaffDailyPerformance): Promise<void> {
  try {
    const key = getPerformanceKey(perf.staffId, perf.date);
    await AsyncStorage.setItem(key, JSON.stringify(perf));
  } catch {}
}

/**
 * Record an enquiry response tap/action
 */
export async function recordEnquiryResponse(
  staffId: string = 'Admin',
  enquiryId: number,
  responseSeconds: number,
  respondedVia: 'call' | 'whatsapp' | 'stage' | 'confirm',
  note?: string,
  extra?: { customerName?: string; route?: string }
): Promise<{ record: PerformanceResponseRecord; stars: number; message: string; isFirstTime: boolean }> {
  const perf = await getDailyPerformance(staffId);
  const starInfo = starsForSeconds(responseSeconds);
  const now = Date.now();

  const existingIdx = perf.responses.findIndex((r) => r.enquiryId === enquiryId);
  const hasNote = !!(note && note.trim().length >= 3);

  let isFirstTime = false;

  if (existingIdx >= 0) {
    // Already recorded earlier response, update note or latest status
    const existing = perf.responses[existingIdx];
    if (hasNote) {
      existing.note = note?.trim();
      existing.hasNote = true;
    }
    perf.responses[existingIdx] = existing;
  } else {
    isFirstTime = true;
    const newRecord: PerformanceResponseRecord = {
      enquiryId,
      seconds: responseSeconds,
      stars: starInfo.stars,
      isLate: starInfo.isLate,
      timestamp: now,
      respondedVia,
      note: note?.trim(),
      hasNote,
      customerName: extra?.customerName,
      route: extra?.route,
    };

    perf.responses.push(newRecord);
    perf.totalAnswered += 1;
    perf.totalResponseSeconds += responseSeconds;

    if (starInfo.isLate) {
      perf.enquiriesAnsweredLate += 1;
    } else {
      perf.enquiriesAnsweredOnTime += 1;
    }

    perf.starCounts[starInfo.stars] = (perf.starCounts[starInfo.stars] || 0) + 1;
  }

  // Recalculate comments pending count (responses without note >= 3 chars)
  perf.commentsPendingCount = perf.responses.filter((r) => !r.hasNote && (!r.note || r.note.trim().length < 3)).length;

  await saveDailyPerformance(perf);

  const durationStr = formatDurationFriendly(responseSeconds);
  let toastMsg = '';
  if (starInfo.stars === 5) {
    toastMsg = `Great! Responded in ${durationStr} ★★★★★`;
  } else if (starInfo.stars >= 3) {
    toastMsg = `Responded in ${durationStr} ${renderStars(starInfo.stars)}`;
  } else if (starInfo.stars >= 1) {
    toastMsg = `Responded in ${durationStr} ${renderStars(starInfo.stars)}`;
  } else {
    toastMsg = `Late response logged (${durationStr})`;
  }

  return {
    record: perf.responses[existingIdx >= 0 ? existingIdx : perf.responses.length - 1],
    stars: starInfo.stars,
    message: toastMsg,
    isFirstTime,
  };
}

/**
 * Update comments pending count in ledger
 */
export async function updateCommentsPendingInLedger(staffId: string, pendingCount: number): Promise<void> {
  const perf = await getDailyPerformance(staffId);
  perf.commentsPendingCount = Math.max(0, pendingCount);
  await saveDailyPerformance(perf);
}

/**
 * Update Missed Count in ledger
 */
export async function updateMissedCountInLedger(staffId: string, missedCount: number): Promise<void> {
  const perf = await getDailyPerformance(staffId);
  perf.missedCount = Math.max(0, missedCount);
  await saveDailyPerformance(perf);
}

/**
 * Update Feedback tasks counts in ledger
 */
export async function updateFeedbackTasksInLedger(staffId: string, done: number, pending: number): Promise<void> {
  const perf = await getDailyPerformance(staffId);
  perf.feedbackTasksDone = Math.max(0, done);
  perf.feedbackTasksPending = Math.max(0, pending);
  await saveDailyPerformance(perf);
}

/**
 * Save Duty Acknowledgment ("I acknowledge" or "I'll improve")
 */
export async function saveDutyAcknowledgment(
  staffId: string,
  type: 'acknowledged' | 'will_improve'
): Promise<StaffDailyPerformance> {
  const perf = await getDailyPerformance(staffId);
  perf.acknowledgment = {
    type,
    timestamp: Date.now(),
  };
  await saveDailyPerformance(perf);
  return perf;
}

/**
 * Mood Score & Coaching Suggestions System
 *
 * Scoring Formula (documented as required):
 * 1. Base Score = average star rating (0 to 5) across all answered enquiries.
 *    If 0 enquiries answered today, default baseline is 3.5.
 * 2. Deductions:
 *    - Missed enquiries: -0.25 per missed enquiry (max deduction: 1.5).
 *    - Comments pending: -0.05 per pending comment (max deduction: 1.0).
 *    - Late answers (>120m): -0.15 per late answer.
 * 3. Bonuses:
 *    - 5-Star ratio > 50%: +0.4 bonus.
 *    - Completed customer feedback tasks: +0.2 bonus.
 * 4. Final Score clamped between 1.0 and 5.0.
 *
 * Mood Emoji Scale:
 * - 4.2 .. 5.0 -> 😄 (Excellent)
 * - 3.4 .. 4.19 -> 🙂 (Good)
 * - 2.6 .. 3.39 -> 😐 (Average)
 * - 1.8 .. 2.59 -> 😕 (Needs Attention)
 * - 1.0 .. 1.79 -> 😢 (Very Poor)
 */
export function calculateMoodScore(perf: StaffDailyPerformance): {
  mood: string;
  score: number;
  avgStars: number;
  avgResponseSeconds: number;
  moodLabel: string;
  suggestions: string[];
} {
  const total = perf.totalAnswered;
  const avgStars = total > 0
    ? (5 * (perf.starCounts[5] || 0) +
       4 * (perf.starCounts[4] || 0) +
       3 * (perf.starCounts[3] || 0) +
       2 * (perf.starCounts[2] || 0) +
       1 * (perf.starCounts[1] || 0)) / total
    : 3.5;

  const avgResponseSeconds = total > 0 ? Math.round(perf.totalResponseSeconds / total) : 0;

  let score = avgStars;

  // Deductions
  const missedPenalty = Math.min(1.5, (perf.missedCount || 0) * 0.25);
  const pendingCommentsPenalty = Math.min(1.0, (perf.commentsPendingCount || 0) * 0.05);
  const latePenalty = Math.min(1.0, (perf.enquiriesAnsweredLate || 0) * 0.15);

  score = score - missedPenalty - pendingCommentsPenalty - latePenalty;

  // Bonuses
  if (total > 0 && ((perf.starCounts[5] || 0) / total) >= 0.5) {
    score += 0.4;
  }
  if (perf.feedbackTasksDone > 0) {
    score += 0.2;
  }

  // Clamp 1.0 to 5.0
  score = Math.max(1.0, Math.min(5.0, Math.round(score * 10) / 10));

  let mood = '😐';
  let moodLabel = 'Average Day';
  if (score >= 4.2) {
    mood = '😄';
    moodLabel = 'Outstanding Job!';
  } else if (score >= 3.4) {
    mood = '🙂';
    moodLabel = 'Good Performance';
  } else if (score >= 2.6) {
    mood = '😐';
    moodLabel = 'Steady Day';
  } else if (score >= 1.8) {
    mood = '😕';
    moodLabel = 'Room for Improvement';
  } else {
    mood = '😢';
    moodLabel = 'Needs Immediate Attention';
  }

  // Dynamic warm, friendly coach suggestions (2-4 lines)
  const suggestions: string[] = [];

  if (perf.starCounts[5] > 0) {
    suggestions.push(`Great work hitting 5 stars on ${perf.starCounts[5]} customer ${perf.starCounts[5] === 1 ? 'lead' : 'leads'} today!`);
  } else {
    suggestions.push('Try tapping Call within 5 minutes of a new enquiry — that gets you 5 stars!');
  }

  if (perf.commentsPendingCount > 0) {
    suggestions.push(`You have ${perf.commentsPendingCount} ${perf.commentsPendingCount === 1 ? 'comment' : 'comments'} pending. Add short notes so customer details stay clear.`);
  } else if (total > 0) {
    suggestions.push('You cleared all enquiry notes today, well done!');
  }

  if (perf.missedCount > 0) {
    suggestions.push('Tomorrow, start with the Missed tab first — those customers may still book.');
  }

  if (perf.feedbackTasksDone > 0) {
    suggestions.push(`You completed ${perf.feedbackTasksDone} customer feedback follow-up ${perf.feedbackTasksDone === 1 ? 'call' : 'calls'}.`);
  }

  if (suggestions.length < 2) {
    suggestions.push('Fast responses keep customers happy and win more bookings.');
  }

  return {
    mood,
    score,
    avgStars: Math.round(avgStars * 10) / 10,
    avgResponseSeconds,
    moodLabel,
    suggestions: suggestions.slice(0, 3),
  };
}
