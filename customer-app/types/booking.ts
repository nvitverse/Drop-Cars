export type BookingMethod = 'STANDARD' | 'DROPBID';
export type RideSharingMode = 'PRIVATE' | 'SHARE_AND_SAVE';

// ---------------------------------------------------------------------------
// STANDARD BOOKING
// ---------------------------------------------------------------------------
export type StandardTripType = 'ONEWAY' | 'ROUNDTRIP' | 'LOCAL' | 'MULTICITY';
export type FarePlan = 'USUAL' | 'LOW_BUDGET';

export interface TaxiBooking {
  id: string;
  bookingMethod: BookingMethod;
  pickupLocation: string;
  dropLocation: string;
  tripType: StandardTripType;
  farePlan?: FarePlan;
  scheduleType: 'NOW' | 'SCHEDULE';
  startDate: string;
  startTime: string;
  vehicleCategory: string;
  billedKm: number;
  perKmRate: number;
  driverBeta: number;
  totalFare: number;
  shareAndSave?: ShareAndSaveDetails;
  passengerName: string;
  passengerPhone: string;
  status: Booking['status'];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// DROP NOW — driver offer marketplace / negotiation / payment state machine
// ---------------------------------------------------------------------------

// Kept as an alias so existing DriverQuote usages continue to compile while
// new code can refer to the more descriptive DriverOffer name.
export type DriverOffer = DriverQuote;

export interface CounterOffer extends DropBidCounterStep {}

export interface DriverProfile {
  driverId: string;
  name: string;
  photo?: string;
  rating: number;
  completedTrips: number;
  reliabilityScore: number;
  verified: boolean;
  memberSince?: string;
}

export interface FleetVehicle {
  vehicleId: string;
  name: string;
  category: 'HATCHBACK' | 'SEDAN' | 'SUV' | 'INNOVA' | 'CRYSTA';
  registrationNumber: string;
  registrationNumberMasked: string;
}

export interface FleetDriver {
  driver: DriverProfile;
  vehicle: FleetVehicle;
}

export type DropBidBookingStatus =
  | 'REQUEST_CREATED'
  | 'OFFERS_RECEIVED'
  | 'OFFER_ACCEPTED'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface WalletHold {
  driverId: string;
  quoteId: string;
  amount: number;
  status: 'HELD' | 'RELEASED' | 'FORFEITED';
  createdAt: string;
  releasedAt?: string;
}

export interface Penalty {
  driverId: string;
  quoteId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  type: 'ADVANCE' | 'BALANCE' | 'FULL';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
}

export interface DropBidCounterStep {
  sender: 'CUSTOMER' | 'DRIVER';
  amount: number;
  timestamp: string;
}

export interface DriverQuote {
  quoteId: string;
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  driverPhone: string;
  driverRating: number;
  completedTrips: number;
  reliabilityScore?: number; // e.g. 99%
  carName: string;
  carCategory: 'HATCHBACK' | 'SEDAN' | 'SUV' | 'INNOVA' | 'CRYSTA';
  carNumber: string;
  isAlternativeVehicle?: boolean;
  alternativeVehicleName?: string;
  quotedFare: number; // Final All-Inclusive Fare
  advanceAmount: number; // 15% advance required
  balanceAmount: number; // 85% payable to driver
  walletHoldAmount?: number; // 20% held in driver wallet
  etaMinutes: number;
  distanceKm?: number;
  offerExpiresAt?: string;
  isRecommended?: boolean;
  recommendationTag?: 'Best Value' | 'Top Rated' | 'Fastest Arrival' | 'Highly Reliable' | 'Great Alternative' | 'Premium Choice';
  matchReasons?: string[];
  counterHistory?: DropBidCounterStep[];
  currentCounterAmount?: number;
  status?: 'ACTIVE' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
}

export interface DropBidRequest {
  requestId: string;
  pickupLocation: string;
  dropLocation: string;
  scheduleType: 'NOW' | 'SCHEDULE';
  startDate?: string;
  startTime?: string;
  pickupAtIso: string; // resolved ISO timestamp for the actual pickup moment
  passengerCount: number;
  vehicleCategory: 'SEDAN' | 'SUV' | 'INNOVA' | 'CRYSTA';
  expectedFare?: number;
  offerValidityMinutes: number;
  requestExpiresAt: string; // ISO timestamp — offers/request stop being valid after this
  status: 'BROADCASTING' | 'OFFERS_RECEIVED' | 'OFFER_ACCEPTED' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
}

export interface SharedPassenger {
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  joinedAt: string;
  seatsBooked: number;
  farePaid: number;
}

export interface ShareAndSaveDetails {
  isEnabled: boolean;
  maxSeatsToShare: number;
  availableSeats: number;
  recommendedSeats: number;
  potentialSavings: number;
  actualSavings: number;
  sharedPassengers: SharedPassenger[];
  status: 'SEARCHING_PASSENGERS' | 'PASSENGER_JOINED' | 'FULLY_BOOKED' | 'NO_MATCH_CONFIRMED_PRIVATE';
}

export interface CarPoolPassenger {
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  seatsRequested: number;
  status: 'REQUESTED' | 'ACCEPTED' | 'DECLINED';
  requestedAt: string;
}

export interface ShareSettings {
  isEnabled: boolean;
  seatsToShare: number;
  minContributionPerSeat: number;
}

export interface CarPoolJourney {
  id: string;
  hostName: string;
  hostPhone: string;
  hostRating?: number;
  pickupCity: string;
  dropCity: string;
  startDate: string;
  startTime: string;
  carName: string;
  carCategory: string;
  driverName: string;
  driverRating: number;
  totalSeats: number;
  availableSeats: number;
  seatFare: number;
  privateFareEquivalent: number;
  status: 'ACTIVE' | 'FULL' | 'COMPLETED';
  /** Present when this listing was auto-created from a Standard Booking via Share & Save. */
  sourceBookingId?: string;
  isCustomerHosted?: boolean;
  passengers?: CarPoolPassenger[];
}

export interface Booking {
  id: string;
  vendorId?: string;
  driverId?: string;
  customerName: string;
  customerPhone: string;
  pickupLocation: string;
  dropLocation: string;
  bookingMethod?: BookingMethod;
  sharingMode?: RideSharingMode;
  mainCategory?: 'OUTSTATION' | 'AIRPORT' | 'LOCAL';
  subCategory?: string;
  startDate?: string;
  startTime?: string;
  driverPricing: {
    fare: number;
    distance: number;
    estimatedTime: string;
  };
  vendorPricing: {
    customerAmount: number;
    commission: number;
  };
  status: 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  assignedDriver?: {
    name: string;
    phone: string;
    carDetails: {
      name: string;
      type: string;
      number: string;
    };
    rating?: number;
  };
  driverQuotes?: DriverQuote[];
  selectedQuote?: DriverQuote;
  shareDetails?: ShareAndSaveDetails;
  isAdvancePaid?: boolean;
  advanceAmountPaid?: number;
  isNonRefundableConfirmed?: boolean;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}