// One conversation in the unified inbox: text, voice notes, photos, read ticks, and the number-masking notice.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, CheckCheck, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import VoiceNote from '@/components/chat/VoiceNote';
import ChatComposer from '@/components/chat/ChatComposer';
import { chatApi, InboxChatSummary, InboxMessage, roleLabel, timeLabel } from '@/services/chatApi';

const POLL_MS = 4000;

export default function InboxRoomScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { themeColors: c } = useTheme();
  const router = useRouter();
  const [chat, setChat] = useState<InboxChatSummary | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<InboxMessage>>(null);
  const lastId = useRef(0);

  const merge = useCallback((incoming: InboxMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      incoming.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort((a, b) => a.id - b.id);
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    if (incoming.some((m) => !m.mine)) chatApi.markRead(String(id), lastId.current).catch(() => {});
  }, [id]);

  const open = useCallback(async () => {
    try {
      setError(null);
      const summary = await chatApi.get(String(id));
      setChat(summary);
      lastId.current = 0;
      setMessages([]);
      const page = await chatApi.messages(String(id), 0);
      merge(page.messages);
      if (!page.messages.length) chatApi.markRead(String(id)).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Could not open this chat.');
    } finally {
      setLoading(false);
    }
  }, [id, merge]);

  useEffect(() => { open(); }, [open]);

  // Poll only while this screen is in front.
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(async () => {
        try { merge((await chatApi.messages(String(id), lastId.current)).messages); } catch { /* keep the last good state */ }
      }, POLL_MS);
      return () => clearInterval(t);
    }, [id, merge]),
  );

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages.length]);

  const sendText = async (text: string) => {
    const body = text.trim();
    if (!body) return;
    setNotice(null);
    try {
      const sent = await chatApi.send(String(id), { text: body });
      merge([sent]);
      if (sent.notice) setNotice(sent.notice);
    } catch (e: any) {
      setError(e?.message || 'Message not sent.');
    }
  };

  const sendVoice = async (uri: string) => {
    try {
      const up = await chatApi.upload(uri, 'audio/m4a');
      merge([await chatApi.send(String(id), { voice_url: up.url })]);
    } catch (e: any) {
      setError(e?.message || 'Voice note not sent.');
    }
  };

  const renderItem = ({ item }: { item: InboxMessage }) => {
    const mine = item.mine;
    return (
      <View style={[s.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
        <View style={[s.bubble, mine ? { backgroundColor: c.primary, borderBottomRightRadius: 4 } : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
          {!mine ? (
            <Text style={[s.sender, { color: c.primary }]}>
              {item.sender_name || roleLabel(item.sender_role)}{item.sender_name ? ` - ${roleLabel(item.sender_role)}` : ''}
            </Text>
          ) : null}
          {item.image_url ? <Image source={{ uri: item.image_url }} style={s.photo} resizeMode="cover" /> : null}
          {item.voice_url ? (
            <VoiceNote uri={item.voice_url} mine={mine} tint={mine ? '#fff' : c.primary} />
          ) : item.text ? (
            <Text style={[s.text, { color: mine ? (c.onPrimary || '#fff') : c.text }]}>{item.text}</Text>
          ) : null}
          <View style={s.meta}>
            <Text style={[s.time, { color: mine ? 'rgba(255,255,255,0.75)' : c.textMuted }]}>{timeLabel(item.created_at)}</Text>
            {mine ? (item.read ? <CheckCheck size={13} color="#BFDBFE" /> : <Check size={13} color="rgba(255,255,255,0.75)" />) : null}
          </View>
        </View>
      </View>
    );
  };

  const heading = (title ? String(title) : chat?.title) || 'Chat';
  const who = chat?.participants.map((p) => p.name).filter(Boolean).slice(0, 4).join(', ');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox' as any))} hitSlop={10} accessibilityLabel="Back">
          <ArrowLeft size={22} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: c.text }]} numberOfLines={1}>{heading}</Text>
          {who ? <Text style={[s.sub, { color: c.textMuted }]} numberOfLines={1}>{who}</Text> : null}
        </View>
      </View>

      {chat?.number_policy ? (
        <View style={[s.policy, { backgroundColor: c.warningTint }]}>
          <ShieldAlert size={14} color={c.warning} />
          <Text style={[s.policyText, { color: c.warning }]}>{chat.number_policy}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            ListEmptyComponent={<Text style={[s.empty, { color: c.textMuted }]}>{error || 'No messages yet.'}</Text>}
          />
        )}
        {error && messages.length ? <Text style={[s.notice, { color: c.error }]}>{error}</Text> : null}
        {notice ? <Text style={[s.notice, { color: c.warning }]}>{notice}</Text> : null}
        {chat && !chat.can_post ? (
          <Text style={[s.closed, { color: c.textMuted }]}>{chat.is_closed ? 'This chat is closed.' : 'You can read this chat but not reply to it.'}</Text>
        ) : (
          <ChatComposer colors={c} placeholder="Type a message" onSendText={sendText} onSendVoice={(uri) => sendVoice(uri)} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 11.5, marginTop: 1 },
  policy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  policyText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13.5 },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  text: { fontSize: 14.5, lineHeight: 20 },
  photo: { width: 190, height: 190, borderRadius: 10, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  time: { fontSize: 10.5 },
  notice: { textAlign: 'center', fontSize: 11.5, paddingHorizontal: 14, paddingBottom: 4 },
  closed: { textAlign: 'center', padding: 14, fontSize: 13 },
});
