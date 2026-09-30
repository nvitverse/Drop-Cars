import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { alertHealth } from './alertHealth';
import { enquiriesApi } from './enquiriesApi';

// Set up default foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const ANDROID_CHANNEL_ID = 'dropcars-admin-alerts';

export async function setupAndroidChannel(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Drop Cars Admin Emergency Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
        sound: 'default',
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
        enableVibrate: true,
      });
      alertHealth.setChannelStatus(true);
      return true;
    } catch (e) {
      console.warn('Failed to configure Android alert channel:', e);
      alertHealth.setChannelStatus(false);
      return false;
    }
  }
  return true;
}

// Initial channel setup call
setupAndroidChannel();

const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId || '8f14b166-7ecb-41e6-b60e-3a61c21c269f';

/**
 * Registers device for push notifications and registers token with both website and backend.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    alertHealth.recordPushToken(null, 'Web platform does not support Expo mobile push notifications');
    return null;
  }

  try {
    if (!Device.isDevice) {
      alertHealth.recordPushToken(null, 'Push alerts require a physical device (running on emulator/simulator)');
      return null;
    }

    // Ensure high-priority channel exists before requesting/registering token
    await setupAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alertHealth.recordPushToken(null, 'Notification permission not granted by user');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    const token = tokenResponse.data;

    alertHealth.recordPushToken(token, null);

    // Register with website PHP backend
    try {
      const deviceLabel = `${Device.manufacturer || ''} ${Device.modelName || 'Admin Device'}`.trim();
      await enquiriesApi.registerPushToken(token, deviceLabel);
    } catch (phpErr) {
      console.warn('Failed to register token with website PHP:', phpErr);
    }

    return token;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.warn('Error getting admin push token:', errMsg);
    alertHealth.recordPushToken(null, errMsg);
    return null;
  }
}
