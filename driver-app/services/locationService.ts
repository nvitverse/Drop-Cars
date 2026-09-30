import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import axiosInstance from '../app/api/axiosInstance';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

const DRIVER_LOCATION_KEY = '@dropcars_driver_last_location';

export const locationService = {
  async saveLastKnownLocation(coords: LocationCoordinates): Promise<void> {
    try {
      await AsyncStorage.setItem(DRIVER_LOCATION_KEY, JSON.stringify(coords));
    } catch (e) {
      console.error('Failed to save driver location:', e);
    }
  },

  async getLastKnownLocation(): Promise<LocationCoordinates | null> {
    try {
      const data = await AsyncStorage.getItem(DRIVER_LOCATION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  async postDriverLocation(orderId: number | string, coords: LocationCoordinates): Promise<boolean> {
    try {
      await this.saveLastKnownLocation(coords);
      // Same OrderAssignment.last_lat/last_lng columns the website's
      // driver-trip.php link already writes to (see
      // /website/trip-link/{token}/location) - this is the Driver App's
      // own JWT-authenticated counterpart, see
      // POST /driver/orders/{order_id}/location in order_assignments.py.
      await axiosInstance.post(`/api/orders/driver/orders/${orderId}/location`, {
        lat: coords.latitude,
        lng: coords.longitude,
      });
      return true;
    } catch (error) {
      console.error('Failed to send driver location to backend:', error);
      return false;
    }
  },

  async postLocationSharingStopped(orderId: number | string): Promise<void> {
    try {
      await axiosInstance.post(`/api/orders/driver/orders/${orderId}/location/left`);
    } catch (error) {
      console.error('Failed to notify backend that location sharing stopped:', error);
    }
  },

  openMapsNavigation(destination: string, origin?: string): void {
    const encodedDest = encodeURIComponent(destination);
    let url = `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}`;
    if (origin) {
      url += `&origin=${encodeURIComponent(origin)}`;
    }
    const Linking = require('react-native').Linking;
    Linking.openURL(url).catch((err: any) => console.error('Could not launch maps:', err));
  }
};

export default locationService;

// --- Foreground trip-location sharing (start/end wired from
// app/trip/start.tsx and app/trip/end.tsx) ---
//
// KNOWN GAP: this only runs a foreground JS setInterval - tracking silently
// stops the moment the driver locks the phone or backgrounds the app
// mid-trip (no TaskManager-registered background task). The fix is a real
// background location task via expo-location's startLocationUpdatesAsync +
// TaskManager.defineTask, following the exact pattern already used for
// push notifications in services/notifications/backgroundNotificationTask.ts
// (module-scope defineTask + an idempotent register*() called once at
// startup). That is NOT wired up here because it requires two Android
// manifest permissions (ACCESS_BACKGROUND_LOCATION and, on Android 14+,
// FOREGROUND_SERVICE_LOCATION) that are not present in the committed,
// non-managed android/app/src/main/AndroidManifest.xml, and this app's
// android/ folder must not be touched/regenerated (no `expo prebuild`) -
// registering the task without those permissions would silently never
// activate (a half-wired, falsely-reassuring fix). Add those two
// <uses-permission> lines by hand to that manifest first, then wire this
// up for real.
//
// Deliberately foreground-only otherwise, tied to one active trip - starts
// only once a trip is actually DRIVING and stops the moment it ends, to
// keep GPS + network usage (and the running cost this powers - Cloud Run
// requests, driver battery) bounded to exactly when a customer could
// plausibly be watching the live map, matching the same website trip-link
// flow's own "share only while the page is open" model.
let trackingIntervalId: ReturnType<typeof setInterval> | null = null;
let trackingOrderId: number | string | null = null;

const TRACKING_INTERVAL_MS = 20000;

async function pingOnce(orderId: number | string) {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await locationService.postDriverLocation(orderId, {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
    });
  } catch (e) {
    console.log('Trip location ping failed (will retry next interval):', e);
  }
}

export async function startTripLocationSharing(orderId: number | string): Promise<void> {
  // Only one trip's sharing loop runs at a time - starting a new one
  // replaces any previous (defensive; trip/end.tsx should always stop the
  // old one first, but this avoids two intervals stacking if it doesn't).
  stopTripLocationSharing();

  if (Platform.OS === 'web') {
    // Web preview has no real GPS hardware behind it in this environment -
    // skip rather than repeatedly failing permission/position calls.
    return;
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.log('Location permission not granted - trip location sharing stays off for this trip.');
    return;
  }

  trackingOrderId = orderId;
  await pingOnce(orderId);
  trackingIntervalId = setInterval(() => {
    if (trackingOrderId != null) pingOnce(trackingOrderId);
  }, TRACKING_INTERVAL_MS);
}

export function stopTripLocationSharing(): void {
  if (trackingIntervalId) {
    clearInterval(trackingIntervalId);
    trackingIntervalId = null;
  }
  if (trackingOrderId != null) {
    locationService.postLocationSharingStopped(trackingOrderId);
    trackingOrderId = null;
  }
}
