export const BOOKING_CONFIG = {
  // Drop Bid Rules
  DROP_NOW_COMMISSION_PERCENT: 20, // 20% internal platform commission included inside final fare
  CUSTOMER_ADVANCE_PERCENT: 15,    // 15% advance required to confirm Drop Bid
  DRIVER_WALLET_HOLD_PERCENT: 20,  // 20% held in driver wallet during bidding
  MAX_DRIVER_CANCELLATION_PENALTY: 1000, // Maximum penalty in INR if driver cancels post advance
  DROP_NOW_MAX_SCHEDULE_HOURS: 24, // Maximum schedule limit for Drop Bid is 24 hours
  DEFAULT_OFFER_VALIDITY_MINUTES: 15,
  OFFER_VALIDITY_OPTIONS_MINUTES: [10, 20, 30, 60],

  // 1. DROP SAVER / SPLIT (Commercial Taxi Seat Sharing Rules)
  DROP_SAVER_PRIMARY_DISCOUNT_PERCENT: 30, // 30% discount on primary rider fare when co-riders match
  DROP_SAVER_MAX_DETOUR_MINUTES: 15,       // Max 15 minutes detour cap for co-rider pickups
  PERSONAL_STOP_TIMER_HOURLY_RATE: 150,     // ₹150/hr billed strictly to primary rider for personal waiting stops

  // 2. DROP CONNECT (P2P Carpooling Regulatory Guardrails)
  DROP_CONNECT_MAX_TRIPS_PER_DAY: 2,       // Max 2 trips/day per host (Office commute pattern)
  DROP_CONNECT_MAX_PER_KM_SEAT_CAP: 3.5,   // Max ₹3.5/km/seat (strictly fuel + toll cost recovery cap)
  DROP_CONNECT_PLATFORM_COMMISSION: 0,      // Zero platform commission taken on P2P carpool trip fare

  // 3. DUAL WALLET & RAZORPAY SETTLEMENT
  PLATFORM_CONVENIENCE_FEE: 15,            // ₹15 platform fee to absorb PG processing fees
  PREMIUM_PLATFORM_CONVENIENCE_FEE: 0,     // ₹0 platform fee for Drop Cars Premium subscribers
  PROMO_WALLET_MAX_DISCOUNT_PERCENT: 10,  // Capped at max 10% discount per ride
  PROMO_WALLET_MAX_DISCOUNT_CAP_INR: 50,  // Max ₹50 discount cap per ride
  PROMO_WALLET_EXPIRY_DAYS: 60,            // 60 days expiration for promo credits
  PREMIUM_SUBSCRIPTION_MONTHLY_INR: 199,   // ₹199/month for Drop Cars Premium

  // Vehicle Capacities & Seating Thresholds
  VEHICLE_CAPACITIES: {
    HATCHBACK: { recommended: 3, max: 4, label: 'Hatchback (Indica / WagonR)' },
    SEDAN: { recommended: 3, max: 4, label: 'Sedan (Dzire / Etios)' },
    SUV: { recommended: 4, max: 6, label: 'SUV (Ertiga / Carens)' },
    INNOVA: { recommended: 4, max: 7, label: 'Toyota Innova' },
    CRYSTA: { recommended: 4, max: 7, label: 'Innova Crysta VIP' },
    HYCROSS: { recommended: 4, max: 7, label: 'Innova Hycross' },
  },

  // Share & Save Discount Percentage
  SHARE_AND_SAVE_DISCOUNT_PERCENT: 25, // Up to 25% fare discount for host

  // Centralized tax/toll configuration
  GST_PERCENT: 5,          // Applicable GST on the pre-tax fare (Base + Driver Beta + Toll)
  TOLL_PER_100KM: 40,       // Estimated toll, applied per 100 billed km on outstation/intercity trips
  STATE_PERMIT_FLAT: 0,     // Flat inter-state permit charge, 0 until a real per-route table exists

  // Recommendation Weights
  RECOMMENDATION_WEIGHTS: {
    fare: 0.32,
    rating: 0.22,
    completedTrips: 0.14,
    reliability: 0.16,
    eta: 0.16,
  },

  RECOMMENDATION_TAGS: {
    BEST_VALUE: 'Best Value',
    TOP_RATED: 'Top Rated',
    FASTEST_ARRIVAL: 'Fastest Arrival',
    HIGHLY_RELIABLE: 'Highly Reliable',
    GREAT_ALTERNATIVE: 'Great Alternative',
  },
};

// ---------------------------------------------------------------------------
// OFFICIAL STANDARD BOOKING TARIFF
// Source of truth for Standard Booking fare calculation. Do not compute
// Standard Booking fares from any other numbers — always read from here.
// ---------------------------------------------------------------------------
export type StandardVehicleCategory =
  | 'HATCHBACK'
  | 'SEDAN'
  | 'ETIOS'
  | 'NEW_SEDAN'
  | 'SUV'
  | 'INNOVA'
  | 'CRYSTA'
  | 'HYCROSS';

export interface TariffRate {
  perKm: number;
  driverBeta: number;
}

export const TARIFF: {
  ONEWAY: Record<StandardVehicleCategory, TariffRate>;
  ROUNDTRIP_USUAL: Record<StandardVehicleCategory, TariffRate>;
  ROUNDTRIP_LOW_BUDGET: Record<StandardVehicleCategory, TariffRate>;
} = {
  // USUAL PLAN — ONE WAY
  ONEWAY: {
    HATCHBACK: { perKm: 13, driverBeta: 300 },
    SEDAN: { perKm: 14, driverBeta: 400 },
    ETIOS: { perKm: 14, driverBeta: 400 },
    NEW_SEDAN: { perKm: 15, driverBeta: 400 },
    SUV: { perKm: 19, driverBeta: 500 },
    INNOVA: { perKm: 20, driverBeta: 500 },
    CRYSTA: { perKm: 24, driverBeta: 600 },
    HYCROSS: { perKm: 25, driverBeta: 600 },
  },
  // USUAL PLAN — ROUND TRIP
  ROUNDTRIP_USUAL: {
    HATCHBACK: { perKm: 12, driverBeta: 300 },
    SEDAN: { perKm: 13, driverBeta: 400 },
    ETIOS: { perKm: 13, driverBeta: 400 },
    NEW_SEDAN: { perKm: 14, driverBeta: 400 },
    SUV: { perKm: 18, driverBeta: 500 },
    INNOVA: { perKm: 19, driverBeta: 500 },
    CRYSTA: { perKm: 22, driverBeta: 800 },
    HYCROSS: { perKm: 23, driverBeta: 800 },
  },
  // LOW BUDGET PLAN — ROUND TRIP ONLY
  ROUNDTRIP_LOW_BUDGET: {
    HATCHBACK: { perKm: 12, driverBeta: 300 },
    SEDAN: { perKm: 12, driverBeta: 400 },
    ETIOS: { perKm: 13, driverBeta: 400 },
    NEW_SEDAN: { perKm: 13, driverBeta: 400 },
    SUV: { perKm: 17, driverBeta: 500 },
    INNOVA: { perKm: 18, driverBeta: 500 },
    CRYSTA: { perKm: 21, driverBeta: 600 },
    HYCROSS: { perKm: 22, driverBeta: 600 },
  },
};

// Minimum billed KM per trip type (industry-standard outstation minimums).
export const MIN_BILLED_KM = {
  ONEWAY: 130,
  ROUNDTRIP: 250,
  LOCAL: 80,
  MULTICITY: 250,
};

// Local / Hourly package tiers. Price = vehicle's ONEWAY per-km rate applied
// to the package KM allowance, plus Driver Beta. Extra usage billed at the
// same per-km rate / a flat hourly rate.
export const LOCAL_PACKAGES = [
  { id: '4HR_40KM', hours: 4, km: 40, label: '4 Hours / 40 KM' },
  { id: '8HR_80KM', hours: 8, km: 80, label: '8 Hours / 80 KM' },
  { id: '12HR_120KM', hours: 12, km: 120, label: '12 Hours / 120 KM' },
];
export const LOCAL_EXTRA_HOUR_RATE = 150;

export const STANDARD_VEHICLE_CATALOG: {
  id: StandardVehicleCategory;
  name: string;
  models: string;
  capacity: string;
  passengerCount: number;
  luggage: string;
  badge: string;
}[] = [
  { id: 'HATCHBACK', name: 'Hatchback', models: 'Maruti WagonR / Tata Indica', capacity: '3+1 Seats', passengerCount: 3, luggage: '2 Bags', badge: 'Budget Friendly' },
  { id: 'SEDAN', name: 'Sedan', models: 'Swift Dzire / Similar', capacity: '4+1 Seats', passengerCount: 4, luggage: '3 Bags', badge: 'Most Popular' },
  { id: 'SUV', name: 'SUV', models: 'Maruti Ertiga / Kia Carens', capacity: '6+1 Seats', passengerCount: 6, luggage: '5 Bags', badge: 'Family Choice' },
  { id: 'INNOVA', name: 'Innova', models: 'Toyota Innova Classic', capacity: '7+1 Seats', passengerCount: 7, luggage: '6 Bags', badge: 'Outstation Favourite' },
  { id: 'CRYSTA', name: 'Innova Crysta', models: 'Innova Crysta VIP', capacity: '7+1 Seats', passengerCount: 7, luggage: '6 Bags', badge: 'VIP Experience' },
  { id: 'HYCROSS', name: 'Innova Hycross', models: 'Toyota Innova Hycross', capacity: '7+1 Seats', passengerCount: 7, luggage: '6 Bags', badge: 'Hybrid Premium' },
];

// Etios and New Sedan are kept ONLY in the tariff table above (official
// pricing data, may still be referenced internally/by admin) - they are no
// longer customer-facing categories. "New Sedan" in particular should
// become an add-on ("request a newer car") layered on Hatchback/Sedan
// rather than its own category - not yet built, flagged for later.

// ---------------------------------------------------------------------------
// DROP NOW — vehicle eligibility. Maps a customer's REQUESTED category to the
// set of actual vehicle categories that are allowed to submit an offer.
// A category offering outside its own requested category is always surfaced
// to the customer as an "Alternative Vehicle" — never disguised as the exact
// requested vehicle.
// ---------------------------------------------------------------------------
export type DropBidVehicleCategory = 'SEDAN' | 'SUV' | 'INNOVA' | 'CRYSTA';

export const DROPBID_VEHICLE_CATALOG: { id: DropBidVehicleCategory; name: string; description: string }[] = [
  { id: 'SEDAN', name: 'Sedan', description: 'Comfortable ride for up to 4' },
  { id: 'SUV', name: 'SUV', description: 'Extra space for up to 6' },
  { id: 'INNOVA', name: 'Innova', description: 'Spacious 7-seater' },
  { id: 'CRYSTA', name: 'Innova Crysta', description: 'Premium 7-seater' },
];

export const ALTERNATE_VEHICLE_MAP: Record<DropBidVehicleCategory, DropBidVehicleCategory[]> = {
  SEDAN: ['SEDAN'],
  SUV: ['SUV', 'INNOVA'],
  INNOVA: ['INNOVA', 'CRYSTA'],
  CRYSTA: ['CRYSTA'],
};

export const bookingConfig = BOOKING_CONFIG;
