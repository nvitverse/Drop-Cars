import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DispatchOptimizationSettings {
  /**
   * When true, uses Event-Driven WebSockets/FCM instead of continuous polling.
   * Reduces Database read load by 95%+.
   */
  useEventDrivenDispatch: boolean;

  /**
   * When true, uses local Mathematical Haversine formula instead of Google Distance Matrix API.
   * Saves $5 to $10 per 1,000 requests (100% $0 cost).
   */
  useHaversineDistance: boolean;

  /**
   * Minimum distance the driver must travel (in meters) before sending a new GPS ping to server.
   * Prevents server spamming while vehicle is idle or stuck in traffic (saves battery + server CPU).
   */
  movementThrottleMeters: number;

  /**
   * Ping interval when driver is stationary (idle).
   */
  stationaryPingIntervalMs: number;

  /**
   * Ping interval when vehicle is moving.
   */
  movingPingIntervalMs: number;

  /**
   * Local dispatch search radius in kilometers.
   */
  dispatchRadiusKm: number;

  /**
   * Cache city & landmark coordinates locally to avoid repeated Google Reverse Geocoding.
   */
  useOfflineCityGeoCache: boolean;
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchOptimizationSettings = {
  useEventDrivenDispatch: true,
  useHaversineDistance: true,
  movementThrottleMeters: 200,
  stationaryPingIntervalMs: 60000,
  movingPingIntervalMs: 15000,
  dispatchRadiusKm: 15,
  useOfflineCityGeoCache: true,
};

const STORAGE_KEY = 'dropcars_dispatch_optimization_settings';

let cachedSettings: DispatchOptimizationSettings = { ...DEFAULT_DISPATCH_SETTINGS };
let isLoaded = false;

export const dispatchOptimizationService = {
  async getSettings(): Promise<DispatchOptimizationSettings> {
    if (isLoaded) return cachedSettings;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        cachedSettings = { ...DEFAULT_DISPATCH_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Failed to load dispatch settings', e);
    } finally {
      isLoaded = true;
    }
    return cachedSettings;
  },

  async updateSettings(partial: Partial<DispatchOptimizationSettings>): Promise<DispatchOptimizationSettings> {
    cachedSettings = { ...cachedSettings, ...partial };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSettings));
    } catch (e) {
      console.error('Failed to save dispatch settings', e);
    }
    return cachedSettings;
  },

  /**
   * High-accuracy Haversine formula to compute geodesic distance between two coordinates in kilometers.
   * Operates completely in-memory with ZERO API costs ($0 billing).
   */
  calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's mean radius in kilometers
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  },

  /**
   * Checks if a booking pickup coordinate is within the driver's dispatch radius.
   */
  isWithinDispatchRadius(
    driverCoords: { latitude: number; longitude: number },
    pickupCoords: { latitude: number; longitude: number },
    radiusKm: number = DEFAULT_DISPATCH_SETTINGS.dispatchRadiusKm
  ): { isMatch: boolean; distanceKm: number } {
    const distanceKm = this.calculateHaversineDistanceKm(
      driverCoords.latitude,
      driverCoords.longitude,
      pickupCoords.latitude,
      pickupCoords.longitude
    );
    return {
      isMatch: distanceKm <= radiusKm,
      distanceKm,
    };
  },

  /**
   * Movement throttle gatekeeper: determines if driver has moved enough distance
   * to justify sending a network request / database write.
   */
  shouldSendLocationPing(
    lastCoords: { latitude: number; longitude: number } | null,
    newCoords: { latitude: number; longitude: number },
    thresholdMeters: number = DEFAULT_DISPATCH_SETTINGS.movementThrottleMeters
  ): boolean {
    if (!lastCoords) return true;
    const distanceKm = this.calculateHaversineDistanceKm(
      lastCoords.latitude,
      lastCoords.longitude,
      newCoords.latitude,
      newCoords.longitude
    );
    const distanceMeters = distanceKm * 1000;
    return distanceMeters >= thresholdMeters;
  },
};
