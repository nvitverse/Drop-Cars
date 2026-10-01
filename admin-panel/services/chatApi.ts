// Unified chat API for the admin app (backend/app/api/routes/conversations.py).
// Kept in its own file so services/api.ts is not touched; it reuses apiService.makeRequest for auth + error handling.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '@/services/api';

const BASE_URL = 'https://drop-cars-api-207918408785.asia-south2.run.app/api';

export type ChatType = 'BOOKING' | 'SUPPORT' | 'STAFF' | 'DIRECT' | 'BROADCAST';

export interface InboxChat {
  id: string;
  type: ChatType;
  title: string;
  order_id: number | null;
  last_message: string | null;
  last_at: string | null;
  unread: number;
  is_closed: boolean;
  muted: boolean;
  member: boolean;
  participants: { role: string; name: string | null }[];
}

export interface InboxMessage {
  id: number;
  conversation_id: string;
  sender_role: string;
  sender_name: string | null;
  mine: boolean;
  kind: string;
  text: string;
  voice_url: string | null;
  image_url: string | null;
  created_at: string | null;
  read: boolean;
  masked: boolean;
  notice?: string;
}

export interface InboxChatSummary {
  id: string;
  type: ChatType;
  title: string;
  order_id: number | null;
  is_closed: boolean;
  can_post: boolean;
  participants: { role: string; name: string | null }[];
  number_revealed?: boolean;
  number_policy?: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'DIRECTOR' | 'STAFF';
  on_duty: boolean;
}

/** The filter chips on the inbox. A chat matches a chip by its type and by who is in it. */
export type InboxFilter = 'ALL' | 'CUSTOMER' | 'FLEET_OWNER' | 'DRIVER' | 'DUTY_DRIVER' | 'VENDOR' | 'BOOKING' | 'STAFF';

export const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'FLEET_OWNER', label: 'Fleet owner' },
  { key: 'DRIVER', label: 'Driver' },
  { key: 'DUTY_DRIVER', label: 'Duty driver' },
  { key: 'VENDOR', label: 'Vendor' },
  { key: 'BOOKING', label: 'Booking' },
  { key: 'STAFF', label: 'Staff' },
];

export const matchesFilter = (c: InboxChat, f: InboxFilter): boolean => {
  const has = (role: string) => c.participants.some((p) => p.role === role);
  switch (f) {
    case 'ALL': return true;
    case 'CUSTOMER': return has('CUSTOMER');
    case 'FLEET_OWNER': return has('FLEET_OWNER');
    case 'DRIVER': return c.type === 'BOOKING' && has('DRIVER');
    case 'DUTY_DRIVER': return c.type === 'SUPPORT' && has('DRIVER');
    case 'VENDOR': return has('VENDOR');
    case 'BOOKING': return c.type === 'BOOKING';
    case 'STAFF': return c.type === 'STAFF' || c.type === 'DIRECT';
  }
};

const call = <T,>(path: string, init?: RequestInit): Promise<T> => apiService.makeRequest<T>(`/conversations${path}`, init);
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const chatApi = {
  /** scope=all is the oversight view (every booking + support chat; internal staff chats only for the director). */
  list: (scope: 'mine' | 'all' = 'all', q?: string) =>
    call<InboxChat[]>(`?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  unread: () => call<{ total: number; by_type: Record<string, number> }>('/unread-count'),
  get: (id: string) => call<InboxChatSummary>(`/${id}`),
  messages: (id: string, afterId = 0) => call<{ messages: InboxMessage[]; can_post: boolean }>(`/${id}/messages?after_id=${afterId}`),
  send: (id: string, body: { text?: string; voice_url?: string; image_url?: string; reply_to_id?: number }) =>
    call<InboxMessage>(`/${id}/messages`, json(body)),
  markRead: (id: string, upTo?: number) => call<any>(`/${id}/read`, json({ up_to_id: upTo ?? null })),
  mute: (id: string, minutes: number | null) => call<any>(`/${id}/mute`, { method: 'PATCH', body: JSON.stringify({ minutes }) }),
  staffDirectory: () => call<StaffMember[]>('/staff/directory'),
  openStaffDirect: (withAdminId: string) => call<InboxChatSummary>('/staff', json({ with_admin_id: withAdminId })),
  openStaffGroup: (title: string, memberIds: string[]) => call<InboxChatSummary>('/staff', json({ title, member_ids: memberIds })),
  openBooking: (orderId: number) => call<InboxChatSummary>(`/booking/${orderId}`, json({})),

  /** Voice notes and photos: upload first, then send the returned url in a message. */
  async upload(uri: string, mime: string): Promise<{ url: string; kind: 'VOICE' | 'IMAGE' }> {
    const token = await AsyncStorage.getItem('auth_token');
    const ext = mime.split('/')[1] || 'm4a';
    const form = new FormData();
    form.append('file', { uri, name: `chat-media.${ext}`, type: mime } as any);
    const res = await fetch(`${BASE_URL}/conversations/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`;
      try { detail = (await res.json())?.detail || detail; } catch { /* keep the status text */ }
      throw new Error(detail);
    }
    return res.json();
  },
};

export const timeLabel = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export const roleLabel = (role: string): string =>
  ({ CUSTOMER: 'Customer', DRIVER: 'Driver', FLEET_OWNER: 'Fleet owner', VENDOR: 'Vendor', STAFF: 'Drop Cars', DIRECTOR: 'Drop Cars', BOT: 'Assistant' } as Record<string, string>)[role] || role;
