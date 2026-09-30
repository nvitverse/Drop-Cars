import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, DollarSign, Plus, Trash2 } from 'lucide-react-native';
import { tariffsApi, WebsiteTariff } from '@/services/tariffsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Core per-vehicle-type, per-trip-type rate management - mirrors the core
// of admin/pages/tariffs.php on the website (same data/tariffs.json store,
// reached via the tariffsApi shared-key bridge). Dynamic/promo pricing
// (date-range scheduling) is NOT covered here - website-only for now.
const VEHICLE_TYPES = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
const TRIP_TYPES: Array<{ value: WebsiteTariff['trip_type']; label: string }> = [
  { value: 'oneway', label: 'One-Way' },
  { value: 'round', label: 'Round Trip' },
];

const emptyForm = (): Partial<WebsiteTariff> => ({
  vehicle_type: 'SEDAN',
  per_km_rate: 0,
  driver_beta: 0,
  trip_type: 'oneway',
  passengers: 0,
  luggage: 0,
  is_ac: true,
  vehicle_model: '',
});

export default function TariffsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [tariffs, setTariffs] = useState<WebsiteTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBrand, setActiveBrand] = useState<'dropcars' | 'airporttaxi'>('dropcars');
  const [airportTariffs, setAirportTariffs] = useState<any>(null);
  const [savingAirport, setSavingAirport] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<Partial<WebsiteTariff>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, airportData] = await Promise.all([
        tariffsApi.list(),
        tariffsApi.getAirportTaxiTariffs().catch(() => ({ success: false, airporttaxi_tariffs: null })),
      ]);
      setTariffs(data.tariffs || []);
      if (airportData?.airporttaxi_tariffs) {
        setAirportTariffs(airportData.airporttaxi_tariffs);
      }
    } catch (error: any) {
      console.warn('Failed to load tariffs:', error);
      showToast(error?.message || 'Failed to load tariffs', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const saveAirportTariffsHandler = async () => {
    if (!airportTariffs) return;
    setSavingAirport(true);
    try {
      await tariffsApi.saveAirportTaxiTariffs(airportTariffs);
      showToast('AirportTaxi tariffs updated live!', 'success');
      Alert.alert('Saved!', 'AirportTaxi.International tariffs saved — the live site and new quotes will use these rates immediately.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save AirportTaxi tariffs');
    } finally {
      setSavingAirport(false);
    }
  };

  const openNew = () => {
    setForm(emptyForm());
    setFormVisible(true);
  };

  const openEdit = (tariff: WebsiteTariff) => {
    setForm({ ...tariff });
    setFormVisible(true);
  };

  const handleDelete = (tariff: WebsiteTariff) => {
    Alert.alert('Delete Tariff', `Remove the ${tariff.vehicle_type} / ${tariff.trip_type} rate? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await tariffsApi.remove(tariff.id);
            setTariffs((prev) => prev.filter((t) => t.id !== tariff.id));
            showToast('Tariff removed', 'success');
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to remove tariff');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.vehicle_type || !form.per_km_rate || form.per_km_rate <= 0) {
      Alert.alert('Required', 'Vehicle type and a per-KM rate greater than 0 are required.');
      return;
    }
    setSaving(true);
    try {
      await tariffsApi.save(form as any);
      setFormVisible(false);
      showToast('Tariff saved - live for new fare quotes immediately', 'success');
      load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save tariff');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Tariffs & Pricing</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Drop Cars & Airport Taxi live sync</Text>
        </View>
        <ThemeToggle size={20} />
        {activeBrand === 'dropcars' && (
          <TouchableOpacity style={styles.newBtn} onPress={openNew}>
            <Plus size={18} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* BRAND SELECTOR TABS */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 10 }}>
        <TouchableOpacity
          style={[
            { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
            activeBrand === 'dropcars'
              ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
              : { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          ]}
          onPress={() => setActiveBrand('dropcars')}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeBrand === 'dropcars' ? '#FFF' : themeColors.text }}>
            🚖 Drop Cars ({tariffs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
            activeBrand === 'airporttaxi'
              ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
              : { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          ]}
          onPress={() => setActiveBrand('airporttaxi')}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeBrand === 'airporttaxi' ? '#FFF' : themeColors.text }}>
            ✈️ Airport Taxi Sub-Brand
          </Text>
        </TouchableOpacity>
      </View>

      {activeBrand === 'airporttaxi' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <View style={[styles.noticeBar, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: '#6366F1', borderWidth: 1, marginBottom: 14 }]}>
            <Text style={[styles.noticeText, { color: isDark ? '#C7D2FE' : '#312E81' }]}>
              ✈️ AirportTaxi.International Tariffs — edits take effect immediately on live airport quotes and website bookings.
            </Text>
          </View>

          {airportTariffs ? (
            <View style={{ gap: 16 }}>
              {/* GLOBAL GST */}
              <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, marginBottom: 8 }}>Global GST / Tax %</Text>
                <TextInput
                  style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
                  value={String(airportTariffs.gstPercent ?? 5)}
                  keyboardType="numeric"
                  onChangeText={(v) => setAirportTariffs((prev: any) => ({ ...prev, gstPercent: Number(v) || 0 }))}
                />
              </View>

              {/* LOCAL AIRPORT TRANSFER */}
              <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, gap: 12 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>Local Airport Transfer (Included {airportTariffs.local?.includedKm || 20} KM)</Text>
                {['SEDAN', 'SUV', 'INNOVA', 'CRYSTA', 'HYCROSS'].map((vk) => (
                  <View key={vk} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, width: 80 }}>{vk}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Base Price (₹)</Text>
                        <TextInput
                          style={[styles.input, { height: 36, fontSize: 12, color: themeColors.text, borderColor: themeColors.border }]}
                          value={String(airportTariffs.local?.minPrice?.[vk] ?? '')}
                          keyboardType="numeric"
                          onChangeText={(v) =>
                            setAirportTariffs((prev: any) => ({
                              ...prev,
                              local: {
                                ...prev.local,
                                minPrice: { ...(prev.local?.minPrice || {}), [vk]: Number(v) || 0 },
                              },
                            }))
                          }
                        />
                      </View>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Extra ₹/KM</Text>
                        <TextInput
                          style={[styles.input, { height: 36, fontSize: 12, color: themeColors.text, borderColor: themeColors.border }]}
                          value={String(airportTariffs.local?.extraKmRate?.[vk] ?? '')}
                          keyboardType="numeric"
                          onChangeText={(v) =>
                            setAirportTariffs((prev: any) => ({
                              ...prev,
                              local: {
                                ...prev.local,
                                extraKmRate: { ...(prev.local?.extraKmRate || {}), [vk]: Number(v) || 0 },
                              },
                            }))
                          }
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* OUTSTATION AIRPORT */}
              <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, gap: 12 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>Outstation Airport (Min {airportTariffs.outstation?.minKm || 130} KM)</Text>
                {['SEDAN', 'SUV', 'INNOVA', 'CRYSTA', 'HYCROSS'].map((vk) => (
                  <View key={`out-${vk}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, width: 80 }}>{vk}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Rate ₹/KM</Text>
                        <TextInput
                          style={[styles.input, { height: 36, fontSize: 12, color: themeColors.text, borderColor: themeColors.border }]}
                          value={String(airportTariffs.outstation?.perKmRate?.[vk] ?? '')}
                          keyboardType="numeric"
                          onChangeText={(v) =>
                            setAirportTariffs((prev: any) => ({
                              ...prev,
                              outstation: {
                                ...prev.outstation,
                                perKmRate: { ...(prev.outstation?.perKmRate || {}), [vk]: Number(v) || 0 },
                              },
                            }))
                          }
                        />
                      </View>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Driver Bata (₹)</Text>
                        <TextInput
                          style={[styles.input, { height: 36, fontSize: 12, color: themeColors.text, borderColor: themeColors.border }]}
                          value={String(airportTariffs.outstation?.driverAllowance?.[vk] ?? '')}
                          keyboardType="numeric"
                          onChangeText={(v) =>
                            setAirportTariffs((prev: any) => ({
                              ...prev,
                              outstation: {
                                ...prev.outstation,
                                driverAllowance: { ...(prev.outstation?.driverAllowance || {}), [vk]: Number(v) || 0 },
                              },
                            }))
                          }
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={{ backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 }}
                onPress={saveAirportTariffsHandler}
                disabled={savingAirport}>
                {savingAirport ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '800' }}>💾 Save Airport Taxi Tariffs</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator size="large" color={themeColors.primary} />
          )}
        </ScrollView>
      ) : (
        <FlatList
        data={tariffs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <DollarSign size={32} color={themeColors.textMuted} />
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No tariffs yet. Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={styles.cardTop}>
              <Text style={[styles.vehicleType, { color: themeColors.text }]}>{item.vehicle_type}</Text>
              <View style={styles.tripBadge}>
                <Text style={styles.tripBadgeText}>
                  {TRIP_TYPES.find((t) => t.value === item.trip_type)?.label || item.trip_type}
                </Text>
              </View>
            </View>
            {item.vehicle_model ? <Text style={[styles.meta, { color: themeColors.textSecondary }]}>{item.vehicle_model}</Text> : null}
            <View style={styles.rateRow}>
              <View>
                <Text style={[styles.rateValue, { color: themeColors.text }]}>₹{item.per_km_rate}/km</Text>
                <Text style={[styles.rateLabel, { color: themeColors.textSecondary }]}>Per-KM Rate</Text>
              </View>
              <View>
                <Text style={[styles.rateValue, { color: themeColors.text }]}>₹{item.driver_beta}</Text>
                <Text style={[styles.rateLabel, { color: themeColors.textSecondary }]}>Driver Bata</Text>
              </View>
              <View>
                <Text style={[styles.rateValue, { color: themeColors.text }]}>{item.passengers} / {item.luggage}</Text>
                <Text style={[styles.rateLabel, { color: themeColors.textSecondary }]}>Pax / Luggage</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Trash2 size={15} color="#EF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      )}

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{form.id ? 'Edit Tariff' : 'New Tariff'}</Text>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Vehicle Type</Text>
              <View style={styles.chipRow}>
                {VEHICLE_TYPES.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.vehicle_type === v && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, vehicle_type: v }))}
                  >
                    <Text style={[styles.chipText, { color: themeColors.textSecondary }, form.vehicle_type === v && styles.chipTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Trip Type</Text>
              <View style={styles.chipRow}>
                {TRIP_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.trip_type === t.value && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, trip_type: t.value }))}
                  >
                    <Text style={[styles.chipText, { color: themeColors.textSecondary }, form.trip_type === t.value && styles.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Per-KM Rate (₹)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. 14"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                value={form.per_km_rate != null ? String(form.per_km_rate) : ''}
                onChangeText={(v) => setForm((f) => ({ ...f, per_km_rate: parseFloat(v) || 0 }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Driver Bata (₹)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. 400"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                value={form.driver_beta != null ? String(form.driver_beta) : ''}
                onChangeText={(v) => setForm((f) => ({ ...f, driver_beta: parseFloat(v) || 0 }))}
              />

              <View style={styles.rowSplit}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Passengers</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    placeholder="4"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                    value={form.passengers != null ? String(form.passengers) : ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, passengers: parseInt(v, 10) || 0 }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Luggage</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    placeholder="3"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                    value={form.luggage != null ? String(form.luggage) : ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, luggage: parseInt(v, 10) || 0 }))}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Vehicle Model (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. Swift Dzire / Etios"
                placeholderTextColor={themeColors.textMuted}
                value={form.vehicle_model || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, vehicle_model: v }))}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Air-Conditioned</Text>
                <Switch
                  value={!!form.is_ac}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_ac: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]} onPress={() => setFormVisible(false)}>
                  <Text style={[styles.modalCancelButtonText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSaveButton, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSaveButtonText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBar: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
  },
  noticeText: { fontSize: 11.5, color: '#B45309', lineHeight: 16 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 30 },
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  vehicleType: { fontSize: 17, fontWeight: '800', color: '#1F2937' },
  tripBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tripBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#2563EB' },
  meta: { fontSize: 12.5, color: '#6B7280', marginBottom: 8 },
  rateRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  rateValue: { fontSize: 16, fontWeight: '800', color: '#059669' },
  rateLabel: { fontSize: 10.5, color: '#9CA3AF', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  deleteBtn: { position: 'absolute', top: 14, right: 14, padding: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  rowSplit: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  chipText: { fontSize: 12.5, color: '#1F2937', fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: { backgroundColor: '#F3F4F6' },
  modalCancelButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  modalSaveButton: { backgroundColor: colors.primary },
  modalSaveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
