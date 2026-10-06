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
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [driverType, setDriverType] = useState<'ALL' | 'DUTY' | 'FLEET'>('ALL');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The location list is every city where a driver / fleet owner has marked a vehicle vacant (never a fixed list).
  const [cityList, setCityList] = useState<Array<{ city: string; count: number }>>([]);
  const [cityOpen, setCityOpen] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const res: any = await apiService.makeRequest('/admin/driver-lookup/cities');
        setCityList(Array.isArray(res) ? res : []);
      } catch {
        setCityList([]);
      }
    })();
  }, []);

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

  const runSearch = async (cityOverride?: string, typeOverride?: 'ALL' | 'DUTY' | 'FLEET') => {
    const activeCity = cityOverride !== undefined ? cityOverride : selectedCity;
    const activeType = typeOverride !== undefined ? typeOverride : driverType;

    if (!query.trim() && activeCity === 'ALL' && activeType === 'ALL') {
      setResults(null);
      return;
    }

    setSearching(true);
    try {
      const data = await apiService.searchDriverLookup({
        q: query.trim() || undefined,
        city: activeCity !== 'ALL' ? activeCity : undefined,
        driverType: activeType,
      });
      setResults(data || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setCityOpen(false);
    runSearch(city, driverType);
  };

  const handleTypeSelect = (type: 'ALL' | 'DUTY' | 'FLEET') => {
    setDriverType(type);
    runSearch(selectedCity, type);
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
  const openGps = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.name, { color: themeColors.text }]}>{d.name}</Text>
                <View style={[styles.badge, { backgroundColor: d.is_owner_driver ? '#8B5CF620' : '#3B82F620', borderColor: d.is_owner_driver ? '#8B5CF6' : '#3B82F6' }]}>
                  <Text style={[styles.badgeText, { color: d.is_owner_driver ? '#8B5CF6' : '#3B82F6' }]}>
                    {d.is_owner_driver ? 'Fleet Owner (Self)' : 'Duty Driver'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, { color: themeColors.textSecondary }]}>ID #{d.reg_id || '—'} · {d.phone}{d.city ? ` · 📍 ${d.city}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => setDetail(null)} style={{ padding: 4 }}><X size={20} color={themeColors.textSecondary} /></TouchableOpacity>
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
            {t?.last_lat && t?.last_lng && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2563EB' }]} onPress={() => openGps(t.last_lat, t.last_lng)}>
                <MapPin size={14} color="#FFF" /><Text style={styles.actionText}>GPS Pin</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
            Licence {d.licence_number || '—'} · {d.licence_status || '—'}{d.licence_expiry ? ` · valid till ${new Date(d.licence_expiry).toLocaleDateString('en-IN')}` : ''}
          </Text>
          {d.permanently_blocked && <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Permanently blocked</Text>}
        </View>

        <View style={[styles.box, card, t && { borderColor: '#93C5FD' }]}>
          <View style={styles.sectionHead}><Route size={15} color="#2563EB" /><Text style={[styles.sectionTitle, { color: themeColors.text }]}>Right now / Current Status</Text></View>
          {t ? (
            <>
              <Text style={[styles.tripRoute, { color: themeColors.text }]}>{t.route || `Booking #${t.order_id}`}</Text>
              <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                #{t.order_id} · {t.assignment_status === 'DRIVING' ? 'Trip in progress' : 'Assigned, not started'} · Pickup {when(t.start_date_time)}
              </Text>
              <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                Customer: {t.customer_name || 'Customer'} {t.customer_phone ? `(${t.customer_phone})` : ''}{t.car_number ? ` · Car: ${t.car_number}` : ''}
              </Text>
              <View style={styles.actions}>
                {t.last_lat && t.last_lng ? (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2563EB' }]} onPress={() => openGps(t.last_lat, t.last_lng)}>
                    <Navigation size={14} color="#FFF" /><Text style={styles.actionText}>Live GPS Fix · {when(t.location_updated_at)}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>No GPS fix yet - updates as soon as driver starts trip navigation.</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => router.push(`/trip-detail?orderId=${t.order_id}` as any)}>
                <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 6 }}>Open trip details ›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Not on any trip right now.</Text>
          )}
        </View>

        <View style={[styles.box, card]}>
          <View style={styles.sectionHead}><Building2 size={15} color="#10B981" /><Text style={[styles.sectionTitle, { color: themeColors.text }]}>{d.is_owner_driver ? 'Fleet driver (self)' : 'Associated Fleet Owner'}</Text></View>
          {f?.id ? (
            <TouchableOpacity style={styles.rowBetween} onPress={() => router.push(`/fleet-owner-detail?ownerId=${f.id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: themeColors.text }]}>{f.name || '—'}</Text>
                <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                  {f.phone || ''}{f.city ? ` · ${f.city}` : ''} · Wallet ₹{Number(f.wallet_balance || 0).toLocaleString('en-IN')}{f.tier === 'PREFERRED' ? ' · Trusted Partner' : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Text style={{ color: themeColors.textSecondary, fontSize: 12.5 }}>No fleet owner linked.</Text>
          )}
          {f?.phone && (
            <TouchableOpacity style={[styles.smallBtn, { borderColor: themeColors.border }]} onPress={() => call(f.phone)}>
              <Phone size={13} color="#059669" /><Text style={{ color: '#059669', fontWeight: '700', fontSize: 12 }}>Call Fleet Owner ({f.phone})</Text>
            </TouchableOpacity>
          )}
          {(cars || []).length > 0 && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 11.5, fontWeight: '700' }}>ATTACHED CARS ({cars.length})</Text>
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
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Recent trips ({recent?.length || 0})</Text>
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
          <Text style={[styles.title, { color: themeColors.text }]}>Driver lookup & Location</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Search duty/fleet drivers, fetch live GPS & area availability</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOnline(); if (showingSearch) runSearch(); }} />}
      >
        {/* Search bar */}
        <View style={[styles.searchRow, card]}>
          <Search size={16} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search name, phone, reg ID, or city..."
            placeholderTextColor={themeColors.textMuted}
            value={query}
            onChangeText={(v) => { setQuery(v); if (!v.trim() && selectedCity === 'ALL' && driverType === 'ALL') setResults(null); }}
            onSubmitEditing={() => runSearch()}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); if (selectedCity === 'ALL' && driverType === 'ALL') setResults(null); }} style={{ padding: 4 }}>
              <X size={15} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => runSearch()} style={[styles.searchBtn, { backgroundColor: themeColors.primary }]}>
            {searching ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.searchBtnText}>Search</Text>}
          </TouchableOpacity>
        </View>

        {/* Driver Type Filters: All / Duty Drivers / Fleet Owners */}
        <View style={styles.filterRow}>
          {(['ALL', 'DUTY', 'FLEET'] as const).map((t) => {
            const active = driverType === t;
            const label = t === 'ALL' ? 'All Drivers' : t === 'DUTY' ? 'Duty Drivers (Main)' : 'Fleet Owners';
            return (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, { backgroundColor: active ? themeColors.primary : themeColors.surface, borderColor: active ? themeColors.primary : themeColors.border }]}
                onPress={() => handleTypeSelect(t)}
              >
                <Text style={[styles.typeChipText, { color: active ? '#FFF' : themeColors.text }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Location dropdown: the cities where drivers / fleet owners marked a vehicle vacant (typing in the search box also finds them) */}
        <View>
          <TouchableOpacity
            style={[styles.cityChip, { alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 11, backgroundColor: themeColors.surface, borderColor: selectedCity === 'ALL' ? themeColors.border : themeColors.primary }]}
            onPress={() => setCityOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <MapPin size={13} color={themeColors.textSecondary} />
            <Text style={[styles.cityChipText, { flex: 1, color: themeColors.text, fontSize: 13.5 }]}>
              {selectedCity === 'ALL' ? `All Locations${cityList.length ? ` (${cityList.length} with vacant vehicles)` : ''}` : selectedCity}
            </Text>
            <ChevronDown size={16} color={themeColors.textSecondary} />
          </TouchableOpacity>
          {cityOpen && (
            <ScrollView style={{ maxHeight: 240, marginTop: 6, borderWidth: 1, borderColor: themeColors.border, borderRadius: 10, backgroundColor: themeColors.surface }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 11 }} onPress={() => handleCitySelect('ALL')}>
                <Text style={{ color: themeColors.text, fontSize: 13.5, fontWeight: selectedCity === 'ALL' ? '800' : '500' }}>All Locations</Text>
              </TouchableOpacity>
              {cityList.length === 0 ? (
                <Text style={{ color: themeColors.textMuted, padding: 12, fontSize: 12.5 }}>No driver or fleet owner has marked a vehicle vacant yet.</Text>
              ) : cityList.map((c) => (
                <TouchableOpacity key={c.city} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 }} onPress={() => handleCitySelect(c.city)}>
                  <Text style={{ flex: 1, color: themeColors.text, fontSize: 13.5, fontWeight: selectedCity === c.city ? '800' : '500' }}>{c.city}</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '700' }}>{c.count}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {renderDetail()}

        {showingSearch ? (
          <>
            <View style={styles.rowBetween}>
              <Text style={[styles.listLabel, { color: themeColors.textSecondary }]}>
                {results!.length} MATCH{results!.length === 1 ? '' : 'ES'} {selectedCity !== 'ALL' ? `IN ${selectedCity.toUpperCase()}` : ''}
              </Text>
              <TouchableOpacity onPress={() => { setResults(null); setQuery(''); setSelectedCity('ALL'); setDriverType('ALL'); }}>
                <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '700' }}>Clear filters</Text>
              </TouchableOpacity>
            </View>
            {results!.length === 0 && (
              <View style={[styles.box, card]}>
                <Text style={{ color: themeColors.textSecondary, textAlign: 'center', paddingVertical: 8 }}>
                  No drivers found matching your criteria. Try another city or mobile number.
                </Text>
              </View>
            )}
            {results!.map((r) => (
              <TouchableOpacity key={r.id} style={[styles.listItem, card]} onPress={() => openDriver(r.id)}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.rowTitle, { color: themeColors.text }]}>{r.name}</Text>
                    <View style={[styles.badge, { backgroundColor: r.is_owner_driver ? '#8B5CF620' : '#3B82F620', borderColor: r.is_owner_driver ? '#8B5CF6' : '#3B82F6' }]}>
                      <Text style={[styles.badgeText, { color: r.is_owner_driver ? '#8B5CF6' : '#3B82F6' }]}>
                        {r.is_owner_driver ? 'Fleet' : 'Duty'}
                      </Text>
                    </View>
                    {r.city ? (
                      <View style={[styles.badge, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}>
                        <Text style={[styles.badgeText, { color: '#059669' }]}>📍 {r.city}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                    #{r.reg_id || '—'} · {r.phone}{r.fleet_driver_name ? ` · Fleet: ${r.fleet_driver_name}` : ''}
                  </Text>
                  {r.last_lat && r.last_lng && (
                    <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '600' }}>
                      📍 Real-time GPS available
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {statusPill(r.status)}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {r.last_lat && r.last_lng && (
                      <TouchableOpacity onPress={() => openGps(r.last_lat, r.last_lng)} style={[styles.iconAction, { backgroundColor: '#2563EB' }]}>
                        <MapPin size={12} color="#FFF" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => call(r.phone)} style={[styles.iconAction, { backgroundColor: '#059669' }]}>
                      <Phone size={12} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => whatsapp(r.phone)} style={[styles.iconAction, { backgroundColor: '#16A34A' }]}>
                      <MessageCircle size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <View style={styles.rowBetween}>
              <Text style={[styles.listLabel, { color: themeColors.textSecondary }]}>ONLINE / ON DUTY NOW · {online.length}</Text>
              <TouchableOpacity onPress={loadOnline}>
                <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '700' }}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {onlineLoading ? <ActivityIndicator color={themeColors.primary} /> : online.length === 0 ? (
              <View style={[styles.box, card]}><Text style={{ color: themeColors.textSecondary }}>No drivers online right now. Search above to look anyone up by name or city.</Text></View>
            ) : online.map((o) => (
              <TouchableOpacity key={o.id} style={[styles.listItem, card]} onPress={() => openDriver(o.id)}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.rowTitle, { color: themeColors.text }]}>{o.driver_name}</Text>
                    {o.city ? (
                      <View style={[styles.badge, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}>
                        <Text style={[styles.badgeText, { color: '#059669' }]}>📍 {o.city}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
                    {o.phone}{o.vehicle_number && o.vehicle_number !== 'N/A' ? ` · ${o.vehicle_number}` : ''}{o.active_trip_id ? ` · Trip #${o.active_trip_id}` : ''}
                  </Text>
                  {o.latitude != null && (
                    <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '600' }}>
                      📍 GPS Fix Active
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {statusPill(o.status === 'ON_TRIP' ? 'DRIVING' : 'ONLINE')}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {o.latitude != null && o.longitude != null && (
                      <TouchableOpacity onPress={() => openGps(o.latitude, o.longitude)} style={[styles.iconAction, { backgroundColor: '#2563EB' }]}>
                        <MapPin size={12} color="#FFF" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => call(o.phone)} style={[styles.iconAction, { backgroundColor: '#059669' }]}>
                      <Phone size={12} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => whatsapp(o.phone)} style={[styles.iconAction, { backgroundColor: '#16A34A' }]}>
                      <MessageCircle size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
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
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  typeChip: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  typeChipText: { fontSize: 11.5, fontWeight: '700' },
  cityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  cityChipText: { fontSize: 11.5, fontWeight: '600' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
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
  iconAction: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionTitle: { fontSize: 13.5, fontWeight: '800' },
  tripRoute: { fontSize: 14, fontWeight: '800' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 6 },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
});
