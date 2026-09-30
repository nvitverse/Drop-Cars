import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosInstance from '@/app/api/axiosInstance';

// Guarded like Driver-App's own real Razorpay wiring (services/payment/
// paymentService.ts + app/(tabs)/wallet.tsx there) - the native module
// isn't available on Expo web, so a require() there would crash the whole
// bundle rather than just this one payment button.
let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  try {
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch (e) {
    RazorpayCheckout = null;
  }
}
import {
  DriverQuote,
  DropBidCounterStep,
  DropBidRequest,
  DropBidBookingStatus,
  WalletHold,
  Penalty,
  ShareAndSaveDetails,
} from '@/types/booking';
import {
  BOOKING_CONFIG,
  StandardVehicleCategory,
  DropBidVehicleCategory,
} from '@/constants/bookingConfig';
import { StandardTripType, FarePlan } from '@/types/booking';
import {
  computeAdvanceAmount,
  computeBalanceAmount,
  computeWalletHold,
  computeCancellationPenalty,
  resolvePickupTimestamp,
  rankAndTagOffers,
} from '@/utils/dropBidEngine';

// Real backend wiring for Drop Bid (2026-09-04) - this used to be entirely
// client-side simulated (generateDropBidOffers/generateSingleLiveOffer,
// both now unused here - kept in dropBidEngine.ts in case a demo/offline
// mode wants them later). See app/api/routes/drop_bid_routes.py on the
// backend.
const DROPBID_CAR_TYPE_MAP: Record<DropBidVehicleCategory, string> = {
  SEDAN: 'SEDAN_4_PLUS_1',
  SUV: 'SUV',
  INNOVA: 'INNOVA',
  CRYSTA: 'INNOVA_CRYSTA',
};

// No real-time location for a driver who hasn't been assigned yet, so
// there is no genuine ETA to show. A flat placeholder (rather than
// omitting the field, which DriverQuote/rankAndTagOffers both require)
// until live driver location + a real distance-to-pickup calculation
// exists - flagged here deliberately, not meant to look precise.
const PLACEHOLDER_ETA_MINUTES = 15;

function mapBackendOffer(o: any, vehicleCategory: DropBidVehicleCategory): DriverQuote {
  const quotedFare = o.offer_price;
  const statusMap: Record<string, DriverQuote['status']> = {
    PENDING: 'ACTIVE',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'REJECTED',
  };
  // A pending counter (from either side, see counter_by) shows as
  // COUNTERED with currentCounterAmount - the UI already had these fields
  // from the original mock design, just never got real data before.
  const hasCounter = o.counter_price != null && o.counter_by;
  return {
    quoteId: o.id,
    driverId: o.driver_id ?? '',
    driverName: o.driver_name || 'Driver',
    driverPhone: o.driver_phone_masked || '',
    driverRating: o.driver_rating ?? 0,
    completedTrips: o.completed_trips ?? 0,
    carName: o.car_name || 'Car',
    carCategory: vehicleCategory,
    carNumber: o.car_number || '',
    quotedFare,
    advanceAmount: computeAdvanceAmount(quotedFare),
    balanceAmount: computeBalanceAmount(quotedFare),
    walletHoldAmount: computeWalletHold(quotedFare),
    etaMinutes: PLACEHOLDER_ETA_MINUTES,
    currentCounterAmount: hasCounter ? o.counter_price : undefined,
    counterHistory: hasCounter ? [{
      sender: o.counter_by === 'driver' ? 'DRIVER' : 'CUSTOMER',
      amount: o.counter_price,
      timestamp: new Date().toISOString(),
    }] : undefined,
    status: hasCounter ? 'COUNTERED' : (statusMap[o.status] ?? 'ACTIVE'),
  };
}

// ---------------------------------------------------------------------------
// STANDARD BOOKING DRAFT — survives navigation/back so the customer never
// loses entered info (Section 58).
// ---------------------------------------------------------------------------
export interface StandardDraft {
  pickup: string;
  drop: string;
  stops: string[];
  scheduleType: 'NOW' | 'SCHEDULE';
  startDate: string;
  startTime: string;
  isUrgent: boolean;
  endDate: string;
  endTime: string;
  tripType: StandardTripType;
  onewaySubtype: 'OUTSTATION' | 'AIRPORT' | 'MULTICITY';
  airportFieldIsPickup: boolean;
  farePlan: FarePlan;
  localPackageId: string;
  passengerCount: number;
  vehicleCategory: StandardVehicleCategory;
  shareEnabled: boolean;
  seatsToShare: number;
  passengerName: string;
  passengerPhone: string;
}

// Temporary dev-convenience default so the form isn't empty on every reload
// while there's no real GPS/location integration yet - remove once real
// location detection is wired up.
const DEFAULT_STANDARD_DRAFT: StandardDraft = {
  pickup: 'Chennai',
  drop: 'Bangalore',
  stops: [],
  scheduleType: 'NOW',
  startDate: '',
  startTime: '',
  isUrgent: true,
  endDate: '',
  endTime: '',
  tripType: 'ONEWAY',
  onewaySubtype: 'OUTSTATION',
  airportFieldIsPickup: true,
  farePlan: 'USUAL',
  localPackageId: '8HR_80KM',
  passengerCount: 2,
  vehicleCategory: 'SEDAN',
  shareEnabled: false,
  seatsToShare: 2,
  passengerName: '',
  passengerPhone: '',
};

export interface RecentSearch {
  id: string;
  pickup: string;
  drop: string;
  tripType: StandardTripType;
  mode: 'STANDARD' | 'DROPBID';
  searchedAt: string;
}

const RECENT_SEARCHES_KEY = 'dropcars.recentSearches';
const MAX_RECENT_SEARCHES = 5;

export interface ConfirmedStandardBooking {
  // Real CustomerBookingRequest.id (UUID) from POST /api/customer/bookings -
  // not a client-fabricated id. Driver/car/OTP are intentionally absent
  // here: the backend only assigns those once an admin links this request
  // to a real Order (see the "My Trips" / dashboard booking list, which
  // polls GET /api/customer/bookings for that real assignment state).
  orderId: string;
  pickup: string;
  drop: string;
  tripType: StandardTripType;
  startDate: string;
  startTime: string;
  vehicleName: string;
  totalFare: number;
  shareAndSave?: ShareAndSaveDetails;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// DROP NOW STATE MACHINE
// ---------------------------------------------------------------------------
export interface ConfirmedDropBidBooking {
  orderId: string;
  requestId: string;
  quote: DriverQuote;
  pickup: string;
  drop: string;
  startDate?: string;
  startTime?: string;
  advancePaid: number;
  balanceDue: number;
  confirmedAt: string;
}

interface TaxiFlowContextValue {
  // Recent searches (persisted, shown on Dashboard)
  recentSearches: RecentSearch[];
  addRecentSearch: (entry: { pickup: string; drop: string; tripType: StandardTripType; mode: 'STANDARD' | 'DROPBID' }) => void;

  // Standard
  standardDraft: StandardDraft;
  updateStandardDraft: (patch: Partial<StandardDraft>) => void;
  resetStandardDraft: () => void;
  confirmedStandardBooking: ConfirmedStandardBooking | null;
  confirmStandardBooking: (booking: ConfirmedStandardBooking) => void;
  clearConfirmedStandardBooking: () => void;

  // Drop Bid
  dropBidRequest: DropBidRequest | null;
  dropBidOffers: DriverQuote[];
  dropBidBookingStatus: DropBidBookingStatus;
  selectedOfferId: string | null;
  walletHolds: WalletHold[];
  penalties: Penalty[];
  confirmedDropBidBooking: ConfirmedDropBidBooking | null;

  createDropBidRequest: (params: {
    pickupLocation: string;
    dropLocation: string;
    scheduleType: 'NOW' | 'SCHEDULE';
    startDate?: string;
    startTime?: string;
    passengerCount: number;
    vehicleCategory: DropBidVehicleCategory;
    expectedFare?: number;
    offerValidityMinutes?: number;
  }) => Promise<DropBidRequest | null>;
  refreshDropBidOffers: () => Promise<void>;
  sendCounterOffer: (quoteId: string, amount: number) => Promise<void>;
  simulateDriverCounterResponse: (quoteId: string) => Promise<void>;
  instantBookNoNegotiation: () => DriverQuote | null;
  switchMatchedDriver: () => void;
  selectOffer: (quoteId: string) => void;
  payAdvanceForSelectedOffer: () => Promise<boolean>;
  simulateDriverCancellationAfterConfirmation: () => void;
  resetDropBid: () => void;

  // Premium membership - mock/local for now (no real subscription/payment
  // backend yet). Gates access to DropBid's "Get Driver Offers" per the
  // product rule: Standard stays the default for everyone, DropBid is a
  // Premium-only convenience so customers aren't trained to expect it's
  // always cheaper.
  isPremium: boolean;
  togglePremium: () => void;

  // Interface mode - "My" (personal, default) vs "B2B" (corporate account).
  // Mock/local for now, same pattern as isPremium - flips the whole app's
  // presentation (dashboard cards, accent, booking tags) to the corporate
  // variant without a real company-account backend yet.
  interfaceMode: InterfaceMode;
  setInterfaceMode: (mode: InterfaceMode) => void;
  toggleInterfaceMode: () => void;
}

export type InterfaceMode = 'MY' | 'B2B';

const PREMIUM_KEY = 'dropcars.isPremium';
const INTERFACE_MODE_KEY = 'dropcars.interfaceMode';

const TaxiFlowContext = createContext<TaxiFlowContextValue | undefined>(undefined);

export function TaxiFlowProvider({ children }: { children: React.ReactNode }) {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [interfaceMode, setInterfaceModeState] = useState<InterfaceMode>('MY');

  useEffect(() => {
    AsyncStorage.getItem(PREMIUM_KEY)
      .then(raw => { if (raw != null) setIsPremium(raw === 'true'); })
      .catch(() => {});
    AsyncStorage.getItem(INTERFACE_MODE_KEY)
      .then(raw => { if (raw === 'MY' || raw === 'B2B') setInterfaceModeState(raw); })
      .catch(() => {});
  }, []);

  const togglePremium = useCallback(() => {
    setIsPremium(prev => {
      const next = !prev;
      AsyncStorage.setItem(PREMIUM_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const setInterfaceMode = useCallback((mode: InterfaceMode) => {
    setInterfaceModeState(mode);
    AsyncStorage.setItem(INTERFACE_MODE_KEY, mode).catch(() => {});
  }, []);

  const toggleInterfaceMode = useCallback(() => {
    setInterfaceModeState(prev => {
      const next: InterfaceMode = prev === 'MY' ? 'B2B' : 'MY';
      AsyncStorage.setItem(INTERFACE_MODE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then(raw => {
        if (raw) setRecentSearches(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const addRecentSearch = useCallback((entry: { pickup: string; drop: string; tripType: StandardTripType; mode: 'STANDARD' | 'DROPBID' }) => {
    setRecentSearches(prev => {
      const deduped = prev.filter(s => !(s.pickup === entry.pickup && s.drop === entry.drop && s.tripType === entry.tripType));
      const next = [{ id: `RS${Date.now()}`, ...entry, searchedAt: new Date().toISOString() }, ...deduped].slice(0, MAX_RECENT_SEARCHES);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const [standardDraft, setStandardDraft] = useState<StandardDraft>(DEFAULT_STANDARD_DRAFT);
  const [confirmedStandardBooking, setConfirmedStandardBooking] = useState<ConfirmedStandardBooking | null>(null);

  const [dropBidRequest, setDropBidRequest] = useState<DropBidRequest | null>(null);
  const [dropBidOffers, setDropBidOffers] = useState<DriverQuote[]>([]);
  const [dropBidBookingStatus, setDropBidBookingStatus] = useState<DropBidBookingStatus>('REQUEST_CREATED');
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [walletHolds, setWalletHolds] = useState<WalletHold[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [confirmedDropBidBooking, setConfirmedDropBidBooking] = useState<ConfirmedDropBidBooking | null>(null);

  const updateStandardDraft = useCallback((patch: Partial<StandardDraft>) => {
    setStandardDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const resetStandardDraft = useCallback(() => setStandardDraft(DEFAULT_STANDARD_DRAFT), []);

  const confirmStandardBooking = useCallback((booking: ConfirmedStandardBooking) => {
    setConfirmedStandardBooking(booking);
  }, []);

  const clearConfirmedStandardBooking = useCallback(() => setConfirmedStandardBooking(null), []);

  const createDropBidRequest = useCallback(async (params: {
    pickupLocation: string;
    dropLocation: string;
    scheduleType: 'NOW' | 'SCHEDULE';
    startDate?: string;
    startTime?: string;
    passengerCount: number;
    vehicleCategory: DropBidVehicleCategory;
    expectedFare?: number;
    offerValidityMinutes?: number;
  }): Promise<DropBidRequest | null> => {
    const offerValidityMinutes = params.offerValidityMinutes ?? BOOKING_CONFIG.DEFAULT_OFFER_VALIDITY_MINUTES;
    const pickupAt = resolvePickupTimestamp(params.scheduleType, params.startDate, params.startTime);

    // customer_target_price is required (>0) by the backend - callers that
    // skip entering one still need something real posted, not a blank
    // request that 400s.
    const targetPrice = params.expectedFare && params.expectedFare > 0 ? Math.round(params.expectedFare) : undefined;
    if (!targetPrice) return null;

    let res;
    try {
      res = await axiosInstance.post('/api/dropbid/requests', {
        pickup_location: params.pickupLocation,
        drop_location: params.dropLocation,
        trip_type: 'Oneway',
        car_type: DROPBID_CAR_TYPE_MAP[params.vehicleCategory] ?? 'SEDAN_4_PLUS_1',
        start_date_time: pickupAt.toISOString(),
        customer_target_price: targetPrice,
      });
    } catch (e) {
      console.error('createDropBidRequest failed:', e);
      return null;
    }

    const requestId = String(res.data.id);
    const request: DropBidRequest = {
      requestId,
      pickupLocation: params.pickupLocation,
      dropLocation: params.dropLocation,
      scheduleType: params.scheduleType,
      startDate: params.startDate,
      startTime: params.startTime,
      pickupAtIso: pickupAt.toISOString(),
      passengerCount: params.passengerCount,
      vehicleCategory: params.vehicleCategory,
      expectedFare: targetPrice,
      offerValidityMinutes,
      requestExpiresAt: new Date(Date.now() + offerValidityMinutes * 60 * 1000).toISOString(),
      status: 'BROADCASTING',
      createdAt: new Date().toISOString(),
    };

    // No offers exist yet - real drivers haven't seen/bid on this request
    // the instant it's created, unlike the old mock which generated them
    // synchronously. refreshDropBidOffers (polled by the OFFERS screen)
    // picks them up as they actually arrive.
    setDropBidRequest(request);
    setDropBidOffers([]);
    setWalletHolds([]);
    setPenalties([]);
    setSelectedOfferId(null);
    setConfirmedDropBidBooking(null);
    setDropBidBookingStatus('OFFERS_RECEIVED');

    return request;
  }, []);

  // Was simulateNewOfferArrival (appended one fake offer). Now a real
  // poll: re-fetches this request's actual offers from the backend and
  // replaces the list wholesale (cheap enough at Drop Bid's real volume -
  // a handful of offers per request). Still exposed as the same function
  // the UI's "Refresh" button and its one-shot post-creation timer call -
  // see dropbid.tsx.
  const refreshDropBidOffers = useCallback(async () => {
    if (!dropBidRequest) return;
    try {
      const res = await axiosInstance.get('/api/dropbid/my-requests');
      const match = (res.data || []).find((r: any) => String(r.id) === dropBidRequest.requestId);
      if (!match) return;
      const mapped = (match.offers || [])
        .filter((o: any) => o.status === 'PENDING')
        .map((o: any) => mapBackendOffer(o, dropBidRequest.vehicleCategory));
      setDropBidOffers(rankAndTagOffers(mapped));
    } catch (e) {
      console.error('refreshDropBidOffers failed:', e);
    }
  }, [dropBidRequest]);

  // Real counter-offer negotiation (2026-09-04, see api/routes/
  // drop_bid_routes.py's /counter and /customer-counter-response). Which
  // endpoint to call depends on whose turn it is: if the driver's the one
  // with an open counter (counterHistory's one entry sender === 'DRIVER',
  // see mapBackendOffer), the customer is responding to THAT counter -
  // typing back the exact same amount is treated as accepting it (an
  // "Accept counter" button would say the same thing with extra taps);
  // otherwise this is the customer's own first move on the offer.
  const sendCounterOffer = useCallback(async (quoteId: string, amount: number) => {
    const offer = dropBidOffers.find(q => q.quoteId === quoteId);
    const driverHasOpenCounter = offer?.counterHistory?.[0]?.sender === 'DRIVER';
    try {
      if (driverHasOpenCounter && offer?.currentCounterAmount === amount) {
        await axiosInstance.post(`/api/dropbid/offers/${quoteId}/customer-counter-response`, { action: 'accept' });
      } else if (driverHasOpenCounter) {
        await axiosInstance.post(`/api/dropbid/offers/${quoteId}/customer-counter-response`, { action: 'counter', price: amount });
      } else {
        await axiosInstance.post(`/api/dropbid/offers/${quoteId}/counter`, { price: amount });
      }
      await refreshDropBidOffers();
    } catch (e) {
      console.error('sendCounterOffer failed:', e);
      throw e;
    }
  }, [dropBidOffers, refreshDropBidOffers]);

  // The offers feed already carries whatever the driver last did (their
  // counter shows up via mapBackendOffer/refreshDropBidOffers on its own
  // poll cycle) - no separate "simulate" step is needed against a real
  // backend, so this is now just an alias kept for dropbid.tsx's existing
  // call sites.
  const simulateDriverCounterResponse = useCallback(async (_quoteId: string) => {
    await refreshDropBidOffers();
  }, [refreshDropBidOffers]);

  const selectOffer = useCallback((quoteId: string) => {
    setSelectedOfferId(quoteId);
    setDropBidBookingStatus('OFFER_ACCEPTED');

    // Release wallet holds for every OTHER active offer — rejection/non-selection
    // must never become a penalty (Section 21/22).
    setWalletHolds(prev => prev.map(h => {
      if (h.quoteId === quoteId) return h;
      if (h.status !== 'HELD') return h;
      return { ...h, status: 'RELEASED', releasedAt: new Date().toISOString() };
    }));

    setDropBidOffers(prev => prev.map(q => q.quoteId === quoteId
      ? { ...q, status: 'ACCEPTED' }
      : (q.status === 'ACTIVE' || q.status === 'COUNTERED') ? { ...q, status: 'REJECTED' } : q));
  }, []);

  // NOTE: despite the name (kept for the existing UI call sites), this
  // does NOT actually collect a real payment yet - the backend's accept
  // endpoint (POST /dropbid/offers/{id}/accept) converts the offer
  // straight into a real Order + OrderAssignment with no Razorpay/payment
  // gateway step of its own. advanceAmount/advancePaid below are the
  // computed 15%-style figure the UI already showed pre-acceptance, not a
  // charge that's actually been made - a real advance-collection flow is
  // a separate follow-up, not built here.
  // Real Razorpay advance payment (2026-09-04) - was a bare accept() call
  // with no payment at all. Same create-order -> checkout -> verify-
  // signature pattern as the Driver-App's real wallet top-up
  // (services/payment/paymentService.ts there), against Drop Bid's own
  // pay-advance/verify-advance endpoints (see drop_bid_routes.py). Only
  // once the advance is verified does accept() run and actually create
  // the real Order - the backend now refuses accept() without it.
  const payAdvanceForSelectedOffer = useCallback(async (): Promise<boolean> => {
    if (!selectedOfferId || !dropBidRequest) return false;
    setDropBidBookingStatus('PAYMENT_PENDING');

    const quote = dropBidOffers.find(q => q.quoteId === selectedOfferId);
    if (!quote) {
      setDropBidBookingStatus('OFFER_ACCEPTED');
      return false;
    }

    if (!RazorpayCheckout) {
      console.error('payAdvanceForSelectedOffer: Razorpay checkout unavailable on this platform.');
      setDropBidBookingStatus('OFFER_ACCEPTED');
      return false;
    }

    try {
      const payRes = await axiosInstance.post(`/api/dropbid/offers/${selectedOfferId}/pay-advance`);
      const { rp_order_id, amount } = payRes.data;

      let profile: { full_name?: string; primary_number?: string; email?: string } = {};
      try {
        const meRes = await axiosInstance.get('/api/customer/me');
        profile = meRes.data || {};
      } catch (e) {
        // Prefill is a convenience, not a requirement - checkout still
        // works with generic values if the profile fetch fails.
      }

      const razorpayResult = await new Promise<any>((resolve, reject) => {
        RazorpayCheckout.open({
          description: 'Drop Bid advance payment',
          currency: 'INR',
          key: 'rzp_live_RuMG3DMZFdeT3Y',
          amount,
          name: 'Drop Cars',
          order_id: rp_order_id,
          prefill: {
            email: profile.email || `${profile.primary_number || 'customer'}@dropcars.in`,
            contact: profile.primary_number || '9999999999',
            name: profile.full_name || 'Drop Cars Customer',
          },
          theme: { color: '#0EA5E9' },
        }).then(resolve).catch(reject);
      });

      await axiosInstance.post(`/api/dropbid/offers/${selectedOfferId}/verify-advance`, {
        rp_order_id: razorpayResult.razorpay_order_id || rp_order_id,
        rp_payment_id: razorpayResult.razorpay_payment_id,
        rp_signature: razorpayResult.razorpay_signature,
      });
    } catch (e) {
      // Includes the customer cancelling the Razorpay sheet - not an
      // error to log loudly, just an incomplete payment.
      console.log('payAdvanceForSelectedOffer: payment not completed:', e);
      setDropBidBookingStatus('OFFER_ACCEPTED');
      return false;
    }

    let res;
    try {
      res = await axiosInstance.post(`/api/dropbid/offers/${selectedOfferId}/accept`);
    } catch (e) {
      console.error('payAdvanceForSelectedOffer (accept) failed:', e);
      setDropBidBookingStatus('OFFER_ACCEPTED');
      return false;
    }

    setConfirmedDropBidBooking({
      orderId: String(res.data.order_id),
      requestId: dropBidRequest.requestId,
      quote,
      pickup: dropBidRequest.pickupLocation,
      drop: dropBidRequest.dropLocation,
      startDate: dropBidRequest.startDate,
      startTime: dropBidRequest.startTime,
      advancePaid: quote.advanceAmount,
      balanceDue: quote.balanceAmount,
      confirmedAt: new Date().toISOString(),
    });
    setDropBidBookingStatus('CONFIRMED');
    return true;
  }, [selectedOfferId, dropBidRequest, dropBidOffers]);

  /** Demonstrates the confirmed-cancellation penalty state machine
   *  (Section 22): only reachable once a booking is CONFIRMED. */
  const simulateDriverCancellationAfterConfirmation = useCallback(() => {
    if (dropBidBookingStatus !== 'CONFIRMED' || !selectedOfferId) return;
    const hold = walletHolds.find(h => h.quoteId === selectedOfferId && h.status === 'HELD');
    if (!hold) return;

    const penaltyAmount = computeCancellationPenalty(hold.amount);
    setWalletHolds(prev => prev.map(h => h.quoteId === selectedOfferId ? { ...h, status: 'FORFEITED' } : h));
    setPenalties(prev => [...prev, {
      driverId: hold.driverId,
      quoteId: hold.quoteId,
      amount: penaltyAmount,
      reason: 'Driver cancelled after confirmed booking + paid advance',
      createdAt: new Date().toISOString(),
    }]);
    setDropBidBookingStatus('CANCELLED');
  }, [dropBidBookingStatus, selectedOfferId, walletHolds]);

  const switchMatchedDriver = useCallback(() => {
    setSelectedOfferId(null);
    setConfirmedDropBidBooking(null);
    setDropBidBookingStatus('OFFERS_RECEIVED');
    setDropBidOffers(prev => prev.map(q => ({
      ...q,
      status: q.status === 'ACCEPTED' || q.status === 'REJECTED' ? 'ACTIVE' : q.status,
    })));
  }, []);

  const instantBookNoNegotiation = useCallback((): DriverQuote | null => {
    if (dropBidOffers.length === 0) return null;
    const topOffer = dropBidOffers.find(o => o.isRecommended) ?? dropBidOffers[0];
    if (!topOffer) return null;
    setSelectedOfferId(topOffer.quoteId);
    setDropBidBookingStatus('OFFER_ACCEPTED');
    setDropBidOffers(prev => prev.map(q => q.quoteId === topOffer.quoteId
      ? { ...q, status: 'ACCEPTED' }
      : (q.status === 'ACTIVE' || q.status === 'COUNTERED') ? { ...q, status: 'REJECTED' } : q));
    return topOffer;
  }, [dropBidOffers]);

  const resetDropBid = useCallback(() => {
    setDropBidRequest(null);
    setDropBidOffers([]);
    setDropBidBookingStatus('REQUEST_CREATED');
    setSelectedOfferId(null);
    setWalletHolds([]);
    setPenalties([]);
    setConfirmedDropBidBooking(null);
  }, []);

  const value = useMemo<TaxiFlowContextValue>(() => ({
    recentSearches,
    addRecentSearch,
    isPremium,
    togglePremium,
    interfaceMode,
    setInterfaceMode,
    toggleInterfaceMode,

    standardDraft,
    updateStandardDraft,
    resetStandardDraft,
    confirmedStandardBooking,
    confirmStandardBooking,
    clearConfirmedStandardBooking,

    dropBidRequest,
    dropBidOffers,
    dropBidBookingStatus,
    selectedOfferId,
    walletHolds,
    penalties,
    confirmedDropBidBooking,

    createDropBidRequest,
    refreshDropBidOffers,
    sendCounterOffer,
    simulateDriverCounterResponse,
    instantBookNoNegotiation,
    switchMatchedDriver,
    selectOffer,
    payAdvanceForSelectedOffer,
    simulateDriverCancellationAfterConfirmation,
    resetDropBid,
  }), [
    recentSearches, addRecentSearch, isPremium, togglePremium, interfaceMode, setInterfaceMode, toggleInterfaceMode,
    standardDraft, updateStandardDraft, resetStandardDraft, confirmedStandardBooking, confirmStandardBooking, clearConfirmedStandardBooking,
    dropBidRequest, dropBidOffers, dropBidBookingStatus, selectedOfferId, walletHolds, penalties, confirmedDropBidBooking,
    createDropBidRequest, refreshDropBidOffers, sendCounterOffer, simulateDriverCounterResponse, instantBookNoNegotiation, switchMatchedDriver, selectOffer, payAdvanceForSelectedOffer, simulateDriverCancellationAfterConfirmation, resetDropBid,
  ]);

  return <TaxiFlowContext.Provider value={value}>{children}</TaxiFlowContext.Provider>;
}

export function useTaxiFlow() {
  const ctx = useContext(TaxiFlowContext);
  if (!ctx) throw new Error('useTaxiFlow must be used within a TaxiFlowProvider');
  return ctx;
}
