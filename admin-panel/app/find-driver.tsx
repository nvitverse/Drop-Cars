import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  StatusBar as RNStatusBar,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Search, MapPin, Phone, Car, ChevronLeft, ChevronRight, Building2, Navigation, MessageCircle, IdCard, Route, X, ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

// Driver lookup: search ANY driver server-side (the old screen only searched
// the first 100 it had loaded, and its status filter compared the wrong
// field so every count showed 0), then one view answering "what is this
// driver doing right now" - live status, current trip with real last GPS
// fix, fleet driver, cars, recent trips. Backend: api/routes/driver_ops.py.

const STATUS_META: Record<string, { label: string; color: string }> = {
  ONLINE: { label: 'Online', color: '#059669' },
  DRIVING: { label: 'On trip', color: '#2563EB' },
  OFFLINE: { label: 'Offline', color: '#64748B' },
  BLOCKED: { label: 'Blocked', color: '#DC2626' },
  PROCESSING: { label: 'Verification pending', color: '#D97706' },
};

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function FindDriverScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Where are drivers / fleet vehicles vacant? The city list is every city someone marked vacant by hand (never a fixed list).
  const [cities, setCities] = useState<Array<{ city: string; count: number }>>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityPick, setCityPick] = useState<string | null>(null);
  const [cityText, setCityText] = useState('');
  const [vacant, setVacant] = useState<any[] | null>(null);
  const [vacantLoading, setVacantLoading] = useState(false);

  const card = { backgroundColor: themeColors.surface, borderColor: themeColors.border };

  const loadOnline = useCallback(async () => {
    try {
      const res = await apiService.getLiveFleetMap();
      setOnline(res?.fleet || []);
    } catch {
      setOnline([]);
    } finally {
      setOnlineLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadOnline(); }, [loadOnline]);

  const loadCities = useCallback(async () => {
    try {
      const res: any = await apiService.makeRequest('/admin/driver-lookup/cities');
      setCities(Array.isArray(res) ? res : []);
    } catch {
      setCities([]);
    }
  }, []);
  useEffect(() => { loadCities(); }, [loadCities]);

  const searchCity = async (city: string) => {
    const c = city.trim();
    if (!c) return;
    setVacantLoading(true);
    setCityOpen(false);
    try {
      const res: any = await apiService.makeRequest(`/admin/driver-lookup/search?city=${encodeURIComponent(c)}`);
      setVacant(Array.isArray(res) ? res : []);
    } catch {
      setVacant([]);
    } finally {
      setVacantLoading(false);
    }
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await apiService.searchDriverLookup(query));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openDriver = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await apiService.getDriverLookup(id));
    } catch {
      setDetail({ error: true });
    } finally {
      setDetailLoading(false);
    }
  };

  const statusPill = (s?: string) => {
    const m = STATUS_META[String(s || '').toUpperCase()] || { label: s || 'Unknown', color: '#64748B' };
    return (
      <View style={[styles.pill, { borderColor: m.color, backgroundColor: m.color + '1A' }]}>
        <Text style={[styles.pillText, { color: m.color }]}>{m.label}</Text>
      </View>
    );
  };

  const call = (p?: string) => p && Linking.openURL(`tel:${p}`);
  const whatsapp = (p?: string) => p && Linking.openURL(`https://wa.me/91${String(p).replace(/\D/g, '').slice(-10)}`);

  const renderDetail = () => {
    if (detailLoading) return <View style={[styles.box, card]}><ActivityIndicator color={themeColors.primary} /></View>;
    if (!detail) return null;
    if (detail.error) return <View style={[styles.box, card]}><Text style={{ color: themeColors.textSecondary }}>Could not load this driver.</Text></View>;
    const { driver: d, fleet_driver: f, cars, current_trip: t, recent_trips: recent, stats } = detail;
    return (
      <View style={{ gap: 10 }}>
        <View style={[styles.box, card]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: themeColors.text }]}>{d.name}</Text>
              <Text style={[styles.sub, { color: themeColors.textSecondary }]}>ID #{d.reg_id || '—'} · {d.phone}{d.city ? ` · ${d.city}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => setDetail(null)}><X size={18} color={themeColors.textSecondary} /></TouchableOpacity>
          </View>
          <View style={[styles.rowBetween, { marginTop: 8 }]}>
            {statusPill(d.status)}
            <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
              ⭐ {d.rating_count ? `${d.rating} (${d.rating_count})` : 'No ratings'} · {stats.completed} trips done · {stats.cancelled} cancelled
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#059669' }]} onPress={() => call(d.phone)}>
              <Phone size={14} color="#FFF" /><Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#16A34A' }]} onPress={() => whatsapp(d.phone)}>
              <MessageCircle size={14} color="#FFF" /><Text style={styles.actionText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: themeColors.primary }]} onPress={() => router.push({ pathname: '/account-documents', params: { accountId: d.id, accountType: 'driver', accountName: d.name } } as any)}>
              <IdCard size={14} color="#FFF" /><Text style={styles.actionText}>Documents</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
            Licence {d.licence_number || '—'} · {d.licence_status || '—'}{d.licence_expiry ? ` · valid till ${new Date(d.licence_expiry).toLocaleDateString('en-IN')}` : ''}
          </Text>
          {d.permanently_blocked && <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Permanently blocked</Text>}
        </View>

        <View style={[styles.box, card, t && { borderColor: '#93C5FD' }]}>
          <View style={styles.sectionHead}><Route size={15} color="#2563EB" /><Text style={[styles.sectionTitle, { color: themeColors.text }]}>Right now</Text></View>
          {t ? (
            <>
              <Text style={[styles.tripRoute, { color: themeColors.text }]}>{t.route || `Booking #${t.order_id}`}</Text>
              <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                #{t.order_id} · {t.assignment_status === 'DRIVING' ? 'Trip in progress' : 'Assigned, not started'} · Pickup {when(t.start_date_time)}
              </Text>
              <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                {t.customer_name || 'Customer'}{t.car_number ? ` · ${t.car_number}` : ''}
              </Text>
              <View style={styles.actions}>
                {t.last_lat && t.last_lng ? (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2563EB' }]} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${t.last_lat},${t.last_lng}`)}>
                    <Navigation size={14} color="#FFF" /><Text style={styles.actionText}>Live location · {when(t.location_updated_at)}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>No GPS fix yet - it appears once the driver opens the trip link.</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => router.push(`/trip-detail?orderId=${t.order_id}` as any)}>
                <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 6 }}>Open trip ›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Not on any trip right now.</Text>
          )}
        </View>

        <View style={[styles.box, card]}>
          <View style={styles.sectionHead}><Building2 size={15} color="#10B981" /><Text style={[styles.sectionTitle, { color: themeColors.text }]}>{d.is_owner_driver ? 'Fleet driver (self)' : 'Drives for'}</Text></View>
          <TouchableOpacity style={styles.rowBetween} onPress={() => router.push(`/fleet-owner-detail?ownerId=${f.id}` as any)}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: themeColors.text }]}>{f.name || '—'}</Text>
              <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                {f.phone || ''}{f.city ? ` · ${f.city}` : ''} · Wallet ₹{Number(f.wallet_balance || 0).toLocaleString('en-IN')}{f.tier === 'PREFERRED' ? ' · Trusted Partner' : ''}
              </Text>
            </View>
            <ChevronRight size={18} color={themeColors.textMuted} />
          </TouchableOpacity>
          {f.phone && (
            <TouchableOpacity style={[styles.smallBtn, { borderColor: themeColors.border }]} onPress={() => call(f.phone)}>
              <Phone size={13} color="#059669" /><Text style={{ color: '#059669', fontWeight: '700', fontSize: 12 }}>Call fleet driver</Text>
            </TouchableOpacity>
          )}
          {(cars || []).length > 0 && (
            <View style={{ marginTop: 8, gap: 4 }}>
              {cars.map((c: any) => (
                <View key={c.id} style={styles.carRow}>
                  <Car size={14} color={themeColors.textSecondary} />
                  <Text style={{ color: themeColors.text, fontSize: 12.5, flex: 1 }}>{c.car_number} · {c.car_name}{c.year ? ` (${c.year})` : ''}</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11.5 }}>{String(c.status || '').toLowerCase()}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.box, card]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Recent trips</Text>
          {(recent || []).length === 0 ? (
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No trips yet.</Text>
          ) : recent.map((r: any) => (
            <TouchableOpacity key={`${r.order_id}-${r.assignment_status}`} style={styles.tripRow} onPress={() => router.push(`/trip-detail?orderId=${r.order_id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: themeColors.text, fontSize: 12.5, fontWeight: '700' }} numberOfLines={1}>#{r.order_id} · {r.route || '—'}</Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 11.5 }}>{when(r.start_date_time)} · {String(r.assignment_status || '').toLowerCase()}</Text>
              </View>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const showingSearch = results !== null;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <ChevronLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Driver lookup</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Live status, current trip, location & who they drive for</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOnline(); }} />}
      >
        <View style={[styles.searchRow, card]}>
          <Search size={16} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Name, mobile number or driver ID"
            placeholderTextColor={themeColors.textMuted}
            value={query}
            onChangeText={(v) => { setQuery(v); if (!v.trim()) setResults(null); }}
            onSubmitEditing={runSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={runSearch} style={[styles.searchBtn, { backgroundColor: themeColors.primary }]}>
            {searching ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.searchBtnText}>Search</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.box, card]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Vacant by location</Text>
          <TouchableOpacity style={[styles.dropdown, { borderColor: themeColors.border }]} onPress={() => setCityOpen((v) => !v)} activeOpacity={0.7}>
            <MapPin size={15} color={themeColors.textSecondary} />
            <Text style={{ flex: 1, color: cityPick ? themeColors.text : themeColors.textMuted, fontSize: 13.5 }}>
              {cityPick || (cities.length ? `Choose a city (${cities.length} with vacant vehicles)` : 'No vacant updates yet')}
            </Text>
            <ChevronDown size={16} color={themeColors.textSecondary} />
          </TouchableOpacity>
          {cityOpen && (
            <ScrollView style={[styles.dropdownList, { borderColor: themeColors.border, backgroundColor: themeColors.background }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {cities.length === 0 ? (
                <Text style={{ color: themeColors.textMuted, padding: 10, fontSize: 12.5 }}>No driver or fleet owner has marked a vehicle vacant yet.</Text>
              ) : cities.map((c) => (
                <TouchableOpacity key={c.city} style={styles.dropdownRow} onPress={() => { setCityPick(c.city); setCityText(''); searchCity(c.city); }}>
                  <Text style={{ flex: 1, color: themeColors.text, fontSize: 13.5 }}>{c.city}</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '700' }}>{c.count}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={[styles.searchRow, { borderColor: themeColors.border, marginTop: 8 }]}>
            <Search size={15} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="or type any location"
              placeholderTextColor={themeColors.textMuted}
              value={cityText}
              onChangeText={(v) => { setCityText(v); if (!v.trim() && !cityPick) setVacant(null); }}
              onSubmitEditing={() => { setCityPick(null); searchCity(cityText); }}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => { setCityPick(null); searchCity(cityText); }} style={[styles.searchBtn, { backgroundColor: themeColors.primary }]}>
              {vacantLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.searchBtnText}>Find</Text>}
            </TouchableOpacity>
          </View>
          {vacant !== null && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={[styles.listLabel, { color: themeColors.textSecondary }]}>
                {vacant.length} VACANT IN {(cityPick || cityText).toUpperCase()}{'  ·  '}
                <Text onPress={() => { setVacant(null); setCityPick(null); setCityText(''); }} style={{ color: themeColors.primary }}>Clear</Text>
              </Text>
              {vacant.length === 0 && <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No vehicle is marked vacant there. Pick another city from the list.</Text>}
              {vacant.map((r, i) => (
                <View key={`${r.id}-${r.car_number || i}`} style={[styles.vacantRow, { borderColor: themeColors.border }]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => r.kind === 'DUTY' && openDriver(r.id)} activeOpacity={r.kind === 'DUTY' ? 0.7 : 1}>
                    <Text style={[styles.rowTitle, { color: themeColors.text }]}>{r.name}{r.car_number ? `  ·  ${r.car_number}` : ''}</Text>
                    <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                      {r.phone}{r.fleet_driver_name && r.fleet_driver_name !== r.name ? ` · ${r.fleet_driver_name}` : ''}{r.matched_city ? ` · vacant in ${r.matched_city}` : ''}
                    </Text>
                    {r.vacant_updated_at ? <Text style={[styles.meta, { color: themeColors.textMuted }]}>Updated {when(r.vacant_updated_at)}</Text> : null}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: '#059669' }]} onPress={() => call(r.phone)}><Phone size={14} color="#FFF" /></TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: '#16A34A' }]} onPress={() => whatsapp(r.phone)}><MessageCircle size={14} color="#FFF" /></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {renderDetail()}

        {showingSearch ? (
          <>
            <Text style={[styles.listLabel, { color: themeColors.textSecondary }]}>{results!.length} MATCH{results!.length === 1 ? '' : 'ES'}</Text>
            {results!.length === 0 && <View style={[styles.box, card]}><Text style={{ color: themeColors.textSecondary }}>No driver found. Try the mobile number or driver ID.</Text></View>}
            {results!.map((r) => (
              <TouchableOpacity key={r.id} style={[styles.listItem, card]} onPress={() => openDriver(r.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: themeColors.text }]}>{r.name}</Text>
                  <Text style={[styles.meta, { color: themeColors.textSecondary }]}>#{r.reg_id || '—'} · {r.phone}{r.fleet_driver_name ? ` · ${r.fleet_driver_name}` : ''}</Text>
                </View>
                {statusPill(r.status)}
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.listLabel, { color: themeColors.textSecondary }]}>ONLINE OR ON A TRIP NOW · {online.length}</Text>
            {onlineLoading ? <ActivityIndicator color={themeColors.primary} /> : online.length === 0 ? (
              <View style={[styles.box, card]}><Text style={{ color: themeColors.textSecondary }}>No drivers online right now. Search above to look anyone up.</Text></View>
            ) : online.map((o) => (
              <TouchableOpacity key={o.id} style={[styles.listItem, card]} onPress={() => openDriver(o.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: themeColors.text }]}>{o.driver_name}</Text>
                  <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                    {o.phone}{o.vehicle_number && o.vehicle_number !== 'N/A' ? ` · ${o.vehicle_number}` : ''}{o.active_trip_id ? ` · Trip #${o.active_trip_id}` : ''}
                  </Text>
                </View>
                {o.latitude != null && <MapPin size={15} color="#2563EB" />}
                {statusPill(o.status === 'ON_TRIP' ? 'DRIVING' : 'ONLINE')}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingLeft: 12, paddingRight: 6, paddingVertical: 5 },
  searchInput: { flex: 1, fontSize: 13.5, paddingVertical: 6 },
  searchBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 70, alignItems: 'center' },
  searchBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12.5 },
  listLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 4 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 2 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionTitle: { fontSize: 13.5, fontWeight: '800' },
  tripRoute: { fontSize: 14, fontWeight: '800' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 6 },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 6 },
  dropdownList: { maxHeight: 220, borderWidth: 1, borderRadius: 10, marginTop: 6 },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  vacantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  iconBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
});
