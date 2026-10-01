// One conversation in the unified inbox: text, voice notes, photos, read ticks, and the number-masking notice.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, Bot, Check, CheckCheck, Paperclip, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import InboxVoiceNote from '@/components/inbox/InboxVoiceNote';
import InboxComposer from '@/components/inbox/InboxComposer';
import ProposalCard from '@/components/inbox/ProposalCard';
import { chatApi, InboxChatSummary, InboxMessage, roleLabel, timeLabel, transcribeVoice } from '@/services/chatApi';

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
  const [botBusy, setBotBusy] = useState(false);
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

  // The assistant answers in a second step so my own message is never held up by it.
  const callBot = async () => {
    setBotBusy(true);
    try {
      const r = await chatApi.askBot(String(id));
      if (r.message) merge([r.message]);
      if (r.handoff) chatApi.get(String(id)).then(setChat).catch(() => {});
    } catch { /* nothing to show: the chat itself is intact */ } finally {
      setBotBusy(false);
    }
  };

  const toggleBot = async () => {
    if (!chat) return;
    try {
      await chatApi.setBot(chat.id, chat.bot_state === 'ON' ? 'OFF' : 'ON');
      setChat(await chatApi.get(chat.id));
    } catch (e: any) {
      setError(e?.message || 'Could not change the assistant.');
    }
  };

  const sendText = async (text: string) => {
    const body = text.trim();
    if (!body) return;
    setNotice(null);
    try {
      const sent = await chatApi.send(String(id), { text: body });
      merge([sent]);
      if (sent.notice) setNotice(sent.notice);
      if (sent.bot_pending) callBot();
    } catch (e: any) {
      setError(e?.message || 'Message not sent.');
    }
  };

  // In the assistant chat, speaking means "type what I said": the transcript is sent as a normal message so you can see what was understood.
  const sendVoice = async (uri: string) => {
    if (chat?.type === 'ASSISTANT') {
      try {
        const text = await transcribeVoice(uri);
        await sendText(text);
      } catch (e: any) {
        setError(e?.message || 'Voice typing failed. Please type the message.');
      }
      return;
    }
    try {
      const up = await chatApi.upload(uri, 'audio/m4a');
      merge([await chatApi.send(String(id), { voice_url: up.url })]);
    } catch (e: any) {
      setError(e?.message || 'Voice note not sent.');
    }
  };

  // Photos: picked with the document picker (already part of the app), uploaded, then sent as an image message.
  const sendPhoto = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.length) return;
      const a = picked.assets[0];
      const up = await chatApi.upload(a.uri, a.mimeType || 'image/jpeg');
      merge([await chatApi.send(String(id), { image_url: up.url })]);
    } catch (e: any) {
      setError(e?.message || 'Photo not sent.');
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
              {item.sender_role === 'BOT' && item.meta?.tools?.length ? `  (looked up: ${item.meta.tools.join(', ')})` : ''}
            </Text>
          ) : null}
          {item.image_url ? <Image source={{ uri: item.image_url }} style={s.photo} resizeMode="cover" /> : null}
          {item.voice_url ? (
            <InboxVoiceNote uri={item.voice_url} mine={mine} tint={mine ? '#fff' : c.primary} />
          ) : item.text ? (
            <Text style={[s.text, { color: mine ? (c.onPrimary || '#fff') : c.text }]}>{item.text}</Text>
          ) : null}
          {item.meta?.proposals?.map((pr) => <ProposalCard key={pr.id} proposal={pr} colors={c} />)}
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

      {chat && (chat.needs_human || ((chat.type === 'SUPPORT' || chat.type === 'BOOKING') && chat.bot_state && chat.bot_state !== 'ON')) ? (
        <View style={[s.policy, { backgroundColor: chat.needs_human ? c.errorTint : c.surfaceAlt }]}>
          <Bot size={14} color={chat.needs_human ? c.error : c.textMuted} />
          <Text style={[s.policyText, { color: chat.needs_human ? c.error : c.textSecondary }]}>
            {chat.needs_human ? 'The assistant handed this chat to a person. Reply to take it.' : 'Assistant is off in this chat.'}
          </Text>
          <TouchableOpacity onPress={toggleBot}><Text style={{ color: c.primary, fontWeight: '800', fontSize: 12 }}>Turn on</Text></TouchableOpacity>
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
        {chat?.type === 'ASSISTANT' && !botBusy && messages.length === 0 ? (
          <TouchableOpacity style={[s.quick, { borderColor: c.primary, backgroundColor: c.surface }]} onPress={() => sendText('What needs my attention?')}>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>What needs my attention?</Text>
          </TouchableOpacity>
        ) : null}
        {botBusy ? <Text style={[s.notice, { color: c.textMuted }]}>Assistant is working on it...</Text> : null}
        {notice ? <Text style={[s.notice, { color: c.warning }]}>{notice}</Text> : null}
        {chat && !chat.can_post ? (
          <Text style={[s.closed, { color: c.textMuted }]}>{chat.is_closed ? 'This chat is closed.' : 'You can read this chat but not reply to it.'}</Text>
        ) : (
          <InboxComposer
            colors={c}
            placeholder="Type a message"
            onSendText={sendText}
            onSendVoice={(uri) => sendVoice(uri)}
            leftAccessory={chat?.type === 'ASSISTANT' ? undefined : (
              <TouchableOpacity onPress={sendPhoto} hitSlop={8} accessibilityLabel="Send a photo" style={{ paddingHorizontal: 6 }}>
                <Paperclip size={20} color={c.textMuted} />
              </TouchableOpacity>
            )}
          />
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
  quick: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  closed: { textAlign: 'center', padding: 14, fontSize: 13 },
});
