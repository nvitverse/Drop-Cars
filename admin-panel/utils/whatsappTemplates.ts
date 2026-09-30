import { Linking, Platform, Alert } from 'react-native';

export interface WhatsAppTemplateData {
  bookingId?: string | number;
  customerName?: string;
  customerPhone?: string;
  pickupLocation?: string;
  dropLocation?: string;
  pickupDate?: string;
  pickupTime?: string;
  vehicleType?: string;
  tripType?: string;
  distanceKm?: number | string;
  baseFare?: number;
  driverBata?: number;
  tollCharges?: number;
  extraCharges?: number;
  advanceAmount?: number;
  totalFare?: number;
  finalFare?: number;
  balancePaid?: number;
  gstAmount?: number;
  driverName?: string;
  driverPhone?: string;
  carName?: string;
  carNumber?: string;
  brandName?: string;
  brandPhone?: string;
  reviewToken?: string;
}

export function formatPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export type TemplateType =
  | 'booking_confirmed'
  | 'driver_assigned'
  | 'fare_estimation'
  | 'group_broadcast'
  | 'advance_request'
  | 'trip_completed'
  | 'feedback_request';

export const TEMPLATE_METADATA: Record<
  TemplateType,
  { title: string; subtitle: string; icon: string; defaultColor: string }
> = {
  booking_confirmed: {
    title: 'Booking Confirmed',
    subtitle: 'Trip schedule, vehicle category & live tracking link',
    icon: 'CheckCircle2',
    defaultColor: '#10B981',
  },
  driver_assigned: {
    title: 'Driver & Cab Assigned',
    subtitle: 'Driver phone, car plate number & tap-to-call link',
    icon: 'Car',
    defaultColor: '#3B82F6',
  },
  group_broadcast: {
    title: 'Group Post (Driver Broadcast)',
    subtitle: 'Driver WhatsApp groups post with route, fare & net payout',
    icon: 'Send',
    defaultColor: '#8B5CF6',
  },
  advance_request: {
    title: 'Advance Payment Request',
    subtitle: '20% booking advance payment link & UPI confirmation',
    icon: 'Calculator',
    defaultColor: '#F59E0B',
  },
  fare_estimation: {
    title: 'Fare Quotation',
    subtitle: 'Itemized base fare, tolls, driver bata & estimate',
    icon: 'Calculator',
    defaultColor: '#0EA5E9',
  },
  trip_completed: {
    title: 'Trip Completed & Invoice',
    subtitle: 'Final settled fare, actual KM & official GST PDF link',
    icon: 'Receipt',
    defaultColor: '#10B981',
  },
  feedback_request: {
    title: 'Feedback & Review',
    subtitle: 'Personal thank you note & 1-tap direct review link',
    icon: 'Star',
    defaultColor: '#EC4899',
  },
};

export function buildWhatsAppMessage(type: TemplateType, data: WhatsAppTemplateData): string {
  const brand = data.brandName || 'Drop Cars';
  const brandPhone = data.brandPhone || '7200217986';
  const bid = data.bookingId ? String(data.bookingId).replace(/^#/, '') : 'DC-BOOKING';
  const custName = data.customerName || 'Valued Customer';
  const pickup = data.pickupLocation || 'Pickup Location';
  const drop = data.dropLocation || 'Destination';
  const date = data.pickupDate || 'Scheduled Date';
  const time = data.pickupTime || 'Scheduled Time';
  const vehicle = data.vehicleType || 'Sedan';
  const tripType = data.tripType || 'One Way';
  const trackingUrl = `https://dropcars.in/track/${bid}`;
  const reviewToken = data.reviewToken || bid;
  const reviewUrl = `https://dropcars.in/review/${reviewToken}`;
  const invoiceUrl = `https://dropcars.in/invoice/${bid}`;
  const advancePayUrl = `https://dropcars.in/pay-advance/${bid}`;

  switch (type) {
    case 'booking_confirmed': {
      const fare = data.totalFare || data.baseFare || 0;
      return `🚗 *${brand.toUpperCase()} - BOOKING CONFIRMED*
Booking ID: *#DC-${bid}*
Status: *Confirmed & Fleet Allocated*

👤 *Customer Details:*
• Name: ${custName}
• Contact: ${data.customerPhone || 'N/A'}

📍 *Trip Schedule:*
• Route: ${pickup} ➔ ${drop}
• Pickup: ${date} at ${time}
• Vehicle: ${vehicle} (${tripType})
${fare > 0 ? `• Quoted Fare: ₹${fare.toLocaleString('en-IN')} (Tolls & Driver Beta Included)\n` : ''}
🔗 *Live Trip Tracking Link:*
${trackingUrl}

📞 *24/7 Support Helpline:* tel:${brandPhone}
Thank you for choosing ${brand}! Have a safe and pleasant journey.`;
    }

    case 'driver_assigned': {
      const dName = data.driverName || 'Professional Driver';
      const dPhone = data.driverPhone || brandPhone;
      const cName = data.carName || vehicle;
      const cNumber = data.carNumber || 'Plate assigned on arrival';

      return `🚖 *${brand.toUpperCase()} - DRIVER & CAB DETAILS*
Booking ID: *#DC-${bid}*

Your cab has been assigned for your journey on ${date} at ${time}.

👤 *Driver Details:*
• Driver Name: *${dName}*
• Mobile: ${dPhone}
• Tap to Call: tel:${dPhone.replace(/\D/g, '')}

🚗 *Vehicle Details:*
• Vehicle: *${cName}*
• Plate Number: *${cNumber}*

📍 *Live Cab Tracking Link:*
${trackingUrl}

Driver will report 15 minutes before pickup time. For immediate assistance, call ${brandPhone}.`;
    }

    case 'group_broadcast': {
      const grossFare = data.totalFare || data.baseFare || 0;
      const commission = Math.round(grossFare * 0.1);
      const netPayout = Math.max(0, grossFare - commission);
      return `🚖 *${brand.toUpperCase()} - NEW TRIP AVAILABLE* 🚖
Booking: *#DC-${bid}*

📍 *Route:* ${pickup} ➔ ${drop}
📅 *Date & Time:* ${date} at ${time}
🚗 *Vehicle Required:* ${vehicle} (${tripType})
${data.distanceKm ? `📏 *Distance:* ~${data.distanceKm} KM\n` : ''}
💰 *Fare Breakdown:*
• Gross Fare: ₹${grossFare.toLocaleString('en-IN')} (Includes Toll & Beta)
• App Commission: ₹${commission.toLocaleString('en-IN')}
• *Net Driver Payout: ₹${netPayout.toLocaleString('en-IN')}*

⚡ *Interested Drivers/Vendors:*
Reply / Call immediately to claim: tel:${brandPhone}
Claim via Driver App or Helpline. First come, first served!`;
    }

    case 'advance_request': {
      const total = data.totalFare || data.baseFare || 0;
      const advance = data.advanceAmount || Math.round(total * 0.2);
      const balance = Math.max(0, total - advance);
      return `💳 *${brand.toUpperCase()} - ADVANCE PAYMENT REQUEST*
Booking ID: *#DC-${bid}*

Dear ${custName},
To confirm your booking for *${pickup} ➔ ${drop}* on *${date} at ${time}*, please pay the 20% confirmation advance.

💰 *Payment Details:*
• Total Trip Fare: ₹${total.toLocaleString('en-IN')}
• *Advance Required (20%): ₹${advance.toLocaleString('en-IN')}*
• Balance on Trip Completion: ₹${balance.toLocaleString('en-IN')}

🔗 *Pay Advance Online (UPI / Card / NetBanking):*
${advancePayUrl}

After payment, driver and vehicle details will be assigned immediately.
📞 Helpline: ${brandPhone}`;
    }

    case 'fare_estimation': {
      const base = data.baseFare || 0;
      const bata = data.driverBata || 0;
      const toll = data.tollCharges || 0;
      const total = data.totalFare || (base + bata + toll);
      const advance = data.advanceAmount || Math.round(total * 0.2);
      const balance = Math.max(0, total - advance);

      return `📋 *${brand.toUpperCase()} - FARE ESTIMATION & QUOTE*
Reference: *EST-${bid}*

📍 *Route Information:*
• ${pickup} ➔ ${drop}
• Trip Type: ${tripType} | Vehicle: ${vehicle}
${data.distanceKm ? `• Estimated Distance: ~${data.distanceKm} KM\n` : ''}
💰 *Itemized Fare Breakdown:*
• Base Trip Fare: ₹${base.toLocaleString('en-IN')}
${bata > 0 ? `• Driver Beta / Allowance: ₹${bata.toLocaleString('en-IN')}\n` : ''}${toll > 0 ? `• Standard Toll Allowance: ₹${toll.toLocaleString('en-IN')}\n` : ''}----------------------------------------
*TOTAL QUOTED ESTIMATION: ₹${total.toLocaleString('en-IN')}*
• 20% Booking Advance: ₹${advance.toLocaleString('en-IN')}
• Balance Payable to Driver: ₹${balance.toLocaleString('en-IN')}
----------------------------------------

🔗 *Confirm & Pay 20% Advance Online:*
${advancePayUrl}

Helpline: ${brandPhone} | ${brand} Mobility`;
    }

    case 'trip_completed': {
      const settled = data.finalFare || data.totalFare || 0;
      const advance = data.advanceAmount || 0;
      const balance = data.balancePaid || Math.max(0, settled - advance);

      return `🧾 *${brand.toUpperCase()} - TRIP COMPLETED & TAX INVOICE*
Invoice #: *INV-${bid}*
Trip Status: *Completed & Settled*

Route: ${pickup} ➔ ${drop}
${data.distanceKm ? `Billed Distance: ${data.distanceKm} KM\n` : ''}
💰 *Billing Summary:*
• Base Trip Fare: ₹${(data.baseFare || settled).toLocaleString('en-IN')}
${data.extraCharges ? `• Extra KM / Time Charges: ₹${data.extraCharges.toLocaleString('en-IN')}\n` : ''}${data.tollCharges ? `• Tolls & State Permit Tax: ₹${data.tollCharges.toLocaleString('en-IN')}\n` : ''}${data.gstAmount ? `• GST (5% SAC 9966): ₹${data.gstAmount.toLocaleString('en-IN')}\n` : ''}----------------------------------------
*NET AMOUNT SETTLED: ₹${settled.toLocaleString('en-IN')}*
${advance > 0 ? `• Less: Advance Paid: -₹${advance.toLocaleString('en-IN')}\n` : ''}• Balance Settled: ₹${balance.toLocaleString('en-IN')} (Paid in Full)
----------------------------------------

📄 *Download Official GST Tax Invoice (PDF):*
${invoiceUrl}

⭐ *Rate Your Experience with Us:*
${reviewUrl}

Thank you for travelling with ${brand}!`;
    }

    case 'feedback_request': {
      const dName = data.driverName ? ` with driver ${data.driverName}` : '';
      return `🌟 *${brand.toUpperCase()} - HOW WAS YOUR TRIP?*
Dear ${custName},

Thank you for riding with us from ${pickup} to ${drop}${dName}.

Your feedback helps us maintain premium safety and quality. Please take 10 seconds to share your experience:

⭐ *1-Tap Instant Review Link:*
${reviewUrl}

🌟 *Or Review Us on Google:*
https://g.page/r/dropcars/review

Helpline: ${brandPhone} | ${brand} Management`;
    }
  }
}

export async function sendWhatsAppMessage(
  type: TemplateType,
  data: WhatsAppTemplateData
): Promise<boolean> {
  const text = buildWhatsAppMessage(type, data);
  const targetPhone = formatPhoneForWhatsApp(data.customerPhone);
  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported || Platform.OS === 'web') {
      await Linking.openURL(url);
      return true;
    } else {
      Alert.alert('WhatsApp Not Installed', 'Could not open WhatsApp on this device.');
      return false;
    }
  } catch (e: any) {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return true;
    }
    Alert.alert('Sharing Error', e?.message || 'Unable to launch WhatsApp.');
    return false;
  }
}
