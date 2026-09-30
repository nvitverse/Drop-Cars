import axiosInstance from '@/app/api/axiosInstance';
import { registerForPushNotificationsAsync } from './notificationService';
import { syncNotificationSounds } from './soundChannelSync';

export interface NotificationResponse {
  sub: string;
  permission1: boolean;
  permission2: boolean;
  token: string;
  muted_until?: string | null;
}

// Temporary snooze (Settings > Mute Notifications). Server-side, so it holds
// even while the app is fully closed. minutes must be one of 15/60/300/480/1440.
export async function muteNotifications(minutes: number): Promise<NotificationResponse> {
  const response = await axiosInstance.post(`/api/notifications/mute?minutes=${minutes}`);
  return response.data as NotificationResponse;
}

export async function unmuteNotifications(): Promise<NotificationResponse> {
  const response = await axiosInstance.post('/api/notifications/unmute');
  return response.data as NotificationResponse;
}

// Get notification settings (VENDOR APP APPROACH)
export async function getNotificationSettings(): Promise<NotificationResponse | null> {
  try {
    const response = await axiosInstance.get('/api/notifications/');
    return response.data as NotificationResponse;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

// Update notification settings (VENDOR APP APPROACH)
export async function updateNotificationSettings(payload: { 
  permission1?: boolean; 
  permission2?: boolean 
}): Promise<NotificationResponse> {
  try {
    const notificationsEnabled = (payload.permission1 ?? true) && (payload.permission2 ?? true);
    let token = '';
    
    // Only get token if notifications are being enabled
    if (notificationsEnabled) {
      const freshToken = await registerForPushNotificationsAsync();
      if (freshToken) {
        token = freshToken;
        console.log('📱 Notifications ON - generated token');
      } else {
        console.error('❌ Failed to generate token');
        token = '';
      }
    } else {
      console.log('📱 Notifications OFF - sending empty token');
    }
    
    console.log('📱 Vehicle owner notification update:', {
      permission1: payload.permission1,
      permission2: payload.permission2,
      notificationsEnabled,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'EMPTY'
    });

    const response = await axiosInstance.post('/api/notifications/', {
      permission1: payload.permission1,
      permission2: payload.permission2,
      token: token
    });
    
    if (token) syncNotificationSounds(axiosInstance, token).catch(() => {});

    console.log('✅ Vehicle owner notification settings updated:', {
      permission1: response.data.permission1,
      permission2: response.data.permission2,
      tokenPreview: response.data.token ? `${response.data.token.substring(0, 20)}...` : 'EMPTY'
    });
    
    return response.data as NotificationResponse;
  } catch (error: any) {
    console.error('❌ Failed to update notification permissions:', error);
    throw error;
  }
}