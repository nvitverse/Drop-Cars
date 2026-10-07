import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface OTAUpdateStatus {
  isAvailable: boolean;
  isDownloading: boolean;
  isReadyToReload: boolean;
  manifest?: any;
  updateId?: string;
  channel?: string;
  runtimeVersion?: string;
  errorMessage?: string;
}

/**
 * Checks if a live Over-The-Air (OTA) update is available on EAS Update servers.
 */
export async function checkOTAUpdate(): Promise<{
  isAvailable: boolean;
  manifest?: any;
  message: string;
}> {
  if (__DEV__) {
    return {
      isAvailable: false,
      message: 'Running in development mode. Live OTA updates apply to production/preview builds.',
    };
  }

  if (Platform.OS === 'web') {
    return {
      isAvailable: false,
      message: 'Web platform automatically loads the latest assets on page refresh.',
    };
  }

  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      return {
        isAvailable: true,
        manifest: update.manifest,
        message: 'A new live update is available!',
      };
    } else {
      return {
        isAvailable: false,
        message: 'Your app is up to date with the latest live version.',
      };
    }
  } catch (error: any) {
    console.warn('OTA Update Check Error:', error);
    return {
      isAvailable: false,
      message: error?.message || 'Could not check for live updates.',
    };
  }
}

/**
 * Downloads and prepares a live update, then reloads the app instantly.
 */
export async function fetchAndApplyOTAUpdate(): Promise<{
  success: boolean;
  message: string;
}> {
  if (__DEV__ || Platform.OS === 'web') {
    return {
      success: false,
      message: 'OTA reload is only available in native production builds.',
    };
  }

  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      await Updates.reloadAsync();
      return {
        success: true,
        message: 'Live update applied! Reloading app...',
      };
    } else {
      return {
        success: false,
        message: 'No new update assets found.',
      };
    }
  } catch (error: any) {
    console.error('OTA Update Download Error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to download live update.',
    };
  }
}

let launchCheckDone = false;

/**
 * Once per app start: if a newer live update exists, download it and restart straight into it. Without this the phone only
 * downloaded the update in the background and showed it on the NEXT launch, so staff kept running the old screens (missing
 * buttons, old popups) for a whole extra open/close. Never throws; gives up quietly if the network is slow.
 */
export async function applyLatestUpdateOnLaunch(): Promise<void> {
  if (launchCheckDone || __DEV__ || Platform.OS === 'web') return;
  launchCheckDone = true;
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
    const check = await Promise.race([Updates.checkForUpdateAsync(), timeout]);
    if (!check.isAvailable) return;
    const result = await Promise.race([Updates.fetchUpdateAsync(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))]);
    if (result.isNew) await Updates.reloadAsync();
  } catch (e) {
    // offline / slow: the normal background download still happens, the update shows on the next start
  }
}

/**
 * Gets currently active bundle & update info.
 */
export function getActiveUpdateInfo() {
  return {
    channel: Updates.channel || 'production',
    updateId: Updates.updateId || 'Embedded Build',
    runtimeVersion: Updates.runtimeVersion || '1.1.0',
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    createdAt: Updates.createdAt ? new Date(Updates.createdAt).toLocaleString('en-IN') : 'N/A',
  };
}
