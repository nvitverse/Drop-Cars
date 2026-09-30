import React, { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  MessageSquare,
  Search,
  Phone,
  Send,
  X,
  User,
  Headphones,
  ArrowLeft,
  ChevronRight,
  Package,
  Mic,
  Square,
  Play,
  Pause,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import VoiceNote from '@/components/chat/VoiceNote';
import ChatComposer from '@/components/chat/ChatComposer';
import { Card, StatusPill, EmptyState, SkeletonRow } from '@/components/ui';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

interface Msg {
  id: string | number;
  mine: boolean;
  sender_name?: string;
  text: string;
  voice_url?: string;
  created_at: string;
}


interface Row {
  key: string;
  kind: 'SUPPORT' | 'BOOKING';
  order_id?: number;
  title: string;
  subtitle: string;
  last_text: string | null;
  last_at: string | null;
  unread: number;
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

export default function AdminChatsScreen() {
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [onDuty, setOnDuty] = useState<boolean | null>(null);

  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceRecorderState = useAudioRecorderState(voiceRecorder);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  const load = useCallback(async () => {
    try {
      const [support, booking] = await Promise.all([
        apiService.getSupportThreads().catch(() => []),
        apiService.getBookingChatThreads().catch(() => []),
      ]);
      const supportRows: Row[] = (support || []).map((t: any) => ({
        key: t.thread_key,
        kind: 'SUPPORT',
        title: t.thread_name || 'Driver/Owner',
        subtitle: t.thread_role === 'OWNER' ? 'Fleet Driver' : t.thread_role === 'VENDOR' ? 'Vendor' : 'Duty Driver',
        last_text: t.last_text,
        last_at: t.last_at,
        unread: t.unread || 0,
      }));
      const bookingRows: Row[] = (booking || []).map((t: any) => ({
        key: `order-${t.order_id}`,
        kind: 'BOOKING',
        order_id: t.order_id,
        title: `#${t.order_id} • ${t.title || 'Booking'}`,
        subtitle: t.other_party || 'Driver',
        last_text: t.last_text,
        last_at: t.last_at,
        unread: t.unread || 0,
      }));
      const all = [...supportRows, ...bookingRows].sort(
        (a, b) => new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime()
      );
      setRows(all);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      apiService.getAdminProfile().then((p: any) => setOnDuty(Boolean(p?.is_on_duty))).catch(() => {});
      const interval = setInterval(load, 10000);
      return () => clearInterval(interval);
    }, [load])
  );

  useEffect(() => {
    if (!openRow) return;
    const interval = setInterval(async () => {
      try {
        if (openRow.kind === 'SUPPORT') {
          const res = await apiService.getSupportThread(openRow.key);
          const fresh = (res.messages || []).map((m: any) => ({ ...m, id: `s-${m.id}` }));
          setMessages((prev) => {
            const known = new Set(prev.map((p) => String(p.id)));
            const add = fresh.filter((m: Msg) => !known.has(String(m.id)));
            return add.length ? [...prev, ...add] : prev;
          });
        } else if (openRow.order_id) {
          const res = await apiService.getBookingChat(openRow.order_id);
          const fresh = (res.messages || []).map((m: any) => ({ ...m, id: `b-${m.id}` }));
          setMessages((prev) => {
            const known = new Set(prev.map((p) => String(p.id)));
            const add = fresh.filter((m: Msg) => !known.has(String(m.id)));
            return add.length ? [...prev, ...add] : prev;
          });
        }
      } catch {}
    }, 6000);
    return () => clearInterval(interval);
  }, [openRow?.key]);

  const openThread = async (row: Row) => {
    setOpenRow(row);
    setMessages([]);
    try {
      if (row.kind === 'SUPPORT') {
        const res = await apiService.getSupportThread(row.key);
        setMessages((res.messages || []).map((m: any) => ({ ...m, id: `s-${m.id}` })));
      } else if (row.order_id) {
        const res = await apiService.getBookingChat(row.order_id);
        setMessages((res.messages || []).map((m: any) => ({ ...m, id: `b-${m.id}` })));
      }
    } catch {}
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || !openRow || sending) return;
    setSending(true);
    setInput('');
    const optimistic: Msg = { id: `tmp-${Date.now()}`, mine: true, sender_name: 'You', text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      if (openRow.kind === 'SUPPORT') {
        await apiService.replySupportThread(openRow.key, text);
      } else if (openRow.order_id) {
        await apiService.sendBookingChatMessage(openRow.order_id, text);
      }
      load();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await voiceRecorder.prepareToRecordAsync();
      voiceRecorder.record();
    } catch {}
  };

  const stopAndSendVoiceRecording = async () => {
    if (!openRow) return;
    try {
      await voiceRecorder.stop();
      const uri = voiceRecorder.uri;
      if (uri) await sendVoiceUri(uri);
    } catch {}
  };

  const sendVoiceUri = async (uri: string) => {
    if (!openRow) return;
    try {
      setUploadingVoice(true);
      const upload = await apiService.uploadChatVoiceNote(uri, 'audio/m4a');
      const voiceUrl = upload.voice_url;
      const optimistic: Msg = { id: `tmp-${Date.now()}`, mine: true, sender_name: 'You', text: '🎤 Voice message', voice_url: voiceUrl, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, optimistic]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      if (openRow.kind === 'SUPPORT') {
        await apiService.replySupportThread(openRow.key, undefined, voiceUrl);
      } else if (openRow.order_id) {
        await apiService.sendBookingChatMessage(openRow.order_id, undefined, voiceUrl);
      }
      load();
    } catch {
    } finally {
      setUploadingVoice(false);
    }
  };

  const toggleOnDuty = async () => {
    const next = !(onDuty ?? false);
    setOnDuty(next);
    AsyncStorage.setItem('@admin_staff_on_duty_shift', String(next)).catch(() => {});
    try {
      const res = await apiService.setOnDuty(next);
      setOnDuty(res.is_on_duty);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', String(res.is_on_duty)).catch(() => {});
    } catch {
      setOnDuty(!next);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', String(!next)).catch(() => {});
    }
  };

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          (r.last_text || '').toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Chats</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{rows.length}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={toggleOnDuty}
          style={[styles.onDutyPill, { backgroundColor: onDuty ? themeColors.successLight : themeColors.surfaceAlt, borderColor: onDuty ? themeColors.success : themeColors.border }]}
        >
          <View style={[styles.onDutyDot, { backgroundColor: onDuty ? themeColors.success : themeColors.textMuted }]} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: onDuty ? themeColors.success : themeColors.textSecondary }}>
            {onDuty ? 'On Duty' : 'Off Duty'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={15} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search chats..."
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={themeColors.primary} />}
          renderItem={({ item }) => (
            <Card
              style={styles.chatCard}
              onPress={() => openThread(item)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: item.kind === 'SUPPORT' ? themeColors.primaryLight : themeColors.successLight }]}>
                  {item.kind === 'SUPPORT' ? <Headphones size={18} color={themeColors.primary} /> : <Package size={18} color={themeColors.success} />}
                </View>
                <View style={styles.rowMid}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: themeColors.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.rowSub, { color: themeColors.textSecondary }]}>
                    {item.last_text || item.subtitle}
                  </Text>
                </View>
                <View style={styles.rightColumn}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textMuted }}>{timeLabel(item.last_at)}</Text>
                  {item.unread > 0 ? (
                    <View style={[styles.unreadBadge, { backgroundColor: themeColors.primary }]}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  ) : (
                    <ChevronRight size={14} color={themeColors.textMuted} />
                  )}
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<MessageSquare size={36} color={themeColors.textMuted} />}
              title="No chats yet"
              message="Driver/owner support messages and booking chats will appear here."
            />
          }
        />
      )}

      {/* Thread Chat Modal */}
      <Modal visible={Boolean(openRow)} animationType="fade" onRequestClose={() => setOpenRow(null)}>
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.chatHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
              <TouchableOpacity onPress={() => setOpenRow(null)} style={{ padding: 4 }}>
                <ArrowLeft size={20} color={themeColors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: themeColors.text }]}>{openRow?.title}</Text>
                <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>{openRow?.subtitle}</Text>
              </View>
            </View>

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14, gap: 10 }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => (
                <View style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                  <View
                    style={[
                      styles.bubble,
                      item.mine
                        ? { backgroundColor: themeColors.primary }
                        : { backgroundColor: themeColors.surface, borderWidth: 1, borderColor: themeColors.border },
                    ]}
                  >
                    {!item.mine && item.sender_name ? (
                      <Text style={[styles.senderLabel, { color: themeColors.primary }]}>{item.sender_name}</Text>
                    ) : null}
                    {item.voice_url ? (
                      <VoiceNote uri={item.voice_url} mine={item.mine} tint={themeColors.primary} />
                    ) : (
                      <Text style={{ color: item.mine ? '#FFFFFF' : themeColors.text, fontSize: 13.5 }}>{item.text}</Text>
                    )}
                    <Text style={{ color: item.mine ? 'rgba(255,255,255,0.7)' : themeColors.textMuted, fontSize: 10, marginTop: 4 }}>
                      {timeLabel(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}
            />

            <ChatComposer
              colors={themeColors}
              placeholder="Type a reply..."
              onSendText={(t) => send(t)}
              onSendVoice={(uri) => sendVoiceUri(uri)}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: '700' },
  onDutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  onDutyDot: { width: 7, height: 7, borderRadius: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  loadingContainer: { padding: 16, gap: 8 },
  listContainer: { padding: 16, gap: 8, paddingBottom: 40 },
  chatCard: { marginBottom: 4, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowMid: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  rowSub: { fontSize: 12, fontWeight: '500' },
  rightColumn: { alignItems: 'flex-end', gap: 4 },
  unreadBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  senderLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { flex: 1, height: 38, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 13 },
  actionBtn: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
