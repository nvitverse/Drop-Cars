import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { maybeShowBubbleForNotification } from '@/services/bubble/bubbleOverlay';

// Runs when a push notification arrives while the app is backgrounded or
// fully closed - the ONLY way JS code executes in that state on Android.
// expo-notifications' normal "notification received" listener (see
// notificationService.ts) only fires while the app's Activity is actually
// resumed/foregrounded; this is the missing other half.
//
// MUST be defined at module scope (not inside a component/function) so it's
// registered before the JS bundle finishes loading, including on a
// process start triggered specifically to run this task.
export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background notification task error:', error);
    return;
  }
  // expo-notifications hands back { notification: <the Notification object> }
  const payloadData = (data as any)?.notification?.request?.content?.data ?? (data as any)?.data ?? {};
  await maybeShowBubbleForNotification(payloadData);
});

// Call once at app startup (see App entry / notificationService.ts). Safe to
// call repeatedly - Expo no-ops if the task is already registered. Android
// only; a plain no-op on iOS/web.
export async function registerBackgroundNotificationTask(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (!alreadyRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
  } catch (error) {
    // Best-effort - foreground notifications (sound, popup, in-app bubble)
    // keep working regardless; only the background-bubble path is affected.
    console.warn('Failed to register background notification task:', error);
  }
}
