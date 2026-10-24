import { NativeModules, Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

// Android-only native module (plugins/native_alert_overlay, added by plugins/withStaffAlertOverlay.js). It is NOT there on an Admin build made
// before this feature, nor on iOS / web - every function below copes with that, so the JS can ship by OTA ahead of the new build.
const { StaffAlertOverlayModule } = NativeModules as {
  StaffAlertOverlayModule?: {
    hasOverlayPermission(): Promise<boolean>;
    requestOverlayPermission(): Promise<void>;
    showBubble(label: string, sub: string, pendingId: string): void;
    hideBubble(): void;
    startPersistentService(): Promise<boolean>;
    stopPersistentService(): void;
    isIgnoringBatteryOptimizations(): Promise<boolean>;
    requestIgnoreBatteryOptimizations(): Promise<void>;
  };
};

/** true when this build contains the native part (an old build says false and the prompt tells staff to update the app). */
export const overlayNativeAvailable = Platform.OS === 'android' && !!StaffAlertOverlayModule;

export type AlertReadiness = {
  notifications: boolean;           // notification permission granted
  overlay: boolean | null;          // "display over other apps"; null = this build cannot tell
  battery: boolean | null;          // battery optimisation off for the app; null = this build cannot tell
  nativeAvailable: boolean;
  ready: boolean;                   // everything that CAN be checked is OK
};

export async function getAlertReadiness(): Promise<AlertReadiness> {
  if (Platform.OS !== 'android') {
    return { notifications: true, overlay: null, battery: null, nativeAvailable: false, ready: true };
  }
  let notifications = false;
  try {
    notifications = (await Notifications.getPermissionsAsync()).status === 'granted';
  } catch {}
  let overlay: boolean | null = null;
  let battery: boolean | null = null;
  if (StaffAlertOverlayModule) {
    try { overlay = await StaffAlertOverlayModule.hasOverlayPermission(); } catch { overlay = null; }
    try { battery = await StaffAlertOverlayModule.isIgnoringBatteryOptimizations(); } catch { battery = null; }
  }
  return { notifications, overlay, battery, nativeAvailable: !!StaffAlertOverlayModule, ready: notifications && overlay !== false && battery !== false };
}

export async function askNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return true;
  } catch {}
  try { await Linking.openSettings(); } catch {}      // refused once: Android will not ask again, the app's own settings page is the only way
  return false;
}

export async function askOverlayPermission(): Promise<void> {
  if (StaffAlertOverlayModule) {
    try { await StaffAlertOverlayModule.requestOverlayPermission(); return; } catch {}
  }
  try { await Linking.openSettings(); } catch {}      // old build: the app's settings page (Display over other apps is under its permissions)
}

export async function askBatteryWhitelist(): Promise<void> {
  if (StaffAlertOverlayModule) {
    try { await StaffAlertOverlayModule.requestIgnoreBatteryOptimizations(); return; } catch {}
  }
  try { await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); return; } catch {}
  try { await Linking.openSettings(); } catch {}
}

export function showAlertBubble(label: string, sub = '', pendingId = ''): void {
  if (!overlayNativeAvailable) return;
  try { StaffAlertOverlayModule!.showBubble(label, sub, pendingId); } catch {}
}

export function hideAlertBubble(): void {
  if (!overlayNativeAvailable) return;
  try { StaffAlertOverlayModule!.hideBubble(); } catch {}
}

export async function startOnDutyService(): Promise<boolean> {
  if (!overlayNativeAvailable) return false;
  try { return await StaffAlertOverlayModule!.startPersistentService(); } catch { return false; }
}

export function stopOnDutyService(): void {
  if (!overlayNativeAvailable) return;
  try { StaffAlertOverlayModule!.stopPersistentService(); } catch {}
}
