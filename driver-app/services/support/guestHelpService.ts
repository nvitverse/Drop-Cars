import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosInstance from '@/app/api/axiosInstance';

export const GUEST_HELP_STORAGE_KEY = 'dropcars_guest_help_v1';

export interface GuestHelpSession {
  help_token: string;
  thread_key: string;
  role: string;
  primary_number: string;
}

export interface GuestMessage {
  id: number;
  mine: boolean;
  sender_name?: string;
  text: string;
  voice_url?: string;
  created_at?: string;
  read: boolean;
}

/**
 * Get currently stored guest help session from AsyncStorage.
 */
export const getSavedGuestHelpSession = async (): Promise<GuestHelpSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(GUEST_HELP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.help_token === 'string' && parsed.help_token.trim().length > 0) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('[guestHelpService] Error reading guest session:', e);
    return null;
  }
};

/**
 * Save or update guest help session.
 */
export const saveGuestHelpSession = async (session: GuestHelpSession): Promise<void> => {
  try {
    if (!session?.help_token) return;
    await AsyncStorage.setItem(GUEST_HELP_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[guestHelpService] Error saving guest session:', e);
  }
};

/**
 * Clear guest help session (e.g. after login, signup, or if token is invalid/expired).
 */
export const clearGuestHelpSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(GUEST_HELP_STORAGE_KEY);
  } catch (e) {
    console.warn('[guestHelpService] Error clearing guest session:', e);
  }
};

/**
 * Fetch messages for the active guest help thread.
 * Marks admin messages as read on the backend.
 */
export const fetchGuestThread = async (afterId: number = 0): Promise<GuestMessage[]> => {
  const session = await getSavedGuestHelpSession();
  if (!session?.help_token) return [];

  try {
    const res = await axiosInstance.post('/api/support/guest/thread', {
      help_token: session.help_token,
      after_id: afterId,
    });
    return res.data?.messages || [];
  } catch (err: any) {
    if (err?.response?.status === 401) {
      console.log('[guestHelpService] Token invalid or expired, clearing guest session');
      await clearGuestHelpSession();
    }
    return [];
  }
};

/**
 * Send a reply message into the active guest help thread.
 */
export const sendGuestMessage = async (
  text?: string,
  voiceUrl?: string
): Promise<{ success: boolean; id?: number; error?: string }> => {
  const session = await getSavedGuestHelpSession();
  if (!session?.help_token) {
    return { success: false, error: 'No active help session' };
  }

  try {
    const res = await axiosInstance.post('/api/support/guest/send', {
      help_token: session.help_token,
      text: text?.trim() || undefined,
      voice_url: voiceUrl?.trim() || undefined,
    });
    return { success: true, id: res.data?.id };
  } catch (err: any) {
    if (err?.response?.status === 401) {
      await clearGuestHelpSession();
      return { success: false, error: 'Session expired. Please submit a new help request.' };
    }
    const msg = err?.response?.data?.detail || err?.message || 'Failed to send message';
    return { success: false, error: msg };
  }
};

/**
 * Fetch count of unread admin replies for the guest badge.
 */
export const fetchGuestUnreadCount = async (): Promise<number> => {
  const session = await getSavedGuestHelpSession();
  if (!session?.help_token) return 0;

  try {
    const res = await axiosInstance.post('/api/support/guest/unread', {
      help_token: session.help_token,
    });
    return typeof res.data?.unread === 'number' ? res.data.unread : 0;
  } catch (err: any) {
    if (err?.response?.status === 401) {
      await clearGuestHelpSession();
    }
    return 0;
  }
};
