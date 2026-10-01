import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  PhoneCall,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  MapPin,
  Headset,
  Bot,
  Sparkles,
  Send,
  Clock,
  Car,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell, useScreenTheme } from '@/components/SafeArea';
import axiosInstance from '../api/axiosInstance';
import { useRouter } from 'expo-router';

interface ChatMessage {
  id: string | number;
  sender: 'ME' | 'BOT';
  text: string;
  created_at: string;
  suggestions?: string[];
}

const FAQS = [
  {
    question: 'How do I track my assigned cab and driver details?',
    answer: 'Go to the "My Trips" tab in the app and select your active booking. You will instantly see driver name, phone number, vehicle registration number, and live status.'
  },
  {
    question: 'Are highway tolls and state permit charges included in the fare?',
    answer: 'Intercity drop taxi fares cover the cab fare and driver allowance. Highway tolls, parking fees, and state entrance permit charges are billed at actual toll booth receipts during the journey.'
  },
  {
    question: 'How do Start & End OTPs work?',
    answer: 'When your assigned driver arrives at your pickup location, share the 4-digit Start OTP shown in your app to begin the trip. At the destination, share the End OTP to safely close the ride.'
  },
  {
    question: 'What is the minimum billable distance for outstation rides?',
    answer: 'One-way drop taxis have a standard minimum billing of 130 KM. Round trip bookings are billed for a minimum of 250 KM per calendar day.'
  },
  {
    question: 'What is the luggage policy?',
    answer: 'Sedan accommodates 3 large suitcases + 2 hand bags. SUV/Innova accommodates 4-5 large bags. Hatchback is best suited for 2 medium bags.'
  },
  {
    question: 'Can I travel with my pet?',
    answer: 'Yes, pets are allowed with prior intimation. Please carry a protective pet seat cover. A nominal hygiene sanitization fee of ₹300 applies.'
  }
];

const COVERAGE_CITIES = [
  'Chennai', 'Bangalore', 'Coimbatore', 'Madurai', 'Trichy',
  'Salem', 'Pondicherry', 'Vellore', 'Hosur', 'Tirupati', 'Kanchipuram',
  'Ooty', 'Kodaikanal', 'Tirunelveli', 'Thanjavur', 'Rameswaram'
];

const INITIAL_QUICK_SUGGESTIONS = [
  'Estimate Chennai ➔ Madurai fare',
  'How do Start & End OTPs work?',
  'Luggage & boot space capacity',
  'Are highway tolls included?',
  'Pet travel policy',
  'AC rules in hill stations',
];

export default function SupportScreen() {
  const { isDark } = useScreenTheme();
  const router = useRouter();

  // Mode: 'AI_CHAT' | 'HELPLINE'
  const [activeMode, setActiveMode] = useState<'AI_CHAT' | 'HELPLINE'>('AI_CHAT');

  // FAQ State
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(0);
  const [callbackRequested, setCallbackRequested] = useState(false);

  // AI Chat State
  const [aiInputText, setAiInputText] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-cust',
      sender: 'BOT',
      text: 'Vanakkam! Welcome to Drop Cars 24/7 AI Assistant. 🚗✨\n\nI can calculate outstation fares, explain Start/End OTPs, toll & luggage rules, or connect you directly with our dispatch desk.',
      created_at: new Date().toISOString(),
      suggestions: [
        'Estimate Chennai ➔ Bangalore fare',
        'How do Start & End OTPs work?',
        'Luggage allowance for Sedan vs SUV',
      ],
    },
  ]);

  const makeCall = () => {
    Linking.openURL('tel:9876543210');
  };

  const openWhatsApp = () => {
    Linking.openURL('https://wa.me/919876543210?text=Hello%20Drop%20Cars%20Support,%20I%20need%20assistance%20with%20my%20taxi%20booking.');
  };

  const handleRequestCallback = () => {
    setCallbackRequested(true);
    setTimeout(() => {
      setCallbackRequested(false);
    }, 6000);
  };

  const toggleFaq = (index: number) => {
    setExpandedFaqIndex(expandedFaqIndex === index ? null : index);
  };

  const handleSendAiMessage = async (overrideText?: string) => {
    const text = (overrideText || aiInputText).trim();
    if (!text || aiSending) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'ME',
      text,
      created_at: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setAiInputText('');
    setAiSending(true);

    try {
      const response = await axiosInstance.post('/ai/chat-assistant', {
        message: text,
        language: 'ta',
      });

      if (response.data && response.data.reply) {
        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          sender: 'BOT',
          text: response.data.reply,
          created_at: new Date().toISOString(),
          suggestions: response.data.suggestions || [],
        };
        setAiMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error('Invalid response');
      }
    } catch (err) {
      // Offline fallback
      let replyText = 'Thank you for reaching out! Our outstation one-way rates start at ₹14/km for Sedan and ₹19/km for SUV. All tolls and permits are charged on actuals.';
      const lower = text.toLowerCase();
      if (lower.includes('otp')) {
        replyText = '🔑 **Start & End OTP**:\n• Your 4-digit Start OTP is sent via SMS & shown in the app. Share it with the driver at pickup.\n• At destination, verify the final bill and share the End OTP to complete the journey.';
      } else if (lower.includes('luggage') || lower.includes('bag')) {
        replyText = '🧳 **Luggage Guidelines**:\n• Sedan: 3 large bags + 2 handbags\n• SUV / Innova: 4-5 large bags\n• Hatchback: 2 medium bags';
      } else if (lower.includes('toll') || lower.includes('permit')) {
        replyText = '🅿️ **Toll & State Permits**:\n• Highway tolls and state entrance taxes are payable on actual toll receipts during the ride.';
      }

      setAiMessages((prev) => [
        ...prev,
        {
          id: 'bot-fallback-' + Date.now(),
          sender: 'BOT',
          text: replyText,
          created_at: new Date().toISOString(),
          suggestions: ['Call 24/7 Helpline', 'Chat on WhatsApp'],
        },
      ]);
    } finally {
      setAiSending(false);
    }
  };

  const themeStyles = getStyles(isDark);

  return (
    <ScreenShell title="24/7 Customer Care" subtitle="Instant AI Assistant • Live Helpline • FAQs">
      {/* A real person: the Drop Cars team chat (replies arrive here and as a notification) */}
      <TouchableOpacity
        style={themeStyles.personCard}
        onPress={() => router.push({ pathname: '/(customer)/chat-room', params: { support: '1', title: 'Drop Cars Support' } } as any)}
        accessibilityLabel="Chat with the Drop Cars team"
      >
        <Headset size={20} color="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text style={themeStyles.personTitle}>Chat with the Drop Cars team</Text>
          <Text style={themeStyles.personSub}>A real person replies here</Text>
        </View>
        <MessageSquare size={18} color="#FFFFFF" />
      </TouchableOpacity>

      {/* SEGMENTED SWITCHER */}
      <View style={themeStyles.modeSwitcher}>
        <TouchableOpacity
          style={[themeStyles.modeTab, activeMode === 'AI_CHAT' && themeStyles.modeTabActive]}
          onPress={() => setActiveMode('AI_CHAT')}
        >
          <Bot size={16} color={activeMode === 'AI_CHAT' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} />
          <Text style={[themeStyles.modeTabText, activeMode === 'AI_CHAT' && themeStyles.modeTabTextActive]}>
            DropBot AI
          </Text>
          <View style={themeStyles.livePill}>
            <Text style={themeStyles.livePillText}>24/7</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[themeStyles.modeTab, activeMode === 'HELPLINE' && themeStyles.modeTabActive]}
          onPress={() => setActiveMode('HELPLINE')}
        >
          <Headset size={16} color={activeMode === 'HELPLINE' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} />
          <Text style={[themeStyles.modeTabText, activeMode === 'HELPLINE' && themeStyles.modeTabTextActive]}>
            Helpline & FAQs
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODE 1: LIVE AI CHAT */}
      {activeMode === 'AI_CHAT' ? (
        <View style={themeStyles.chatContainer}>
          {/* QUICK CHIPS CAROUSEL */}
          <View style={themeStyles.chipsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {INITIAL_QUICK_SUGGESTIONS.map((sug, sIdx) => (
                <TouchableOpacity
                  key={sIdx}
                  style={themeStyles.suggestionChip}
                  onPress={() => handleSendAiMessage(sug)}
                >
                  <Sparkles size={12} color="#0EA5E9" />
                  <Text style={themeStyles.suggestionText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* CHAT MESSAGES BUBBLES */}
          <View style={{ gap: 12, marginTop: 10 }}>
            {aiMessages.map((msg) => {
              const isMe = msg.sender === 'ME';
              return (
                <View key={String(msg.id)} style={[themeStyles.msgWrap, isMe ? themeStyles.msgWrapMe : themeStyles.msgWrapBot]}>
                  <View style={[themeStyles.msgBubble, isMe ? themeStyles.msgBubbleMe : themeStyles.msgBubbleBot]}>
                    <Text style={[themeStyles.msgText, isMe ? themeStyles.msgTextMe : themeStyles.msgTextBot]}>
                      {msg.text}
                    </Text>
                  </View>

                  {/* Contextual Suggestions */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <View style={themeStyles.bubbleChipsWrap}>
                      {msg.suggestions.map((s, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={themeStyles.subChip}
                          onPress={() => handleSendAiMessage(s)}
                        >
                          <Text style={themeStyles.subChipText}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* INPUT BAR */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ marginTop: 16 }}>
            <View style={themeStyles.inputBar}>
              <TextInput
                style={themeStyles.textInput}
                placeholder="Ask DropBot (e.g. fare from Chennai to Trichy)..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={aiInputText}
                onChangeText={setAiInputText}
                onSubmitEditing={() => handleSendAiMessage()}
              />
              <TouchableOpacity
                style={[themeStyles.sendBtn, { opacity: aiSending ? 0.6 : 1 }]}
                onPress={() => handleSendAiMessage()}
                disabled={aiSending}
              >
                {aiSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : (
        /* MODE 2: HELPLINE & FAQS */
        <View style={{ gap: 14 }}>
          {/* ACTION BUTTONS */}
          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={makeCall}>
              <LinearGradient colors={['#0EA5E9', '#0284C7']} style={themeStyles.supportButton}>
                <PhoneCall color="#FFFFFF" size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.buttonTitle}>Call 24/7 Support Helpline</Text>
                  <Text style={themeStyles.buttonSubtitle}>+91 98765 43210 (Toll Free)</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={openWhatsApp}>
              <LinearGradient colors={['#10B981', '#059669']} style={themeStyles.supportButton}>
                <MessageSquare color="#FFFFFF" size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.buttonTitle}>Chat on WhatsApp</Text>
                  <Text style={themeStyles.buttonSubtitle}>Instant booking updates & live representative</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* CALLBACK REQUEST BUTTON */}
          <TouchableOpacity
            style={[themeStyles.callbackCard, callbackRequested && themeStyles.callbackSuccessCard]}
            onPress={handleRequestCallback}
            disabled={callbackRequested}
          >
            <Headset color={callbackRequested ? '#10B981' : '#0EA5E9'} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={themeStyles.callbackTitle}>
                {callbackRequested ? 'Callback Requested!' : 'Request Instant Support Callback'}
              </Text>
              <Text style={themeStyles.callbackSubtext}>
                {callbackRequested ? 'Our dispatch supervisor will call your registered phone within 2 minutes.' : 'Click to request an immediate phone call from our team.'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* FREQUENTLY ASKED QUESTIONS */}
          <Text style={themeStyles.sectionHeader}>Frequently Asked Questions</Text>

          <View style={{ gap: 10 }}>
            {FAQS.map((faq, idx) => {
              const isExpanded = expandedFaqIndex === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={themeStyles.faqCard}
                  onPress={() => toggleFaq(idx)}
                  activeOpacity={0.8}
                >
                  <View style={themeStyles.faqHeader}>
                    <HelpCircle color="#0EA5E9" size={20} />
                    <Text style={themeStyles.faqQ}>{faq.question}</Text>
                    {isExpanded ? <ChevronUp color="#94A3B8" size={20} /> : <ChevronDown color="#94A3B8" size={20} />}
                  </View>

                  {isExpanded && (
                    <View style={themeStyles.faqAnswerContainer}>
                      <Text style={themeStyles.faqA}>{faq.answer}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* MAJOR SERVICE COVERAGE CITIES */}
          <Text style={themeStyles.sectionHeader}>Major Service Hubs</Text>
          <View style={themeStyles.cityContainer}>
            {COVERAGE_CITIES.map((city) => (
              <View key={city} style={themeStyles.cityChip}>
                <MapPin color="#0EA5E9" size={14} />
                <Text style={themeStyles.cityText}>{city}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScreenShell>
  );
}

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    personCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#6366F1', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
    personTitle: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
    personSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
    modeSwitcher: { flexDirection: 'row', backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderRadius: 14, padding: 4, marginBottom: 14 },
    modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10 },
    modeTabActive: { backgroundColor: '#0EA5E9' },
    modeTabText: { fontSize: 13, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' },
    modeTabTextActive: { color: '#FFFFFF' },
    livePill: { backgroundColor: '#10B981', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 },
    livePillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
    // Chat styles
    chatContainer: { paddingBottom: 10 },
    chipsRow: { paddingBottom: 6 },
    suggestionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
    suggestionText: { fontSize: 12, color: isDark ? '#E2E8F0' : '#1E293B', fontWeight: '600' },
    msgWrap: { maxWidth: '88%' },
    msgWrapMe: { alignSelf: 'flex-end' },
    msgWrapBot: { alignSelf: 'flex-start' },
    msgBubble: { padding: 14, borderRadius: 18 },
    msgBubbleMe: { backgroundColor: '#0EA5E9', borderBottomRightRadius: 2 },
    msgBubbleBot: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
    msgText: { fontSize: 13.5, lineHeight: 20 },
    msgTextMe: { color: '#FFFFFF', fontWeight: '500' },
    msgTextBot: { color: isDark ? '#F1F5F9' : '#0F172A' },
    bubbleChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    subChip: { backgroundColor: isDark ? '#0F172A' : '#F0F9FF', borderWidth: 1, borderColor: '#38BDF8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    subChipText: { fontSize: 11.5, color: '#0284C7', fontWeight: '700' },
    inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    textInput: { flex: 1, height: 46, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 23, borderWidth: 1, borderColor: isDark ? '#334155' : '#CBD5E1', paddingHorizontal: 16, fontSize: 13.5, color: isDark ? '#FFFFFF' : '#0F172A' },
    sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
    // Helpline styles
    supportButton: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    buttonTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    buttonSubtitle: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, marginTop: 2 },
    callbackCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
    callbackSuccessCard: { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4' },
    callbackTitle: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 15, fontWeight: '800' },
    callbackSubtext: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, marginTop: 2 },
    sectionHeader: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: '800', marginTop: 16, marginBottom: 10 },
    faqCard: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: isDark ? 1 : 0, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
    faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    faqQ: { flex: 1, color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 14, fontWeight: '700' },
    faqAnswerContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#E2E8F0' },
    faqA: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 13, lineHeight: 18 },
    cityContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cityChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
    cityText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 13, fontWeight: '700' },
  });
}
