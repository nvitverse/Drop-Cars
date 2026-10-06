import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft,
  MessageCircle,
  Bot,
  Headphones,
  Sparkles,
  Send,
  X,
  Phone,
  ShieldCheck,
  ChevronRight,
  HelpCircle,
  Clock,
  Car,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as themeColors } from '../constants/theme';
import api from './api/api';

const formatBookingId = (id: any, _d?: any) => 'DC' + String(id).padStart(4, '0');

interface Thread {
  order_id: number;
  title: string;
  trip_type: string;
  car_type: string;
  start_date_time: string | null;
  assignment_status: string;
  my_side: 'POSTER' | 'DRIVER';
  other_party: string;
  last_text: string | null;
  last_at: string | null;
  unread: number;
}

interface ChatMessage {
  id: string | number;
  sender: 'ME' | 'BOT' | 'SYSTEM' | 'ADMIN';
  text: string;
  created_at: string;
  suggestions?: string[];
}

const timeLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// Initial AI Quick Chips
const AI_QUICK_SUGGESTIONS = [
  'Estimate Chennai ➔ Madurai fare',
  'Explain ₹500 Security Hold rule',
  'What is the cancellation penalty?',
  'Toll & Fastag collection rules',
  'Start & End Trip OTP guide',
  'Ghat road & hill station rules',
];

export default function ChatsScreen() {
  const router = useRouter();
  const colors: any = { ...themeColors, surface: themeColors.surface, textSecondary: themeColors.textSecondary };

  // Segment Tab: 'ALL' | 'BOT' | 'BOOKINGS'
  const [activeTab, setActiveTab] = useState<'ALL' | 'BOT' | 'BOOKINGS'>('ALL');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Chat Modal State
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-vendor',
      sender: 'BOT',
      text: 'Vanakkam! I am DropBot, your 24/7 Fleet & Booking AI Assistant.\n\nAsk me anything about outstation tariffs, OTP rules, Fastag tolls, ₹500 security hold, or partner cancellation policies!',
      created_at: new Date().toISOString(),
      suggestions: [
        'Calculate Chennai ➔ Bangalore fare',
        'How does ₹500 Security Hold work?',
        'Cancellation & penalty rules',
      ],
    },
  ]);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/booking-chat/threads');
      setThreads(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load chats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 10000);
      return () => clearInterval(t);
    }, [load])
  );

  const handleSendAiMessage = async (textToSend?: string) => {
    const text = (textToSend || aiInputText).trim();
    if (!text || aiSending) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'ME',
      text,
      created_at: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setAiInputText('');
    setAiSending(true);

    try {
      // Call backend AI Assistant endpoint
      const response = await api.post('/ai/chat-assistant', {
        message: text,
        language: 'ta',
      });

      if (response.data && response.data.reply) {
        const botReply: ChatMessage = {
          id: 'bot-' + Date.now(),
          sender: 'BOT',
          text: response.data.reply,
          created_at: new Date().toISOString(),
          suggestions: response.data.suggestions || [],
        };
        setAiMessages((prev) => [...prev, botReply]);
      } else {
        throw new Error('No reply from server');
      }
    } catch (err) {
      // High quality offline fallback
      let fallbackText = 'I am here to help! Standard Outstation rates are:\n• Sedan: ₹14/km\n• SUV: ₹19/km\n• Innova: ₹21/km\n\nFastag tolls are payable as per actuals. ₹500 security hold is released instantly upon End OTP.';
      const lower = text.toLowerCase();
      if (lower.includes('cancel') || lower.includes('penalty') || lower.includes('500')) {
        fallbackText = '⚠️ **Cancellation Policy**:\n• 10s HUD decline window is 100% FREE (₹0 penalty).\n• Cancelling after driver/car assignment incurs a ₹500 penalty deducted from wallet.';
      } else if (lower.includes('hold') || lower.includes('security') || lower.includes('wallet')) {
        fallbackText = '💳 **₹500 Security Hold**:\n• A refundable ₹500 hold is temporarily reserved per active trip.\n• Instantly released to available balance once ride is completed via End OTP.';
      }

      setAiMessages((prev) => [
        ...prev,
        {
          id: 'bot-fallback-' + Date.now(),
          sender: 'BOT',
          text: fallbackText,
          created_at: new Date().toISOString(),
          suggestions: ['Call Operations Helpline', 'Check Wallet Balance'],
        },
      ]);
    } finally {
      setAiSending(false);
    }
  };

  // Real 2-way text chat with Admin (Admin App > Chats sees and replies to
  // this same thread) - the "Operations & Dispatch Desk" row used to be
  // call-only, with no way to just type a message. Backend endpoints
  // (/support/*) already existed for the Driver App's Support chat; the
  // only gap was _resolve_sender not accepting a vendor token, fixed
  // 2026-09-23 alongside this.
  const [adminChatVisible, setAdminChatVisible] = useState(false);
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([]);
  const [adminInputText, setAdminInputText] = useState('');
  const [adminSending, setAdminSending] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const loadAdminThread = useCallback(async () => {
    try {
      const res = await api.get('/support/my-thread');
      const msgs = (res.data?.messages || []).map((m: any) => ({
        id: m.id,
        sender: m.mine ? 'ME' : 'ADMIN',
        text: m.text || (m.voice_url ? '🎤 Voice message' : ''),
        created_at: m.created_at,
      }));
      setAdminMessages(msgs);
    } catch (e) {
      // keep whatever was already loaded - don't clear on a transient poll failure
    } finally {
      setAdminLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!adminChatVisible) return;
    setAdminLoading(true);
    loadAdminThread();
    const t = setInterval(loadAdminThread, 6000);
    return () => clearInterval(t);
  }, [adminChatVisible, loadAdminThread]);

  const sendAdminMessage = async () => {
    const text = adminInputText.trim();
    if (!text || adminSending) return;
    setAdminInputText('');
    setAdminSending(true);
    const tempId = 'temp-' + Date.now();
    setAdminMessages((prev) => [...prev, { id: tempId, sender: 'ME', text, created_at: new Date().toISOString() }]);
    try {
      const res = await api.post('/support/dispatch-message', { text });
      const realId = res.data?.id;
      if (realId) {
        setAdminMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
      }
    } catch (e) {
      setAdminMessages((prev) => prev.filter((m) => m.id !== tempId));
      setAdminInputText(text);
    } finally {
      setAdminSending(false);
    }
  };

  const callHelpline = async () => {
    // Never a hardcoded number - calls whoever has actually toggled "on
    // duty" right now (Admin App > Chats), same lookup the Driver App uses.
    try {
      const res = await api.get('/support/on-duty-contact');
      if (res.data?.phone) {
        Linking.openURL(`tel:${res.data.phone}`);
        return;
      }
    } catch {}
    setAiModalVisible(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Messages & Support</Text>
          <Text style={{ fontSize: 11.5, color: colors.textSecondary }}>DropBot AI • Dispatch • Driver Chats</Text>
        </View>
        <TouchableOpacity
          onPress={() => setAiModalVisible(true)}
          style={[styles.aiChipHeader, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.primary }}>AI Help</Text>
        </TouchableOpacity>
      </View>

      {/* FILTER TABS */}
      <View style={[styles.tabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'ALL' && [styles.tabBtnActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('ALL')}
        >
          <Text style={[styles.tabText, activeTab === 'ALL' && { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
            All ({threads.length + 2})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'BOT' && [styles.tabBtnActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('BOT')}
        >
          <Text style={[styles.tabText, activeTab === 'BOT' && { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
            DropBot & Dispatch
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'BOOKINGS' && [styles.tabBtnActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('BOOKINGS')}
        >
          <Text style={[styles.tabText, activeTab === 'BOOKINGS' && { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
            Trip Chats ({threads.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* PINNED AI BOT & DISPATCH CHANNELS */}
          {activeTab !== 'BOOKINGS' && (
            <View style={{ borderBottomWidth: 6, borderBottomColor: colors.border }}>
              {/* 1. DropBot 24/7 AI */}
              <TouchableOpacity
                style={[styles.pinnedCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setAiModalVisible(true)}
              >
                <View style={[styles.botAvatar, { backgroundColor: '#8B5CF6' }]}>
                  <Bot size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>DropBot AI Assistant</Text>
                    <View style={styles.liveTag}>
                      <Text style={{ fontSize: 10, color: '#10B981', fontFamily: 'Inter-Bold' }}>● 24/7 LIVE</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                    Instant fare calculations, ₹500 hold info & operational rules
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* 2. Admin / Operations & Dispatch Desk - real 2-way text
                  chat now, with Call still one tap away in the header. */}
              <TouchableOpacity
                style={[styles.pinnedCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
                activeOpacity={0.8}
                onPress={() => setAdminChatVisible(true)}
              >
                <View style={[styles.botAvatar, { backgroundColor: '#0284C7' }]}>
                  <Headphones size={20} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>Admin / Dispatch Desk</Text>
                    <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Inter-Bold' }}>CHAT</Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                    Message Drop Cars Admin directly - reassignments, escalations & emergencies
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* TRIP CHATS SECTION */}
          {activeTab !== 'BOT' && (
            <View>
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACTIVE BOOKING THREADS</Text>
              </View>

              {threads.length === 0 ? (
                <View style={styles.center}>
                  <MessageCircle size={36} color={colors.textSecondary} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No active trip chats</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                    When a booking is accepted, an in-app chat opens automatically to coordinate with the driver or customer.
                  </Text>
                </View>
              ) : (
                threads.map((item) => (
                  <TouchableOpacity
                    key={String(item.order_id)}
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: '/chat/[orderId]', params: { orderId: String(item.order_id) } } as any)}
                  >
                    <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                      <Car size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                          #{formatBookingId(item.order_id, item.start_date_time)} · {item.title}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{timeLabel(item.last_at)}</Text>
                      </View>
                      <View style={styles.rowTop}>
                        <Text numberOfLines={1} style={{ flex: 1, color: colors.textSecondary, fontSize: 12.5 }}>
                          {item.last_text || `${item.trip_type} · ${item.car_type} · with ${item.other_party}`}
                        </Text>
                        {item.unread > 0 && (
                          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                            <Text style={{ color: '#FFF', fontSize: 11, fontFamily: 'Inter-Bold' }}>{item.unread}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* FULL-FEATURED DROPBOT AI INTERACTION MODAL */}
      <Modal visible={aiModalVisible} animationType="slide" onRequestClose={() => setAiModalVisible(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          {/* MODAL HEADER */}
          <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.botAvatarSmall, { backgroundColor: '#8B5CF6' }]}>
                <Bot size={18} color="#FFF" />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>DropBot AI Assistant</Text>
                <Text style={{ fontSize: 11, color: '#10B981', fontFamily: 'Inter-Medium' }}>● 24/7 Instant Responses</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setAiModalVisible(false)} style={styles.closeBtn}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* SUGGESTION CHIPS CAROUSEL */}
          <View style={{ paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
              {AI_QUICK_SUGGESTIONS.map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.quickChip, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => handleSendAiMessage(chip)}
                >
                  <Sparkles size={12} color={colors.primary} />
                  <Text style={[styles.quickChipText, { color: colors.text }]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* MESSAGES LIST */}
          <FlatList
            data={aiMessages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: 14, gap: 12 }}
            renderItem={({ item }) => {
              const isMe = item.sender === 'ME';
              return (
                <View style={[styles.messageBubbleWrap, isMe ? styles.wrapMe : styles.wrapBot]}>
                  <View
                    style={[
                      styles.messageBubble,
                      isMe
                        ? [styles.bubbleMe, { backgroundColor: colors.primary }]
                        : [styles.bubbleBot, { backgroundColor: colors.surface, borderColor: colors.border }],
                    ]}
                  >
                    <Text style={[styles.messageText, isMe ? { color: '#FFF' } : { color: colors.text }]}>
                      {item.text}
                    </Text>
                    <Text style={[styles.messageTime, isMe ? { color: '#E0E7FF' } : { color: colors.textSecondary }]}>
                      {timeLabel(item.created_at)}
                    </Text>
                  </View>

                  {/* Suggestion tags if sent by Bot */}
                  {item.suggestions && item.suggestions.length > 0 && (
                    <View style={styles.bubbleSuggestions}>
                      {item.suggestions.map((s, sIdx) => (
                        <TouchableOpacity
                          key={sIdx}
                          style={[styles.subChip, { borderColor: colors.primary + '50', backgroundColor: colors.surface }]}
                          onPress={() => handleSendAiMessage(s)}
                        >
                          <Text style={{ fontSize: 11.5, color: colors.primary, fontFamily: 'Inter-Medium' }}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            }}
          />

          {/* INPUT BAR */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Ask DropBot (e.g. fare from Salem to Madurai)..."
                placeholderTextColor={colors.textSecondary}
                value={aiInputText}
                onChangeText={setAiInputText}
                onSubmitEditing={() => handleSendAiMessage()}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: aiSending ? 0.6 : 1 }]}
                onPress={() => handleSendAiMessage()}
                disabled={aiSending}
              >
                {aiSending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFF" />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ADMIN / DISPATCH DESK CHAT MODAL - real 2-way, Admin App sees & replies */}
      <Modal visible={adminChatVisible} animationType="slide" onRequestClose={() => setAdminChatVisible(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.botAvatarSmall, { backgroundColor: '#0284C7' }]}>
                <Headphones size={18} color="#FFF" />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Admin / Dispatch Desk</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>A real person replies here</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={callHelpline} style={styles.closeBtn}>
                <Phone size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdminChatVisible(false)} style={styles.closeBtn}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {adminLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <FlatList
              data={adminMessages}
              keyExtractor={(m) => String(m.id)}
              contentContainerStyle={{ padding: 14, gap: 12 }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Headphones size={36} color={colors.textSecondary} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Send a message and Drop Cars Admin will reply here.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isMe = item.sender === 'ME';
                return (
                  <View style={[styles.messageBubbleWrap, isMe ? styles.wrapMe : styles.wrapBot]}>
                    <View
                      style={[
                        styles.messageBubble,
                        isMe
                          ? [styles.bubbleMe, { backgroundColor: colors.primary }]
                          : [styles.bubbleBot, { backgroundColor: colors.surface, borderColor: colors.border }],
                      ]}
                    >
                      <Text style={[styles.messageText, isMe ? { color: '#FFF' } : { color: colors.text }]}>
                        {item.text}
                      </Text>
                      <Text style={[styles.messageTime, isMe ? { color: '#E0E7FF' } : { color: colors.textSecondary }]}>
                        {timeLabel(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Message Drop Cars Admin..."
                placeholderTextColor={colors.textSecondary}
                value={adminInputText}
                onChangeText={setAdminInputText}
                onSubmitEditing={sendAdminMessage}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: adminSending ? 0.6 : 1 }]}
                onPress={sendAdminMessage}
                disabled={adminSending}
              >
                {adminSending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFF" />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  back: { padding: 6 },
  title: { fontSize: 18, fontFamily: 'Inter-Bold' },
  aiChipHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontFamily: 'Inter-Medium', color: '#64748B' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  pinnedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  botAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  botAvatarSmall: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  liveTag: { backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
  rowTitle: { flex: 1, fontSize: 14.5, fontFamily: 'Inter-Bold' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  // Modal styles
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter-Bold' },
  closeBtn: { padding: 4 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  quickChipText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  messageBubbleWrap: { maxWidth: '85%' },
  wrapMe: { alignSelf: 'flex-end' },
  wrapBot: { alignSelf: 'flex-start' },
  messageBubble: { padding: 12, borderRadius: 16 },
  bubbleMe: { borderBottomRightRadius: 2 },
  bubbleBot: { borderBottomLeftRadius: 2, borderWidth: 1 },
  messageText: { fontSize: 13.5, lineHeight: 20 },
  messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  bubbleSuggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  subChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 8 },
  textInput: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, fontSize: 13.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
