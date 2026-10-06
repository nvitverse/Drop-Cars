// Command Centre "smart" layer: reads the LIVE state (website approvals, bookings, support) and answers / acts on it.
// No AI service needed: it understands English, Tanglish and Tamil keywords. Anything it does not recognise returns null and the
// older parser (booking creation, invoice, duty, health) handles the message. Writes (post / hold / release) always ask first.
import { apiService } from '@/services/api';
import * as supportApi from '@/services/supportApi';

const IST = 'Asia/Kolkata';
const HOUR = 3600000;

const fmtDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short' }) : '-');
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }) : '-');
const fmtFull = (iso?: string | null) => (iso ? `${fmtDay(iso)}, ${fmtTime(iso)}` : '-');
const place = (loc: any): string => {
  if (!loc) return '?';
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  const parts = keys.map((k) => String(loc[k]).split(',')[0].trim());
  return parts.length > 1 ? `${parts[0]} → ${parts[parts.length - 1]}` : parts[0] || '?';
};
const rupee = (n?: number | null) => (n == null ? '' : `₹${Number(n).toLocaleString('en-IN')}`);
const until = (iso?: string | null) => {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / 60000);
  return h >= 48 ? `in ${Math.floor(h / 24)} d ${h % 24} h` : h > 0 ? `in ${h} h ${m} min` : `in ${m} min`;
};

const hasAny = (t: string, words: string[]) => words.some((w) => t.includes(w));

let pendingConfirm: null | { kind: 'post' | 'hold' | 'release'; ids: string[]; at: number } = null;

async function pendingList(): Promise<any[]> {
  const list = (await apiService.getPendingWebsiteBookings().catch(() => [])) as any[];
  return [...list].sort((a, b) => new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime());
}

async function recentOrders(): Promise<any[]> {
  const res = await apiService.getOrders(0, 200, 'newest').catch(() => ({ orders: [] as any[] }));
  return res.orders || [];
}

const isLive = (o: any) => ['PENDING', 'ASSIGNED', 'STARTED'].includes(String(o.trip_status || '').toUpperCase());
const hasDriver = (o: any) => !!(o.assigned_driver || (o.assignments && o.assignments.length > 0) || o.driver_id);

/** What needs attention right now - the message shown when the Command Centre opens and for "what's pending". */
export async function buildBrief(): Promise<string> {
  const [pending, orders, support] = await Promise.all([
    pendingList(),
    recentOrders(),
    supportApi.getSupportThreads().catch(() => [] as any[]),
  ]);
  const now = Date.now();
  const lines: string[] = [];

  if (pending.length) {
    const next = [...pending].filter((p) => p.auto_post_at).sort((a, b) => new Date(a.auto_post_at).getTime() - new Date(b.auto_post_at).getTime())[0];
    const held = pending.filter((p) => p.is_held).length;
    lines.push(`🌐 Website approvals: ${pending.length} waiting${held ? ` (${held} held)` : ''}.${next ? ` Next auto-post: ${next.customer_name} ${fmtFull(next.auto_post_at)} (${until(next.auto_post_at)}).` : ''}`);
  } else {
    lines.push('🌐 Website approvals: nothing waiting.');
  }

  const live = orders.filter(isLive);
  const unassigned = live.filter((o) => !hasDriver(o));
  const soon = unassigned.filter((o) => o.start_date_time && new Date(o.start_date_time).getTime() - now < 24 * HOUR);
  if (unassigned.length) {
    lines.push(`🚨 Unassigned bookings: ${unassigned.length}${soon.length ? ` - ${soon.length} pickup within 24 h` : ''}.`);
  } else {
    lines.push('✅ No unassigned bookings.');
  }

  const today = live.filter((o) => o.start_date_time && fmtDay(o.start_date_time) === fmtDay(new Date().toISOString()));
  lines.push(`📅 Pickups today: ${today.length}.`);

  const unread = (support as any[]).reduce((n, t) => n + (t.unread || 0), 0);
  lines.push(unread ? `💬 Support chats: ${unread} unread message${unread > 1 ? 's' : ''}.` : '💬 Support chats: all read.');

  return `Here is where things stand:\n\n${lines.join('\n')}\n\nAsk "pending", "unassigned", "today", "booking #345", or say "hold all" / "post all".`;
}

async function listPending(): Promise<string> {
  const pending = await pendingList();
  if (!pending.length) return '🌐 No website booking is waiting.';
  const rows = pending.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.customer_name} · ${place(p.pickup_drop_location)}\n    Pickup ${fmtFull(p.start_date_time)} · ${rupee(p.customer_total ?? p.quoted_total_amount)}\n    ${p.is_held ? '⏸ Held · ' : ''}${p.auto_post_at ? `Auto-posts ${fmtFull(p.auto_post_at)} (${until(p.auto_post_at)})` : 'Waits for staff'}`
  );
  return `🌐 ${pending.length} website booking${pending.length > 1 ? 's' : ''} waiting (by pickup date):\n\n${rows.join('\n\n')}${pending.length > 10 ? `\n\n…and ${pending.length - 10} more` : ''}\n\nSay "post all", "hold all" or "release all". For one booking use Website Approvals (Customize / Change time).`;
}

async function listUnassigned(): Promise<string> {
  const orders = await recentOrders();
  const un = orders.filter((o) => isLive(o) && !hasDriver(o))
    .sort((a, b) => new Date(a.start_date_time || 0).getTime() - new Date(b.start_date_time || 0).getTime());
  if (!un.length) return '✅ No unassigned booking.';
  const rows = un.slice(0, 10).map((o, i) => `${i + 1}. #${o.id} ${o.customer_name} · ${place(o.pickup_drop_location)}\n    Pickup ${fmtFull(o.start_date_time)} (${until(o.start_date_time)}) · ${rupee(o.vendor_price ?? o.estimated_price)}`);
  return `🚨 ${un.length} unassigned booking${un.length > 1 ? 's' : ''}:\n\n${rows.join('\n\n')}${un.length > 10 ? `\n\n…and ${un.length - 10} more` : ''}`;
}

async function listToday(offsetDays: number): Promise<string> {
  const orders = await recentOrders();
  const target = fmtDay(new Date(Date.now() + offsetDays * 24 * HOUR).toISOString());
  const list = orders.filter((o) => isLive(o) && o.start_date_time && fmtDay(o.start_date_time) === target)
    .sort((a, b) => new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime());
  if (!list.length) return `📅 No pickups ${offsetDays === 0 ? 'today' : 'tomorrow'}.`;
  const rows = list.slice(0, 15).map((o) => `• ${fmtTime(o.start_date_time)} #${o.id} ${o.customer_name} · ${place(o.pickup_drop_location)} · ${hasDriver(o) ? '✅ driver assigned' : '🚨 no driver'}`);
  return `📅 ${list.length} pickup${list.length > 1 ? 's' : ''} ${offsetDays === 0 ? 'today' : 'tomorrow'} (${target}):\n\n${rows.join('\n')}`;
}

async function bookingStatus(id: string): Promise<string> {
  const orders = await recentOrders();
  const o = orders.find((x) => String(x.id) === id || String(x.source_order_id) === id);
  if (!o) return `I could not find booking #${id} in the latest 200 bookings. Open Operations > Bookings and search it.`;
  const status = String(o.trip_status || '').toUpperCase();
  const driving = status === 'STARTED' || (o.assignments || []).some((a: any) => String(a.assignment_status).toUpperCase() === 'DRIVING');
  const stage = status === 'COMPLETED' ? 'Completed' : status.includes('CANCEL') ? 'Cancelled' : driving ? 'Running (trip started)' : hasDriver(o) ? 'Assigned (trip not started)' : 'Unassigned';
  return `#${o.id} · ${o.customer_name}\n${place(o.pickup_drop_location)}\nPickup ${fmtFull(o.start_date_time)} (${until(o.start_date_time)})\nStatus: ${stage}\nFare: ${rupee(o.vendor_price ?? o.estimated_price)}${o.advance_received ? ` · advance ${rupee(o.advance_received)}` : ''}`;
}

async function support(): Promise<string> {
  const th = (await supportApi.getSupportThreads().catch(() => [])) as any[];
  const unread = th.filter((t) => t.unread > 0).sort((a, b) => b.unread - a.unread);
  if (!unread.length) return `💬 ${th.length} support chats, all read.`;
  const rows = unread.slice(0, 8).map((t) => `• ${t.thread_name || 'Driver/Owner'} - ${t.unread} unread · ${String(t.last_text || '').slice(0, 60)}`);
  return `💬 ${unread.length} support chat${unread.length > 1 ? 's' : ''} need a reply:\n\n${rows.join('\n')}\n\nOpen Chats > Driver & booking chats to answer.`;
}

async function askConfirmation(kind: 'post' | 'hold' | 'release'): Promise<string> {
  const pending = await pendingList();
  if (!pending.length) return '🌐 No website booking is waiting.';
  const ids = pending.map((p) => String(p.id)).slice(0, 200);
  pendingConfirm = { kind, ids, at: Date.now() };
  const what = kind === 'post' ? `POST ${ids.length} booking(s) to drivers right now` : kind === 'hold' ? `HOLD ${ids.length} booking(s) until 2 hrs before pickup` : `RELEASE the hold on ${ids.length} booking(s)`;
  return `⚠️ I will ${what}.\n\nReply "yes" to do it, or "no" to cancel.`;
}

async function runConfirmed(): Promise<string> {
  const c = pendingConfirm;
  pendingConfirm = null;
  if (!c || Date.now() - c.at > 5 * 60000) return 'That confirmation has expired. Ask again.';
  const call = (path: string, body: any) => apiService.makeRequest(path, { method: 'POST', body: JSON.stringify(body) });
  if (c.kind === 'post') {
    const r: any = await call('/admin/website-bookings/bulk-approve', { ids: c.ids });
    return `✅ Posted ${r.approved_count}${r.failed?.length ? `. ${r.failed.length} could not be posted (${r.failed[0].reason}).` : '.'}`;
  }
  if (c.kind === 'hold') {
    const r: any = await call('/admin/website-bookings/bulk-hold', { ids: c.ids });
    return `⏸ Held ${r.held.length}${r.failed?.length ? `. ${r.failed.length} are too close to pickup to hold.` : '.'} They post by themselves 2 hrs before pickup and the alarm rings then.`;
  }
  const r: any = await call('/admin/website-bookings/bulk-release', { ids: c.ids });
  return `▶️ Released ${r.released.length}.`;
}

/** Returns the reply text, or null when the message is not one of the smart commands. */
export async function smartIntent(raw: string): Promise<string | null> {
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  if (pendingConfirm) {
    if (/^(yes|y|ok|okay|confirm|aama|ஆமா|ஆம்|சரி|seri|sari|pannu|பண்ணு)\b/.test(t)) return runConfirmed();
    if (/^(no|n|cancel|venam|வேண்டாம்|vendam|illa|இல்ல)\b/.test(t)) { pendingConfirm = null; return 'Okay, nothing was changed.'; }
  }

  // write commands first (they ask before doing anything)
  if (/(post|approve)\s*all|ellam\s*post|எல்லாம்\s*post|அனைத்தும்\s*post/.test(t)) return askConfirmation('post');
  if (/hold\s*all|ellam\s*hold|எல்லாம்\s*hold/.test(t)) return askConfirmation('hold');
  if (/(release|resume)\s*all|ellam\s*release/.test(t)) return askConfirmation('release');

  const idMatch = t.match(/(?:booking|order|புக்கிங்)?\s*#?\s*(\d{2,7})\b/);
  if (idMatch && hasAny(t, ['status', 'epdi', 'enna aachu', 'என்ன ஆச்சு', 'details', 'check', '#', 'booking id']) && !hasAny(t, ['confirm', 'approve', 'cancel', 'invoice', 'assign'])) {
    return bookingStatus(idMatch[1]);
  }

  if (hasAny(t, ['pending', 'approval', 'waiting', 'website booking', 'website', 'காத்திருக்கும்', 'பெண்டிங்'])) return listPending();
  if (hasAny(t, ['unassigned', 'not assigned', 'assign pannala', 'driver illa', 'யாரும் எடுக்கல', 'அசைன் ஆகல'])) return listUnassigned();
  if (hasAny(t, ['tomorrow', 'naalaiku', 'நாளைக்கு', 'நாளை'])) return listToday(1);
  if (hasAny(t, ['today', 'indru', 'inniku', 'இன்று', 'இன்னைக்கு'])) return listToday(0);
  if (hasAny(t, ['support', 'unread', 'chats', 'message', 'reply pannala', 'சப்போர்ட்'])) return support();
  if (hasAny(t, ['brief', 'summary', 'what needs', 'attention', 'overview', 'status of everything', 'enna nadakkudhu', 'என்ன நடக்குது', 'சுருக்கம்', 'ellam epdi', 'எல்லாம் எப்படி'])) return buildBrief();
  return null;
}
