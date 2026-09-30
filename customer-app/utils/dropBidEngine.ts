import { DriverQuote } from '@/types/booking';
import {
  BOOKING_CONFIG,
  ALTERNATE_VEHICLE_MAP,
  DropBidVehicleCategory,
} from '@/constants/bookingConfig';
import { estimateDistanceKm } from '@/utils/taxiPricing';

const FIRST_NAMES = ['Ramesh', 'Suresh', 'Arun', 'Kumar', 'Vijay', 'Senthil', 'Prakash', 'Manikandan', 'Bala', 'Karthik', 'Dinesh', 'Mohan', 'Saravanan', 'Ashok', 'Ganesh'];
const LAST_NAMES = ['Kumar', 'Babu', 'Raj', 'V.', 'S.', 'M.', 'Prasad', 'Swamy', 'Nathan', 'Moorthy'];

const VEHICLE_MODELS: Record<DropBidVehicleCategory, string[]> = {
  SEDAN: ['Swift Dzire', 'Honda Amaze', 'Toyota Etios'],
  SUV: ['Maruti Ertiga', 'Kia Carens', 'Mahindra Marazzo'],
  INNOVA: ['Toyota Innova Classic', 'Toyota Innova Crysta'],
  CRYSTA: ['Innova Crysta VIP', 'Innova Crysta ZX'],
};

// Vehicles that can show up as an ALTERNATIVE for an Innova request without
// being labelled as an Innova at all (e.g. a hybrid crossover of comparable
// class). Always flagged isAlternativeVehicle so the customer is never
// confused about what they are actually getting.
const ALTERNATIVE_MODEL_NAMES: Partial<Record<DropBidVehicleCategory, string[]>> = {
  INNOVA: ['Toyota Hycross'],
  SUV: ['Toyota Hycross'],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seed) % arr.length];
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOffersParams {
  requestId: string;
  pickupLocation: string;
  dropLocation: string;
  vehicleCategory: DropBidVehicleCategory;
  passengerCount: number;
  expectedFare?: number;
  offerValidityMinutes: number;
  count?: number;
}

/**
 * Deterministic-ish mock driver-offer generator. Not random per render (uses
 * a seeded RNG keyed off the request id) so the offer list doesn't jump
 * around while the customer is reading it — new offers are only appended by
 * explicit "simulate live update" calls, matching Section 45's requirement
 * that live updates must not disturb the customer's current position.
 */
export function generateDropBidOffers(params: GenerateOffersParams): DriverQuote[] {
  const { requestId, vehicleCategory, expectedFare, offerValidityMinutes } = params;
  const count = params.count ?? (8 + (requestId.length % 8)); // 8-15 offers
  const eligibleCategories = ALTERNATE_VEHICLE_MAP[vehicleCategory] ?? [vehicleCategory];
  const distanceBase = estimateDistanceKm(params.pickupLocation, params.dropLocation);
  const baseFare = expectedFare && expectedFare > 0
    ? expectedFare
    : Math.round((distanceBase * (vehicleCategory === 'SEDAN' ? 14 : vehicleCategory === 'SUV' ? 19 : vehicleCategory === 'INNOVA' ? 20 : 24)) + 450);

  let seedBase = 0;
  for (let i = 0; i < requestId.length; i++) seedBase = (seedBase * 31 + requestId.charCodeAt(i)) >>> 0;

  const offers: DriverQuote[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seedBase + i * 7919);
    const category = pick(eligibleCategories, rng() * eligibleCategories.length);
    const isAlternativeVehicle = category !== vehicleCategory;
    const altNames = ALTERNATIVE_MODEL_NAMES[category];
    const useAltModel = isAlternativeVehicle && altNames && rng() < 0.6;

    const carName = useAltModel
      ? pick(altNames!, rng() * altNames!.length)
      : pick(VEHICLE_MODELS[category], rng() * VEHICLE_MODELS[category].length);

    const driverName = `${pick(FIRST_NAMES, rng() * FIRST_NAMES.length)} ${pick(LAST_NAMES, rng() * LAST_NAMES.length)}`;
    const rating = Math.round((4.2 + rng() * 0.79) * 100) / 100;
    const completedTrips = Math.round(40 + rng() * 900);
    const reliabilityScore = Math.round(84 + rng() * 16);
    const distanceKm = Math.round((0.4 + rng() * 6.5) * 10) / 10;
    const etaMinutes = Math.max(2, Math.round(distanceKm * 2.2 + rng() * 3));

    // Fare variance around the base fare, +/- ~14%, nudged by vehicle class.
    const classMultiplier = category === 'CRYSTA' ? 1.12 : category === 'INNOVA' ? 1.0 : category === 'SUV' ? 0.95 : 0.86;
    const variance = 0.86 + rng() * 0.28;
    const quotedFare = Math.round((baseFare * classMultiplier * variance) / 10) * 10;

    const advanceAmount = Math.round(quotedFare * (BOOKING_CONFIG.CUSTOMER_ADVANCE_PERCENT / 100));
    const balanceAmount = quotedFare - advanceAmount;
    const walletHoldAmount = Math.round(quotedFare * (BOOKING_CONFIG.DRIVER_WALLET_HOLD_PERCENT / 100));

    const expiresAt = new Date(now + offerValidityMinutes * 60 * 1000 - i * 4000).toISOString();

    offers.push({
      quoteId: `${requestId}-off-${i}`,
      driverId: `drv-${requestId}-${i}`,
      driverName,
      driverPhone: `98765${(40000 + i * 37 + seedBase % 900).toString().slice(-5)}`,
      driverRating: rating,
      completedTrips,
      reliabilityScore,
      carName,
      carCategory: category,
      carNumber: `TN ${(10 + (i % 40)).toString().padStart(2, '0')} ${pick(['AB', 'CD', 'EF', 'GJ', 'KL'], rng() * 5)} ${1000 + Math.round(rng() * 8999)}`,
      isAlternativeVehicle,
      alternativeVehicleName: useAltModel ? carName : undefined,
      quotedFare,
      advanceAmount,
      balanceAmount,
      walletHoldAmount,
      etaMinutes,
      distanceKm,
      offerExpiresAt: expiresAt,
      status: 'ACTIVE',
      counterHistory: [],
    });
  }

  return rankAndTagOffers(offers);
}

/** Adds one more freshly-generated offer to simulate a live incoming bid. */
export function generateSingleLiveOffer(params: GenerateOffersParams, existingCount: number): DriverQuote {
  const [offer] = generateDropBidOffers({ ...params, count: 1, requestId: `${params.requestId}-live-${existingCount}-${Date.now()}` });
  return offer;
}

interface ScoredOffer {
  offer: DriverQuote;
  score: number;
}

function normalize(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 1;
  const n = (value - min) / (max - min);
  return invert ? 1 - n : n;
}

/**
 * Computes the "Recommended" ranking (Section 14) - a weighted blend of
 * fare, rating, completed trips, reliability and ETA. Cheapest is NOT
 * automatically first; a driver with a slightly higher fare but much better
 * rating/reliability/ETA can outrank it.
 */
export function scoreOffers(offers: DriverQuote[]): ScoredOffer[] {
  if (offers.length === 0) return [];
  const w = BOOKING_CONFIG.RECOMMENDATION_WEIGHTS;

  const fares = offers.map(o => o.quotedFare);
  const ratings = offers.map(o => o.driverRating);
  const trips = offers.map(o => o.completedTrips);
  const reliability = offers.map(o => o.reliabilityScore ?? 90);
  const etas = offers.map(o => o.etaMinutes);

  const fareRange = [Math.min(...fares), Math.max(...fares)];
  const ratingRange = [Math.min(...ratings), Math.max(...ratings)];
  const tripsRange = [Math.min(...trips), Math.max(...trips)];
  const reliabilityRange = [Math.min(...reliability), Math.max(...reliability)];
  const etaRange = [Math.min(...etas), Math.max(...etas)];

  return offers.map(offer => {
    const fareScore = normalize(offer.quotedFare, fareRange[0], fareRange[1], true);
    const ratingScore = normalize(offer.driverRating, ratingRange[0], ratingRange[1]);
    const tripsScore = normalize(offer.completedTrips, tripsRange[0], tripsRange[1]);
    const reliabilityScore = normalize(offer.reliabilityScore ?? 90, reliabilityRange[0], reliabilityRange[1]);
    const etaScore = normalize(offer.etaMinutes, etaRange[0], etaRange[1], true);

    const score =
      fareScore * w.fare +
      ratingScore * w.rating +
      tripsScore * w.completedTrips +
      reliabilityScore * w.reliability +
      etaScore * w.eta;

    return { offer, score };
  });
}

/**
 * Ranks offers and assigns at most one recommendation badge per offer, only
 * to offers that genuinely stand out on that dimension (Section 14).
 */
export function rankAndTagOffers(offers: DriverQuote[]): DriverQuote[] {
  if (offers.length === 0) return offers;
  const scored = scoreOffers(offers).sort((a, b) => b.score - a.score);

  const cheapest = [...offers].sort((a, b) => a.quotedFare - b.quotedFare)[0];
  const topRated = [...offers].sort((a, b) => b.driverRating - a.driverRating)[0];
  const fastest = [...offers].sort((a, b) => a.etaMinutes - b.etaMinutes)[0];
  const mostReliable = [...offers].sort((a, b) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0))[0];

  const topOverallId = scored[0]?.offer.quoteId;
  const usedTags = new Set<string>();

  return scored.map(({ offer, score }, idx) => {
    let tag: DriverQuote['recommendationTag'] | undefined;
    let isRecommended = false;

    if (offer.quoteId === topOverallId) {
      isRecommended = true;
      tag = 'Best Value';
      usedTags.add(offer.quoteId);
    } else if (offer.quoteId === topRated.quoteId && !usedTags.has(offer.quoteId)) {
      tag = 'Top Rated';
      isRecommended = idx < 3;
      usedTags.add(offer.quoteId);
    } else if (offer.quoteId === fastest.quoteId && !usedTags.has(offer.quoteId)) {
      tag = 'Fastest Arrival';
      isRecommended = idx < 3;
      usedTags.add(offer.quoteId);
    } else if (offer.quoteId === mostReliable.quoteId && !usedTags.has(offer.quoteId)) {
      tag = 'Highly Reliable';
      isRecommended = idx < 3;
      usedTags.add(offer.quoteId);
    } else if (offer.isAlternativeVehicle && idx < 5 && !usedTags.has(offer.quoteId)) {
      tag = 'Great Alternative';
      usedTags.add(offer.quoteId);
    }

    const processedOffer = {
      ...offer,
      isRecommended,
      recommendationTag: tag,
      _score: score,
    } as DriverQuote & { _score: number };

    return {
      ...processedOffer,
      matchReasons: getMatchReasons(processedOffer),
    };
  });
}

export function getMatchReasons(offer: DriverQuote): string[] {
  const reasons: string[] = [];
  if (offer.etaMinutes <= 8) {
    reasons.push(`⚡ ${offer.etaMinutes}-min Fastest Arrival`);
  } else if (offer.etaMinutes <= 12) {
    reasons.push(`⏱️ Quick ${offer.etaMinutes}-min Pickup`);
  }

  if (offer.driverRating >= 4.8) {
    reasons.push(`⭐ ${offer.driverRating} Top-Rated Driver`);
  }

  if (offer.reliabilityScore && offer.reliabilityScore >= 95) {
    reasons.push(`🛡️ ${offer.reliabilityScore}% High Reliability`);
  }

  if (offer.recommendationTag === 'Best Value') {
    reasons.push(`🏷️ Best Price for Route (₹${offer.quotedFare})`);
  } else if (offer.isRecommended) {
    reasons.push(`🏆 Top Recommended Choice`);
  }

  if (reasons.length === 0) {
    reasons.push(`✅ Verified Driver (${offer.completedTrips}+ trips)`);
  }
  return reasons.slice(0, 2);
}

export type OfferSortMode = 'RECOMMENDED' | 'LOWEST_FARE' | 'HIGHEST_RATED' | 'FASTEST' | 'NEAREST';

export function sortOffers(offers: DriverQuote[], mode: OfferSortMode): DriverQuote[] {
  const list = [...offers];
  switch (mode) {
    case 'LOWEST_FARE':
      return list.sort((a, b) => a.quotedFare - b.quotedFare);
    case 'HIGHEST_RATED':
      return list.sort((a, b) => b.driverRating - a.driverRating);
    case 'FASTEST':
      return list.sort((a, b) => a.etaMinutes - b.etaMinutes);
    case 'NEAREST':
      return list.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    case 'RECOMMENDED':
    default:
      return list.sort((a, b) => {
        if (a.isRecommended && !b.isRecommended) return -1;
        if (!a.isRecommended && b.isRecommended) return 1;
        return a.quotedFare - b.quotedFare;
      });
  }
}

// ---------------------------------------------------------------------------
// Wallet hold / commission / advance / cancellation-penalty pure helpers.
// These implement Sections 20-24 as real calculations, not just copy.
// ---------------------------------------------------------------------------
export function computeAdvanceAmount(finalFare: number): number {
  return Math.round(finalFare * (BOOKING_CONFIG.CUSTOMER_ADVANCE_PERCENT / 100));
}

export function computeBalanceAmount(finalFare: number): number {
  return finalFare - computeAdvanceAmount(finalFare);
}

export function computeWalletHold(quotedFare: number): number {
  return Math.round(quotedFare * (BOOKING_CONFIG.DRIVER_WALLET_HOLD_PERCENT / 100));
}

export function computeCommission(finalFare: number): { commission: number; driverAmount: number } {
  const commission = Math.round(finalFare * (BOOKING_CONFIG.DROP_NOW_COMMISSION_PERCENT / 100));
  return { commission, driverAmount: finalFare - commission };
}

/** Only ever called on a CONFIRMED booking's driver cancelling — never on rejection/expiry. */
export function computeCancellationPenalty(walletHoldAmount: number): number {
  return Math.min(walletHoldAmount, BOOKING_CONFIG.MAX_DRIVER_CANCELLATION_PENALTY);
}

export function resolvePickupTimestamp(scheduleType: 'NOW' | 'SCHEDULE', startDate?: string, startTime?: string): Date {
  if (scheduleType === 'NOW') {
    return new Date(Date.now() + 10 * 60 * 1000); // nearest practical pickup: ~10 min out
  }
  if (startDate && startTime) {
    const parsed = new Date(`${startDate}T${to24Hour(startTime)}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.now() + 60 * 60 * 1000);
}

function to24Hour(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '10:00:00';
  let [, h, m, meridian] = match;
  let hour = parseInt(h, 10);
  if (meridian) {
    const isPM = meridian.toUpperCase() === 'PM';
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }
  return `${hour.toString().padStart(2, '0')}:${m}:00`;
}

export function isWithinDropBidScheduleLimit(scheduleType: 'NOW' | 'SCHEDULE', startDate?: string, startTime?: string): boolean {
  if (scheduleType === 'NOW') return true;
  const pickupAt = resolvePickupTimestamp(scheduleType, startDate, startTime);
  return pickupAt.getTime() >= Date.now() - 5 * 60 * 1000;
}

/**
 * Ultra-Low-Cost Google Maps Navigation Deep-Link Generator.
 * Opens official native Google Maps app with turn-by-turn navigation for drivers (₹0 API cost).
 */
export function buildGoogleMapsRouteUrl(pickup: string, drop: string, stops: string[] = []): string {
  const origin = encodeURIComponent(pickup);
  const destination = encodeURIComponent(drop);
  const cleanStops = stops.filter(s => s.trim().length > 0);
  const waypointsParam = cleanStops.length > 0 ? `&waypoints=${cleanStops.map(s => encodeURIComponent(s.trim())).join('|')}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=driving`;
}

export interface TripClassification {
  isLocal: boolean;
  distanceKm: number;
  estimatedMinutes: number;
  badgeLabel: string;
  pricingType: 'LOCAL_METER' | 'INTERCITY_BIDDING';
  estimatedFare: number;
}

/**
 * Intelligent Trip Classifier: Automatically detects Local City Drop (<=35km) vs Intercity Outstation (>35km)
 * Calculates fare using distance (km) + duration (minutes) for local drops.
 */
export function classifyTripType(pickup: string, drop: string, vehicleCategory: DropBidVehicleCategory): TripClassification {
  const distanceKm = estimateDistanceKm(pickup, drop);
  const isLocal = distanceKm <= 60; // Local Drop up to 60 km
  const avgSpeed = isLocal ? 30 : 55;
  const estimatedMinutes = Math.max(8, Math.round((distanceKm / avgSpeed) * 60));

  let estimatedFare = 0;
  if (isLocal) {
    // Local Meter Formula: Base ₹60 + (₹14/km * distance) + (₹1.5/min * time)
    const baseFare = 60;
    const perKmRate = vehicleCategory === 'CRYSTA' ? 22 : vehicleCategory === 'SUV' ? 18 : 14;
    const perMinRate = 1.5;
    estimatedFare = Math.round(baseFare + (distanceKm * perKmRate) + (estimatedMinutes * perMinRate));
  } else {
    // Intercity Outstation Formula: ₹17-24/km
    const rate = vehicleCategory === 'CRYSTA' ? 24 : vehicleCategory === 'SUV' ? 20 : 17;
    estimatedFare = Math.round(distanceKm * rate);
  }

  return {
    isLocal,
    distanceKm,
    estimatedMinutes,
    badgeLabel: isLocal ? '⚡ Local City Drop (Meter Fare: Distance + Time)' : '🛣️ Intercity Outstation (Dynamic Bidding)',
    pricingType: isLocal ? 'LOCAL_METER' : 'INTERCITY_BIDDING',
    estimatedFare,
  };
}

/**
 * Dynamic In-Memory Location & Distance Cache (1-Time API Spend Engine).
 * Reuses previously calculated route distances and discovered locations for ₹0 API cost.
 */
const DYNAMIC_DISTANCE_CACHE: Record<string, number> = {};
const USER_DISCOVERED_LOCATIONS: Set<string> = new Set();

export function saveDiscoveredLocationToCache(locationName: string) {
  const clean = locationName.trim();
  if (clean.length > 2) {
    USER_DISCOVERED_LOCATIONS.add(clean);
  }
}

/**
 * Calculates multi-stop trip distance across all waypoints (pickup -> stop1 -> stop2 -> drop).
 * Caches every route segment so API is called at most once per route.
 */
export function calculateMultiStopDistance(pickup: string, stops: string[] = [], drop: string): number {
  const cleanStops = stops.filter(s => s.trim().length > 0);
  const routePoints = [pickup, ...cleanStops, drop].filter(p => p.trim().length > 0);

  if (routePoints.length < 2) return 0;

  let totalKm = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const from = routePoints[i];
    const to = routePoints[i + 1];
    const cacheKey = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;

    if (DYNAMIC_DISTANCE_CACHE[cacheKey] !== undefined) {
      totalKm += DYNAMIC_DISTANCE_CACHE[cacheKey];
    } else {
      const segDist = estimateDistanceKm(from, to);
      DYNAMIC_DISTANCE_CACHE[cacheKey] = segDist;
      totalKm += segDist;
    }
  }

  return Math.round(totalKm * 10) / 10;
}

/**
 * Intelligent Multi-Stop Trip Classifier: Supports multi-stop local drop vs intercity classification.
 */
export function classifyMultiStopTripType(
  pickup: string,
  stops: string[] = [],
  drop: string,
  vehicleCategory: DropBidVehicleCategory,
  // Real driving distance from the backend's Google Distance Matrix quote
  // (see POST /customer/bookings/quote), when the caller has already
  // fetched one - overrides the local hash-based guess in
  // calculateMultiStopDistance, which is only a same-request-cycle
  // placeholder until that real fetch resolves.
  realDistanceKmOverride?: number | null
): TripClassification {
  const distanceKm = realDistanceKmOverride ?? calculateMultiStopDistance(pickup, stops, drop);
  const isLocal = distanceKm <= 60; // Up to 60 km is Local City Drop!
  const avgSpeed = isLocal ? 28 : 55;
  const estimatedMinutes = Math.max(10, Math.round((distanceKm / avgSpeed) * 60));

  let estimatedFare = 0;
  if (isLocal) {
    // Local Meter Formula: Base ₹60 + (₹14/km * distance) + (₹1.5/min * time) + (₹30 per extra stop)
    const baseFare = 60;
    const perKmRate = vehicleCategory === 'CRYSTA' ? 22 : vehicleCategory === 'SUV' ? 18 : 14;
    const perMinRate = 1.5;
    const extraStopsFee = Math.max(0, stops.filter(s => s.trim()).length) * 30;
    estimatedFare = Math.round(baseFare + (distanceKm * perKmRate) + (estimatedMinutes * perMinRate) + extraStopsFee);
  } else {
    // Intercity Outstation Formula: ₹17-24/km
    const rate = vehicleCategory === 'CRYSTA' ? 24 : vehicleCategory === 'SUV' ? 20 : 17;
    const extraStopsFee = Math.max(0, stops.filter(s => s.trim()).length) * 50;
    estimatedFare = Math.round((distanceKm * rate) + extraStopsFee);
  }

  const stopCount = stops.filter(s => s.trim()).length;
  const stopLabel = stopCount > 0 ? ` (${stopCount} Stop${stopCount > 1 ? 's' : ''})` : '';

  return {
    isLocal,
    distanceKm,
    estimatedMinutes,
    badgeLabel: isLocal
      ? `⚡ Local City Drop${stopLabel} • Meter Fare`
      : `🛣️ Intercity Outstation${stopLabel} • Dynamic Bidding`,
    pricingType: isLocal ? 'LOCAL_METER' : 'INTERCITY_BIDDING',
    estimatedFare,
  };
}

const POPULAR_LOCATIONS_CACHE: Record<string, string[]> = {
  chennai: ['Chennai Central Railway Station', 'Chennai International Airport (MAA)', 'Koyambedu CMBT Bus Stand', 'T. Nagar Bus Terminus', 'Velachery MRTS Station', 'Tambaram Railway Station'],
  bangalore: ['KSR Bengaluru City Railway Station', 'Kempegowda International Airport (BLR)', 'Majestic Bus Stand', 'Electronic City Phase 1', 'Indiranagar Metro Station', 'Whitefield Railway Station'],
  bengaluru: ['KSR Bengaluru City Railway Station', 'Kempegowda International Airport (BLR)', 'Majestic Bus Stand', 'Electronic City Phase 1', 'Indiranagar Metro Station'],
  tiruvannamalai: ['Tiruvannamalai Annamalaiyar Temple', 'Tiruvannamalai Main Bus Stand', 'Tiruvannamalai Railway Station', 'Girivalam Path Entrance', 'Ramanasramam Ashram'],
  coimbatore: ['Coimbatore Junction Railway Station', 'Coimbatore International Airport (CJB)', 'Gandhipuram Central Bus Stand', 'Singanallur Bus Stand', 'UkKadam Bus Stand'],
  vellore: ['Vellore Fort', 'Vellore New Bus Stand', 'Katpadi Junction Railway Station', 'CMC Hospital Vellore', 'VIT University Vellore'],
  pondicherry: ['Puducherry Beach Road', 'Pondicherry Bus Stand', 'Puducherry Railway Station', 'Auroville Visitor Centre', 'JIPMER Hospital'],
  puducherry: ['Puducherry Beach Road', 'Pondicherry Bus Stand', 'Puducherry Railway Station', 'Auroville Visitor Centre'],
  salem: ['Salem New Bus Stand', 'Salem Junction Railway Station', 'Five Roads Salem', 'Yercaud Foot Hills'],
  trichy: ['Trichy Central Bus Stand', 'Trichy Junction Railway Station', 'Trichy International Airport (TRZ)', 'Srirangam Ranganathar Temple'],
  madurai: ['Madurai Meenakshi Amman Temple', 'Madurai Junction Railway Station', 'Mattuthavani Bus Stand', 'Madurai Airport (IXM)'],
  kanchipuram: ['Kanchipuram Kamakshi Amman Temple', 'Kanchipuram Bus Stand', 'Kanchipuram Railway Station'],
  villupuram: ['Villupuram Junction Railway Station', 'Villupuram New Bus Stand'],
  hosur: ['Hosur Bus Stand', 'Hosur Railway Station', 'SIPCOT Hosur Industrial Complex'],
  tirupati: ['Tirupati Railway Station', 'Tirupati Central Bus Stand', 'Tirumala Temple Foothills', 'Tirupati Airport (TIR)'],
  chengam: ['Chengam Bus Stand', 'Chengam Central'],
  polur: ['Polur Bus Stand', 'Polur Railway Station'],
  arani: ['Arani Bus Stand', 'Arani Silk Market'],
  gingee: ['Gingee Fort', 'Gingee Bus Stand'],
  kallakurichi: ['Kallakurichi Bus Stand', 'Kallakurichi Central'],
};

export function searchDebouncedLocations(query: string): string[] {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return [];

  // 1. Check user-discovered location cache first
  const userMatches = Array.from(USER_DISCOVERED_LOCATIONS).filter(loc => loc.toLowerCase().includes(clean));
  if (userMatches.length > 0) return userMatches;

  // 2. Check predefined city cache
  for (const [key, list] of Object.entries(POPULAR_LOCATIONS_CACHE)) {
    if (clean.includes(key)) {
      return list;
    }
  }

  const allKnown = Object.values(POPULAR_LOCATIONS_CACHE).flat();
  const matched = allKnown.filter(place => place.toLowerCase().includes(clean));
  if (matched.length > 0) return matched;

  // No matching real locations found - return empty array (do NOT generate fake places)
  return [];
}

export interface LiveDriverLocationPing {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
  speedKmH: number;
  updatedAtIso: string;
}

export function simulateLiveDriverSocketPing(currentLat: number, currentLng: number, targetLat: number, targetLng: number): LiveDriverLocationPing {
  const dLat = targetLat - currentLat;
  const dLng = targetLng - currentLng;
  const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  const heading = (angle + 360) % 360;

  return {
    driverId: `DRV-${Math.floor(Math.random() * 900 + 100)}`,
    lat: currentLat + dLat * 0.05,
    lng: currentLng + dLng * 0.05,
    heading: Math.round(heading),
    speedKmH: Math.round(30 + Math.random() * 15),
    updatedAtIso: new Date().toISOString(),
  };
}
