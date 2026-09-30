import { clearRequestCache } from '@/utils/requestCache';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import { Platform, Alert } from 'react-native';
import { maybeShowBubbleForNotification } from '@/services/bubble/bubbleOverlay';
import { registerBackgroundNotificationTask } from '@/services/notifications/backgroundNotificationTask';

// Read the admin-configured sentence out loud on-device. Only fires from the
// foreground listener below - the background task (backgroundNotificationTask.ts)
// currently only drives the bubble, not speech/custom-sound, to keep that
// change scoped; extend it there too if this needs to work with the app
// fully closed as well.
function speakIfConfigured(data: any) {
  const text = data?.speak_text;
  if (typeof text === 'string' && text.trim()) {
    Speech.speak(text, { language: 'en-IN' });
  }
}

// Play an admin-uploaded custom chime (replaces the default notification
// sound for this event) while the app is foreground. Fire-and-forget - a
// short one-off sound, no need to track/release the player carefully.
function playCustomSoundIfConfigured(data: any) {
  const url = data?.custom_sound_url;
  if (typeof url === 'string' && url.trim()) {
    try {
      const player = createAudioPlayer({ uri: url });
      player.play();
    } catch (error) {
      console.warn('Failed to play custom notification sound:', error);
    }
  }
}

// Android Purpose-Specific Notification Channels
export const CHANNEL_URGENT_BOOKING = 'dropcars-urgent-booking-v1';
export const CHANNEL_NEW_BOOKING = 'dropcars-new-booking-v1';
export const CHANNEL_TRIP_LIFECYCLE = 'dropcars-trip-lifecycle-v1';
export const CHANNEL_WALLET_EARNINGS = 'dropcars-wallet-earnings-v1';
export const CHANNEL_DOCUMENTS_ACCOUNT = 'dropcars-documents-account-v1';

// Legacy fallback export
export const ANDROID_NOTIFICATION_CHANNEL_ID = CHANNEL_NEW_BOOKING;

// Set up Android channels BEFORE handler
async function setupAndroidChannels() {
  if (Platform.OS === 'android') {
    // 1. Urgent/instant booking alerts (MAX importance, loud custom sound, vibration)
    await Notifications.setNotificationChannelAsync(CHANNEL_URGENT_BOOKING, {
      name: 'Urgent & Instant Booking Alerts',
      description: 'Critical alerts for urgent trips, Drop Bid driver requests, and expiring assignments',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#EF4444',
      sound: 'notification_tone.wav',
      enableVibrate: true,
      showBadge: true,
    });

    // 2. Regular new booking alerts (HIGH importance)
    await Notifications.setNotificationChannelAsync(CHANNEL_NEW_BOOKING, {
      name: 'New Booking Alerts',
      description: 'Alerts for standard new trip offers and bids',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
      sound: 'notification_tone.wav',
      enableVibrate: true,
      showBadge: true,
    });

    // 3. Trip lifecycle (DEFAULT importance)
    await Notifications.setNotificationChannelAsync(CHANNEL_TRIP_LIFECYCLE, {
      name: 'Trip Lifecycle & Status',
      description: 'Driver assignment, arrival reminders, trip start and completion updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150, 150, 150],
      lightColor: '#10B981',
      enableVibrate: true,
    });

    // 4. Wallet & earnings (DEFAULT importance)
    await Notifications.setNotificationChannelAsync(CHANNEL_WALLET_EARNINGS, {
      name: 'Wallet & Earnings',
      description: 'Payouts, account credits/debits, and wallet balance updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100, 100, 100],
      lightColor: '#F59E0B',
      enableVibrate: true,
    });

    // 5. Documents & account (DEFAULT importance)
    await Notifications.setNotificationChannelAsync(CHANNEL_DOCUMENTS_ACCOUNT, {
      name: 'Documents & Account',
      description: 'KYC status, document expiry reminders, and admin announcements',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#3B82F6',
      enableVibrate: false,
    });

    console.log('✅ 5 Android notification channels configured for Driver App');
  }
}

// Configure handler AFTER channel setup
async function setupNotificationHandler() {
  await setupAndroidChannels(); // Channels first!
  
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      console.log('🔔 Notification received in handler:', notification);
      // The backend sends a second, title-less "bubble wakeup" push next to
      // every new-booking push (it only exists to run JS so the bubble can
      // show). It must never surface as its own notification - that was the
      // duplicate the driver saw.
      const content: any = notification?.request?.content ?? {};
      if (content?.data?.bubble_wakeup || (!content?.title && !content?.body)) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // These are Android-only, safe to include
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
  console.log('✅ Notification handler configured');
}

// Initialize notification setup once at module load
setupNotificationHandler();
registerBackgroundNotificationTask();

// Several places (NotificationContext, notificationApi, driverNotificationApi...) call this at about the same time on
// start-up; each one used to reach Notifications.requestPermissionsAsync() itself, so the driver saw the system
// "Allow notifications" dialog twice. All concurrent callers now share ONE in-flight registration, and the
// "permission denied" alert is shown at most once per app session.
let registerInFlight: Promise<string | null> | null = null;
let deniedAlertShown = false;

export function registerForPushNotificationsAsync(): Promise<string | null> {
  if (registerInFlight) return registerInFlight;
  registerInFlight = doRegisterForPushNotifications().finally(() => {
    // keep sharing the result for a moment so a late second caller does not start a second prompt
    setTimeout(() => { registerInFlight = null; }, 5000);
  });
  return registerInFlight;
}

async function doRegisterForPushNotifications(): Promise<string | null> {
  // Push tokens aren't obtainable the same way on web (no real Expo push
  // registration there, and browser notification-permission prompts in an
  // embedded/sandboxed preview fail immediately) - this used to alert every
  // time NotificationContext tried to silently re-register on load, which
  // meant a "Permission Denied" popup on nearly every screen. Web callers
  // just get null back quietly; native (Android/iOS) behavior is unchanged.
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // REMOVED: Duplicate channel setup - already done in setupNotificationHandler()

    if (!Device.isDevice) {
      Alert.alert('Error', 'Push notifications only work on physical devices');
      return null;
    }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
      if (!deniedAlertShown) {
        deniedAlertShown = true;
        Alert.alert('Permission Denied', 'Push notification permission is required for this feature.');
      }
      return null;
    }

        const token = await Notifications.getExpoPushTokenAsync();

    return token.data;
    } catch (error) {
    console.error('Error getting push token:', error);
    Alert.alert('Error', 'Failed to get push notification token');
    return null;
  }
}

// Set up notification listeners (foreground + tap logging)
export const setupNotificationListeners = () => {
  console.log('🔔 Setting up notification listeners...');
  
  // Listener for when notification is received in foreground
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('📱 NOTIFICATION RECEIVED IN FOREGROUND:', {
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data,
      identifier: notification.request.identifier,
      timestamp: new Date().toISOString()
    });
    clearRequestCache(); // something changed on the server (approval, assignment, ...) - lists must be fetched fresh
    playCustomSoundIfConfigured(notification.request.content.data);
    speakIfConfigured(notification.request.content.data);
    // Opt-in floating bubble overlay - only actually shows anything when the
    // driver has enabled it and granted the overlay permission (checked
    // inside this call). Note: expo-notifications only invokes this listener
    // while the app is foregrounded (no background task is registered), so
    // this is the only context this ever runs in.
    maybeShowBubbleForNotification(notification.request.content.data).catch(() => {});
  });

  // Listener for when user taps notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('👆 NOTIFICATION TAPPED:', {
      title: response.notification.request.content.title,
      data: response.notification.request.content.data,
      actionIdentifier: response.actionIdentifier
    });
    playCustomSoundIfConfigured(response.notification.request.content.data);
    speakIfConfigured(response.notification.request.content.data);
  });

  console.log('✅ Notification listeners set up successfully');
  return { receivedListener, responseListener };
};

/** Expected values for checklist (match app.json and code) */
export const CUSTOM_SOUND_EXPECTED = {
  channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
  soundFile: 'notification_tone.wav',
  /** In app.json plugin use filename only: "notification_tone.wav" (not ./assets/...) */
  soundsJsonValue: 'notification_tone.wav',
} as const;

/**
 * Verify custom sound setup at runtime. Use in Settings checklist.
 * On Android: checks that the channel exists and has custom sound.
 * On iOS: channel API not used; returns platform info only.
 */
export async function verifyCustomSoundSetup(): Promise<{
  platform: string;
  channelExists: boolean;
  channelHasCustomSound: boolean;
  message: string;
}> {
  if (Platform.OS !== 'android') {
    return {
      platform: Platform.OS,
      channelExists: true,
      channelHasCustomSound: true,
      message: 'iOS: verify app.json sounds and test with "Test Notification Sound".',
    };
  }
  try {
    const channel = await Notifications.getNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      return {
        platform: 'android',
        channelExists: false,
        channelHasCustomSound: false,
        message: 'Channel not found. Reopen app so channel is created, or reinstall build.',
      };
    }
    // setNotificationChannelAsync takes the actual filename ('notification_tone.wav'),
    // but getNotificationChannelAsync reports it back as the OS-level category
    // 'default' | 'custom' | null (Android can't hand back which specific file
    // it is) - comparing against the filename here always failed even when
    // the channel was correctly configured with the custom sound.
    const hasCustom = channel.sound === 'custom';
    return {
      platform: 'android',
      channelExists: true,
      channelHasCustomSound: hasCustom,
      message: hasCustom
        ? 'Channel exists with custom sound.'
        : 'Channel exists but sound is not custom (default). Check app.json plugin and rebuild.',
    };
  } catch (e) {
    return {
      platform: 'android',
      channelExists: false,
      channelHasCustomSound: false,
      message: `Error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Simple test notification using the custom sound/channel
export async function testForegroundNotification(): Promise<void> {
  try {
    console.log('🧪 Testing notification...');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test Notification',
        body: 'This is a test notification',
        data: { test: true },
        // For iOS and Android < 8, this name must match the bundled sound file
        sound: 'notification_tone.wav',
      },
      // For Android 8+, channelId must be set so the channel's custom sound is used
      trigger: Platform.OS === 'android'
        ? { seconds: 1, channelId: ANDROID_NOTIFICATION_CHANNEL_ID }
        : null, // Immediate on iOS
    });
    console.log('✅ Test notification sent');
  } catch (error) {
    console.error('❌ Failed to send test notification:', error);
  }
}