import FreshRefreshControl from '@/components/FreshRefreshControl';
import { setForegroundInterval } from '@/utils/foregroundInterval';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import PageInfoModal from '@/components/PageInfoModal';
import {
  MessageCircle,
  Search,
  ChevronRight,
  ShieldCheck,
  Zap,
  MapPin,
  Clock,
  Car,
  User,
  Sparkles,
  Check,
  CheckCheck,
  Send,
  ArrowLeft,
  Headphones,
  Bot,
  Plus,
  X,
  Phone,
  HelpCircle,
  RefreshCw,
  Info,
  Cpu,
  RotateCcw,
  Compass,
  Radio,
  Layers,
  CornerDownRight,
  Navigation,
  Mic,
  Square,
  Play,
  Pause,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import VoiceNote from '@/components/chat/VoiceNote';
import ChatComposer from '@/components/chat/ChatComposer';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosDriver from '@/app/api/axiosDriver';
import axiosInstance from '@/app/api/axiosInstance';
import { formatBookingId } from '@/utils/format';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

export interface ChatMessage {
  id: string | number;
  sender: 'ME' | 'OTHER' | 'BOT' | 'SYSTEM';
  sender_name?: string;
  text: string;
  created_at: string;
  status?: 'sent' | 'delivered' | 'read';
  category?: string;
  action_chips?: string[];
  // Shown instead of/alongside action_chips when the Help Bot needs the
  // driver to pick WHICH of their current trips a question is about (e.g.
  // "what's the tariff for this trip") - each button carries the real
  // order_id so the follow-up fetches that exact booking's numbers.
  trip_options?: { order_id: number; label: string }[];
  // Set when this message is a voice note (booking chat / Support only,
  // not the Help Bot - a canned bot can't listen to audio).
  voice_url?: string;
}

export interface BotResponse {
  text: string;
  category: string;
  action_chips?: string[];
}

export interface ConversationItem {
  id: string; // 'ai-bot', 'dispatch-desk', or 'order-1234'
  type: 'AI_BOT' | 'DISPATCH' | 'PASSENGER';
  order_id?: number;
  title: string;
  subtitle: string;
  route_info?: string;
  car_type?: string;
  customer_name?: string;
  customer_phone?: string;
  // Who is actually on the other side of an order's chat (there is no
  // in-app "customer" account on this platform - the real party is
  // whoever posted the booking). See booking_chat.py's `other_role`.
  other_role?: 'VENDOR' | 'OWNER' | 'ADMIN' | 'DRIVER';
  other_phone?: string;
  last_message: string;
  last_time: string;
  unread_count: number;
  is_online?: boolean;
  is_pinned?: boolean;
  // True once there's real chat history (or the driver deliberately opened
  // it from the "+" new-chat sheet) - only these show on the main list; a
  // trip with no activity yet is still reachable from "+" as a contact.
  has_activity?: boolean;
}

export const timeLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// Reply in whatever language the driver actually typed in (Tamil script, or
// common romanized/Tanglish words), instead of always asking the backend
// for Tamil. Mirrors the backend's own detection in ai_whatsapp_assistant.py.
const TAMIL_ROMAN_WORDS = new Set([
  'vanakkam', 'evlo', 'enna', 'panrathu', 'kaasu', 'kattanam', 'pannunga', 'irukku',
  'venum', 'vendam', 'illa', 'aagum', 'epadi', 'yenga', 'nalla', 'seekiram', 'romba',
  'nanba', 'anna', 'akka', 'amma', 'appa', 'theriyala', 'mudiyala', 'panna', 'vandhu',
  'poyiduchu', 'aaguthu', 'nu',
]);
export const detectLanguage = (text: string): 'ta' | 'en' => {
  if (/[஀-௿]/.test(text)) return 'ta';
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return words.some((w) => TAMIL_ROMAN_WORDS.has(w)) ? 'ta' : 'en';
};

// Loose "is this driver asking about a fare/tariff" check, used to decide
// whether to first ask "which trip?" before answering - reusing this text
// (rather than the fully category-matched backend response) keeps it in
// sync with what the driver typed, not what category the bot guessed.
const TARIFF_WORDS = ['tariff', 'fare', 'rate', 'charges', 'pricing', 'kattanam', 'evlo'];
export const isTripTariffIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return TARIFF_WORDS.some((w) => lower.includes(w));
};

export const BOT_COMMANDS = [
  { key: 'cmd-1', number: '1', label: '⚡ Tariffs & Rates', query: '1' },
  { key: 'cmd-2', number: '2', label: '🔑 Start Trip OTP', query: '2' },
  { key: 'cmd-3', number: '3', label: '🅿️ Fastag & Tolls', query: '3' },
  { key: 'cmd-4', number: '4', label: '⏳ Delay & Waiting', query: '4' },
  { key: 'cmd-5', number: '5', label: '💳 Wallet & ₹500 Hold', query: '5' },
  { key: 'cmd-6', number: '6', label: '⚠️ Decline & Fine', query: '6' },
  { key: 'cmd-7', number: '7', label: '🌙 Driver Bata', query: '7' },
  { key: 'cmd-8', number: '8', label: '📡 HUD Auto-Match', query: '8' },
  { key: 'cmd-9', number: '9', label: '🚨 SOS & Dispatch Desk', query: '9' },
];

const CITY_DISTANCES: Record<string, number> = {
  'chennai-madurai': 460,
  'chennai-bangalore': 345,
  'chennai-bengaluru': 345,
  'chennai-coimbatore': 505,
  'chennai-salem': 345,
  'chennai-trichy': 330,
  'chennai-pondicherry': 155,
  'chennai-puducherry': 155,
  'chennai-vellore': 138,
  'chennai-tirunelveli': 625,
  'chennai-kanyakumari': 705,
  'chennai-thanjavur': 350,
  'chennai-tirupati': 135,
  'chennai-ooty': 540,
  'chennai-kodaikanal': 525,
  'chennai-dindigul': 420,
  'chennai-hosur': 310,
  'chennai-erode': 400,
  'chennai-tiruppur': 465,
  'chennai-rameswaram': 560,
  'chennai-tuticorin': 600,
  'bangalore-chennai': 345,
  'bengaluru-chennai': 345,
  'bangalore-coimbatore': 365,
  'bangalore-mysore': 145,
  'bangalore-salem': 205,
  'bangalore-madurai': 435,
  'bangalore-trichy': 340,
  'bangalore-hosur': 40,
  'coimbatore-chennai': 505,
  'coimbatore-madurai': 215,
  'coimbatore-salem': 165,
  'coimbatore-ooty': 85,
  'coimbatore-trichy': 215,
  'coimbatore-erode': 100,
  'coimbatore-tiruppur': 55,
  'coimbatore-bangalore': 365,
  'madurai-chennai': 460,
  'madurai-rameshwaram': 175,
  'madurai-kanyakumari': 245,
  'madurai-coimbatore': 215,
  'madurai-trichy': 135,
  'madurai-salem': 235,
  'madurai-tirunelveli': 160,
  'trichy-chennai': 330,
  'trichy-madurai': 135,
  'trichy-thanjavur': 55,
  'trichy-salem': 140,
  'salem-chennai': 345,
  'salem-bangalore': 205,
  'salem-coimbatore': 165,
  'salem-erode': 65,
  'pondicherry-chennai': 155,
};

const KNOWN_CITIES = [
  'chennai', 'madurai', 'coimbatore', 'bangalore', 'bengaluru', 'salem', 'trichy',
  'pondicherry', 'puducherry', 'vellore', 'erode', 'tirunelveli', 'kanyakumari',
  'thanjavur', 'dindigul', 'hosur', 'ooty', 'kodaikanal', 'tiruppur', 'kumbakonam',
  'tirupati', 'rameswaram', 'cuddalore', 'villupuram', 'nagercoil', 'tuticorin',
  'karur', 'mysore', 'munnar', 'pollachi', 'palani', 'kochi', 'theni', 'dharmapuri', 'krishnagiri', 'namakkal'
];

// Deeply Trained DropBot AI Engine (Bilingual Tamil & English + Numeric Shortcuts + Dynamic Calculation)
export function generateAiResponse(query: string): BotResponse {
  const raw = query.trim();
  const lower = raw.toLowerCase();
  const cleanTokens = lower.replace(/[#.,!?:;_-]/g, ' ').split(/\s+/).filter(Boolean);
  const numOnly = lower.replace(/[^0-9]/g, '');

  const isOne = cleanTokens.includes('1') || cleanTokens.includes('one') || lower === '1' || numOnly === '1' || lower === 'opt 1' || lower === 'option 1';
  const isTwo = cleanTokens.includes('2') || cleanTokens.includes('two') || lower === '2' || numOnly === '2' || lower === 'opt 2' || lower === 'option 2';
  const isThree = cleanTokens.includes('3') || cleanTokens.includes('three') || lower === '3' || numOnly === '3' || lower === 'opt 3' || lower === 'option 3';
  const isFour = cleanTokens.includes('4') || cleanTokens.includes('four') || lower === '4' || numOnly === '4' || lower === 'opt 4' || lower === 'option 4';
  const isFive = cleanTokens.includes('5') || cleanTokens.includes('five') || lower === '5' || numOnly === '5' || lower === 'opt 5' || lower === 'option 5';
  const isSix = cleanTokens.includes('6') || cleanTokens.includes('six') || lower === '6' || numOnly === '6' || lower === 'opt 6' || lower === 'option 6';
  const isSeven = cleanTokens.includes('7') || cleanTokens.includes('seven') || lower === '7' || numOnly === '7' || lower === 'opt 7' || lower === 'option 7';
  const isEight = cleanTokens.includes('8') || cleanTokens.includes('eight') || lower === '8' || numOnly === '8' || lower === 'opt 8' || lower === 'option 8';
  const isNine = cleanTokens.includes('9') || cleanTokens.includes('nine') || lower === '9' || numOnly === '9' || lower === 'opt 9' || lower === 'option 9';

  // Check for multi-city distance calculations
  const foundCities = KNOWN_CITIES.filter((c) => lower.includes(c));
  if (foundCities.length >= 2) {
    const c1 = foundCities[0];
    const c2 = foundCities[1];
    const key = `${c1}-${c2}`;
    const rKey = `${c2}-${c1}`;
    const dist = CITY_DISTANCES[key] || CITY_DISTANCES[rKey] || 320;
    const name1 = c1.charAt(0).toUpperCase() + c1.slice(1);
    const name2 = c2.charAt(0).toUpperCase() + c2.slice(1);

    return {
      category: 'DYNAMIC ROUTE QUOTE',
      text: `🚗 Route Estimate: ${name1} ➔ ${name2}\n\n• 📏 Estimated Distance: ~${dist} km\n\n💵 Fare Estimates (Excl. Tolls):\n• 🚗 Sedan (Etios / Dzire): ~₹${(dist * 14).toLocaleString()} (@ ₹14/km)\n• 🚙 SUV (Ertiga / Carens): ~₹${(dist * 19).toLocaleString()} (@ ₹19/km)\n• 🚘 Prime SUV (Innova Crysta): ~₹${(dist * 21).toLocaleString()} (@ ₹21/km)\n• 🚖 Hatchback (Swift / WagonR): ~₹${(dist * 13).toLocaleString()} (@ ₹13/km)\n\n• 👨‍✈️ Driver Allowance: Day ₹300 | Night ₹400\n• 🅿️ Fastag Tolls: Reimbursed on actual plaza receipts by passenger.\n\n💡 Would you like to check start OTP or toll policies?`,
      action_chips: ['🔑 2. Start Trip OTP', '🅿️ 3. Toll Rules', '⏳ 4. Waiting Policy', '🎧 Contact Dispatch Desk'],
    };
  }

  // 1. TARIFF & DISTANCE CALCULATIONS
  if (isOne || (!isTwo && !isThree && !isFour && !isFive && !isSix && !isSeven && !isEight && !isNine && (
    lower.includes('tariff') || lower.includes('fare') || lower.includes('rate') || lower.includes('km rate') ||
    lower.includes('evlo') || lower.includes('kattanam') || lower.includes('per km') || lower.includes('charges') ||
    lower.includes('rate card') || lower.includes('pricing')
  ))) {
    return {
      category: 'TARIFF CALCULATION',
      text: `💰 Drop Cars Partner Standard Tariffs:\n\n• 🚗 Sedan (Etios / Dzire / Aura): ₹14/km (Outstation min 250 km/day)\n• 🚙 SUV (Ertiga / Marazzo / Carens): ₹19/km\n• 🚘 Prime SUV (Innova / Crysta): ₹21/km\n• 🚖 Hatchback (Swift / WagonR): ₹13/km\n\n• 👨‍✈️ Driver Bata (Allowance):\n  - Day: ₹300 (06:00 AM - 10:00 PM)\n  - Night: ₹400 (10:00 PM - 06:00 AM)\n• 🅿️ Fastag Tolls & Parking: 100% paid by customer on actual receipts.\n\n📍 Popular Intercity Quick Lookups:\n• Chennai ➔ Bangalore (~345 km): Sedan ~₹4,830 | SUV ~₹6,555\n• Chennai ➔ Madurai (~460 km): Sedan ~₹6,440 | SUV ~₹8,740\n• Chennai ➔ Coimbatore (~505 km): Sedan ~₹7,070 | SUV ~₹9,595\n• Chennai ➔ Trichy (~330 km): Sedan ~₹4,620 | SUV ~₹6,270\n• Chennai ➔ Pondicherry (~155 km): Sedan ~₹2,170 | SUV ~₹2,945\n\n💡 Type any route (e.g. "Chennai to Madurai") for instant calculated quotes!`,
      action_chips: ['🚗 Chennai to Madurai', '🚗 Chennai to Bangalore', '🚗 Chennai to Coimbatore', '🔑 2. Start Trip OTP', '🅿️ 3. Toll Rules'],
    };
  }

  // 2. START TRIP & END OTP PROTOCOL
  if (isTwo || lower.includes('otp') || lower.includes('start code') || lower.includes('end code') || lower.includes('start trip') || lower.includes('start ride') || lower.includes('verification')) {
    return {
      category: 'OTP PROTOCOL',
      text: `🔑 Start Trip & End OTP Verification Protocol:\n\n1. 📲 Start Trip OTP (4 Digits):\n• Visible on the passenger's app home screen and sent to their registered mobile via SMS.\n• Ask the passenger for the code when you meet at the pickup location.\n• Enter the 4 digits in Duty Dashboard before starting navigation.\n\n2. 🏁 End Trip OTP:\n• At destination, enter any actual Fastag toll receipts and extra km in the app.\n• Verify the End OTP with passenger to close the duty sheet and unlock payments.\n\n3. ⚠️ Troubleshooting OTP:\n• If passenger did not get SMS: Tap 'Resend OTP' on driver duty screen.\n• Check if passenger mobile has signal.\n• In extreme network outage: Contact Dispatch Desk for verified instant override.`,
      action_chips: ['🅿️ 3. Toll & Parking Rules', '⏳ 4. Waiting Time Policy', '🎧 Contact Dispatch Desk'],
    };
  }

  // 3. TOLL & PARKING RULES
  if (isThree || lower.includes('toll') || lower.includes('fastag') || lower.includes('parking') || lower.includes('permit') || lower.includes('sunga') || lower.includes('sungam')) {
    return {
      category: 'TOLLS & FASTAG',
      text: `🅿️ Fastag Toll, Parking & Permit Collection Rules:\n\n• 🛣️ Fastag Toll Plazas: All National and State Highway tolls are 100% payable by the customer as per actual receipts.\n• 🚗 Parking Charges: Airport entry, railway station parking, or commercial parking tickets are reimbursed by customer.\n• 🏛️ Inter-State Road Permits: State entrance tax (e.g. Tamil Nadu ➔ Karnataka / Kerala / AP) is billed directly to the customer.\n\n📋 How to Log Tolls at Trip End:\n1. Keep Fastag SMS or plaza slips handy.\n2. In the 'Close Duty' screen, enter the exact total toll amount.\n3. The amount is automatically added to customer final bill and credited to you.`,
      action_chips: ['💰 1. Calculate Fare', '🔑 2. Start Trip OTP', '💳 5. Wallet Security Hold'],
    };
  }

  // 4. WAITING TIME & DELAY POLICY
  if (isFour || lower.includes('wait') || lower.includes('delay') || lower.includes('late') || lower.includes('not reachable') || lower.includes('unresponsive') || lower.includes('waiting charge')) {
    return {
      category: 'WAITING & DELAY',
      text: `⏳ Passenger Delay & Waiting Time Policy:\n\n• ⏱️ Free Waiting Period: 15 minutes from the scheduled trip start time.\n• 💵 Waiting Charges (after 15 mins):\n  - Sedan: ₹2.00 / minute (₹120 / hour)\n  - SUV / Innova: ₹2.50 / minute (₹150 / hour)\n\n📍 Unreachable Customer Protocol:\n1. Send an in-app message ("I have reached the pickup location").\n2. Call passenger via the masked in-app line.\n3. If passenger does not arrive after 15 minutes, tap 'Report Issue ➔ Waiting Delay'.\n4. Platform logs GPS timestamp and adds verified waiting fee to customer invoice.`,
      action_chips: ['📍 Reached Pickup Point', '⚠️ 6. Cancellation Rules', '🎧 Contact Dispatch Desk'],
    };
  }

  // 5. WALLET HOLD & PAYOUTS
  if (isFive || lower.includes('wallet') || lower.includes('hold') || lower.includes('security') || lower.includes('payout') || lower.includes('settlement') || lower.includes('panam') || lower.includes('balance')) {
    return {
      category: 'FINANCIAL CORE',
      text: `💳 Wallet Security Hold, Payouts & Balance Policy:\n\n• 🔒 Wallet Hold (minimum ₹500):\n  - On every booking you accept, at least ₹500 is held from your wallet (even if the commission is only ₹301). If the commission with extras is more than ₹500, that bigger amount is held.\n  - When the trip is completed the commission is deducted from the hold and the rest is refunded to your Available Balance. A cancelled booking is refunded in full.\n\n• 🏦 Partner Settlements:\n  - Weekly automated bank settlements disbursed every Monday directly to your registered bank account.\n  - Instant on-demand payouts available via Wallet ➔ Withdraw.\n\n• 💡 Pro Tip: Maintain at least ₹1,000 wallet balance so high-demand outstation rides are instantly assigned to you without delay.`,
      action_chips: ['➕ Recharge Wallet', '⚠️ 6. Cancellation Fine', '💰 1. Tariff Rates'],
    };
  }

  // 6. CANCELLATION & ₹500 PENALTY
  if (isSix || lower.includes('cancel') || lower.includes('penalty') || lower.includes('500') || lower.includes('fine') || lower.includes('decline') || lower.includes('abaraatham')) {
    return {
      category: 'CANCELLATION & PENALTY',
      text: `⚠️ Cancellation Rules & ₹500 Operational Penalty:\n\n1. ⏱️ 10-Second HUD Alert Decline:\n• Declining an incoming ride during the 10-second HUD broadcast is 100% FREE (₹0 penalty, zero impact on partner score).\n\n2. 🚫 Post-Assignment Partner Cancellation:\n• Once a ride is accepted and assigned to a driver/car, partner cancellations incur a ₹500 operational penalty deducted from wallet to cover emergency passenger reassignment.\n\n3. 💵 Customer Cancellation:\n• If the passenger cancels after you arrive at pickup, the platform charges the customer and credits the cancellation fee directly to your driver wallet.`,
      action_chips: ['💳 5. Wallet Balance', '⏳ 4. Waiting Policy', '🎧 Contact Dispatch Desk'],
    };
  }

  // 7. DRIVER BATA & NIGHT ALLOWANCE
  if (isSeven || lower.includes('bata') || lower.includes('allowance') || lower.includes('night') || lower.includes('stay') || lower.includes('halt') || lower.includes('beta')) {
    return {
      category: 'DRIVER ALLOWANCE',
      text: `🌙 Driver Bata & Night Halt Allowances:\n\n• ☀️ Day Driver Bata: ₹300 per day (06:00 AM - 10:00 PM).\n• 🌙 Night Driver Bata: ₹400 per night (for duty running between 10:00 PM and 06:00 AM).\n• 🏨 Outstation Multi-Day Halt: ₹500/night halt allowance when passenger requires the vehicle overnight on outstation trips.\n\n• Digital Trip Sheet: All allowances are computed automatically based on trip start and completion timestamps.`,
      action_chips: ['💰 1. Standard Tariffs', '🅿️ 3. Toll Rules', '🎧 Contact Dispatch Desk'],
    };
  }

  // 8. HUD AUTO-MATCH & SOUND ALERTS
  if (isEight || lower.includes('hud') || lower.includes('sound') || lower.includes('alert') || lower.includes('audio') || lower.includes('broadcast') || lower.includes('10 second')) {
    return {
      category: 'HUD DISPATCH',
      text: `📡 Drop Cars Urgent HUD Dispatch & Sound Alerts:\n\n• 🔊 Urgent Audio Broadcast: When a ride matching your car segment and route appears, your app sounds a high-priority 10-second alert.\n• ⚡ 10-Second Acceptance Window: You have 10 seconds to review the route, estimated payout, and tap 'ACCEPT'.\n• 🔔 Ensure Sound is Active: Turn phone media volume up and keep Drop Cars notifications enabled in phone settings.\n• 🚗 Route Requests vs Direct HUD: Route Requests give advance confirmed bookings; Direct HUD is for instant broadcasts.`,
      action_chips: ['⚡ View Route Requests', '💰 1. Tariff Rates', '🎧 Contact Dispatch Desk'],
    };
  }

  // 9. EMERGENCY SOS & DISPATCH HOTLINE
  if (isNine || lower.includes('sos') || lower.includes('emergency') || lower.includes('accident') || lower.includes('breakdown') || lower.includes('police') || lower.includes('ambulance') || lower.includes('dispatch') || lower.includes('agent') || lower.includes('support')) {
    return {
      category: 'EMERGENCY SOS',
      // No phone number hardcoded here - Support > "Talk to a person now"
      // always reaches whoever's actually on duty (see /api/support/on-duty-contact).
      text: `🚨 24/7 Emergency SOS & Central Operations Desk:\n\n• 🚗 Vehicle Breakdown: Tap 'Emergency SOS' in Duty dashboard. Drop Cars Dispatch will coordinate a replacement cab within 30-45 minutes.\n• 🏥 Accident / Medical Help: Dial 108 (Ambulance) / 112 (Police) immediately.\n• 🎧 For anything else, open Drop Cars Admin / Support and tap 'Talk to a person now' to reach whoever is on duty.`,
      action_chips: ['🎧 Open Admin / Support', '📍 Share GPS Coordinates'],
    };
  }

  // Default Futuristic Overview / Greetings
  return {
    category: 'GREETING',
    text: `👋 Drop Cars Help Bot\nInstant answers for drivers, 24/7\n\nType a number (1–9) or tap an option below:\n\n1. 💰 Tariff & Distance Rates\n2. 🔑 Start Trip & End OTP\n3. 🅿️ Fastag & Toll Rules\n4. ⏳ Delay & Waiting Time\n5. 💳 Wallet Hold & Settlements\n6. ⚠️ Cancellation & ₹500 Penalty\n7. 🌙 Driver Bata (Day ₹300 / Night ₹400)\n8. 📡 HUD Auto-Matching\n9. 🚨 Emergency SOS & Dispatch\n\n💡 You can also type a route like "Chennai to Madurai", or ask in Tamil.`,
    action_chips: [
      '💰 1. Calculate Fare',
      '🔑 2. How to get Start OTP?',
      '🅿️ 3. Toll Rules',
      '⏳ 4. Waiting Policy',
      '⚠️ 6. ₹500 Penalty Policy',
    ],
  };
}

export default function ChatsTabScreen() {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPageInfo, setShowPageInfo] = useState(false);
  // "+" new-chat sheet: pick a contact (a trip's Vendor/Owner/Admin, a call
  // to the customer, or Admin support) to start or resume a chat with.
  const [newChatVisible, setNewChatVisible] = useState(false);
  // Conversations the driver deliberately opened from "+" - promoted onto
  // the main list immediately, without waiting for the next server refresh
  // to report real message activity.
  const [activatedIds, setActivatedIds] = useState<Set<string>>(new Set());
  // While the Help Bot is waiting for the driver to pick which trip a
  // question is about (see isTripTariffIntent) - a plain text reply in this
  // state gets ignored by the normal send flow so it doesn't get treated as
  // a fresh, unrelated question to the generic bot.
  const [awaitingTripPick, setAwaitingTripPick] = useState(false);

  // Voice notes - real 2-way chats only (Passenger/Vendor booking chat and
  // Support), not the Help Bot, which can't listen to audio.
  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceRecorderState = useAudioRecorderState(voiceRecorder);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  // Active Chat Modal State
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Live polling for whichever chat is currently open - a real messenger
  // shows the other side's reply without the driver having to back out and
  // reopen the thread. Booking chats (PASSENGER) poll booking-chat;
  // Support (DISPATCH) polls its own thread. Help Bot needs no polling -
  // it always replies inline to whatever was just sent.
  useEffect(() => {
    if (!selectedConversation) return;
    const convo = selectedConversation;
    const storageKey = `@chat_history_${convo.id}`;

    const poll = async () => {
      try {
        let incoming: any[] = [];
        if (convo.type === 'PASSENGER' && convo.order_id) {
          const res = await axiosDriver.get(`/api/booking-chat/orders/${convo.order_id}`);
          incoming = Array.isArray(res.data?.messages)
            ? res.data.messages.map((m: any) => ({
                id: m.id, sender: m.mine ? 'ME' : 'OTHER', sender_name: m.sender_name,
                text: m.text, voice_url: m.voice_url || undefined, created_at: m.created_at || new Date().toISOString(),
                status: m.mine ? (m.read ? 'read' : 'sent') : 'read',
              }))
            : [];
        } else if (convo.type === 'DISPATCH') {
          const res = await axiosDriver.get('/api/support/my-thread');
          incoming = Array.isArray(res.data?.messages)
            ? res.data.messages.map((m: any) => ({
                id: `sup-${m.id}`, sender: m.mine ? 'ME' : 'OTHER', sender_name: m.sender_name || 'Drop Cars Support',
                text: m.text, voice_url: m.voice_url || undefined, created_at: m.created_at || new Date().toISOString(),
                status: m.mine ? (m.read ? 'read' : 'sent') : 'read',
              }))
            : [];
        } else {
          return;
        }
        if (incoming.length === 0) return;
        setChatMessages((prev) => {
          const known = new Set(prev.map((p) => String(p.id)));
          const fresh = incoming.filter((m) => !known.has(String(m.id)));
          if (fresh.length === 0) return prev;
          const next = [...prev, ...fresh];
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          return next;
        });
      } catch {}
    };

    const stop = setForegroundInterval(poll, 6000);
    return stop;
  }, [selectedConversation?.id]);

  useEffect(() => {
    AsyncStorage.getItem('@chat_activated_ids')
      .then((raw) => {
        if (raw) setActivatedIds(new Set(JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);

  const activateConversation = useCallback((id: string) => {
    setActivatedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem('@chat_activated_ids', JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  // Load All Conversations (AI Bot, Dispatch, and Passenger Bookings)
  const loadConversations = useCallback(async () => {
    try {
      const [threadsRes, pendingRes, assignedRes] = await Promise.all([
        axiosDriver.get('/api/booking-chat/threads').catch(() => ({ data: [] })),
        axiosInstance.get('/api/orders/vehicle-owner/pending').catch(() => ({ data: [] })),
        axiosDriver.get('/api/assignments/driver/assigned-orders').catch(() => ({ data: [] })),
      ]);

      const threadList: any[] = Array.isArray(threadsRes.data) ? threadsRes.data : [];
      const rawRides: any[] = [
        ...(Array.isArray(pendingRes.data) ? pendingRes.data : []),
        ...(Array.isArray(assignedRes.data) ? assignedRes.data : []),
      ];

      const convos: ConversationItem[] = [];

      // Pinned: Help Bot - always first, always here (see render: it never
      // goes through the has_activity filter that hides empty trip rows).
      convos.push({
        id: 'ai-bot',
        type: 'AI_BOT',
        title: 'Drop Cars Help Bot',
        subtitle: '24/7 Smart Automated Assistant • Instant Replies',
        last_message: 'Ask about tariffs, start OTP, tolls, route rules & policies...',
        last_time: new Date().toISOString(),
        unread_count: 0,
        is_online: true,
        is_pinned: true,
        has_activity: true,
      });

      // Drop Cars Dispatch & Operations Desk - no longer pinned by default;
      // reachable from the "+" new-chat sheet, and only shows up here once
      // the driver has actually opened/messaged it (see activatedIds).
      convos.push({
        id: 'dispatch-desk',
        type: 'DISPATCH',
        title: 'Drop Cars Admin / Support',
        subtitle: 'Duty & route help desk',
        last_message: 'Message here for duty, route or trip adjustments.',
        last_time: new Date().toISOString(),
        unread_count: 0,
        is_online: true,
        has_activity: false,
      });

      // Trip conversations - who a driver can actually reach is whoever
      // POSTED the booking (a vendor, another fleet owner, or Drop Cars
      // Admin for a Website booking) - there is no separate "customer"
      // account on this platform, see booking_chat.py's other_role.
      const seenOrderIds = new Set<number>();
      const roleLabel: Record<string, string> = { VENDOR: 'Vendor', OWNER: 'Fleet Driver', ADMIN: 'Drop Cars Admin', DRIVER: 'Driver' };

      // Merge from backend threads (these carry the real other_party/other_role + message history)
      for (const t of threadList) {
        if (!t.order_id || seenOrderIds.has(t.order_id)) continue;
        seenOrderIds.add(t.order_id);
        const role = t.other_role || 'ADMIN';
        const otherName = t.other_party || roleLabel[role] || 'Booking contact';

        convos.push({
          id: `order-${t.order_id}`,
          type: 'PASSENGER',
          order_id: t.order_id,
          title: `${roleLabel[role] || 'Contact'} • ${otherName}`,
          subtitle: `${t.title || 'Trip Details'}`,
          route_info: t.title || 'Booking',
          car_type: t.car_type || 'Car',
          customer_name: otherName,
          other_role: role,
          other_phone: t.other_phone || undefined,
          last_message: t.last_text || `${t.trip_type || 'Oneway'} • #${formatBookingId(t.order_id, t.start_date_time)}`,
          last_time: t.last_at || t.start_date_time || new Date().toISOString(),
          unread_count: t.unread || 0,
          is_online: t.assignment_status === 'DRIVING' || t.assignment_status === 'ASSIGNED',
          has_activity: Boolean(t.last_text),
        });
      }

      // Merge from active/assigned rides that don't have a chat thread yet
      // (no message sent) - these are "contacts", reachable from "+" but
      // not shown on the main list until has_activity flips true.
      for (const r of rawRides) {
        const oId = Number(r.order_id || r.id);
        if (!oId || seenOrderIds.has(oId)) continue;
        const st = String(r.trip_status || r.assignment_status || '').toUpperCase();
        if (st === 'COMPLETED' || st === 'CANCELLED') continue;

        seenOrderIds.add(oId);
        const locs = r.pickup_drop_location || {};
        const p = locs['0'] || locs.location_1 || r.pickup_location || 'Pickup';
        const d = locs['1'] || locs.location_2 || r.drop_location || 'Drop';

        convos.push({
          id: `order-${oId}`,
          type: 'PASSENGER',
          order_id: oId,
          title: `Trip • #${formatBookingId(oId, r.start_date_time)}`,
          subtitle: `${p} ➔ ${d}`,
          route_info: `${p} ➔ ${d}`,
          car_type: r.car_type || 'Car',
          customer_name: r.customer_name || '',
          customer_phone: r.customer_number || '',
          other_role: 'ADMIN',
          last_message: `${p} ➔ ${d}`,
          last_time: r.start_date_time || new Date().toISOString(),
          unread_count: 0,
          is_online: true,
          has_activity: false,
        });
      }

      setConversations(convos);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      const stop = setForegroundInterval(loadConversations, 10000);
      return stop;
    }, [loadConversations])
  );

  // Dedicated pinned objects for DropBot AI and Dispatch Desk
  const botConvo = useMemo(() => {
    return (
      conversations.find((c) => c.type === 'AI_BOT') || {
        id: 'ai-bot',
        type: 'AI_BOT' as const,
        title: 'Drop Cars Help Bot',
        subtitle: '24/7 Smart Automated Assistant • Instant Replies',
        last_message: 'Ask about tariffs, start OTP, tolls, route rules & policies...',
        last_time: new Date().toISOString(),
        unread_count: 0,
        is_online: true,
        is_pinned: true,
      }
    );
  }, [conversations]);

  const dispatchConvo = useMemo(() => {
    return (
      conversations.find((c) => c.type === 'DISPATCH') || {
        id: 'dispatch-desk',
        type: 'DISPATCH' as const,
        title: 'Drop Cars Admin / Support',
        subtitle: 'Duty & route help desk',
        last_message: 'Message here for duty, route or trip adjustments.',
        last_time: new Date().toISOString(),
        unread_count: 0,
        is_online: true,
      }
    );
  }, [conversations]);

  // Every trip the driver currently has a party to chat with (Vendor / Fleet
  // Owner / Admin) or call (the customer) - used to build the "+" new-chat
  // sheet and the Help Bot's "which trip?" picker. Unfiltered by search or
  // activity, unlike the visible list below.
  const tripConversations = useMemo(() => conversations.filter((c) => c.type === 'PASSENGER'), [conversations]);

  // What actually shows on the main screen - only chats with real activity
  // (or ones the driver just opened from "+"), like a normal messaging app;
  // everything else stays reachable from "+" without cluttering the list.
  const mainListConversations = useMemo(() => {
    let list = conversations.filter(
      (c) => c.type !== 'AI_BOT' && c.type !== 'DISPATCH' && (c.has_activity || activatedIds.has(c.id) || c.unread_count > 0)
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.subtitle.toLowerCase().includes(q) ||
          c.last_message.toLowerCase().includes(q) ||
          (c.route_info && c.route_info.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
  }, [conversations, searchQuery, activatedIds]);

  // Open Chat Thread
  const openChat = async (convo: ConversationItem) => {
    // Booking chats have their own WhatsApp-style screen (reply menus on
    // messages, hold-to-record voice, quoted replies).
    if (convo.type === 'PASSENGER' && convo.order_id) {
      activateConversation(convo.id);
      router.push({ pathname: '/chat/[orderId]', params: { orderId: String(convo.order_id) } } as any);
      return;
    }
    setSelectedConversation(convo);
    setInputText('');
    setAwaitingTripPick(false);
    activateConversation(convo.id);

    // Load persisted local messages
    const storageKey = `@chat_history_${convo.id}`;
    let loadedMsgs: ChatMessage[] = [];
    try {
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached) {
        loadedMsgs = JSON.parse(cached);
      }
    } catch {}

    // Default welcome messages if new
    if (loadedMsgs.length === 0) {
      if (convo.type === 'AI_BOT') {
        loadedMsgs = [
          {
            id: 'init-1',
            sender: 'BOT',
            sender_name: 'Help Bot',
            category: 'GREETING',
            text: `👋 Drop Cars Help Bot\nInstant answers for drivers on duty, fares, and policies.\n\nType a number (1–9) or tap an option below:\n\n1. 💰 Tariff & Distance Rates\n2. 🔑 Start Trip & End OTP\n3. 🅿️ Fastag & Toll Rules\n4. ⏳ Delay & Waiting Time\n5. 💳 Wallet Hold & Settlements\n6. ⚠️ Cancellation & ₹500 Penalty\n7. 🌙 Driver Bata (Day ₹300 / Night ₹400)\n8. 📡 HUD Auto-Matching\n9. 🚨 Emergency SOS & Dispatch\n\n💡 You can also type a route like "Chennai to Madurai", or ask in Tamil.`,
            created_at: new Date().toISOString(),
            status: 'read',
            action_chips: [
              '💰 1. Calculate Fare',
              '🔑 2. How to get Start OTP?',
              '🅿️ 3. Toll Rules',
              '⏳ 4. Waiting Policy',
              '⚠️ 6. ₹500 Penalty Policy',
            ],
          },
        ];
      } else if (convo.type === 'DISPATCH') {
        loadedMsgs = [
          {
            id: 'init-2',
            sender: 'OTHER',
            sender_name: 'Drop Cars Support',
            text: "I'll try to answer instantly first - type your question, or tap an option below. Only 'Talk to a person' goes to a human, and that's reviewed, not instant.",
            created_at: new Date().toISOString(),
            status: 'read',
            action_chips: [
              '🚨 Route detour due to road block',
              '⏱️ Passenger delayed more than 15 mins',
              '🚗 Minor vehicle issue - need 10 mins',
              '💳 Wallet balance hold inquiry',
              '📦 About a specific booking',
              '🙋 Talk to a person now',
            ],
          },
        ];
        // Any real history (e.g. an earlier Admin reply) beyond this
        // fixed intro - without this, it only appeared after the first
        // 6s poll tick.
        try {
          const res = await axiosDriver.get('/api/support/my-thread');
          if (Array.isArray(res.data?.messages) && res.data.messages.length > 0) {
            const backendMapped = res.data.messages.map((m: any) => ({
              id: `sup-${m.id}`,
              sender: m.mine ? 'ME' : 'OTHER',
              sender_name: m.sender_name || 'Drop Cars Support',
              text: m.text,
              voice_url: m.voice_url || undefined,
              created_at: m.created_at || new Date().toISOString(),
              status: m.mine ? (m.read ? 'read' : 'sent') : 'read',
            }));
            loadedMsgs = [loadedMsgs[0], ...backendMapped];
          }
        } catch {}
      } else if (convo.type === 'PASSENGER') {
        loadedMsgs = [
          {
            id: 'init-3',
            sender: 'SYSTEM',
            text: `🛡️ Private End-to-End Chat for ${convo.title}. Your phone number is masked and protected.`,
            created_at: new Date().toISOString(),
          },
        ];
        // Fetch backend messages if order
        if (convo.order_id) {
          try {
            const res = await axiosDriver.get(`/api/booking-chat/orders/${convo.order_id}`);
            if (res.data?.messages && Array.isArray(res.data.messages)) {
              const backendMapped = res.data.messages.map((m: any) => ({
                id: m.id,
                sender: m.mine ? 'ME' : 'OTHER',
                sender_name: m.sender_name,
                text: m.text,
                voice_url: m.voice_url || undefined,
                created_at: m.created_at || new Date().toISOString(),
                status: m.mine ? (m.read ? 'read' : 'sent') : 'read',
              }));
              if (backendMapped.length > 0) {
                loadedMsgs = [loadedMsgs[0], ...backendMapped];
              }
            }
          } catch {}
        }
      }
    }

    setChatMessages(loadedMsgs);
  };

  // Reset DropBot Session
  const resetBotSession = async () => {
    if (!selectedConversation) return;
    const initialMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'BOT',
      sender_name: 'Help Bot',
      category: 'GREETING',
      text: `👋 Drop Cars Help Bot (reset)\nInstant answers for drivers on duty, fares, and policies.\n\nType a number (1–9) or tap an option below:\n\n1. 💰 Tariff & Distance Rates\n2. 🔑 Start Trip & End OTP\n3. 🅿️ Fastag & Toll Rules\n4. ⏳ Delay & Waiting Time\n5. 💳 Wallet Hold & Settlements\n6. ⚠️ Cancellation & ₹500 Penalty\n7. 🌙 Driver Bata (Day ₹300 / Night ₹400)\n8. 📡 HUD Auto-Matching\n9. 🚨 Emergency SOS & Dispatch\n\n💡 You can also type a route like "Chennai to Madurai", or ask in Tamil.`,
      created_at: new Date().toISOString(),
      status: 'read',
      action_chips: [
        '💰 1. Calculate Fare',
        '🔑 2. How to get Start OTP?',
        '🅿️ 3. Toll Rules',
        '⏳ 4. Waiting Policy',
        '⚠️ 6. ₹500 Penalty Policy',
      ],
    };
    setChatMessages([initialMsg]);
    const storageKey = `@chat_history_${selectedConversation.id}`;
    AsyncStorage.setItem(storageKey, JSON.stringify([initialMsg])).catch(() => {});
  };

  // Send Message
  const startVoiceRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to send a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await voiceRecorder.prepareToRecordAsync();
      voiceRecorder.record();
    } catch {
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopAndSendVoiceRecording = async () => {
    if (!selectedConversation) return;
    try {
      await voiceRecorder.stop();
      const uri = voiceRecorder.uri;
      if (!uri) return;
      await sendVoiceUri(uri);
    } catch {
      Alert.alert('Error', 'Could not send the voice note. Please try again.');
    }
  };

  const sendVoiceUri = async (uri: string) => {
    if (!selectedConversation) return;
    try {
      setUploadingVoice(true);
      const formData = new FormData();
      formData.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
      const res = await axiosDriver.post('/api/booking-chat/upload-voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const voiceUrl = res.data?.voice_url;
      if (!voiceUrl) throw new Error('Upload failed');

      const storageKey = `@chat_history_${selectedConversation.id}`;
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ME',
        sender_name: 'You',
        text: '🎤 Voice message',
        voice_url: voiceUrl,
        created_at: new Date().toISOString(),
        status: 'sent',
      };
      const updatedMsgs = [...chatMessages, newMsg];
      setChatMessages(updatedMsgs);
      AsyncStorage.setItem(storageKey, JSON.stringify(updatedMsgs)).catch(() => {});
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      if (selectedConversation.type === 'PASSENGER' && selectedConversation.order_id) {
        const sendRes = await axiosDriver.post(`/api/booking-chat/orders/${selectedConversation.order_id}`, { voice_url: voiceUrl });
        reconcileSentMessage(newMsg.id as string, storageKey, sendRes.data);
      } else if (selectedConversation.type === 'DISPATCH') {
        const sendRes = await axiosDriver.post('/api/support/dispatch-message', { voice_url: voiceUrl });
        reconcileSentMessage(newMsg.id as string, storageKey, sendRes.data, 'sup-');
      }
    } catch {
      Alert.alert('Error', 'Could not send the voice note. Please try again.');
    } finally {
      setUploadingVoice(false);
    }
  };

  // Swaps a locally-echoed "ME" bubble's temporary client id for the
  // server's real one once the send confirms - otherwise the next poll
  // (which dedupes by id) doesn't recognize its own message and adds a
  // second, duplicate bubble for it.
  const reconcileSentMessage = (tempId: string, storageKey: string, serverMsg: any, idPrefix = '') => {
    if (!serverMsg?.id) return;
    setChatMessages((prev) => {
      const next: ChatMessage[] = prev.map((m) =>
        String(m.id) === tempId
          ? { ...m, id: `${idPrefix}${serverMsg.id}`, status: (serverMsg.read ? 'read' : 'sent') as 'read' | 'sent' }
          : m
      );
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const sendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || !selectedConversation) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'ME',
      sender_name: 'You',
      text: textToSend,
      created_at: new Date().toISOString(),
      status: 'sent',
    };

    const updated = [...chatMessages, newMsg];
    setChatMessages(updated);
    setInputText('');

    // Persist
    const storageKey = `@chat_history_${selectedConversation.id}`;
    AsyncStorage.setItem(storageKey, JSON.stringify(updated)).catch(() => {});

    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // If Passenger chat, send to backend
    if (selectedConversation.type === 'PASSENGER' && selectedConversation.order_id) {
      try {
        const res = await axiosDriver.post(`/api/booking-chat/orders/${selectedConversation.order_id}`, {
          text: textToSend,
        });
        reconcileSentMessage(newMsg.id as string, storageKey, res.data);
      } catch {}
    }

    // If AI Bot, generate smart automated reply
    if (selectedConversation.type === 'AI_BOT') {
      setAwaitingTripPick(false);

      // A fare/tariff question, and the driver currently has trip(s) to ask
      // about - check which one instead of guessing, then hand off to
      // pickTrip() for the real numbers on that exact booking.
      const activeTrips = tripConversations.filter((c) => c.order_id);
      if (isTripTariffIntent(textToSend) && activeTrips.length > 0) {
        const lang = detectLanguage(textToSend);
        setAwaitingTripPick(true);
        const askMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'BOT',
          sender_name: 'Help Bot',
          category: 'WHICH_TRIP',
          text: lang === 'ta'
            ? '📌 எந்த சவாரியை பற்றி கேட்கிறீர்கள்? கீழே தேர்ந்தெடுக்கவும்:'
            : '📌 Which trip are you asking about? Pick one below:',
          created_at: new Date().toISOString(),
          status: 'read',
          trip_options: activeTrips.map((c) => ({
            order_id: c.order_id as number,
            label: `#${formatBookingId(c.order_id as number, c.last_time)} • ${c.route_info || c.subtitle}`,
          })),
        };
        setChatMessages((prev) => {
          const next = [...prev, askMsg];
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
          return next;
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }

      setIsBotTyping(true);
      setTimeout(async () => {
        let replyObj = generateAiResponse(textToSend);

        // Try backend AI Assistant endpoint if available
        try {
          const aiRes = await axiosInstance.post('/api/ai/chat-assistant', {
            message: textToSend,
            language: detectLanguage(textToSend),
            // the last few turns, so the assistant remembers what was just discussed
            history: chatMessages.slice(-8).filter((m) => !!m.text).map((m) => ({ role: m.sender === 'ME' ? 'user' : 'assistant', text: String(m.text).slice(0, 500) })),
          });
          if (aiRes.data?.reply) {
            replyObj = {
              text: aiRes.data.reply,
              category: aiRes.data.category || replyObj.category,
              action_chips: aiRes.data.suggestions || replyObj.action_chips,
            };
          }
        } catch {}

        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'BOT',
          sender_name: 'Help Bot',
          text: replyObj.text,
          category: replyObj.category,
          action_chips: replyObj.action_chips,
          created_at: new Date().toISOString(),
          status: 'read',
        };

        setChatMessages((prev) => {
          const next = [...prev, botMsg];
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
          return next;
        });
        setIsBotTyping(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }, 500);
    }

    // Support chat: try to answer automatically first (same brain as Help
    // Bot - tariffs, OTP, tolls, wallet, cancellation, documents...). A real
    // person (Admin) is the LAST resort - only when the bot genuinely can't
    // help, or the driver explicitly asks for one. A booking question goes
    // straight to that trip's real Vendor/Owner chat instead of a generic
    // ticket, since that's who can actually answer it.
    if (selectedConversation.type === 'DISPATCH') {
      const pushBotMsg = (msg: Partial<ChatMessage> & { text: string }) => {
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'OTHER',
          sender_name: 'Drop Cars Support',
          created_at: new Date().toISOString(),
          status: 'read',
          ...msg,
        };
        setChatMessages((prev) => {
          const next = [...prev, botMsg];
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
          return next;
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      };

      const escalateToAdmin = async (noteText: string) => {
        setIsBotTyping(true);
        let replyText = "✅ Your message has been sent to Drop Cars Support - a real person will review it, not an automatic reply. For anything urgent right now, please call the Dispatch/Support helpline.";
        try {
          const res = await axiosDriver.post('/api/support/dispatch-message', { text: noteText });
          if (res.data?.reply) replyText = res.data.reply;
          // The original "ME" bubble for whatever the driver typed/tapped
          // was already added above with a temporary id - swap it for the
          // server's real one so the next poll doesn't show it twice.
          reconcileSentMessage(newMsg.id as string, storageKey, res.data, 'sup-');
        } catch {
          replyText = "⚠️ Could not send that right now - please try again, or call the helpline for anything urgent.";
        }
        setIsBotTyping(false);
        pushBotMsg({ text: replyText, category: 'ADMIN_ESCALATION' });
      };

      if (textToSend === '📦 About a specific booking') {
        const trips = tripConversations.filter((c) => c.order_id);
        if (trips.length === 0) {
          pushBotMsg({ text: "You don't have an active booking right now - once you accept one, its Vendor/Owner chat opens automatically." });
        } else if (trips.length === 1) {
          pushBotMsg({ text: 'Opening that booking\'s chat...' });
          setTimeout(() => pickBookingChat(trips[0].order_id as number), 400);
        } else {
          pushBotMsg({
            text: 'Which booking is this about? Pick one - it opens that trip\'s Vendor/Owner chat.',
            trip_options: trips.map((c) => ({
              order_id: c.order_id as number,
              label: `#${formatBookingId(c.order_id as number, c.last_time)} • ${c.route_info || c.subtitle}`,
            })),
          });
        }
        return;
      }

      if (textToSend === '🙋 Talk to a person now') {
        await escalateToAdmin('Driver asked to talk to a person directly.');
        return;
      }

      setIsBotTyping(true);
      setTimeout(async () => {
        let replyObj = generateAiResponse(textToSend);
        try {
          const aiRes = await axiosInstance.post('/api/ai/chat-assistant', {
            message: textToSend,
            language: detectLanguage(textToSend),
            // the last few turns, so the assistant remembers what was just discussed
            history: chatMessages.slice(-8).filter((m) => !!m.text).map((m) => ({ role: m.sender === 'ME' ? 'user' : 'assistant', text: String(m.text).slice(0, 500) })),
          });
          if (aiRes.data?.reply) {
            replyObj = {
              text: aiRes.data.reply,
              category: aiRes.data.category || replyObj.category,
              action_chips: aiRes.data.suggestions || replyObj.action_chips,
            };
          }
        } catch {}
        setIsBotTyping(false);

        if (replyObj.category === 'UNRECOGNIZED') {
          // Couldn't answer this one automatically - go straight to a
          // person instead of leaving the driver stuck on a bot loop.
          await escalateToAdmin(textToSend);
          return;
        }

        pushBotMsg({
          text: replyObj.text,
          category: replyObj.category,
          action_chips: [...(replyObj.action_chips || []), '🙋 Talk to a person now'],
        });
      }, 400);
    }
  };

  // Driver picked a specific trip from the "which trip?" chips - fetch that
  // exact booking's real numbers instead of the generic rate card.
  const pickTrip = async (orderId: number, label: string) => {
    if (!selectedConversation) return;
    setAwaitingTripPick(false);
    const storageKey = `@chat_history_${selectedConversation.id}`;
    const pickMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'ME',
      sender_name: 'You',
      text: label,
      created_at: new Date().toISOString(),
      status: 'sent',
    };
    setChatMessages((prev) => {
      const next = [...prev, pickMsg];
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setIsBotTyping(true);
    try {
      const lang = detectLanguage(label);
      const res = await axiosDriver.get(`/api/ai/trip-detail/${orderId}`, { params: { language: lang } });
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'BOT',
        sender_name: 'Help Bot',
        category: res.data?.category || 'TRIP_DETAIL',
        text: res.data?.reply || 'Could not load this trip right now.',
        action_chips: res.data?.suggestions,
        created_at: new Date().toISOString(),
        status: 'read',
      };
      setChatMessages((prev) => {
        const next = [...prev, botMsg];
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'BOT',
        sender_name: 'Help Bot',
        text: "🙏 Couldn't load that trip's details right now - open it from your trips list, or ask Dispatch Desk.",
        created_at: new Date().toISOString(),
        status: 'read',
      };
      setChatMessages((prev) => {
        const next = [...prev, errMsg];
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } finally {
      setIsBotTyping(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // From the Support chat's "About a booking" option - booking questions
  // belong in that trip's own Vendor/Owner chat, not a generic support
  // ticket, so this switches straight into it.
  const pickBookingChat = (orderId: number) => {
    const convo = tripConversations.find((c) => c.order_id === orderId);
    if (convo) openChat(convo);
  };

  // A "📞 Call ..." suggestion chip should actually place a call, not send
  // more chat text - it dials whoever is really on duty right now (never a
  // hardcoded number) instead.
  const callOnDuty = async () => {
    try {
      const res = await axiosInstance.get('/api/support/on-duty-contact');
      if (res.data?.phone) {
        Linking.openURL(`tel:${res.data.phone}`);
        return;
      }
    } catch {}
    // No one reachable by phone right now - the chat still works.
    if (selectedConversation?.type !== 'DISPATCH') {
      openChat(dispatchConvo);
    }
  };

  const onActionChipPress = (chip: string) => {
    if (chip.includes('📞')) {
      callOnDuty();
      return;
    }
    sendMessage(chip);
  };

  // Quick Action Chips
  const getQuickReplies = () => {
    if (!selectedConversation) return [];
    if (selectedConversation.type === 'AI_BOT') {
      return [
        '💰 Calculate Fare (Chennai to Madurai)',
        '🔑 How to get Start OTP?',
        '🅿️ Toll & Parking collection rule',
        '⏳ Passenger delayed more than 15 mins',
        '⚠️ Cancellation ₹500 penalty rule',
      ];
    }
    if (selectedConversation.type === 'PASSENGER') {
      return [
        '📍 I have reached the pickup point',
        '⏳ Please wait 5 minutes, in traffic',
        '🔑 Please share the 4-digit start OTP',
        '💵 Cash payment ready as per tariff',
      ];
    }
    return [
      '🚨 Route detour due to road block',
      '⏱️ Passenger delayed more than 15 mins',
      '🚗 Minor vehicle issue - need 10 mins',
      '💳 Wallet balance hold inquiry',
      '📦 About a specific booking',
      '🙋 Talk to a person now',
    ];
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Messenger Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.headerIconBg, { backgroundColor: colors.primary + '18' }]}>
            <MessageCircle size={22} color={colors.primary} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.title, { color: colors.text }]}>Chats</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPageInfo(true)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: colors.primary + '18',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.primary + '33',
                  marginLeft: 2,
                }}
              >
                <Info size={13} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Help Bot, trip contacts & support
            </Text>
          </View>
        </View>
      </View>

      <PageInfoModal
        visible={showPageInfo}
        title="Drop Cars Chats"
        description="Help Bot for instant duty answers, plus a real chat with whoever posted each trip (a vendor, another fleet owner, or Drop Cars Admin) and quick ways to reach or call the customer."
        pipelineText="💬 Tap + to start a new chat, or reopen any chat with real activity from the list below."
        workflowSteps={[
          'Help Bot answers tariffs, OTP, tolls, waiting time, cancellation, wallet, documents, app trouble and more - in Tamil or English, even with a typo.',
          'Ask Help Bot about a specific trip\'s tariff and it will ask which trip, then show that booking\'s real numbers.',
          'Tap + to message the Vendor/Fleet Driver/Admin behind any of your current trips, call the customer, or reach Admin support.',
          'A chat only appears in this list once you actually open or message it - use + to find one that isn\'t here yet.',
        ]}
        tips={[
          'There is no separate in-app "customer" account on this platform - the real party you can message is whoever posted the booking.',
          'To reach the customer directly, use Call from the + sheet (subject to the number being shown by the poster).',
        ]}
        onClose={() => setShowPageInfo(false)}
      />

      {/* Search */}
      <View style={[styles.searchSection, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBox, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}>
          <Search size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search chats..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Chat list - Help Bot is pinned (ListHeaderComponent, always here);
          everything else only shows once it has real activity. */}
      <FlatList
        data={mainListConversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90, flexGrow: 1 }}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadConversations(); }} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <>
          <TouchableOpacity
            style={[styles.chatRow, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.35)' : '#DDD6FE', marginBottom: 6 }]}
            activeOpacity={0.7}
            onPress={() => openChat(botConvo)}
          >
            <View style={[styles.chatAvatar, { backgroundColor: '#8B5CF6' }]}>
              <Bot size={22} color="#FFFFFF" />
            </View>
            <View style={styles.chatRowMid}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>Help Bot</Text>
                <View style={styles.pinnedTag}>
                  <Sparkles size={9} color="#7C3AED" />
                  <Text style={styles.pinnedTagText}>AI</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>
                Tariffs • Start OTP • Tolls • Documents • ask anything
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {/* Admin is always here too, like the Help Bot - a real person. "+" (new chat) picks a reason: a trip, or general support. */}
          <TouchableOpacity
            style={[styles.chatRow, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(37, 99, 235, 0.35)' : '#BFDBFE', marginBottom: 6 }]}
            activeOpacity={0.7}
            onPress={() => { activateConversation('dispatch-desk'); openChat(dispatchConvo); }}
          >
            <View style={[styles.chatAvatar, { backgroundColor: '#2563EB' }]}>
              <Headphones size={22} color="#FFFFFF" />
            </View>
            <View style={styles.chatRowMid}>
              <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>Drop Cars Admin</Text>
              <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>
                {dispatchConvo.unread_count > 0 ? dispatchConvo.last_message : 'Duty • Upcoming bookings • Payments • any help'}
              </Text>
            </View>
            {dispatchConvo.unread_count > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadBadgeText}>{dispatchConvo.unread_count}</Text>
              </View>
            ) : (
              <ChevronRight size={18} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          </>
        }
        renderItem={({ item }) => {
          const roleTag = item.other_role === 'VENDOR' ? 'Vendor' : item.other_role === 'OWNER' ? 'Fleet Driver' : item.other_role === 'ADMIN' ? 'Admin' : '';
          return (
            <TouchableOpacity
              style={[styles.chatRow, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}
              activeOpacity={0.7}
              onPress={() => openChat(item)}
            >
              <View style={[styles.chatAvatar, { backgroundColor: colors.primary + '22' }]}>
                <User size={20} color={colors.primary} />
              </View>
              <View style={styles.chatRowMid}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>{item.title}</Text>
                  {roleTag ? (
                    <View style={[styles.roleTag, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
                      <Text style={[styles.roleTagText, { color: colors.textSecondary }]}>{roleTag}</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>
                  {item.last_message}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.chatRowTime, { color: colors.textSecondary }]}>{timeLabel(item.last_time)}</Text>
                {item.unread_count > 0 ? (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, {
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 24,
            marginTop: 10,
          }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(79, 70, 229, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={30} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: 16, marginTop: 10 }]}>No chats yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontSize: 12.5, paddingHorizontal: 12, lineHeight: 18 }]}>
              {searchQuery
                ? 'No chats match your search.'
                : 'Tap the + button to message the Vendor/Fleet Driver/Admin behind your current trips, call a customer, or reach Admin support.'}
            </Text>
          </View>
        }
      />

      {/* Start a new chat */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => setNewChatVisible(true)}
      >
        <Plus size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={newChatVisible} animationType="slide" transparent onRequestClose={() => setNewChatVisible(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Start a chat</Text>
              <TouchableOpacity onPress={() => setNewChatVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>SUPPORT</Text>
              <TouchableOpacity
                style={[styles.newChatRow, { borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => { setNewChatVisible(false); activateConversation('dispatch-desk'); openChat(dispatchConvo); }}
              >
                <View style={[styles.chatAvatar, { backgroundColor: '#2563EB' }]}>
                  <Headphones size={18} color="#FFFFFF" />
                </View>
                <View style={styles.chatRowMid}>
                  <Text style={[styles.chatRowTitle, { color: colors.text }]}>Drop Cars Admin / Support</Text>
                  <Text style={[styles.chatRowSub, { color: colors.textSecondary }]}>Duty & route help desk</Text>
                </View>
              </TouchableOpacity>

              {tripConversations.length > 0 && (
                <>
                  <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>MESSAGE ABOUT A TRIP</Text>
                  {tripConversations.map((c) => {
                    const roleTag = c.other_role === 'VENDOR' ? 'Vendor' : c.other_role === 'OWNER' ? 'Fleet Driver' : 'Admin';
                    return (
                      <TouchableOpacity
                        key={`new-${c.id}`}
                        style={[styles.newChatRow, { borderColor: colors.border }]}
                        activeOpacity={0.7}
                        onPress={() => { setNewChatVisible(false); openChat(c); }}
                      >
                        <View style={[styles.chatAvatar, { backgroundColor: colors.primary + '22' }]}>
                          <User size={18} color={colors.primary} />
                        </View>
                        <View style={styles.chatRowMid}>
                          <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>{roleTag} • {c.customer_name || c.title}</Text>
                          <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>{c.route_info || c.subtitle}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {tripConversations.some((c) => c.other_phone) && (
                    <>
                      <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>CALL THE VENDOR / OWNER</Text>
                      {tripConversations.filter((c) => c.other_phone).map((c) => {
                        const roleTag = c.other_role === 'VENDOR' ? 'Vendor' : c.other_role === 'OWNER' ? 'Fleet Driver' : 'Admin';
                        return (
                          <TouchableOpacity
                            key={`vcall-${c.id}`}
                            style={[styles.newChatRow, { borderColor: colors.border }]}
                            activeOpacity={0.7}
                            onPress={() => { setNewChatVisible(false); Linking.openURL(`tel:${c.other_phone}`); }}
                          >
                            <View style={[styles.chatAvatar, { backgroundColor: '#059669' }]}>
                              <Phone size={16} color="#FFFFFF" />
                            </View>
                            <View style={styles.chatRowMid}>
                              <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>{roleTag} • {c.customer_name}</Text>
                              <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>{c.route_info || c.subtitle}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}

                  <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>CALL THE CUSTOMER</Text>
                  {tripConversations.filter((c) => c.customer_phone).map((c) => (
                    <TouchableOpacity
                      key={`call-${c.id}`}
                      style={[styles.newChatRow, { borderColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => { setNewChatVisible(false); Linking.openURL(`tel:${c.customer_phone}`); }}
                    >
                      <View style={[styles.chatAvatar, { backgroundColor: '#059669' }]}>
                        <Phone size={16} color="#FFFFFF" />
                      </View>
                      <View style={styles.chatRowMid}>
                        <Text numberOfLines={1} style={[styles.chatRowTitle, { color: colors.text }]}>{c.customer_name || 'Customer'}</Text>
                        <Text numberOfLines={1} style={[styles.chatRowSub, { color: colors.textSecondary }]}>{c.route_info || c.subtitle}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {tripConversations.length === 0 && (
                <Text style={[styles.chatRowSub, { color: colors.textSecondary, paddingHorizontal: 4, paddingTop: 4 }]}>
                  No active trips right now - once you accept a booking, its Vendor/Owner chat and the customer's call option will appear here.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* In-App Live Messenger Screen (Modal) - fade, not slide-up-from-
          bottom: this opens a chat that lives INSIDE the Chats section, so
          covering the screen like a brand-new page (the default RN Modal
          "slide" animation) read as a jarring context switch. */}
      <Modal
        visible={Boolean(selectedConversation)}
        animationType="fade"
        onRequestClose={() => setSelectedConversation(null)}
      >
        <SafeAreaView style={[styles.chatViewContainer, { backgroundColor: isDarkMode ? '#080C14' : colors.background }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
          >
            {/* Chat AppBar */}
            {selectedConversation?.type === 'AI_BOT' ? (
              // Futuristic Cyber / Quantum Header
              <LinearGradient
                colors={isDarkMode ? ['#070A14', '#11172E', '#1E1B4B'] : ['#0F172A', '#1E293B', '#312E81']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.futuristicAppBar}
              >
                <TouchableOpacity
                  onPress={() => setSelectedConversation(null)}
                  style={styles.futuristicBackBtn}
                >
                  <ArrowLeft size={20} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.futuristicHeaderInfo}>
                  <View style={styles.holoAvatarWrapper}>
                    <LinearGradient
                      colors={['#06B6D4', '#8B5CF6', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.holoRing}
                    >
                      <View style={styles.holoInnerCore}>
                        <Bot size={20} color="#38BDF8" />
                      </View>
                    </LinearGradient>
                    <View style={styles.holoOnlineDot} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.holoTitle}>DROP CARS HELP BOT</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={styles.pulseDotGreen} />
                      <Text style={styles.holoStatusText}>AUTOMATED ANSWERS • AVAILABLE 24/7</Text>
                    </View>
                  </View>
                </View>

                {/* Reset Session & Security Shield */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={resetBotSession}
                    style={styles.holoActionBtn}
                  >
                    <RotateCcw size={15} color="#C4B5FD" />
                  </TouchableOpacity>
                  <View style={styles.quantumShieldBadge}>
                    <ShieldCheck size={13} color="#10B981" />
                  </View>
                </View>
              </LinearGradient>
            ) : (
              // Standard AppBar for Dispatch and Passenger
              <View style={[styles.chatAppBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setSelectedConversation(null)}
                  style={styles.backBtn}
                >
                  <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.chatHeaderInfo}>
                  <View
                    style={[
                      styles.chatHeaderAvatar,
                      {
                        backgroundColor:
                          selectedConversation?.type === 'DISPATCH'
                            ? '#2563EB'
                            : colors.primary,
                      },
                    ]}
                  >
                    {selectedConversation?.type === 'DISPATCH' ? (
                      <Headphones size={18} color="#FFFFFF" />
                    ) : (
                      <User size={18} color="#FFFFFF" />
                    )}
                  </View>
                  <View>
                    <Text numberOfLines={1} style={[styles.chatHeaderTitle, { color: colors.text }]}>
                      {selectedConversation?.title}
                    </Text>
                    <Text style={[styles.chatHeaderSub, { color: colors.textSecondary }]}>
                      {selectedConversation?.type === 'DISPATCH'
                        ? 'Reviewed by Support - not instant'
                        : '🟢 In-App Encrypted Chat'}
                    </Text>
                  </View>
                </View>

                {selectedConversation?.type === 'PASSENGER' && selectedConversation?.other_phone ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${selectedConversation.other_phone}`)}
                    style={[styles.maskedBadge, { backgroundColor: isDarkMode ? 'rgba(16,185,129,0.15)' : '#ECFDF5', marginRight: 6 }]}
                  >
                    <Phone size={14} color="#10B981" />
                  </TouchableOpacity>
                ) : null}

                {/* Number masked security badge */}
                <View style={[styles.maskedBadge, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                  <ShieldCheck size={14} color="#10B981" />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: '#10B981' }}>Masked</Text>
                </View>
              </View>
            )}

            {/* Quick Action Rail */}
            {selectedConversation?.type === 'AI_BOT' ? (
              <View style={[styles.cyberCommandBar, { backgroundColor: isDarkMode ? '#080C16' : '#F8FAFC', borderBottomColor: colors.border }]}>
                <View style={styles.cyberCommandLabelRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Cpu size={12} color="#8B5CF6" />
                    <Text style={styles.cyberCommandLabel}>QUICK QUESTIONS</Text>
                  </View>
                  <Text style={styles.cyberCommandSub}>Tap protocol or type 1–9</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 6, gap: 8 }}>
                  {BOT_COMMANDS.map((cmd) => (
                    <TouchableOpacity
                      key={cmd.key}
                      onPress={() => sendMessage(cmd.query)}
                      style={[
                        styles.cyberChip,
                        {
                          backgroundColor: isDarkMode ? 'rgba(139, 92, 246, 0.12)' : '#FFFFFF',
                          borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.35)' : '#DDD6FE',
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <View style={styles.cyberChipNum}>
                        <Text style={styles.cyberChipNumText}>{cmd.number}</Text>
                      </View>
                      <Text style={[styles.cyberChipText, { color: isDarkMode ? '#E2E8F0' : '#1E293B' }]}>
                        {cmd.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.quickRepliesBar, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderBottomColor: colors.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
                  {getQuickReplies().map((chip, idx) => (
                    <TouchableOpacity
                      key={`chip-${idx}`}
                      onPress={() => onActionChipPress(chip)}
                      style={[styles.quickChip, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}
                    >
                      <Text style={[styles.quickChipText, { color: colors.text }]}>{chip}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Message Stream */}
            <FlatList
              ref={flatListRef}
              data={chatMessages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14, gap: 10 }}
              renderItem={({ item }) => {
                if (item.sender === 'SYSTEM') {
                  return (
                    <View style={styles.systemPill}>
                      <ShieldCheck size={12} color="#10B981" />
                      <Text style={styles.systemPillText}>{item.text}</Text>
                    </View>
                  );
                }

                const isMe = item.sender === 'ME';
                const isBot = item.sender === 'BOT';

                if (isBot) {
                  return (
                    <View style={[styles.messageRow, styles.messageRowOther]}>
                      <View
                        style={[
                          styles.botCyberCard,
                          {
                            backgroundColor: isDarkMode ? '#0B1120' : '#FFFFFF',
                            borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.35)' : '#DDD6FE',
                          },
                        ]}
                      >
                        <View style={styles.botCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <LinearGradient
                              colors={['#8B5CF6', '#6366F1']}
                              style={styles.botMiniIconBg}
                            >
                              <Bot size={12} color="#FFFFFF" />
                            </LinearGradient>
                            <Text style={styles.botCardAuthor}>HELP BOT</Text>
                          </View>
                          {item.category && (
                            <View style={[styles.categoryBadge, { backgroundColor: isDarkMode ? 'rgba(139, 92, 246, 0.25)' : '#EDE9FE' }]}>
                              <Text style={styles.categoryBadgeText}>{item.category}</Text>
                            </View>
                          )}
                        </View>

                        <Text style={[styles.botCardText, { color: isDarkMode ? '#F1F5F9' : '#0F172A' }]}>
                          {item.text}
                        </Text>

                        {/* "Which trip?" picker - each button carries the real order_id */}
                        {item.trip_options && item.trip_options.length > 0 && (
                          <View style={styles.actionChipsContainer}>
                            <View style={styles.actionChipsWrap}>
                              {item.trip_options.map((opt: { order_id: number; label: string }) => (
                                <TouchableOpacity
                                  key={`trip-${opt.order_id}`}
                                  onPress={() => pickTrip(opt.order_id, opt.label)}
                                  style={[
                                    styles.actionPill,
                                    {
                                      backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF',
                                      borderColor: isDarkMode ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
                                    },
                                  ]}
                                  activeOpacity={0.7}
                                >
                                  <CornerDownRight size={11} color="#6366F1" />
                                  <Text style={styles.actionPillText}>{opt.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Interactive Follow-up Action Chips */}
                        {item.action_chips && item.action_chips.length > 0 && (
                          <View style={styles.actionChipsContainer}>
                            <Text style={styles.actionChipsPrompt}>Quick options:</Text>
                            <View style={styles.actionChipsWrap}>
                              {item.action_chips.map((chip: string, cIdx: number) => (
                                <TouchableOpacity
                                  key={`ac-${cIdx}`}
                                  onPress={() => onActionChipPress(chip)}
                                  style={[
                                    styles.actionPill,
                                    {
                                      backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF',
                                      borderColor: isDarkMode ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
                                    },
                                  ]}
                                  activeOpacity={0.7}
                                >
                                  <CornerDownRight size={11} color="#6366F1" />
                                  <Text style={styles.actionPillText}>{chip}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}

                        <View style={styles.msgFooter}>
                          <Text style={[styles.msgTime, { color: isDarkMode ? '#64748B' : '#94A3B8' }]}>
                            {timeLabel(item.created_at)}
                          </Text>
                          <Sparkles size={11} color="#8B5CF6" />
                        </View>
                      </View>
                    </View>
                  );
                }

                if (isMe) {
                  return (
                    <View style={[styles.messageRow, styles.messageRowMe]}>
                      <LinearGradient
                        colors={['#4F46E5', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.userCyberBubble}
                      >
                        <View style={styles.userBubbleHeader}>
                          <Text style={styles.userBubbleTag}>⚡ DRIVER COMMAND</Text>
                        </View>
                        {item.voice_url ? (
                          <VoiceNote uri={item.voice_url} mine tint="#FFFFFF" />
                        ) : (
                          <Text style={styles.userBubbleText}>{item.text}</Text>
                        )}
                        <View style={styles.msgFooter}>
                          <Text style={styles.userMsgTime}>{timeLabel(item.created_at)}</Text>
                          {item.status === 'read' ? (
                            <CheckCheck size={13} color="#38BDF8" />
                          ) : (
                            <Check size={13} color="rgba(255,255,255,0.6)" />
                          )}
                        </View>
                      </LinearGradient>
                    </View>
                  );
                }

                // Standard Other Message (Dispatch / Passenger)
                return (
                  <View style={[styles.messageRow, styles.messageRowOther]}>
                    <View
                      style={[
                        styles.messageBubble,
                        styles.bubbleOther,
                        {
                          backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                          borderColor: colors.border,
                          borderWidth: isDarkMode ? 0 : 1,
                        },
                      ]}
                    >
                      {item.sender_name && (
                        <Text style={[styles.senderLabel, { color: colors.primary }]}>
                          {item.sender_name}
                        </Text>
                      )}
                      {item.voice_url ? (
                        <VoiceNote uri={item.voice_url} mine={false} tint={colors.primary} />
                      ) : (
                        <Text style={[styles.messageText, { color: colors.text }]}>
                          {item.text}
                        </Text>
                      )}

                      {item.trip_options && item.trip_options.length > 0 && (
                        <View style={styles.actionChipsContainer}>
                          <View style={styles.actionChipsWrap}>
                            {item.trip_options.map((opt: { order_id: number; label: string }) => (
                              <TouchableOpacity
                                key={`dtrip-${opt.order_id}`}
                                onPress={() => pickBookingChat(opt.order_id)}
                                style={[styles.actionPill, { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF', borderColor: isDarkMode ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE' }]}
                                activeOpacity={0.7}
                              >
                                <CornerDownRight size={11} color="#6366F1" />
                                <Text style={styles.actionPillText}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}

                      {item.action_chips && item.action_chips.length > 0 && (
                        <View style={styles.actionChipsContainer}>
                          <View style={styles.actionChipsWrap}>
                            {item.action_chips.map((chip: string, cIdx: number) => (
                              <TouchableOpacity
                                key={`dac-${cIdx}`}
                                onPress={() => onActionChipPress(chip)}
                                style={[styles.actionPill, { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF', borderColor: isDarkMode ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE' }]}
                                activeOpacity={0.7}
                              >
                                <CornerDownRight size={11} color="#6366F1" />
                                <Text style={styles.actionPillText}>{chip}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}

                      <View style={styles.msgFooter}>
                        <Text style={[styles.msgTime, { color: colors.textSecondary }]}>
                          {timeLabel(item.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                isBotTyping ? (
                  <View style={[styles.cyberTypingCard, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.4)' : '#DDD6FE' }]}>
                    <ActivityIndicator size="small" color="#8B5CF6" />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={styles.typingMainText}>Help Bot is typing...</Text>
                      <Text style={styles.typingSubText}>Analyzing fleet tariffs & operational protocols</Text>
                    </View>
                  </View>
                ) : null
              }
            />

            {/* Futuristic Numeric Quick Launch Dock */}
            {selectedConversation?.type === 'AI_BOT' && (
              <View style={[styles.quickNumDock, { backgroundColor: isDarkMode ? '#070B14' : '#F1F5F9', borderTopColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 }}>
                  <Text style={styles.quickNumHint}>⚡ RAPID PROTOCOL SHORTCUTS</Text>
                  <Text style={styles.quickNumSub}>1-Tap Execute</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 4 }}>
                  {[
                    { n: '1', label: 'Tariffs' },
                    { n: '2', label: 'OTP' },
                    { n: '3', label: 'Tolls' },
                    { n: '4', label: 'Waiting' },
                    { n: '5', label: 'Wallet' },
                    { n: '6', label: '₹500 Fine' },
                    { n: '7', label: 'Bata' },
                    { n: '8', label: 'HUD' },
                    { n: '9', label: 'SOS' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.n}
                      onPress={() => sendMessage(item.n)}
                      style={[
                        styles.numShortcutBtn,
                        {
                          backgroundColor: isDarkMode ? 'rgba(139, 92, 246, 0.15)' : '#FFFFFF',
                          borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.4)' : '#C4B5FD',
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.numShortcutDigit}>{item.n}</Text>
                      <Text style={styles.numShortcutLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {selectedConversation?.type === 'DISPATCH' ? (
              <ChatComposer
                colors={colors}
                placeholder="Message Dispatch Desk"
                onSendText={(t) => sendMessage(t)}
                onSendVoice={(uri) => sendVoiceUri(uri)}
              />
            ) : (
            /* Futuristic Cyber Input Bar */
            <View style={[styles.cyberInputContainer, { backgroundColor: isDarkMode ? '#080C16' : colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.cyberInputWrapper, { backgroundColor: isDarkMode ? '#0F172A' : '#F1F5F9', borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.35)' : '#CBD5E1' }]}>
                <TextInput
                  style={[
                    styles.cyberTextInput,
                    {
                      color: colors.text,
                    },
                  ]}
                  placeholder={
                    selectedConversation?.type === 'AI_BOT'
                      ? 'Ask Help Bot anything in Tamil / English (or type 1–9)...'
                      : 'Type a message (no phone calls needed)...'
                  }
                  placeholderTextColor={colors.textSecondary}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                {!inputText.trim() && selectedConversation?.type !== 'AI_BOT' ? (
                  <TouchableOpacity
                    onPress={voiceRecorderState.isRecording ? stopAndSendVoiceRecording : startVoiceRecording}
                    disabled={uploadingVoice}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={voiceRecorderState.isRecording ? ['#EF4444', '#DC2626'] : ['#6366F1', '#8B5CF6', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cyberSendBtn}
                    >
                      {uploadingVoice ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : voiceRecorderState.isRecording ? (
                        <Square size={14} color="#FFFFFF" fill="#FFFFFF" />
                      ) : (
                        <Mic size={16} color="#FFFFFF" />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => sendMessage()}
                    style={{ opacity: !inputText.trim() ? 0.5 : 1 }}
                    disabled={!inputText.trim()}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#6366F1', '#8B5CF6', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cyberSendBtn}
                    >
                      <Send size={16} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
              {voiceRecorderState.isRecording && (
                <Text style={{ textAlign: 'center', fontSize: 11, color: '#EF4444', marginTop: 4, fontFamily: 'Inter-Medium' }}>
                  🔴 Recording... {Math.round((voiceRecorderState.durationMillis || 0) / 1000)}s (tap square to send)
                </Text>
              )}
            </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B98118',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#10B981',
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    padding: 0,
  },
  hubContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  hubGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  hubCard: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 12,
  },
  hubCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hubIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  hubBadgeTextPurple: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
  },
  hubBadgeTextBlue: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#2563EB',
  },
  hubLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  hubTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.1,
  },
  hubSub: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginTop: 1,
  },
  hubFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  sectionSub: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  tripCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  tripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  avatarMini: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerName: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
  bookingBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bookingBadgeText: {
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  routeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B98114',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '75%',
  },
  routeTagText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#059669',
  },
  carTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  carTagText: {
    fontSize: 10.5,
    fontFamily: 'Inter-SemiBold',
  },
  tripCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 7,
  },
  lastMsgSnippet: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginRight: 8,
  },
  timeSnippet: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  convoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convoTitle: {
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
  },
  pinBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  convoTime: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  routeSnippet: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
  },
  convoBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  lastMsgText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    marginRight: 8,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  // WhatsApp-style chat list row (Help Bot header row + every trip contact)
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  chatAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatRowMid: {
    flex: 1,
    gap: 2,
  },
  chatRowTitle: {
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
    flexShrink: 1,
  },
  chatRowSub: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
  },
  chatRowTime: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  pinnedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pinnedTagText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    color: '#7C3AED',
  },
  roleTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleTagText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  // Floating "start a new chat" button
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  // "+" new-chat bottom sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
  },
  chatViewContainer: {
    flex: 1,
  },
  futuristicAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.3)',
    gap: 10,
  },
  futuristicBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  futuristicHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  holoAvatarWrapper: {
    position: 'relative',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holoRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holoInnerCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#090D18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holoOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#090D18',
  },
  holoTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  versionPill: {
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#8B5CF6',
  },
  versionText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    color: '#C4B5FD',
  },
  pulseDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  holoStatusText: {
    fontSize: 9.5,
    fontFamily: 'Inter-SemiBold',
    color: '#34D399',
    letterSpacing: 0.1,
  },
  holoActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  quantumShieldBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  cyberCommandBar: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  cyberCommandLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  cyberCommandLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
    letterSpacing: 0.3,
  },
  cyberCommandSub: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#94A3B8',
  },
  cyberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  cyberChipNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cyberChipNumText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  cyberChipText: {
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
  },
  botCyberCard: {
    maxWidth: '86%',
    borderRadius: 18,
    borderWidth: 1.5,
    borderLeftWidth: 3.5,
    borderLeftColor: '#8B5CF6',
    padding: 13,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  botCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  botMiniIconBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botCardAuthor: {
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
    letterSpacing: 0.3,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
  },
  botCardText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 19.5,
  },
  actionChipsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.15)',
  },
  actionChipsPrompt: {
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
    marginBottom: 6,
  },
  actionChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#6366F1',
  },
  userCyberBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    borderBottomRightRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  userBubbleHeader: {
    marginBottom: 3,
  },
  userBubbleTag: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  userBubbleText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
    lineHeight: 19,
  },
  userMsgTime: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.75)',
  },
  cyberTypingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    maxWidth: '85%',
  },
  typingMainText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
  },
  typingSubText: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
  },
  quickNumDock: {
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: 1,
  },
  quickNumHint: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
    letterSpacing: 0.4,
  },
  quickNumSub: {
    fontSize: 9.5,
    fontFamily: 'Inter-Medium',
    color: '#94A3B8',
  },
  numShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  numShortcutDigit: {
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
  },
  numShortcutLabel: {
    fontSize: 10.5,
    fontFamily: 'Inter-SemiBold',
    color: '#64748B',
  },
  cyberInputContainer: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderTopWidth: 1,
  },
  cyberInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
  },
  cyberTextInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 90,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    padding: 0,
  },
  cyberSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    padding: 6,
  },
  chatHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderTitle: {
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
  },
  chatHeaderSub: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  maskedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickRepliesBar: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
  },
  systemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    maxWidth: '85%',
  },
  systemPillText: {
    color: '#059669',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    borderBottomLeftRadius: 2,
  },
  senderLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  msgTime: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
  },
});
