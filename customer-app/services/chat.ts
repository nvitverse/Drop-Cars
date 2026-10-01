// Customer <-> Drop Cars chat (unified conversations API, backend/app/api/routes/conversations.py).
// Text only for now: voice notes / photos need expo-audio / expo-image-picker (native modules), which this app does not
// ship yet - incoming voice notes open in the phone's player, incoming photos show inline.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import axiosInstance from '@/app/api/axiosInstance';

export interface ChatConversation {
  id: string;
  type: 'BOOKING' | 'SUPPORT' | 'STAFF' | 'DIRECT' | 'BROADCAST';
  title: string;
  order_id: number | null;
  last_message: string | null;
  last_at: string | null;
  unread: number;
  is_closed: boolean;
  muted: boolean;
  participants: { role: string; name: string | null }[];
}

export interface ChatMessage {
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
  bot_pending?: boolean;
  meta?: { bot?: boolean; suggestions?: string[]; handoff?: boolean } | null;
}

export interface ChatSummary {
  id: string;
  type: string;
  title: string;
  order_id: number | null;
  is_closed: boolean;
  can_post: boolean;
  number_revealed?: boolean;
  number_policy?: string | null;
}

export const listConversations = async (): Promise<ChatConversation[]> =>
  (await axiosInstance.get('/api/conversations')).data;

export const unreadTotal = async (): Promise<number> =>
  Number((await axiosInstance.get('/api/conversations/unread-count')).data?.total || 0);

export const openSupportChat = async (): Promise<ChatSummary> =>
  (await axiosInstance.post('/api/conversations/support')).data;

export const openBookingChat = async (orderId: number): Promise<ChatSummary> =>
  (await axiosInstance.post(`/api/conversations/booking/${orderId}`)).data;

export const getChat = async (id: string): Promise<ChatSummary> =>
  (await axiosInstance.get(`/api/conversations/${id}`)).data;

export const getMessages = async (id: string, afterId = 0): Promise<{ messages: ChatMessage[]; can_post: boolean }> =>
  (await axiosInstance.get(`/api/conversations/${id}/messages`, { params: { after_id: afterId } })).data;

export const sendMessage = async (id: string, text: string): Promise<ChatMessage> =>
  (await axiosInstance.post(`/api/conversations/${id}/messages`, { text })).data;

/** Asks the assistant to answer my latest message (only called when the send reply said bot_pending). */
export const askBot = async (id: string): Promise<{ replied: boolean; handoff?: boolean; message?: ChatMessage | null }> =>
  (await axiosInstance.post(`/api/conversations/${id}/bot`, null, { timeout: 45000 })).data;

export const markRead = async (id: string, upTo?: number): Promise<void> => {
  await axiosInstance.post(`/api/conversations/${id}/read`, { up_to_id: upTo ?? null });
};

/**
 * Registers this phone for pushes (new chat messages, booking updates). The app only asked for the permission before and
 * never stored a token, so customers never got a push. Safe to call on every start; failures are ignored.
 */
export const registerCustomerPush = async (): Promise<void> => {
  try {
    if (Platform.OS === 'web') return;
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined as any)).data;
    if (!token) return;
    await axiosInstance.post('/api/notifications/', { permission1: true, permission2: true, token });
  } catch {
    // push is a convenience; chat still works by opening the app
  }
};

export const timeLabel = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
