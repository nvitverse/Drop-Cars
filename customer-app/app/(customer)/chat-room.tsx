// One chat: the Drop Cars team (support) or the group chat of one booking (driver, vendor, Drop Cars).
// Open it with ?support=1, ?order=<order id> or ?id=<conversation id>.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, CheckCheck, Mic, Send, ShieldAlert } from 'lucide-react-native';
import { getPalette } from '@/constants/theme';
import { useScreenTheme } from '@/components/SafeArea';
import {
  ChatMessage, ChatSummary, getChat, getMessages, markRead, openBookingChat, openSupportChat, sendMessage, timeLabel,
} from '@/services/chat';

const POLL_MS = 4000;

export default function ChatRoomScreen() {
  const params = useLocalSearchParams<{ id?: string; order?: string; support?: string; title?: string }>();
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = styles(palette, isDark);

  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastId = useRef(0);
  const chatId = useRef<string | null>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      incoming.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort((a, b) => a.id - b.id);
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    if (incoming.some((m) => !m.mine) && chatId.current) markRead(chatId.current, lastId.current).catch(() => {});
  }, []);

  const open = useCallback(async () => {
    try {
      setError(null);
      let summary: ChatSummary;
      if (params.id) summary = await getChat(String(params.id));
      else if (params.order) summary = await openBookingChat(Number(params.order));
      else summary = await openSupportChat();
      chatId.current = summary.id;
      setChat(summary);
      const page = await getMessages(summary.id, 0);
      lastId.current = 0;
      setMessages([]);
      merge(page.messages);
      if (!page.messages.length) markRead(summary.id).catch(() => {});
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not open this chat. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [params.id, params.order, params.support, merge]);

  useEffect(() => { open(); }, [open]);

  // Poll for new messages only while this screen is in front.
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(async () => {
        if (!chatId.current) return;
        try {
          const page = await getMessages(chatId.current, lastId.current);
          merge(page.messages);
        } catch { /* keep the last good state */ }
      }, POLL_MS);
      return () => clearInterval(t);
    }, [merge]),
  );

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !chatId.current) return;
    setSending(true);
    setNotice(null);
    try {
      const sent = await sendMessage(chatId.current, body);
      setText('');
      merge([sent]);
      if (sent.notice) setNotice(sent.notice);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Message not sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  const title = params.title ? String(params.title) : chat?.title || 'Chat';

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const mine = item.mine;
    return (
      <View style={[s.row, mine ? s.rowMine : s.rowOther]}>
        <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
          {!mine && item.sender_name ? <Text style={s.sender}>{item.sender_name}</Text> : null}
          {item.image_url ? <Image source={{ uri: item.image_url }} style={s.photo} resizeMode="cover" /> : null}
          {item.voice_url ? (
            <TouchableOpacity style={s.voice} onPress={() => Linking.openURL(item.voice_url as string)}>
              <Mic size={16} color={mine ? '#FFFFFF' : palette.primaryBrand} />
              <Text style={[s.text, mine && s.textMine]}>Voice message - tap to play</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[s.text, mine && s.textMine]}>{item.text}</Text>
          )}
          <View style={s.meta}>
            <Text style={[s.time, mine && s.timeMine]}>{timeLabel(item.created_at)}</Text>
            {mine ? (item.read ? <CheckCheck size={13} color="#BFDBFE" /> : <Check size={13} color="rgba(255,255,255,0.75)" />) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/chats' as any))} accessibilityLabel="Back" hitSlop={10}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {chat?.type === 'BOOKING' ? 'Driver, vendor and Drop Cars' : 'Drop Cars team - we reply here'}
          </Text>
        </View>
      </View>

      {chat?.number_policy ? (
        <View style={s.policy}>
          <ShieldAlert size={14} color="#B45309" />
          <Text style={s.policyText}>{chat.number_policy}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.primaryBrand} /></View>
      ) : error && !messages.length ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); open(); }}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 8, gap: 6 }}
          ListEmptyComponent={<Text style={s.empty}>{chat?.type === 'BOOKING' ? 'No messages yet. Say hello to your driver.' : 'Vanakkam! Tell us how we can help.'}</Text>}
        />
      )}

      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {chat && !chat.can_post ? (
        <Text style={s.closed}>{chat.is_closed ? 'This chat is closed.' : 'You can only read this chat.'}</Text>
      ) : (
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message"
            placeholderTextColor={palette.placeholder}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || sending} accessibilityLabel="Send">
            {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = (p: ReturnType<typeof getPalette>, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: p.primaryBrand },
    headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 1 },
    policy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB' },
    policyText: { flex: 1, fontSize: 11.5, color: '#B45309', lineHeight: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    errorText: { color: p.textSecondary, textAlign: 'center', fontSize: 13.5 },
    retry: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: p.primaryBrand },
    retryText: { color: '#FFFFFF', fontWeight: '700' },
    empty: { textAlign: 'center', color: p.textMuted, marginTop: 40, fontSize: 13.5 },
    row: { flexDirection: 'row' },
    rowMine: { justifyContent: 'flex-end' },
    rowOther: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
    bubbleMine: { backgroundColor: p.primaryBrand, borderBottomRightRadius: 4 },
    bubbleOther: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderBottomLeftRadius: 4 },
    sender: { fontSize: 11, fontWeight: '800', color: p.primaryBrand, marginBottom: 2 },
    text: { fontSize: 14.5, lineHeight: 20, color: p.textPrimary },
    textMine: { color: '#FFFFFF' },
    voice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    photo: { width: 190, height: 190, borderRadius: 10, marginBottom: 4 },
    meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
    time: { fontSize: 10.5, color: p.textMuted },
    timeMine: { color: 'rgba(255,255,255,0.75)' },
    notice: { textAlign: 'center', fontSize: 11.5, color: '#B45309', paddingHorizontal: 14, paddingBottom: 4 },
    closed: { textAlign: 'center', color: p.textMuted, padding: 14, fontSize: 13 },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: p.divider, backgroundColor: p.surface },
    input: { flex: 1, maxHeight: 110, minHeight: 42, borderRadius: 20, borderWidth: 1, borderColor: p.border, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14.5, color: p.textPrimary, backgroundColor: p.background },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primaryBrand },
  });
