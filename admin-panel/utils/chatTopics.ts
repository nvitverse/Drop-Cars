// What a chat is ABOUT, worked out from its latest message (English, Tamil-in-English letters and Tamil script words).
// Used by the Chats inbox to sort every conversation into  main category (who) > topic (what) so staff can see at a glance
// "5 drivers have login problems, 3 are about documents, 2 about money".

export interface TopicDef {
  id: string;
  label: string;
  color: string;
  keywords: string[];
}

export interface ChatLike {
  last_text?: string | null;
  title?: string;
  help?: boolean;
  stage?: string;
}

// Words are matched as lower-case substrings of the message. Order = tie-break priority.
export const PARTNER_TOPICS: TopicDef[] = [
  { id: 'login', label: 'Login & OTP', color: '#F59E0B', keywords: ['login', 'log in', 'logged', 'password', 'forgot', 'otp', 'sign in', 'sign up', 'signup', 'register', 'registration', 'verification code', 'cannot open', 'login aagala', 'varala', 'லாகின்', 'பாஸ்வேர்ட்', 'ஓடிபி'] },
  { id: 'documents', label: 'Documents & Verification', color: '#3B82F6', keywords: ['document', 'licence', 'license', ' dl', 'rc ', ' rc', 'insurance', 'permit', ' fc', 'aadhaar', 'aadhar', 'pan card', 'police', 'invalid', 'verify', 'verified', 'verification', 'expiry', 'expire', 'upload', 'photo', 'original', 'certificate', 'ஆவணம்', 'லைசென்ஸ்'] },
  { id: 'wallet', label: 'Wallet & Payments', color: '#10B981', keywords: ['wallet', 'payment', 'paid', 'pay ', 'recharge', 'balance', 'payout', 'withdraw', 'redeem', 'refund', 'upi', 'gpay', 'phonepe', 'paytm', 'money', 'amount', 'hold', 'commission', 'invoice', 'bill', 'rupee', 'பணம்', 'வாலட்'] },
  { id: 'subscription', label: 'Subscription & Trusted', color: '#8B5CF6', keywords: ['subscription', 'subscribe', 'trusted', 'plan', 'yearly', 'monthly', 'premium', 'preferred', 'pro '] },
  { id: 'trips', label: 'Bookings & Trips', color: '#06B6D4', keywords: ['booking', 'trip', 'ride', 'pickup', 'pick up', 'drop', 'customer', 'toll', 'km', 'end trip', 'start trip', 'close', 'cancel', 'duty', 'assign', 'accept', 'vehicle', 'car ', 'outstation', 'புக்கிங்', 'ட்ரிப்'] },
  { id: 'app', label: 'App problems', color: '#EF4444', keywords: ['app', 'crash', 'update', 'not working', 'error', 'bug', 'hang', 'slow', 'notification', 'sound', 'location', 'gps', 'screen', 'stuck', 'open aagala'] },
  { id: 'other', label: 'Other', color: '#64748B', keywords: [] },
];

export const VENDOR_TOPICS: TopicDef[] = [
  { id: 'login', label: 'Login & OTP', color: '#F59E0B', keywords: ['login', 'password', 'forgot', 'otp', 'sign in', 'register', 'signup'] },
  { id: 'posting', label: 'Posting & Bookings', color: '#06B6D4', keywords: ['post', 'booking', 'trip', 'assign', 'driver', 'car', 'fare', 'tariff', 'quote', 'cancel', 'edit'] },
  { id: 'payments', label: 'Payments & Wallet', color: '#10B981', keywords: ['wallet', 'advance', 'payment', 'commission', 'invoice', 'gst', 'refund', 'payout', 'recharge', 'amount', 'bill'] },
  { id: 'documents', label: 'Documents', color: '#3B82F6', keywords: ['document', 'gst number', 'pan', 'verify', 'upload', 'kyc'] },
  { id: 'other', label: 'Other', color: '#64748B', keywords: [] },
];

export const CUSTOMER_TOPICS: TopicDef[] = [
  { id: 'booking', label: 'Booking help', color: '#06B6D4', keywords: ['book', 'booking', 'quote', 'price', 'fare', 'tariff', 'car type', 'pickup', 'schedule', 'change'] },
  { id: 'payments', label: 'Payments & Refunds', color: '#10B981', keywords: ['payment', 'paid', 'refund', 'advance', 'invoice', 'bill', 'upi', 'money', 'wallet', 'cancel'] },
  { id: 'trip', label: 'During the trip', color: '#F59E0B', keywords: ['driver', 'late', 'delay', 'otp', 'location', 'where', 'not reached', 'toll', 'route', 'car number', 'ac '] },
  { id: 'login', label: 'Login & App', color: '#8B5CF6', keywords: ['login', 'otp', 'password', 'app', 'error', 'crash'] },
  { id: 'other', label: 'Other', color: '#64748B', keywords: [] },
];

// Booking (trip) chats: about the journey itself
export const TRIP_TOPICS: TopicDef[] = [
  { id: 'extras', label: 'Toll, parking & extras', color: '#F59E0B', keywords: ['toll', 'parking', 'permit', 'tax', 'extra', 'bata', 'waiting', 'night', 'charge'] },
  { id: 'money', label: 'Payment & cash', color: '#10B981', keywords: ['payment', 'cash', 'advance', 'paid', 'upi', 'balance', 'amount', 'bill', 'refund', 'rupee'] },
  { id: 'code', label: 'Trip code (OTP)', color: '#8B5CF6', keywords: ['otp', 'code', 'start code', 'end code'] },
  { id: 'route', label: 'Route & location', color: '#06B6D4', keywords: ['route', 'location', 'address', 'landmark', 'map', 'where', 'reach', 'pickup', 'drop', 'km', 'distance'] },
  { id: 'delay', label: 'Delay & changes', color: '#EF4444', keywords: ['late', 'delay', 'wait', 'cancel', 'change', 'reschedule', 'postpone', 'not coming', 'no show'] },
  { id: 'general', label: 'General', color: '#64748B', keywords: [] },
];

export function classifyTopic(row: ChatLike, topics: TopicDef[]): string {
  if (row.help && topics.some((t) => t.id === 'login')) return 'login';   // asked for help from the forgot-password screen = cannot log in
  const text = ` ${(row.last_text || '').toLowerCase()} ${(row.title || '').toLowerCase()} `;
  if (!text.trim()) return topics[topics.length - 1].id;
  let best = topics[topics.length - 1].id;
  let bestHits = 0;
  for (const t of topics) {
    let hits = 0;
    for (const k of t.keywords) if (k && text.includes(k)) hits++;
    if (hits > bestHits) {
      best = t.id;
      bestHits = hits;
    }
  }
  return best;
}
