// services/orderService.ts
import api from '../app/api/api';

// Define types for better TypeScript support
interface QuoteData {
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: { [key: string]: string };
  // Per-stop address/maps link, keyed like pickup_drop_location. Shown to
  // the driver before they accept. Booking-only.
  location_links?: { [key: string]: string };
  start_date_time: string;
  // Round Trip "return" / Multi City "drop" date+time. Not used by
  // Oneway/Hourly.
  end_date_time?: string;
  customer_name: string;
  customer_number: string;
  max_time_to_assign_order: number;
  toll_charge_update: boolean;
  acceptance_deadline?: string;
  cost_per_km?: number;
  extra_cost_per_km?: number;
  driver_allowance?: number;
  extra_driver_allowance?: number;
  permit_charges?: number;
  extra_permit_charges?: number;
  hill_charges?: number;
  toll_charges?: number;
  pickup_notes: string;
  send_to?: string;
  near_city?: string[]; // Change to string array
  // Hourly rental fields
  package_hours?: { hours: number; km_range: number };
  cost_per_hour?: number;
  extra_cost_per_hour?: number;
  cost_for_addon_km?: number;
  extra_cost_for_addon_km?: number;
  pick_near_city?: string[];
  // Quote-review distance/time override (booking-only - never touches the
  // route distance cache).
  override_km?: number;
  override_trip_time?: string;
  // Special requirements (both off/null by default = no special
  // Special requirements & driver extra charges (100% to driver, no commission cut)
  car_make_year_requirement?: number;
  car_year_charge?: number;
  carrier_required?: boolean;
  carrier_charge?: number;
  non_cng?: boolean;
  non_cng_charge?: number;
  pet_friendly?: boolean;
  pet_friendly_charge?: number;
  // Priority window: on by default - only Preferred Partners can accept
  // until priority_cutoff_at. Omitting the cutoff lets the backend compute
  // its own default.
  priority_for_paid?: boolean;
  priority_cutoff_at?: string;
  // Fare transparency: display-only, doesn't change any charge calculation.
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[];
  advance_received?: number;
  // ALL_INCLUSIVE only - see crud/end_records.py's All-Inclusive commission
  // rule: vendor_profit = extra_amount, admin_profit = 5% of
  // total_booking_amount. waiting_hours_included is display-only.
  total_booking_amount?: number;
  extra_amount?: number;
  waiting_hours_included?: number;
  // "10% CC" toggle (added 2026-09-04) - defaults true (normal platform
  // commission) server-side if omitted; false skips admin_profit entirely
  // at trip close (see backend crud/end_records.py).
  apply_commission?: boolean;
}

interface FormData {
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: { [key: string]: string };
  location_links?: { [key: string]: string };
  start_date_time: Date;
  // Round Trip "return" / Multi City "drop" date+time. null/undefined =
  // default (same date as pickup, 9:30 PM).
  end_date_time?: Date | null;
  customer_name: string;
  customer_number: string;
  customer_country_code?: string;
  max_time_hours: string;
  max_time_minutes: string;
  // Exact "keep booking live until" datetime. null/undefined = default
  // (pickup time + 15 minutes).
  live_until?: Date | null;
  accept_by_days?: string;
  toll_charge_update: boolean;
  // Common
  pickup_notes: string;
  // Regular trip
  cost_per_km?: string;
  extra_cost_per_km?: string;
  driver_allowance?: string;
  extra_driver_allowance?: string;
  permit_charges?: string;
  extra_permit_charges?: string;
  hill_charges?: string;
  toll_charges?: string;
  // Hourly rental
  package_hours?: { hours: number; km_range: number } | null;
  cost_per_hour?: string;
  extra_cost_per_hour?: string;
  cost_for_addon_km?: string;
  extra_cost_for_addon_km?: string;
  night_charges? : string;
  // Quote-review distance/time override (booking-only - never touches the
  // route distance cache).
  override_km?: string;
  override_trip_time?: string;
  // Special requirements & driver extra charges (100% to driver).
  require_car_make_year?: boolean;
  car_make_year_requirement?: string;
  car_year_charge?: string;
  carrier_required?: boolean;
  carrier_charge?: string;
  non_cng?: boolean;
  non_cng_charge?: string;
  pet_friendly?: boolean;
  pet_friendly_charge?: string;
  priority_for_paid?: boolean;
  priority_cutoff_at?: Date | null;
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[];
  advance_received?: string;
  total_booking_amount?: string;
  extra_amount?: string;
  waiting_hours_included?: string;
  apply_commission?: boolean;
}

// ----------------------
// Quote API functions
// ----------------------

export const getOnewayQuote = async (quoteData: QuoteData) => {
  const response = await api.post('/orders/oneway/quote', quoteData);
  return response.data;
};

export const getRoundTripQuote = async (quoteData: QuoteData) => {
  const response = await api.post('/orders/roundtrip/quote', quoteData);
  return response.data;
};

export const getMulticityQuote = async (quoteData: QuoteData) => {
  const response = await api.post('/orders/multicity/quote', quoteData);
  return response.data;
};

export const getHourlyQuote = async (quoteData: QuoteData) => {
  const response = await api.post('/orders/hourly/quote', quoteData);
  return response.data;
};

// ----------------------
// Order Confirmation
// ----------------------

export const confirmOnewayOrder = async (orderData: QuoteData) => {
  const response = await api.post('/orders/oneway/confirm', orderData);
  return response.data;
};

export const confirmRoundTripOrder = async (orderData: QuoteData) => {
  const response = await api.post('/orders/roundtrip/confirm', orderData);
  return response.data;
};

export const confirmMulticityOrder = async (orderData: QuoteData) => {
  const response = await api.post('/orders/multicity/confirm', orderData);
  return response.data;
};

export const confirmHourlyOrder = async (orderData: QuoteData) => {
  const response = await api.post('/orders/hourly/confirm', orderData);
  return response.data;
};

// ----------------------
// Generic Dispatcher
// ----------------------

export const getQuote = async (quoteData: QuoteData) => {
  switch (quoteData.trip_type) {
    case 'Oneway':
    case 'Local':
      return getOnewayQuote(quoteData);
    case 'Round Trip':
      return getRoundTripQuote(quoteData);
    case 'Multy City':
      return getMulticityQuote(quoteData);
    default:
      throw new Error(`Unsupported trip type: ${quoteData.trip_type}`);
  }
};

export const confirmOrder = async (orderData: QuoteData) => {
  switch (orderData.trip_type) {
    case 'Oneway':
    case 'Local':
      return confirmOnewayOrder(orderData);
    case 'Round Trip':
      return confirmRoundTripOrder(orderData);
    case 'Multy City':
      return confirmMulticityOrder(orderData);
    case 'Hourly Rental':
      return confirmHourlyOrder(orderData);
    default:
      throw new Error(`Unsupported trip type: ${orderData.trip_type}`);
  }
};

// ----------------------
// Data Formatters
// ----------------------

// Minutes (from now) the booking stays live. Priority:
// 1. Exact "live until" datetime chosen by the vendor
// 2. Default: pickup time + 15 minutes
// 3. Legacy hours/minutes fields (older callers)
const getLiveMinutes = (formData: FormData): number => {
  const target =
    formData.live_until !== undefined
      ? (formData.live_until ?? new Date(formData.start_date_time.getTime() + 15 * 60 * 1000))
      : null;
  if (target) {
    return Math.max(1, Math.round((target.getTime() - Date.now()) / 60000));
  }
  const hours = parseInt(formData.max_time_hours || '0');
  const minutes = parseInt(formData.max_time_minutes || '0');
  return (hours * 60) + minutes;
};

// Default Round Trip "return" / Multi City "drop" datetime when the vendor
// hasn't picked one: same date as pickup, 9:30 PM.
export const getDefaultEndDateTime = (startDateTime: Date): Date => {
  const d = new Date(startDateTime);
  d.setHours(21, 30, 0, 0);
  return d;
};

export const formatOrderData = (
  formData: FormData,
  sendTo: string = 'ALL',
  nearCity?: string[] // Change to string array
): QuoteData => {
  const totalMinutes = getLiveMinutes(formData);
  // Legacy "Accept By (days)" field - kept for old callers. The exact
  // "Keep Booking Live Until" picker (live_until) supersedes it.
  const acceptByDays = parseInt(formData.accept_by_days || '0');
  const needsEndDateTime = formData.trip_type === 'Round Trip' || formData.trip_type === 'Multy City';
  const effectiveEndDateTime = needsEndDateTime
    ? (formData.end_date_time ?? getDefaultEndDateTime(formData.start_date_time))
    : null;

  const nonCngVal = parseFloat(formData.non_cng_charge || '0');
  const carrierVal = parseFloat(formData.carrier_charge || '0');
  const petVal = parseFloat(formData.pet_friendly_charge || '0');
  const yearVal = parseFloat(formData.car_year_charge || '0');

  const driverExtrasList: string[] = [];
  if (formData.non_cng) {
    driverExtrasList.push(`Non CNG${nonCngVal > 0 ? ` (+₹${formData.non_cng_charge} to driver)` : ''}`);
  }
  if (formData.carrier_required) {
    driverExtrasList.push(`Carrier${carrierVal > 0 ? ` (+₹${formData.carrier_charge} to driver)` : ''}`);
  }
  if (formData.pet_friendly) {
    driverExtrasList.push(`Pet Friendly${petVal > 0 ? ` (+₹${formData.pet_friendly_charge} to driver)` : ''}`);
  }
  if (formData.require_car_make_year && formData.car_make_year_requirement) {
    driverExtrasList.push(`Year ${formData.car_make_year_requirement}+${yearVal > 0 ? ` (+₹${formData.car_year_charge} to driver)` : ''}`);
  }

  let finalPickupNotes = formData.pickup_notes || '';
  if (driverExtrasList.length > 0) {
    const hasAnyExtra = nonCngVal > 0 || carrierVal > 0 || petVal > 0 || yearVal > 0;
    const headerTitle = hasAnyExtra ? 'Special Requirements & Driver Extras' : 'Special Requirements';
    const extrasLine = `[${headerTitle}: ${driverExtrasList.join(', ')}]`;
    if (!finalPickupNotes.includes(headerTitle)) {
      finalPickupNotes = finalPickupNotes ? `${finalPickupNotes}\n${extrasLine}` : extrasLine;
    }
  }

  const orderData: QuoteData = {
    vendor_id: formData.vendor_id,
    trip_type: formData.trip_type,
    car_type: formData.car_type,
    pickup_drop_location: formData.pickup_drop_location,
    ...(formData.location_links && Object.keys(formData.location_links).length > 0 && {
      location_links: formData.location_links,
    }),
    start_date_time: formData.start_date_time.toISOString(),
    ...(effectiveEndDateTime && { end_date_time: effectiveEndDateTime.toISOString() }),
    customer_name: formData.customer_name,
    customer_number: `${formData.customer_country_code || '+91'}${formData.customer_number}`,
    max_time_to_assign_order: totalMinutes,
    toll_charge_update: formData.toll_charge_update,
    pickup_notes: finalPickupNotes,
    send_to: sendTo,
    ...(formData.live_until
      ? { acceptance_deadline: formData.live_until.toISOString() }
      : acceptByDays > 0 && {
          acceptance_deadline: new Date(Date.now() + acceptByDays * 24 * 60 * 60 * 1000).toISOString(),
        }),
    near_city: sendTo === 'NEAR_CITY' && nearCity && nearCity.length > 0 ? nearCity : ['ALL'],
    ...(formData.cost_per_km && { cost_per_km: parseFloat(formData.cost_per_km) }),
    ...(formData.extra_cost_per_km && { extra_cost_per_km: parseFloat(formData.extra_cost_per_km) }),
    ...(formData.driver_allowance && { driver_allowance: parseFloat(formData.driver_allowance) }),
    ...(formData.extra_driver_allowance && { extra_driver_allowance: parseFloat(formData.extra_driver_allowance) }),
    ...(formData.permit_charges && { permit_charges: parseFloat(formData.permit_charges) }),
    ...(formData.extra_permit_charges && { extra_permit_charges: parseFloat(formData.extra_permit_charges) }),
    ...(formData.hill_charges && { hill_charges: parseFloat(formData.hill_charges) }),
    ...(formData.toll_charges && { toll_charges: parseFloat(formData.toll_charges) }),
    ...(formData.night_charges && { night_charges: parseFloat(formData.night_charges) }),
    ...(formData.override_km && parseFloat(formData.override_km) > 0 && {
      override_km: parseFloat(formData.override_km),
      ...(formData.override_trip_time && { override_trip_time: formData.override_trip_time }),
    }),
    ...(formData.require_car_make_year && formData.car_make_year_requirement && {
      car_make_year_requirement: parseInt(formData.car_make_year_requirement, 10),
      ...(yearVal > 0 && { car_year_charge: yearVal }),
    }),
    ...(formData.carrier_required && {
      carrier_required: true,
      ...(carrierVal > 0 && { carrier_charge: carrierVal }),
    }),
    ...(formData.non_cng && {
      non_cng: true,
      ...(nonCngVal > 0 && { non_cng_charge: nonCngVal }),
    }),
    ...(formData.pet_friendly && {
      pet_friendly: true,
      ...(petVal > 0 && { pet_friendly_charge: petVal }),
    }),
    priority_for_paid: formData.priority_for_paid !== false,
    ...(formData.priority_for_paid !== false && formData.priority_cutoff_at && {
      priority_cutoff_at: formData.priority_cutoff_at.toISOString(),
    }),
    fare_type: formData.fare_type || 'ITEMIZED',
    charge_items: [
      { label: 'Toll', included: !formData.toll_charge_update },
      ...(formData.charge_items || []),
    ],
    ...(formData.advance_received && parseFloat(formData.advance_received) > 0 && {
      advance_received: parseFloat(formData.advance_received),
    }),
    ...(formData.fare_type === 'ALL_INCLUSIVE' && formData.total_booking_amount && {
      total_booking_amount: parseFloat(formData.total_booking_amount),
      extra_amount: formData.extra_amount ? parseFloat(formData.extra_amount) : 0,
      ...(formData.waiting_hours_included && { waiting_hours_included: parseFloat(formData.waiting_hours_included) }),
    }),
    apply_commission: formData.apply_commission !== false,
  };

  return orderData;
};

export const formatHourlyOrderData = (
  formData: FormData,
  sendTo: string = 'ALL',
  nearCity?: string[]
): QuoteData => {
  const totalMinutes = getLiveMinutes(formData);

  const nonCngVal = parseFloat(formData.non_cng_charge || '0');
  const carrierVal = parseFloat(formData.carrier_charge || '0');
  const petVal = parseFloat(formData.pet_friendly_charge || '0');
  const yearVal = parseFloat(formData.car_year_charge || '0');

  const driverExtrasList: string[] = [];
  if (formData.non_cng) {
    driverExtrasList.push(`Non CNG${nonCngVal > 0 ? ` (+₹${formData.non_cng_charge} to driver)` : ''}`);
  }
  if (formData.carrier_required) {
    driverExtrasList.push(`Carrier${carrierVal > 0 ? ` (+₹${formData.carrier_charge} to driver)` : ''}`);
  }
  if (formData.pet_friendly) {
    driverExtrasList.push(`Pet Friendly${petVal > 0 ? ` (+₹${formData.pet_friendly_charge} to driver)` : ''}`);
  }
  if (formData.require_car_make_year && formData.car_make_year_requirement) {
    driverExtrasList.push(`Year ${formData.car_make_year_requirement}+${yearVal > 0 ? ` (+₹${formData.car_year_charge} to driver)` : ''}`);
  }

  let finalNotes = formData.pickup_notes || '';
  if (driverExtrasList.length > 0) {
    const hasAnyExtra = nonCngVal > 0 || carrierVal > 0 || petVal > 0 || yearVal > 0;
    const headerTitle = hasAnyExtra ? 'Special Requirements & Driver Extras' : 'Special Requirements';
    const extrasLine = `[${headerTitle}: ${driverExtrasList.join(', ')}]`;
    if (!finalNotes.includes(headerTitle)) {
      finalNotes = finalNotes ? `${finalNotes}\n${extrasLine}` : extrasLine;
    }
  }

  const orderData: QuoteData = {
    vendor_id: formData.vendor_id,
    trip_type: "Hourly Rental",
    car_type: formData.car_type,
    pickup_drop_location: formData.pickup_drop_location,
    ...(formData.location_links && Object.keys(formData.location_links).length > 0 && {
      location_links: formData.location_links,
    }),
    start_date_time: formData.start_date_time.toISOString(),
    customer_name: formData.customer_name,
    customer_number: `${formData.customer_country_code || '+91'}${formData.customer_number}`,
    max_time_to_assign_order: totalMinutes,
    toll_charge_update: formData.toll_charge_update,
    pickup_notes: finalNotes,
    send_to: sendTo,
    near_city: sendTo === 'NEAR_CITY' && nearCity && nearCity.length > 0 ? nearCity : ['ALL'],
    pick_near_city: sendTo === 'NEAR_CITY' && nearCity && nearCity.length > 0 ? nearCity : ['ALL'],
    ...(formData.package_hours && { package_hours: formData.package_hours }),
    ...(formData.cost_per_hour && { cost_per_hour: parseFloat(formData.cost_per_hour) }),
    ...(formData.extra_cost_per_hour && { extra_cost_per_hour: parseFloat(formData.extra_cost_per_hour) }),
    ...(formData.cost_for_addon_km && { cost_for_addon_km: parseFloat(formData.cost_for_addon_km) }),
    ...(formData.extra_cost_for_addon_km && { extra_cost_for_addon_km: parseFloat(formData.extra_cost_for_addon_km) }),
    ...(formData.require_car_make_year && formData.car_make_year_requirement && {
      car_make_year_requirement: parseInt(formData.car_make_year_requirement, 10),
      ...(yearVal > 0 && { car_year_charge: yearVal }),
    }),
    ...(formData.carrier_required && {
      carrier_required: true,
      ...(carrierVal > 0 && { carrier_charge: carrierVal }),
    }),
    ...(formData.non_cng && {
      non_cng: true,
      ...(nonCngVal > 0 && { non_cng_charge: nonCngVal }),
    }),
    ...(formData.pet_friendly && {
      pet_friendly: true,
      ...(petVal > 0 && { pet_friendly_charge: petVal }),
    }),
  };

  return orderData;
};

export const increaseAllInclusiveFare = async (
  orderId: number,
  newTotalAmount: number
): Promise<{ status: string; order_id: number; old_total_amount: number; new_total_amount: number; message: string }> => {
  const response = await api.patch(`/orders/${orderId}/increase-all-inclusive-fare`, {
    new_total_amount: Math.round(newTotalAmount),
  });
  return response.data;
};