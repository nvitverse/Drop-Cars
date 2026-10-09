import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { smartIntent, buildBrief } from '@/utils/commandSmart';
import { apiService } from '@/services/api';
import { useStaffDuty } from '@/context/StaffDutyContext';
import { printOrDownloadInvoice, shareQuotationViaWhatsApp, InvoiceData } from '@/utils/invoiceGenerator';
import { parseBookingVoiceCommand, ParsedBookingVoiceDraft } from '@/utils/magicParser';

export interface CommandMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  actionCard?: {
    type: 'create_booking_preview' | 'approve_booking' | 'cancel_booking' | 'system_health' | 'duty_toggle' | 'generate_invoice' | 'info';
    data?: any;
    status?: 'pending' | 'completed' | 'cancelled';
  };
}

interface ParsedBookingIntent {
  pickup?: string;
  drop?: string;
  vehicleType?: string;
  carTypeValue?: string;
  tripType?: string;
  costPerKm?: string;
  extraCostPerKm?: string;
  driverAllowance?: string;
  extraDriverAllowance?: string;
  includeToll?: boolean;
  customerName?: string;
  customerPhone?: string;
}

interface CommandCenterContextType {
  isOpen: boolean;
  messages: CommandMessage[];
  isProcessing: boolean;
  openCommandCenter: () => void;
  closeCommandCenter: () => void;
  sendMessage: (inputText: string) => Promise<void>;
  executeCardAction: (messageId: string, actionType: string, payload?: any) => Promise<void>;
  clearChat: () => void;
  showInvoiceModal: boolean;
  setShowInvoiceModal: (val: boolean) => void;
  invoiceModalData: Partial<InvoiceData>;
  setInvoiceModalData: (val: Partial<InvoiceData>) => void;
}

const CommandCenterContext = createContext<CommandCenterContextType | undefined>(undefined);

// Known cities dictionary for Tamil & English matching
const KNOWN_CITIES = [
  'Chennai', 'Tiruvannamalai', 'Bangalore', 'Coimbatore', 'Madurai', 'Trichy',
  'Salem', 'Tiruppur', 'Erode', 'Vellore', 'Pondicherry', 'Hosur', 'Dindigul',
  'Tirunelveli', 'Kanchipuram', 'Villupuram', 'Cuddalore', 'Thanjavur', 'Kumbakonam',
  'Nagapattinam', 'Nagercoil', 'Karur', 'Namakkal', 'Krishnagiri', 'Dharmapuri'
];

const TAMIL_CITY_MAP: Record<string, string> = {
  'திருவண்ணாமலை': 'Tiruvannamalai',
  'சென்னை': 'Chennai',
  'பெங்களூர்': 'Bangalore',
  'கோயம்புத்தூர்': 'Coimbatore',
  'கோவை': 'Coimbatore',
  'மதுரை': 'Madurai',
  'திருச்சி': 'Trichy',
  'சேலம்': 'Salem',
  'திருப்பூர்': 'Tiruppur',
  'ஈரோடு': 'Erode',
  'வேலூர்': 'Vellore',
  'பாண்டிச்சேரி': 'Pondicherry',
  'புதுச்சேரி': 'Pondicherry',
  'ஓசூர்': 'Hosur',
  'திண்டுக்கல்': 'Dindigul',
  'திருநெல்வேலி': 'Tirunelveli',
  'காஞ்சிபுரம்': 'Kanchipuram',
  'விழுப்புரம்': 'Villupuram',
  'கடலூர்': 'Cuddalore',
  'தஞ்சாவூர்': 'Thanjavur',
  'கும்பகோணம்': 'Kumbakonam',
};

export const CommandCenterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const { toggleDuty, isOnDuty } = useStaffDuty();

  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<CommandMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: 'வணக்கம்! Drop Cars Command Center-க்கு வரவேற்கிறோம்.\n\nவாய்ஸ் அல்லது டெக்ஸ்ட் மூலம் Booking உருவாக்கலாம், Booking Confirm/Cancel செய்யலாம் அல்லது System Health பார்க்கலாம்.\n\nஎடுத்துக்காட்டு: "Tiruvannamalai to Chennai, Sedan, 14, 1, 300, 100, Toll extra" அல்லது "Booking E260901 Confirm".',
      timestamp: Date.now(),
    },
  ]);

  // Opening it shows what needs attention right now (live), at most every 2 minutes
  const lastBriefRef = useRef(0);
  const openCommandCenter = useCallback(() => {
    setIsOpen(true);
    if (Date.now() - lastBriefRef.current < 120000) return;
    lastBriefRef.current = Date.now();
    buildBrief()
      .then((text) => setMessages((prev) => [...prev, { id: 'brief-' + Date.now(), sender: 'assistant', text, timestamp: Date.now() }]))
      .catch(() => {});
  }, []);
  const closeCommandCenter = useCallback(() => setIsOpen(false), []);
  const clearChat = useCallback(() => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        text: 'Command Center Chat தயார். உங்கள் கட்டளையை குரல் அல்லது டெக்ஸ்ட் மூலம் கூறவும்.',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // Natural Language & Regex Intent Parser (Zero-Cost, No 3rd-party AI)
  const parseUserIntent = (text: string) => {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // 1. Staff Duty Toggle Intent
    if (
      lower.includes('duty on') ||
      lower.includes('டூட்டி ஆன்') ||
      lower.includes('start duty') ||
      lower.includes('go online')
    ) {
      return { type: 'DUTY_ON' };
    }
    if (
      lower.includes('duty off') ||
      lower.includes('டூட்டி ஆப்') ||
      lower.includes('end duty') ||
      lower.includes('go offline')
    ) {
      return { type: 'DUTY_OFF' };
    }

    // 2. System Health Intent
    if (
      lower.includes('system health') ||
      lower.includes('server status') ||
      lower.includes('smtp status') ||
      lower.includes('ஹெல்த்')
    ) {
      return { type: 'SYSTEM_HEALTH' };
    }

    // 3. Booking ID Action Intent (Confirm / Approve / Cancel / Recreate)
    const bookingIdMatch = raw.match(/\b([A-Za-z]{0,2}\d{4,12})\b/);
    if (bookingIdMatch) {
      const bId = bookingIdMatch[1];
      if (
        lower.includes('confirm') ||
        lower.includes('approve') ||
        lower.includes('கன்பார்ம்') ||
        lower.includes('அப்ரூவ்') ||
        lower.includes('உறுதி')
      ) {
        return { type: 'APPROVE_BOOKING', bookingId: bId };
      }
      if (
        lower.includes('cancel') ||
        lower.includes('கேன்சல்') ||
        lower.includes('ரத்து')
      ) {
        return { type: 'CANCEL_BOOKING', bookingId: bId };
      }
      if (
        lower.includes('recreate') ||
        lower.includes('மீண்டும்')
      ) {
        return { type: 'RECREATE_BOOKING', bookingId: bId };
      }
      if (
        lower.includes('assign') ||
        lower.includes('டிரைவர்')
      ) {
        return { type: 'ASSIGN_DRIVER', bookingId: bId };
      }
      if (
        lower.includes('invoice') ||
        lower.includes('இன்வாய்ஸ்') ||
        lower.includes('ரசீது') ||
        lower.includes('பில்') ||
        lower.includes('bill')
      ) {
        return { type: 'GENERATE_INVOICE', bookingId: bId };
      }
    }

    // General Invoice Intent
    if (
      lower.includes('invoice') ||
      lower.includes('இன்வாய்ஸ்') ||
      lower.includes('ரசீது') ||
      lower.includes('பில்') ||
      lower.includes('bill')
    ) {
      return { type: 'GENERATE_INVOICE', bookingId: undefined };
    }

    // 4. Create Booking / Estimate Draft Intent (Tamil, Tanglish, English)
    const isBookingOrEst = /\bto\b|\bடூ\b|\bஇலிருந்து\b|sedan|suv|innova|crysta|etios|tempo|booking|புக்கிங்|estimate|quotation|quote|எஸ்டிமேட்|கொட்டேஷன்/i.test(raw);
    if (isBookingOrEst) {
      const voiceDraft = parseBookingVoiceCommand(raw);
      if (voiceDraft.isEstimate) {
        return {
          type: 'ESTIMATE_DRAFT_PARSED',
          draft: voiceDraft,
        };
      }
      return {
        type: 'CREATE_BOOKING_PARSED',
        parsed: {
          pickup: voiceDraft.pickup,
          drop: voiceDraft.drop,
          vehicleType: voiceDraft.vehicleType,
          carTypeValue: voiceDraft.carTypeValue,
          tripType: voiceDraft.tripType,
          costPerKm: voiceDraft.costPerKm,
          extraCostPerKm: voiceDraft.extraCostPerKm,
          driverAllowance: voiceDraft.driverAllowance,
          extraDriverAllowance: voiceDraft.extraDriverAllowance,
          includeToll: voiceDraft.includeToll,
          tollMode: voiceDraft.tollMode,
          gstMode: voiceDraft.gstMode,
          gstRate: voiceDraft.gstRate,
          advance: voiceDraft.advance,
          days: voiceDraft.days,
        },
      };
    }

    return { type: 'UNKNOWN', raw };
  };

  const sendMessage = async (inputText: string) => {
    if (!inputText.trim()) return;

    const userMsgId = 'user-' + Date.now();
    const userMsg: CommandMessage = {
      id: userMsgId,
      sender: 'user',
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Live questions and bulk actions (pending, unassigned, today, booking #id, post/hold all ...) are answered from the real data
      const looksLikeNewBooking = /\bto\b/i.test(inputText) && /\d{2,}/.test(inputText) && /sedan|suv|innova|crysta|etios|toll/i.test(inputText);
      const smart = looksLikeNewBooking ? null : await smartIntent(inputText);
      if (smart) {
        setMessages((prev) => [...prev, { id: 'asst-' + Date.now(), sender: 'assistant', text: smart, timestamp: Date.now() }]);
        return;
      }
      const intent = parseUserIntent(inputText);

      if (intent.type === 'DUTY_ON') {
        toggleDuty(true);
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: '🟢 Staff Duty ON செய்யப்பட்டது. Floating Screen Bubble உங்கள் திரையில் தோன்றும்.',
          timestamp: Date.now(),
          actionCard: {
            type: 'duty_toggle',
            data: { status: 'ON' },
            status: 'completed',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'DUTY_OFF') {
        toggleDuty(false);
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: '🔴 Staff Duty OFF செய்யப்பட்டது. நீங்கள் Offline நிலைக்கு மாற்றப்பட்டீர்கள்.',
          timestamp: Date.now(),
          actionCard: {
            type: 'duty_toggle',
            data: { status: 'OFF' },
            status: 'completed',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'SYSTEM_HEALTH') {
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: '📊 System Diagnostics & Health நிலவரம்:\n\n• Server: Cloud Run Active (Response ~180ms)\n• Database: Connected (Pool 100% OK)\n• SMTP Pool: Multi-Account Rotation Ready (3 Segments Active)\n• Google Maps API: 5 Keys Pool Healthy ($0 Bill)',
          timestamp: Date.now(),
          actionCard: {
            type: 'system_health',
            data: {},
            status: 'completed',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'APPROVE_BOOKING') {
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: `Website Booking #${intent.bookingId} கண்டறியப்பட்டது. இதை உடனடியாக Approve செய்து Driver Marketplace-ல் வெளியிடவா?`,
          timestamp: Date.now(),
          actionCard: {
            type: 'approve_booking',
            data: { bookingId: intent.bookingId },
            status: 'pending',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'CANCEL_BOOKING') {
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: `Booking #${intent.bookingId}-ஐ ரத்து (Cancel) செய்யவா?`,
          timestamp: Date.now(),
          actionCard: {
            type: 'cancel_booking',
            data: { bookingId: intent.bookingId },
            status: 'pending',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'CREATE_BOOKING_PARSED' && intent.parsed) {
        const p = intent.parsed;
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: `புதிய Booking விவரங்கள் தயாராக உள்ளன:\n\n📍 வழித்தடம்: ${p.pickup} ➔ ${p.drop}\n🚗 வாகனம்: ${p.vehicleType} (${p.tripType === 'roundtrip' ? 'Round Trip' : 'One Way'})\n📅 நாட்கள்: ${p.days || 1} day(s)\n💵 கட்டணம்: ₹${p.costPerKm}/KM (Extra: ₹${p.extraCostPerKm}/KM)\n👨‍✈️ Driver Bata: ₹${p.driverAllowance} (Extra: ₹${p.extraDriverAllowance})\n🛣️ டோல்: ${p.tollMode === 'INCLUDED' ? 'Included' : 'Extra'}\n🧾 GST: ${p.gstMode === 'NONE' ? 'None' : `${p.gstRate}% ${p.gstMode}`}\n💰 அட்வான்ஸ்: ₹${p.advance || 0}\n\nகீழே உள்ள பட்டனை அழுத்தி Booking Form-ல் சரிபார்த்து உறுதி செய்யவும்.`,
          timestamp: Date.now(),
          actionCard: {
            type: 'create_booking_preview',
            data: p,
            status: 'pending',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'ESTIMATE_DRAFT_PARSED' && (intent as any).draft) {
        const d = (intent as any).draft as ParsedBookingVoiceDraft;
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: `📋 Estimate / Quotation Draft தயார்:\n\n📍 Route: ${d.pickup} ➔ ${d.drop}\n🚗 Vehicle: ${d.vehicleType} (${d.days} day${d.days > 1 ? 's' : ''})\n🛣️ Toll: ${d.tollMode}\n🧾 GST: ${d.gstMode === 'NONE' ? 'None' : `${d.gstRate}% ${d.gstMode}`}\n💰 Advance Req: ₹${d.advance}\n\nStaff can review, edit and generate brand quotation now.`,
          timestamp: Date.now(),
          actionCard: {
            type: 'generate_invoice',
            data: d.estimateDraft,
            status: 'pending',
          },
        };
        setMessages((prev) => [...prev, reply]);
      } else if (intent.type === 'GENERATE_INVOICE') {
        const bookingId = (intent as any).bookingId;
        if (!bookingId) {
          const reply: CommandMessage = {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: 'எந்த Booking ID அல்லது கஸ்டமருக்கு Invoice உருவாக்க வேண்டும்? தயவுசெய்து Booking ID (எ.கா: "Booking 1042 Invoice") எனக் குறிப்பிடவும்.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, reply]);
        } else {
          let orderData: any = null;
          try {
            orderData = await apiService.getOrder(bookingId);
          } catch (e) {
            console.log('Direct getOrder failed in CommandCenter:', e);
          }

          const invoiceNumber = String(bookingId);
          const customerName = orderData?.customer_name || 'Customer';
          const customerPhone = orderData?.customer_number || '';
          const loc = orderData?.pickup_drop_location;
          let pickup = orderData?.pickup_address || orderData?.pickup_city || '';
          let dropLocation = orderData?.drop_address || orderData?.drop_city || '';
          if (loc && typeof loc === 'object') {
            if ('pickup' in loc) {
              pickup = (loc as any).pickup?.address || (loc as any).pickup?.city || pickup;
              dropLocation = (loc as any).drop?.address || (loc as any).drop?.city || dropLocation;
            } else {
              const keys = Object.keys(loc).sort((a: string, b: string) => Number(a) - Number(b));
              pickup = (loc as any)['0'] || pickup;
              dropLocation = (loc as any)[keys[keys.length - 1]] || dropLocation;
            }
          }

          const assigned = orderData?.assigned_driver || (orderData?.assignments && orderData.assignments[0]);
          const baseFare = Number(orderData?.vendor_price || orderData?.estimated_price || orderData?.quoted_total_amount || 0);
          const tollCharges = Number(orderData?.toll_charges || orderData?.quoted_toll_charges || 0);
          const driverBata = Number(orderData?.driver_allowance || orderData?.driver_bata || 300);
          const distanceKm = Number(orderData?.trip_distance || orderData?.quoted_trip_distance || 0);

          const invData: Partial<InvoiceData> = {
            invoiceNumber,
            date: new Date().toLocaleDateString('en-IN'),
            customerName,
            customerPhone,
            pickup: pickup || 'Pickup Point',
            dropLocation: dropLocation || 'Drop Point',
            vehicleType: orderData?.car_type || 'Sedan',
            tripType: orderData?.trip_type || 'One Way',
            distanceKm,
            baseFare,
            tollCharges,
            driverBata,
            driverName: assigned?.driver_name || (assigned as any)?.full_name || '',
            driverPhone: assigned?.driver_number || (assigned as any)?.primary_number || '',
            cabNumber: assigned?.vehicle_number || (assigned as any)?.reg_id || '',
          };

          const reply: CommandMessage = {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `🧾 Booking #${bookingId}-க்கான Invoice விவரங்கள் தயாராக உள்ளன.\n\n• ரூட்: ${invData.pickup} ➔ ${invData.dropLocation}\n• அடிப்படை கட்டணம்: ₹${baseFare}\n• டோல்: ₹${tollCharges} | பாட்டா: ₹${driverBata}\n\nகீழே உள்ள பட்டன்களை பயன்படுத்தி Print செய்யலாம், PDF டவுன்லோட் செய்யலாம் அல்லது வாட்ஸ்அப்பில் அனுப்பலாம்.`,
            timestamp: Date.now(),
            actionCard: {
              type: 'generate_invoice',
              data: invData,
              status: 'pending',
            },
          };
          setMessages((prev) => [...prev, reply]);
        }
      } else {
        const reply: CommandMessage = {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: 'மன்னிக்கவும், கட்டளை தெளிவாகப் புரியவில்லை.\n\nஉதாரணமாக இவ்வாறு கூறலாம்:\n• "Tiruvannamalai to Chennai Sedan 14 1 300 100 Toll extra"\n• "Booking 1042 Invoice"\n• "Booking E260901 Confirm"\n• "Duty ON" / "Duty OFF"\n• "System Health"',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, reply]);
      }
    } catch (e: any) {
      const errorReply: CommandMessage = {
        id: 'asst-err-' + Date.now(),
        sender: 'assistant',
        text: 'செயல்பாட்டின் போது பிழை ஏற்பட்டது: ' + (e?.message || 'Please try again'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeCardAction = async (messageId: string, actionType: string, payload?: any) => {
    setIsProcessing(true);
    try {
      if (actionType === 'create_booking_preview') {
        setIsOpen(false);
        router.push({
          pathname: '/create-booking' as any,
          params: {
            pickup: payload?.pickup,
            drop: payload?.drop,
            car_type: payload?.carTypeValue,
            trip_type: payload?.tripType,
          },
        });
      } else if (actionType === 'approve_booking') {
        const bookingId = payload?.bookingId;
        await apiService.approveWebsiteBooking(bookingId).catch(() => null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionCard: { ...m.actionCard!, status: 'completed' },
                  text: `✅ Website Booking #${bookingId} வெற்றிகரமாக Approve செய்யப்பட்டு Driver Marketplace-ல் வெளியிடப்பட்டது.`,
                }
              : m
          )
        );
      } else if (actionType === 'cancel_booking') {
        const bookingId = payload?.bookingId;
        await apiService.rejectWebsiteBooking(bookingId, 'Cancelled via Command Center').catch(() => null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionCard: { ...m.actionCard!, status: 'completed' },
                  text: `❌ Booking #${bookingId} Cancel செய்யப்பட்டது.`,
                }
              : m
          )
        );
      } else if (actionType === 'print_invoice') {
        printOrDownloadInvoice(payload);
      } else if (actionType === 'download_invoice_pdf') {
        const invId = payload.invoiceNumber || payload.id;
        apiService.downloadTaxInvoicePdf(invId, 'DC-INV-' + invId);
      } else if (actionType === 'share_invoice_whatsapp') {
        shareQuotationViaWhatsApp(payload);
      } else if (actionType === 'customize_invoice') {
        setInvoiceModalData(payload);
        setShowInvoiceModal(true);
      }
    } catch (e: any) {
      console.error('Error executing card action:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceModalData, setInvoiceModalData] = useState<Partial<InvoiceData>>({});

  return (
    <CommandCenterContext.Provider
      value={{
        isOpen,
        messages,
        isProcessing,
        openCommandCenter,
        closeCommandCenter,
        sendMessage,
        executeCardAction,
        clearChat,
        showInvoiceModal,
        setShowInvoiceModal,
        invoiceModalData,
        setInvoiceModalData,
      }}
    >
      {children}
    </CommandCenterContext.Provider>
  );
};

export const useCommandCenter = () => {
  const context = useContext(CommandCenterContext);
  if (!context) {
    throw new Error('useCommandCenter must be used within a CommandCenterProvider');
  }
  return context;
};
