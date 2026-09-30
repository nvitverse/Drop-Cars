import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as SecureStore from '@/utils/secureStore';
import { getNotificationSettings, updateNotificationSettings, muteNotifications, unmuteNotifications } from '@/services/notifications/notificationApi';

export const MUTE_DURATIONS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '5 hours', minutes: 300 },
  { label: '8 hours', minutes: 480 },
  { label: '24 hours', minutes: 1440 },
] as const;

interface NotificationContextType {
  notificationsEnabled: boolean;
  toggleNotifications: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  getNotificationStatus: () => Promise<boolean>;
  /** null = not muted, otherwise the ISO timestamp mute ends at. */
  mutedUntil: string | null;
  muteFor: (minutes: number) => Promise<void>;
  unmute: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Default ON: first-time/never-set-a-preference users should start opted
  // in to push notifications. This is only the FALLBACK used before the
  // remote setting loads (pre-login) or when no backend row exists yet -
  // loadNotificationSettings() below always overrides it with whatever the
  // user actually has persisted (including an explicit false).
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [permission1, setPermission1] = useState<boolean>(false);
  const [permission2, setPermission2] = useState<boolean>(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);

  // Load notification settings (VENDOR APP APPROACH)
  useEffect(() => {
    // Skip the fetch entirely pre-login - axiosInstance would reject it anyway
    // (no auth token yet), so this just avoids a guaranteed-failed request and
    // a scary console error on every cold app start before sign-in.
    SecureStore.getItemAsync('authToken').then((token) => {
      if (token) loadNotificationSettings();
    });
  }, []);

  const loadNotificationSettings = async () => {
    try {
      const remote = await getNotificationSettings();
      if (remote) {
        setPermission1(!!remote.permission1);
        setPermission2(!!remote.permission2);
        setMutedUntil(remote.muted_until ?? null);
        // Master is enabled if token exists
        const hasToken = !!(remote.token && remote.token.trim() !== '');
        setNotificationsEnabled(hasToken);
        console.log('📱 Loaded notification settings:', {
          permission1: remote.permission1,
          permission2: remote.permission2,
          hasToken: hasToken,
          tokenPreview: remote.token ? `${remote.token.substring(0, 20)}...` : 'EMPTY'
        });
        // A row exists but somehow has no token (e.g. permission was denied
        // last time, or the app was reinstalled) - retry registration
        // silently so the user never has to find a button for this.
        if (!hasToken) {
          try {
            const res = await updateNotificationSettings({ permission1: true, permission2: true });
            setPermission1(!!res.permission1);
            setPermission2(!!res.permission2);
            setNotificationsEnabled(!!(res.token && res.token.trim() !== ''));
          } catch (retryError) {
            console.warn('⚠️ Silent re-registration failed:', retryError);
          }
        }
      } else {
        // No settings exist yet on the backend - this is a genuinely new
        // user/device that has never made a choice. Default to opted-in AND
        // actually register a token right away, instead of only flipping a
        // local flag - otherwise the UI shows "on" while no real token ever
        // gets created, and pushes silently never arrive. Users who
        // previously toggled it off DO have a backend row (hasToken ===
        // false above), so they are unaffected by this branch.
        try {
          const res = await updateNotificationSettings({ permission1: true, permission2: true });
          setPermission1(!!res.permission1);
          setPermission2(!!res.permission2);
          setNotificationsEnabled(!!(res.token && res.token.trim() !== ''));
        } catch (registerError) {
          console.warn('⚠️ Auto-registration on first load failed:', registerError);
          setNotificationsEnabled(true);
          setPermission1(true);
          setPermission2(true);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load notification settings:', error);
      setNotificationsEnabled(false);
    }
  };

  const toggleNotifications = async () => {
    try {
      const newStatus = !notificationsEnabled;
      setNotificationsEnabled(newStatus);
      
      // Update backend with new permissions and token (VENDOR APP APPROACH)
      try {
        const res = await updateNotificationSettings({ 
          permission1: newStatus, 
          permission2: newStatus
        });
        setPermission1(!!res.permission1);
        setPermission2(!!res.permission2);
        console.log('✅ Backend notification settings updated:', { 
          permission1: res.permission1, 
          permission2: res.permission2,
          token: res.token ? `${res.token.substring(0, 20)}...` : 'EMPTY'
        });
      } catch (backendError) {
        console.warn('⚠️ Failed to update backend notification settings:', backendError);
        // Revert on error
        setNotificationsEnabled(!newStatus);
      }
      
      console.log('✅ Notifications toggled:', newStatus);
    } catch (error) {
      console.error('❌ Failed to toggle notifications:', error);
    }
  };

  const muteFor = async (minutes: number) => {
    try {
      const res = await muteNotifications(minutes);
      setMutedUntil(res.muted_until ?? null);
    } catch (error) {
      console.error('❌ Failed to mute notifications:', error);
    }
  };

  const unmute = async () => {
    try {
      const res = await unmuteNotifications();
      setMutedUntil(res.muted_until ?? null);
    } catch (error) {
      console.error('❌ Failed to unmute notifications:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      // Simple approach - no complex clearing needed
      console.log('📱 Notification clearing not implemented (vendor app approach)');
    } catch (error) {
      console.error('❌ Failed to clear notifications:', error);
    }
  };

  const getNotificationStatus = async (): Promise<boolean> => {
    return notificationsEnabled;
  };

  return (
    <NotificationContext.Provider value={{
      notificationsEnabled,
      toggleNotifications,
      clearAllNotifications,
      getNotificationStatus,
      mutedUntil,
      muteFor,
      unmute,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}