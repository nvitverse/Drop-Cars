// Booking chat with the booking's poster (vendor / fleet driver / Drop Cars), WhatsApp-style:
//  - tap a message from the other side (or its ⌄) -> menu with replies that answer THAT message,
//    plus Reply (quote), Forward and Call
//  - "+" -> the questions a driver usually asks (pickup location, customer number, tariff, ...)
//  - hold the mic to record (slide up to lock, left to cancel), voice notes with seek + speed
//  - ✓ sent / ✓✓ read, day separators, quoted replies
import { setForegroundInterval } from '@/utils/foregroundInterval';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  Pressable,
  ScrollView,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, MessageCircle, Phone, ChevronDown, Plus, Check, CheckCheck, HelpCircle, Camera, CheckCircle2, ShieldAlert, MapPin, Zap } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosDriver from '@/app/api/axiosDriver';
import { formatBookingId } from '@/utils/format';
import VoiceNote from '@/components/chat/VoiceNote';
import ChatComposer, { ReplyTarget } from '@/components/chat/ChatComposer';
import MessageMenuSheet, { MenuMessage, ReplyOption } from '@/components/chat/MessageMenuSheet';

interface Msg {
  id: number | string;
  side: string;
  mine: boolean;
  sender_name?: string;
  kind?: string;
  text: string;
  voice_url?: string | null;
  created_at: string;
  read?: boolean;
  pending?: boolean;
  reply_to?: { id: number; mine: boolean; kind?: string; text: string; sender_name?: string } | null;
  reply_options?: ReplyOption[];
}

interface Question {
  key: string;
  label: string;
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOpenYet, setNotOpenYet] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Msg | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const lastId = useRef(0);
  const listRef = useRef<FlatList<any>>(null);

  const load = useCallback(async () => {
    try {
      const res = await axiosDriver.get(`/api/booking-chat/orders/${orderId}`, { params: { after_id: lastId.current } });
      const d = res.data;
      setMeta(d);
      setQuestions(d.quick_menu || []);
      setNotOpenYet(null);
      const fresh: Msg[] = Array.isArray(d.messages) ? d.messages : [];
      if (fresh.length) {
        lastId.current = Math.max(lastId.current, ...fresh.map((m) => Number(m.id) || 0));
        setMessages((prev) => {
          const byId = new Map(prev.filter((m) => !m.pending).map((m) => [String(m.id), m]));
          fresh.forEach((m) => byId.set(String(m.id), m));
          const pending = prev.filter((m) => m.pending);
          return [...Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id)), ...pending];
        });
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 400 || e?.response?.status === 403) {
        setNotOpenYet(typeof detail === 'string' ? detail : 'Chat opens once you accept this booking.');
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      lastId.current = 0;
      load();
      return setForegroundInterval(load, 4000);
    }, [load])
  );

  // Read receipts for my messages change without new ids - refresh them quietly.
  useEffect(() => {
    const t = setInterval(async () => {
      if (!messages.some((m) => m.mine && !m.read && !m.pending)) return;
      try {
        const res = await axiosDriver.get(`/api/booking-chat/orders/${orderId}`, { params: { after_id: 0 } });
        const all: Msg[] = res.data?.messages || [];
        const read = new Set(all.filter((m) => m.read).map((m) => String(m.id)));
        setMessages((prev) => prev.map((m) => (read.has(String(m.id)) ? { ...m, read: true } : m)));
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [messages, orderId]);

  const rows = useMemo(() => {
    const out: any[] = [];
    let last = '';
    messages.forEach((m) => {
      const day = dayLabel(m.created_at);
      if (day !== last) {
        out.push({ type: 'day', id: `day-${day}-${m.id}`, label: day });
        last = day;
      }
      out.push({ type: 'msg', id: String(m.id), m });
    });
    return out;
  }, [messages]);

  useEffect(() => {
    if (rows.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [rows.length]);

  const post = async (
    body: { text?: string; quick_key?: string; voice_url?: string },
    echo: Partial<Msg>,
    reply: ReplyTarget | null = replyTo,
  ) => {
    const tempId = `tmp-${Date.now()}`;
    const local: Msg = {
      id: tempId, side: 'DRIVER', mine: true, text: body.text || echo.text || '', kind: echo.kind || 'TEXT',
      voice_url: body.voice_url, created_at: new Date().toISOString(), pending: true,
      reply_to: reply ? { id: Number(reply.id), mine: false, text: reply.text, kind: reply.kind, sender_name: reply.senderName } : null,
    };
    setMessages((prev) => [...prev, local]);
    setReplyTo(null);
    try {
      const res = await axiosDriver.post(`/api/booking-chat/orders/${orderId}`, {
        ...body,
        reply_to_id: reply ? Number(reply.id) : undefined,
      });
      const saved: Msg = res.data;
      lastId.current = Math.max(lastId.current, Number(saved.id) || 0);
      setMessages((prev) => prev.filter((m) => m.id !== tempId).concat(saved).sort((a, b) => Number(a.id) - Number(b.id)));
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      const d = e?.response?.data?.detail;
      Alert.alert('Not sent', typeof d === 'string' ? d : 'Please check your connection and try again.');
    }
  };

  const sendText = (text: string) => post({ text }, { text });

  const sendVoice = async (uri: string) => {
    const form = new FormData();
    form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
    try {
      const up = await axiosDriver.post('/api/booking-chat/upload-voice', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const voiceUrl = up.data?.voice_url;
      if (!voiceUrl) throw new Error('upload failed');
      await post({ voice_url: voiceUrl }, { text: '🎤 Voice message', kind: 'VOICE' });
    } catch {
      Alert.alert('Voice not sent', 'Could not upload the voice message. Please try again.');
    }
  };

  // Answering from a message's menu quotes that message, like a WhatsApp reply.
  const pickReply = (opt: ReplyOption, msg: MenuMessage) => {
    post(
      { text: opt.text || opt.label, quick_key: opt.key },
      { text: opt.text || opt.label },
      { id: msg.id, text: msg.text, senderName: msg.sender_name, kind: msg.kind },
    );
  };

  const askQuestion = (q: Question) => {
    setAskOpen(false);
    post({ quick_key: q.key }, { text: q.label }, null);
  };

  const readOnly = !!meta?.read_only;
  const otherLabel = meta?.other_party || 'Vendor';

  const renderRow = ({ item }: { item: any }) => {
    if (item.type === 'day') {
      return (
        <View style={styles.dayWrap}>
          <Text style={[styles.day, { backgroundColor: isDarkMode ? '#1F2937' : '#E2E8F0', color: colors.textSecondary }]}>{item.label}</Text>
        </View>
      );
    }
    const m: Msg = item.m;
    const theirs = !m.mine;
    const hasMenu = theirs && !readOnly;
    const Bubble: any = hasMenu ? TouchableOpacity : View;
    return (
      <Bubble
        activeOpacity={0.8}
        onPress={hasMenu ? () => setMenuFor(m) : undefined}
        onLongPress={hasMenu ? () => setMenuFor(m) : undefined}
        style={[
          styles.bubble,
          m.mine ? styles.mine : styles.theirs,
          { backgroundColor: m.mine ? colors.primary : colors.surface, borderColor: colors.border, opacity: m.pending ? 0.7 : 1 },
        ]}
      >
        {theirs && !!m.sender_name && (
          <View style={styles.nameRow}>
            <Text style={{ color: colors.primary, fontSize: 11.5, fontFamily: 'Inter-Bold', flex: 1 }}>{m.sender_name}</Text>
            {hasMenu && <ChevronDown size={16} color={colors.textSecondary} />}
          </View>
        )}
        {!!m.reply_to && (
          <View style={[styles.quote, { borderLeftColor: m.mine ? '#FFFFFF' : colors.primary, backgroundColor: m.mine ? 'rgba(255,255,255,0.15)' : colors.background }]}>
            <Text style={{ color: m.mine ? '#FFFFFF' : colors.primary, fontSize: 11, fontFamily: 'Inter-Bold' }}>
              {m.reply_to.mine ? 'You' : m.reply_to.sender_name || otherLabel}
            </Text>
            <Text numberOfLines={2} style={{ color: m.mine ? 'rgba(255,255,255,0.85)' : colors.textSecondary, fontSize: 12 }}>
              {m.reply_to.kind === 'VOICE' ? '🎤 Voice message' : m.reply_to.text}
            </Text>
          </View>
        )}
        {m.voice_url ? (
          <VoiceNote uri={m.voice_url} mine={m.mine} tint={colors.primary} />
        ) : (
          <Text selectable style={{ color: m.mine ? '#FFFFFF' : colors.text, fontSize: 14.5, lineHeight: 20 }}>{m.text}</Text>
        )}
        <View style={styles.metaRow}>
          <Text style={{ color: m.mine ? 'rgba(255,255,255,0.75)' : colors.textSecondary, fontSize: 10 }}>
            {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {m.mine && (m.read ? <CheckCheck size={13} color="#A7F3D0" /> : <Check size={13} color="rgba(255,255,255,0.75)" />)}
        </View>
        {hasMenu && (m.reply_options?.length || 0) > 0 && (
          <Text style={{ color: colors.primary, fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 4 }}>Tap to answer ›</Text>
        )}
      </Bubble>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => safeBack(router)} style={{ padding: 6, marginRight: 6 }} accessibilityLabel="Back">
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontFamily: 'Inter-Bold' }}>
            {otherLabel} · #{formatBookingId(Number(orderId), meta?.start_date_time)}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium' }}>
            {meta?.title || (meta ? `${meta.trip_type} · ${meta.car_type}` : '')}
          </Text>
        </View>
        {!!meta?.other_phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${meta.other_phone}`).catch(() => {})} style={{ padding: 8 }} accessibilityLabel={`Call ${otherLabel}`}>
            <Phone size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : notOpenYet ? (
        <View style={styles.center}>
          <MessageCircle size={40} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>{notOpenYet}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <MessageCircle size={40} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
                  Tap + to ask the {otherLabel.toLowerCase()} for the pickup location, customer number, tariff and more, or type or hold the mic.
                </Text>
              </View>
            }
          />

          {readOnly ? (
            <View style={[styles.closed, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>This trip is completed - chat is closed.</Text>
            </View>
          ) : (
            <ChatComposer
              colors={colors}
              placeholder={`Message ${otherLabel}`}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSendText={sendText}
              onSendVoice={sendVoice}
              leftAccessory={
                questions.length > 0 ? (
                  <TouchableOpacity onPress={() => setAskOpen(true)} style={[styles.plus, { borderColor: colors.border }]} accessibilityLabel="Ask a question">
                    <Plus size={20} color={colors.primary} />
                  </TouchableOpacity>
                ) : null
              }
            />
          )}
        </KeyboardAvoidingView>
      )}

      <MessageMenuSheet
        visible={!!menuFor}
        message={menuFor}
        colors={colors}
        otherPhone={meta?.other_phone}
        otherLabel={otherLabel}
        onClose={() => setMenuFor(null)}
        onPickReply={pickReply}
        onReply={(msg) => setReplyTo({ id: msg.id, text: msg.text, senderName: msg.sender_name, kind: msg.kind })}
      />

      <Modal visible={askOpen} transparent animationType="slide" onRequestClose={() => setAskOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setAskOpen(false)} />
        <View style={[styles.askSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.askHead}>
            <HelpCircle size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter-Bold' }}>Ask {otherLabel}</Text>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {questions.map((q) => (
              <TouchableOpacity key={q.key} onPress={() => askQuestion(q)} style={[styles.askRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dayWrap: { alignItems: 'center', marginVertical: 4 },
  day: { fontSize: 11, fontFamily: 'Inter-SemiBold', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  bubble: { maxWidth: '84%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 6 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  closed: { padding: 14, borderTopWidth: 1, alignItems: 'center' },
  plus: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  askSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, paddingBottom: 26 },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  askRow: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
});
