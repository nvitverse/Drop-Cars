// Admin > Chats: the general driver/owner Support inbox (SupportMessage, no order_id).
// Backend: /api/support/admin/threads. Kept in its own file because services/api.ts was twice overwritten back to the old
// /booking-chat/* paths (per-booking only), which hid every Support message and password-reset request from Admin.
import { apiService } from './api';

export const getSupportThreads = (): Promise<any[]> => apiService.makeRequest('/support/admin/threads');

export const getSupportThread = (threadKey: string): Promise<{ thread_key: string; thread_name: string; thread_role: string; messages: any[] }> =>
  apiService.makeRequest(`/support/admin/threads/${encodeURIComponent(threadKey)}`);

export const replySupportThread = (threadKey: string, text?: string, voiceUrl?: string): Promise<any> =>
  apiService.makeRequest(`/support/admin/threads/${encodeURIComponent(threadKey)}`, {
    method: 'POST',
    body: JSON.stringify({ text, voice_url: voiceUrl }),
  });
