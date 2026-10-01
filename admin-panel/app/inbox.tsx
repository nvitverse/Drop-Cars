// Unified inbox: every customer / fleet owner / driver / vendor / booking chat plus internal team chats, in one list
// with filter chips. Opens at /inbox (the older Chats tab keeps working until the apps are all on the new API).
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bot, Car, Headset, Search, UserPlus, Users, X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  chatApi, FILTERS, InboxChat, InboxFilter, matchesFilter, StaffMember, timeLabel,
} from '@/services/chatApi';

const POLL_MS = 12000;

export default function InboxScreen() {
  const { themeColors: c } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<InboxChat[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('ALL');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems((await chatApi.list('all')).filter((i) => i.type !== 'ASSISTANT'));
    } catch (e: any) {
      setError(e?.message || 'Could not load chats.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, POLL_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    FILTERS.forEach((f) => { out[f.key] = items.filter((i) => matchesFilter(i, f.key)).reduce((n, i) => n + i.unread, 0); });
    return out;
  }, [items]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => matchesFilter(i, filter) && (!needle
      || i.title.toLowerCase().includes(needle)
      || (i.last_message || '').toLowerCase().includes(needle)
      || i.participants.some((p) => (p.name || '').toLowerCase().includes(needle))
      || (i.order_id != null && String(i.order_id).includes(needle))));
  }, [items, filter, q]);

  const openRoom = (id: string, title: string) => router.push({ pathname: '/inbox-room', params: { id, title } } as any);

  const openAssistant = async () => {
    try {
      const chat = await chatApi.openAssistant();
      openRoom(chat.id, 'Assistant');
    } catch (e: any) {
      setError(e?.message || 'Could not open the assistant.');
    }
  };

  const openPicker = async () => {
    setPicker(true);
    setSelected([]);
    setGroupTitle('');
    try { setTeam(await chatApi.staffDirectory()); } catch (e: any) { setError(e?.message || 'Could not load the team.'); }
  };

  const startChat = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const chat = selected.length === 1
        ? await chatApi.openStaffDirect(selected[0])
        : await chatApi.openStaffGroup(groupTitle.trim() || 'Team', selected);
      setPicker(false);
      openRoom(chat.id, chat.title);
    } catch (e: any) {
      setError(e?.message || 'Could not start the chat.');
    } finally {
      setBusy(false);
    }
  };

  const icon = (t: InboxChat['type']) =>
    t === 'SUPPORT' ? <Headset size={18} color={c.primary} /> : t === 'BOOKING' ? <Car size={18} color={c.primary} /> : <Users size={18} color={c.primary} />;

  const subtitle = (i: InboxChat) => {
    const names = i.participants.map((p) => p.name).filter(Boolean).slice(0, 3).join(', ');
    return i.type === 'BOOKING' && i.order_id ? `Booking #${i.order_id}${names ? ` - ${names}` : ''}` : names;
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats' as any))} hitSlop={10} accessibilityLabel="Back">
          <ArrowLeft size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: c.text }]}>Inbox</Text>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <TouchableOpacity onPress={openAssistant} hitSlop={10} accessibilityLabel="Ask the assistant">
            <Bot size={22} color={c.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openPicker} hitSlop={10} accessibilityLabel="New team chat">
            <UserPlus size={22} color={c.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.search, { backgroundColor: c.inputBg, borderColor: c.border }]}>
        <Search size={16} color={c.textMuted} />
        <TextInput style={[s.searchInput, { color: c.text }]} value={q} onChangeText={setQ} placeholder="Search name, booking # or message" placeholderTextColor={c.textMuted} />
        {q ? <TouchableOpacity onPress={() => setQ('')}><X size={16} color={c.textMuted} /></TouchableOpacity> : null}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[s.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryTint : c.surface }]}>
                <Text style={[s.chipText, { color: on ? c.primary : c.textSecondary }]}>{f.label}</Text>
                {counts[f.key] > 0 ? <View style={[s.dot, { backgroundColor: c.primary }]}><Text style={s.dotText}>{counts[f.key] > 99 ? '99+' : counts[f.key]}</Text></View> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? <Text style={[s.error, { color: c.error }]}>{error}</Text> : null}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={[s.empty, { color: c.textMuted }]}>{q || filter !== 'ALL' ? 'No chats match this filter.' : 'No chats yet.'}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.row, { backgroundColor: c.surface, borderBottomColor: c.border }]} onPress={() => openRoom(item.id, item.title)}>
              <View style={[s.avatar, { backgroundColor: c.primaryTint }]}>{icon(item.type)}</View>
              <View style={{ flex: 1 }}>
                <View style={s.line}>
                  <Text style={[s.name, { color: c.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[s.time, { color: c.textMuted }]}>{timeLabel(item.last_at)}</Text>
                </View>
                <Text style={[s.sub, { color: c.textMuted }]} numberOfLines={1}>{subtitle(item)}</Text>
                <View style={s.line}>
                  <Text style={[s.preview, { color: item.unread ? c.text : c.textSecondary, fontWeight: item.unread ? '700' : '400' }]} numberOfLines={1}>
                    {item.last_message || 'No messages yet'}
                  </Text>
                  {item.needs_human ? <View style={[s.badge, { backgroundColor: c.error, paddingHorizontal: 8 }]}><Text style={s.badgeText}>Needs a person</Text></View> : null}
                  {item.unread > 0 ? <View style={[s.badge, { backgroundColor: c.primary }]}><Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text></View> : null}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <View style={s.modalBack}>
          <View style={[s.sheet, { backgroundColor: c.surface }]}>
            <View style={s.line}>
              <Text style={[s.name, { color: c.text, fontSize: 16 }]}>New team chat</Text>
              <TouchableOpacity onPress={() => setPicker(false)} hitSlop={10}><X size={20} color={c.textMuted} /></TouchableOpacity>
            </View>
            <Text style={[s.sub, { color: c.textMuted, marginBottom: 8 }]}>Pick one person for a direct chat, or several for a group. Only members and the director can read it.</Text>
            {selected.length > 1 ? (
              <TextInput style={[s.groupInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]} value={groupTitle} onChangeText={setGroupTitle} placeholder="Group name" placeholderTextColor={c.textMuted} maxLength={80} />
            ) : null}
            <ScrollView style={{ maxHeight: 320 }}>
              {team.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <TouchableOpacity key={m.id} style={[s.member, { borderBottomColor: c.border }]} onPress={() => setSelected((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}>
                    <View style={[s.check, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent' }]} />
                    <Text style={[s.name, { color: c.text, flex: 1 }]}>{m.name}</Text>
                    <Text style={[s.sub, { color: m.on_duty ? c.success : c.textMuted }]}>{m.role === 'DIRECTOR' ? 'Director' : m.on_duty ? 'On duty' : 'Off duty'}</Text>
                  </TouchableOpacity>
                );
              })}
              {!team.length ? <Text style={[s.empty, { color: c.textMuted }]}>No other team members found.</Text> : null}
            </ScrollView>
            <TouchableOpacity style={[s.cta, { backgroundColor: c.primary, opacity: selected.length && !busy ? 1 : 0.5 }]} disabled={!selected.length || busy} onPress={startChat}>
              {busy ? <ActivityIndicator color={c.onPrimary || '#fff'} /> : <Text style={[s.ctaText, { color: c.onPrimary || '#fff' }]}>{selected.length > 1 ? 'Create group' : 'Start chat'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, height: 40, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  dot: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { paddingHorizontal: 16, paddingBottom: 6, fontSize: 12.5 },
  empty: { textAlign: 'center', padding: 28, fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flexShrink: 1, fontSize: 14.5, fontWeight: '800' },
  time: { fontSize: 11 },
  sub: { fontSize: 11.5, marginTop: 1 },
  preview: { flex: 1, fontSize: 13, marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  modalBack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 8 },
  groupInput: { height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, marginBottom: 6 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  cta: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontSize: 15, fontWeight: '800' },
});
