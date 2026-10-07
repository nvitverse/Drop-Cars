import {
  TARIFF,
  MIN_BILLED_KM,
  LOCAL_PACKAGES,
  LOCAL_EXTRA_HOUR_RATE,
  StandardVehicleCategory,
  BOOKING_CONFIG,
} from '@/constants/bookingConfig';
import { StandardTripType, FarePlan } from '@/types/booking';

/**
 * Estimated route distance in KM. Real implementation would call a
 * directions/geocoding service - this is a deterministic mock (same pair of
 * locations always resolves to the same distance) so fares stay stable
 * across re-renders and back navigation.
 */
const KNOWN_INTERCITY_DISTANCES: Record<string, number> = {
  // Tiruvannamalai Surrounding Towns & Taluks
  'tiruvannamalai|chengam': 34,
  'chengam|tiruvannamalai': 34,
  'tiruvannamalai|polur': 35,
  'polur|tiruvannamalai': 35,
  'tiruvannamalai|arani': 60,
  'arani|tiruvannamalai': 60,
  'tiruvannamalai|gingee': 39,
  'gingee|tiruvannamalai': 39,
  'tiruvannamalai|vandavasi': 68,
  'vandavasi|tiruvannamalai': 68,
  'tiruvannamalai|cheyyar': 75,
  'cheyyar|tiruvannamalai': 75,
  'tiruvannamalai|tirukoilur': 37,
  'tirukoilur|tiruvannamalai': 37,
  'tiruvannamalai|thirukoilur': 37,
  'thirukoilur|tiruvannamalai': 37,
  'tiruvannamalai|kallakurichi': 62,
  'kallakurichi|tiruvannamalai': 62,
  'tiruvannamalai|tindivanam': 70,
  'tindivanam|tiruvannamalai': 70,
  'tiruvannamalai|harur': 55,
  'harur|tiruvannamalai': 55,
  'tiruvannamalai|uthangarai': 65,
  'uthangarai|tiruvannamalai': 65,

  // Major Intercity Routes
  'chennai|bangalore': 345,
  'bangalore|chennai': 345,
  'bengaluru|chennai': 345,
  'chennai|bengaluru': 345,
  'chennai|pondicherry': 155,
  'pondicherry|chennai': 155,
  'puducherry|chennai': 155,
  'chennai|coimbatore': 505,
  'coimbatore|chennai': 505,
  'chennai|madurai': 462,
  'madurai|chennai': 462,
  'chennai|trichy': 330,
  'trichy|chennai': 330,
  'chennai|salem': 340,
  'salem|chennai': 340,
  'chennai|vellore': 140,
  'vellore|chennai': 140,
  'chennai|tiruvannamalai': 195,
  'tiruvannamalai|chennai': 195,
  'tiruvannamalai|bangalore': 205,
  'bangalore|tiruvannamalai': 205,
  'bengaluru|tiruvannamalai': 205,
  'tiruvannamalai|pondicherry': 110,
  'pondicherry|tiruvannamalai': 110,
  'tiruvannamalai|vellore': 85,
  'vellore|tiruvannamalai': 85,
  'tiruvannamalai|salem': 140,
  'salem|tiruvannamalai': 140,
  'tiruvannamalai|trichy': 180,
  'trichy|tiruvannamalai': 180,
  'coimbatore|bangalore': 365,
  'bangalore|coimbatore': 365,
  'madurai|bangalore': 435,
  'bangalore|madurai': 435,
};

const TAMILNADU_CITIES = [
  'chennai', 'bangalore', 'bengaluru', 'coimbatore', 'madurai', 'trichy',
  'tiruchirappalli', 'salem', 'tiruvannamalai', 'thiruvannamalai', 'pondicherry',
  'puducherry', 'vellore', 'kanchipuram', 'villupuram', 'thanjavur', 'tanjore',
  'tirupur', 'erode', 'tirunelveli', 'hosur', 'dindigul', 'nagercoil', 'cuddalore',
  'kumbakonam', 'tuticorin', 'thoothukudi', 'karur', 'rajapalayam', 'chengam',
  'polur', 'arani', 'gingee', 'vandavasi', 'cheyyar', 'kallakurichi'
];

const LOCAL_LANDMARK_KEYWORDS = [
  'temple', 'station', 'bus stand', 'bus stop', 'airport', 'hospital', 'college',
  'university', 'mall', 'nagar', 'colony', 'street', 'road', 'salai', 'ashram',
  'path', 'girivalam', 'square', 'circle', 'bypass', 'junction', 'park', 'beach',
  'theatre', 'cinema', 'market', 'bazaar', 'bridge', 'complex', 'cross'
];

export function estimateDistanceKm(pickup: string, drop: string): number {
  if (!pickup || !drop) return 0;
  const pLow = pickup.trim().toLowerCase();
  const dLow = drop.trim().toLowerCase();

  if (pLow === dLow) return 3;

  // 1. Direct Known Intercity / Inter-town Pair Lookup
  for (const [pair, dist] of Object.entries(KNOWN_INTERCITY_DISTANCES)) {
    const [c1, c2] = pair.split('|');
    if (pLow.includes(c1) && dLow.includes(c2)) {
      return dist;
    }
  }

  const pickupCity = TAMILNADU_CITIES.find(c => pLow.includes(c));
  const dropCity = TAMILNADU_CITIES.find(c => dLow.includes(c));

  // 2. Intra-city / Local Landmark Detection
  const isSameCity = pickupCity && dropCity && (
    pickupCity === dropCity ||
    (pickupCity.startsWith('tiruvannamalai') && dropCity.startsWith('tiruvannamalai')) ||
    (pickupCity.startsWith('bangalore') && dropCity.startsWith('bengaluru')) ||
    (pickupCity.startsWith('pondicherry') && dropCity.startsWith('puducherry'))
  );

  const isLandmarkInvolved = LOCAL_LANDMARK_KEYWORDS.some(k => pLow.includes(k) || dLow.includes(k));

  if (isSameCity || (isLandmarkInvolved && (!pickupCity || !dropCity))) {
    let hash = 0;
    const combined = `${pLow}|${dLow}`;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash * 31 + combined.charCodeAt(i)) % 100;
    }
    // Realistic intra-city local drop distance: 3.5 km to 12 km
    return Math.max(3.5, (hash % 10) + 3.5);
  }

  // 3. Known Different Cities Fallback
  if (pickupCity && dropCity && pickupCity !== dropCity) {
    let hash = 0;
    const combined = `${pickupCity}|${dropCity}`;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash * 31 + combined.charCodeAt(i)) % 200;
    }
    return 80 + (hash % 150);
  }

  return 28;
}

export interface StandardFareBreakdown {
  // true when these numbers come from the live backend quote (the tariffs the owner edits in the Admin App);
  // false = the old built-in estimate, used only until the quote arrives or when it cannot be fetched
  isLive?: boolean;
  permitAmount?: number;
  hillAmount?: number;
  nightAmount?: number;
  tripType: StandardTripType;
  farePlan?: FarePlan;
  vehicleCategory: StandardVehicleCategory;
  distanceKm: number;
  billedKm: number;
  perKmRate: number;
  driverBeta: number;
  distanceFare: number;
  tollAmount: number;
  gstAmount: number;
  subtotalBeforeTax: number;
  totalFare: number;
  packageLabel?: string;
}

// Centralized: every all-inclusive fare (Standard AND Drop Bid, via
// dropBidEngine's own use of this same math) is computed here, once - GST
// and toll are never hardcoded into a screen.
function applyTaxAndToll(distanceFare: number, driverBeta: number, billedKm: number, tripType: StandardTripType) {
  const tollAmount = tripType === 'LOCAL' ? 0 : Math.round((billedKm / 100) * BOOKING_CONFIG.TOLL_PER_100KM);
  const subtotalBeforeTax = distanceFare + driverBeta + tollAmount + BOOKING_CONFIG.STATE_PERMIT_FLAT;
  const gstAmount = Math.round(subtotalBeforeTax * (BOOKING_CONFIG.GST_PERCENT / 100));
  const totalFare = subtotalBeforeTax + gstAmount;
  return { tollAmount, subtotalBeforeTax, gstAmount, totalFare };
}

function tariffTable(tripType: StandardTripType, farePlan: FarePlan) {
  if (tripType === 'ONEWAY') return TARIFF.ONEWAY;
  if (tripType === 'MULTICITY') return TARIFF.ROUNDTRIP_USUAL;
  if (tripType === 'LOCAL') return TARIFF.ONEWAY; // local uses base one-way per-km rate
  // ROUNDTRIP
  return farePlan === 'LOW_BUDGET' ? TARIFF.ROUNDTRIP_LOW_BUDGET : TARIFF.ROUNDTRIP_USUAL;
}

export function computeStandardFare(params: {
  tripType: StandardTripType;
  farePlan?: FarePlan;
  vehicleCategory: StandardVehicleCategory;
  pickup: string;
  drop: string;
  localPackageId?: string;
  // Real driving distance from the backend's Google Distance Matrix quote
  // (POST /customer/bookings/quote), when the caller has already fetched
  // one for this pickup/drop pair - overrides the estimateDistanceKm()
  // guess below, which is a hash-based placeholder (flat 28km fallback for
  // any route it doesn't recognize as a known city).
  realDistanceKmOverride?: number | null;
}): StandardFareBreakdown {
  const { tripType, vehicleCategory, pickup, drop } = params;
  const farePlan: FarePlan = params.farePlan ?? 'USUAL';
  const table = tariffTable(tripType, farePlan);
  const rate = table[vehicleCategory];

  if (tripType === 'LOCAL') {
    const pkg = LOCAL_PACKAGES.find(p => p.id === params.localPackageId) ?? LOCAL_PACKAGES[1];
    const distanceFare = pkg.km * rate.perKm;
    const tax = applyTaxAndToll(distanceFare, rate.driverBeta, pkg.km, tripType);
    return {
      tripType,
      farePlan,
      vehicleCategory,
      distanceKm: pkg.km,
      billedKm: pkg.km,
      perKmRate: rate.perKm,
      driverBeta: rate.driverBeta,
      distanceFare,
      ...tax,
      packageLabel: pkg.label,
    };
  }

  const oneWayDistance = params.realDistanceKmOverride ?? estimateDistanceKm(pickup, drop);
  const distanceKm = tripType === 'ROUNDTRIP' || tripType === 'MULTICITY' ? oneWayDistance * 2 : oneWayDistance;
  const minKm = tripType === 'ONEWAY' ? MIN_BILLED_KM.ONEWAY
    : tripType === 'ROUNDTRIP' ? MIN_BILLED_KM.ROUNDTRIP
    : MIN_BILLED_KM.MULTICITY;
  const billedKm = Math.max(distanceKm, minKm);
  const distanceFare = billedKm * rate.perKm;
  const tax = applyTaxAndToll(distanceFare, rate.driverBeta, billedKm, tripType);

  return {
    tripType,
    farePlan,
    vehicleCategory,
    distanceKm,
    billedKm,
    perKmRate: rate.perKm,
    driverBeta: rate.driverBeta,
    distanceFare,
    ...tax,
  };
}

// One vehicle's live price from POST /customer/bookings/quote-all.
export interface ServerFare {
  total_km: number;
  trip_time: string;
  base_km_amount: number;
  driver_allowance: number;
  extra_driver_allowance: number;
  permit_charges: number;
  extra_permit_charges: number;
  hill_charges: number;
  toll_charges: number;
  night_charges: number;
  total_amount: number;
  customer_amount: number;
}

// What the customer pays is the backend's customer_amount, nothing added on top (no invented toll / permit / GST). GST is an optional
// upgrade the customer can take later from My Trips.
export function fareFromServer(q: ServerFare, ctx: { tripType: StandardTripType; farePlan?: FarePlan; vehicleCategory: StandardVehicleCategory }): StandardFareBreakdown {
  const driverBeta = (q.driver_allowance || 0) + (q.extra_driver_allowance || 0);
  const permitAmount = (q.permit_charges || 0) + (q.extra_permit_charges || 0);
  const hillAmount = q.hill_charges || 0;
  const tollAmount = q.toll_charges || 0;
  const nightAmount = q.night_charges || 0;
  const total = q.customer_amount || q.total_amount || 0;
  const distanceFare = Math.max(0, total - driverBeta - permitAmount - hillAmount - tollAmount - nightAmount);
  const km = q.total_km || 0;
  return {
    isLive: true,
    tripType: ctx.tripType,
    farePlan: ctx.farePlan,
    vehicleCategory: ctx.vehicleCategory,
    distanceKm: km,
    billedKm: km,
    perKmRate: km > 0 ? Math.round(distanceFare / km) : 0,
    driverBeta,
    distanceFare,
    tollAmount,
    permitAmount,
    hillAmount,
    nightAmount,
    gstAmount: 0,
    subtotalBeforeTax: total,
    totalFare: total,
  };
}

export { LOCAL_PACKAGES, LOCAL_EXTRA_HOUR_RATE };
