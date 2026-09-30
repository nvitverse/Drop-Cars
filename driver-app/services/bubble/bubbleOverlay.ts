import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Android-only native module (see android/app/src/main/java/com/dropcars/driverapp/bubble).
// Undefined on iOS/web, or on an old build that predates this feature -
// every exported function below guards against that.
const { BubbleOverlayModule } = NativeModules as {
  BubbleOverlayModule?: {
    hasOverlayPermission(): Promise<boolean>;
    requestOverlayPermission(): Promise<void>;
    showBubble(tripType: string, fare: string, bookingId: string): void;
    hideBubble(): void;
    startPersistentService(): Promise<boolean>;
    stopPersistentService(): void;
  };
};

export const BUBBLE_ENABLED_STORAGE_KEY = 'bubbleOverlayEnabled';

// Local device preference only (mirrors ThemeContext's AsyncStorage pattern) -
// unlike push notifications this has no server-side concept, so there is no
// backend endpoint to sync it with.
export async function getBubblePreference(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BUBBLE_ENABLED_STORAGE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setBubblePreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BUBBLE_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Best-effort - worst case the toggle resets to OFF (the safe default)
    // on next app start.
  }
}

export async function hasOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return false;
  try {
    return await BubbleOverlayModule.hasOverlayPermission();
  } catch {
    return false;
  }
}

export async function requestOverlayPermission(): Promise<void> {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return;
  try {
    await BubbleOverlayModule.requestOverlayPermission();
  } catch {
    // Ignore - the user just won't see the system settings screen;
    // hasOverlayPermission() keeps reporting false and the rest of the app
    // stays fully functional without the bubble.
  }
}

export function showBubble(tripType: string, fare: string, bookingId: string): void {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return;
  try {
    BubbleOverlayModule.showBubble(tripType, fare, bookingId);
  } catch {}
}

export function hideBubble(): void {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return;
  try {
    BubbleOverlayModule.hideBubble();
  } catch {}
}

/**
 * Keeps the app process alive (a low-priority "watching for bookings"
 * foreground notification, not a bubble) so a push notification has a live
 * JS runtime to wake into instead of a killed process - see
 * services/notifications/backgroundNotificationTask.ts, registered via
 * expo-task-manager, which is what actually receives the notification while
 * the app is backgrounded/closed and calls maybeShowBubbleForNotification
 * below. Call once after login if the driver has opted in (getBubblePreference)
 * and overlay permission is granted; call stopPersistentService on logout.
 * Resolves false (no-op) if overlay permission isn't granted yet.
 */
export async function startPersistentService(): Promise<boolean> {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return false;
  try {
    return await BubbleOverlayModule.startPersistentService();
  } catch {
    return false;
  }
}

export function stopPersistentService(): void {
  if (Platform.OS !== 'android' || !BubbleOverlayModule) return;
  try {
    BubbleOverlayModule.stopPersistentService();
  } catch {}
}

/**
 * Called both from the foreground push-notification "received" listener and
 * from the background notification task (backgroundNotificationTask.ts) to
 * decide whether a newly arrived notification should surface as a floating
 * bubble. Gates on: platform, the driver's opt-in, and whether the overlay
 * permission is actually granted (opting in only requests it - the user may
 * have declined).
 *
 * The push payload's exact field names are defined server-side and are not
 * visible from this client repo, so common key variants are checked
 * defensively instead of assuming one fixed schema.
 */
export async function maybeShowBubbleForNotification(data: any): Promise<void> {
  if (Platform.OS !== 'android') return;

  const enabled = await getBubblePreference();
  if (!enabled) return;

  const granted = await hasOverlayPermission();
  if (!granted) return;

  const bookingId = data?.booking_id ?? data?.order_id ?? data?.bookingId ?? data?.assignment_id;
  if (bookingId == null) return;

  const tripType = String(data?.trip_type ?? data?.tripType ?? 'New Booking');
  const fareRaw = data?.estimated_price ?? data?.fare ?? data?.amount ?? data?.cost_per_km;
  const fare = fareRaw != null ? `Rs ${fareRaw}` : '';

  showBubble(tripType, fare, String(bookingId));
}
