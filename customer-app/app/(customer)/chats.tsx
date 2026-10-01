// Messages: the Drop Cars team + the chat of every booking, newest first, with unread badges.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Car, Headset } from 'lucide-react-native';
import { getPalette } from '@/constants/theme';
import { useScreenTheme } from '@/components/SafeArea';
import { ChatConversation, listConversations, timeLabel } from '@/services/chat';

export default function ChatsScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = styles(palette);
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listConversations());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load your messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  const support = items.find((c) => c.type === 'SUPPORT');
  const bookings = items.filter((c) => c.type === 'BOOKING');

  const row = (c: ChatConversation) => (
    <TouchableOpacity key={c.id} style={s.item} onPress={() => router.push({ pathname: '/(customer)/chat-room', params: { id: c.id, title: c.title } } as any)}>
      <View style={s.avatar}>{c.type === 'SUPPORT' ? <Headset size={18} color={palette.primaryBrand} /> : <Car size={18} color={palette.primaryBrand} />}</View>
      <View style={{ flex: 1 }}>
        <View style={s.line}>
          <Text style={s.title} numberOfLines={1}>{c.title}</Text>
          <Text style={s.time}>{timeLabel(c.last_at)}</Text>
        </View>
        <View style={s.line}>
          <Text style={[s.preview, c.unread > 0 && s.previewUnread]} numberOfLines={1}>{c.last_message || 'No messages yet'}</Text>
          {c.unread > 0 ? <View style={s.badge}><Text style={s.badgeText}>{c.unread > 99 ? '99+' : c.unread}</Text></View> : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Text style={s.headerTitle}>Messages</Text>
        <Text style={s.headerSub}>Drop Cars team and your trips</Text>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.primaryBrand} /></View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => row(item)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <View>
              {support ? row(support) : (
                <TouchableOpacity style={s.item} onPress={() => router.push({ pathname: '/(customer)/chat-room', params: { support: '1', title: 'Drop Cars Support' } } as any)}>
                  <View style={s.avatar}><Headset size={18} color={palette.primaryBrand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>Drop Cars Support</Text>
                    <Text style={s.preview}>Chat with our team - we reply here</Text>
                  </View>
                </TouchableOpacity>
              )}
              {error ? <Text style={s.error}>{error}</Text> : null}
              {bookings.length ? <Text style={s.section}>Your trips</Text> : null}
            </View>
          }
          ListEmptyComponent={!error ? <Text style={s.empty}>Chats for your trips appear here once a driver is assigned.</Text> : null}
        />
      )}
    </View>
  );
}

const styles = (p: ReturnType<typeof getPalette>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.background },
    header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: p.primaryBrand },
    headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    section: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: p.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.divider, backgroundColor: p.surface },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primaryGlow },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { flex: 1, fontSize: 14.5, fontWeight: '800', color: p.textPrimary },
    time: { fontSize: 11, color: p.textMuted },
    preview: { flex: 1, fontSize: 13, color: p.textMuted, marginTop: 2 },
    previewUnread: { color: p.textPrimary, fontWeight: '700' },
    badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: p.primaryBrand },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    error: { color: '#DC2626', fontSize: 12.5, padding: 14 },
    empty: { textAlign: 'center', color: p.textMuted, fontSize: 13, padding: 24 },
  });
