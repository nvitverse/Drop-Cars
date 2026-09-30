import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Linking,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Car, Users, CalendarCheck, Wallet, Receipt, HandCoins, LayoutDashboard,
  Plus, ChevronLeft, ChevronRight, Phone, AlertTriangle, X, Wrench,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import DatePickButton from '@/components/DatePickButton';

// Drop Cars' own company fleet - real data, replacing (tabs)/our-fleet.tsx
// which was hardcoded demo cars/drivers that saved nothing (found 2026-09-30).
// Backend: api/routes/own_fleet.py.

type TabKey = 'overview' | 'cars' | 'drivers' | 'attendance' | 'payroll' | 'expenses' | 'advances';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'cars', label: 'Cars', icon: Car },
  { key: 'drivers', label: 'Drivers', icon: Users },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'payroll', label: 'Payroll', icon: Wallet },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'advances', label: 'Advances', icon: HandCoins },
];

const CAR_TYPES = [
  { label: 'Sedan', value: 'SEDAN_4_PLUS_1' },
  { label: 'Prime Sedan', value: 'NEW_SEDAN_2022_MODEL' },
  { label: 'SUV', value: 'SUV' },
  { label: 'Innova', value: 'INNOVA' },
  { label: 'Innova Crysta', value: 'INNOVA_CRYSTA' },
];
const CAR_STATUS_META: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Available', color: '#059669' },
  ON_TRIP: { label: 'On trip', color: '#2563EB' },
  MAINTENANCE: { label: 'Maintenance', color: '#D97706' },
};
const ATT_OPTIONS = [
  { key: 'P', label: 'Present', color: '#059669' },
  { key: 'A', label: 'Absent', color: '#DC2626' },
  { key: 'HD', label: 'Half day', color: '#D97706' },
  { key: 'L', label: 'Leave', color: '#6366F1' },
  { key: 'OT', label: 'Overtime', color: '#7C3AED' },
];
const EXPENSE_CATEGORIES = ['FUEL', 'SERVICE', 'REPAIR', 'TOLL', 'PARKING', 'INSURANCE', 'OTHER'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const money = (n?: number | null) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const showDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const showMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export default function OwnFleetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();

  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState<any>(null);
  const [cars, setCars] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  const [attDate, setAttDate] = useState(isoDate(new Date()));
  const [attendance, setAttendance] = useState<any[]>([]);
  const [savingAtt, setSavingAtt] = useState(false);

  const [month, setMonth] = useState(isoMonth(new Date()));
  const [payroll, setPayroll] = useState<any>(null);
  const [expenses, setExpenses] = useState<any>(null);
  const [advances, setAdvances] = useState<any[]>([]);

  const [modal, setModal] = useState<null | 'car' | 'driver' | 'expense' | 'advance'>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const card = { backgroundColor: themeColors.surface, borderColor: themeColors.border };
  const inputStyle = [styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }];

  const loadBase = useCallback(async () => {
    const [s, c, d] = await Promise.all([
      apiService.getOwnFleetSummary(),
      apiService.getOwnFleetCars(),
      apiService.getOwnFleetDrivers(),
    ]);
    setSummary(s);
    setCars(c || []);
    setDrivers(d || []);
  }, []);

  const loadTab = useCallback(async (t: TabKey) => {
    if (t === 'attendance') {
      const res = await apiService.getOwnFleetAttendance(attDate);
      setAttendance((res.drivers || []).map((r: any) => ({ ...r, status: r.status || null })));
    } else if (t === 'payroll') {
      setPayroll(await apiService.getOwnFleetPayroll(month));
    } else if (t === 'expenses') {
      setExpenses(await apiService.getOwnFleetExpenses(month));
    } else if (t === 'advances') {
      setAdvances(await apiService.getOwnFleetAdvances());
    }
  }, [attDate, month]);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadBase(), loadTab(tab)]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load Own Fleet data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadBase, loadTab, tab]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${attDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    if (d > new Date()) return;
    setAttDate(isoDate(d));
  };
  const shiftMonth = (delta: number) => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    if (d > new Date()) return;
    setMonth(isoMonth(d));
  };

  const openModal = (kind: 'car' | 'driver' | 'expense' | 'advance', initial: any = {}) => {
    const defaults: Record<string, any> = {
      car: { car_type: 'SEDAN_4_PLUS_1', status: 'AVAILABLE' },
      driver: { salary_type: 'MONTHLY', base_salary: '20000', per_trip_bata: '0', ot_rate_per_hour: '0', daily_wage: '0' },
      expense: { category: 'FUEL' },
      advance: {},
    };
    setForm({ ...defaults[kind], ...initial });
    setModal(kind);
  };

  const num = (v: any) => (v === '' || v == null ? undefined : parseInt(String(v), 10) || 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal === 'car') {
        if (!form.name?.trim() || !form.car_number?.trim()) throw new Error('Enter the car model and number');
        const payload = {
          name: form.name, car_number: form.car_number, car_type: form.car_type, status: form.status,
          insurance_expiry: form.insurance_expiry || null, fc_expiry: form.fc_expiry || null,
          permit_expiry: form.permit_expiry || null, odometer_km: num(form.odometer_km),
          next_service_km: num(form.next_service_km), notes: form.notes || null,
        };
        if (form.id) await apiService.updateOwnFleetCar(form.id, payload);
        else await apiService.createOwnFleetCar(payload);
      } else if (modal === 'driver') {
        if (!form.name?.trim() || !form.phone?.trim()) throw new Error('Enter the driver name and phone');
        const payload = {
          name: form.name, phone: form.phone, salary_type: form.salary_type,
          base_salary: num(form.base_salary) || 0, daily_wage: num(form.daily_wage) || 0,
          per_trip_bata: num(form.per_trip_bata) || 0, ot_rate_per_hour: num(form.ot_rate_per_hour) || 0,
          assigned_car_id: form.assigned_car_id || null, licence_number: form.licence_number || null,
          licence_expiry: form.licence_expiry || null,
        };
        if (form.id) await apiService.updateOwnFleetDriver(form.id, payload);
        else await apiService.createOwnFleetDriver(payload);
      } else if (modal === 'expense') {
        if (!num(form.amount)) throw new Error('Enter the amount');
        await apiService.addOwnFleetExpense({
          category: form.category, amount: num(form.amount), car_id: form.car_id || null,
          date: form.date || undefined, note: form.note || null,
        });
      } else if (modal === 'advance') {
        if (!form.driver_id) throw new Error('Choose a driver');
        if (!num(form.amount)) throw new Error('Enter the amount');
        await apiService.recordOwnFleetAdvance({ driver_id: form.driver_id, amount: num(form.amount)!, note: form.note || undefined });
      }
      setModal(null);
      await loadAll();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again');
    } finally {
      setSaving(false);
    }
  };

  const setCarStatus = (c: any) => {
    Alert.alert(c.name, 'Change status', [
      ...Object.entries(CAR_STATUS_META).map(([k, m]) => ({
        text: m.label,
        onPress: async () => {
          try {
            await apiService.updateOwnFleetCar(c.id, { status: k });
            await loadAll();
          } catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const deactivate = (kind: 'car' | 'driver', item: any) => {
    Alert.alert(`Remove ${item.name}?`, 'It will be hidden from the active list. Past attendance, expenses and payroll stay intact.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            if (kind === 'car') await apiService.updateOwnFleetCar(item.id, { is_active: false });
            else await apiService.updateOwnFleetDriver(item.id, { is_active: false });
            await loadAll();
          } catch (e: any) { Alert.alert('Error', e?.message || 'Failed'); }
        },
      },
    ]);
  };

  const setAtt = (driverId: string, patch: any) => {
    setAttendance((prev) => prev.map((r) => (r.driver_id === driverId ? { ...r, ...patch } : r)));
  };

  const saveAttendance = async () => {
    const records = attendance.filter((r) => r.status).map((r) => ({
      driver_id: r.driver_id, status: r.status, trips_count: parseInt(String(r.trips_count || 0), 10) || 0,
      ot_hours: r.status === 'OT' ? parseInt(String(r.ot_hours || 0), 10) || 0 : 0,
    }));
    if (records.length === 0) {
      Alert.alert('Nothing to save', 'Mark at least one driver first.');
      return;
    }
    setSavingAtt(true);
    try {
      const res = await apiService.markOwnFleetAttendance(attDate, records);
      Alert.alert('Saved', `Attendance saved for ${res.saved} driver${res.saved === 1 ? '' : 's'}.`);
      await loadAll();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again');
    } finally {
      setSavingAtt(false);
    }
  };

  const paySalary = (row: any) => {
    const pay = async (via: string) => {
      try {
        const res = await apiService.payOwnFleetSalary(row.driver_id, month, via);
        Alert.alert('Salary marked paid', `${row.name}: ${money(res.net_paid)} via ${via}`);
        await loadAll();
      } catch (e: any) {
        Alert.alert('Could not mark paid', e?.message || 'Please try again');
      }
    };
    Alert.alert(`Pay ${row.name}`, `${showMonth(month)} net salary ${money(row.net_payable)}. How was it paid?`, [
      { text: 'Cash', onPress: () => pay('CASH') },
      { text: 'UPI', onPress: () => pay('UPI') },
      { text: 'Bank', onPress: () => pay('BANK') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const carTypeLabel = (v: string) => CAR_TYPES.find((c) => c.value === v)?.label || v;

  const Chip = ({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, {
        borderColor: active ? (color || themeColors.primary) : themeColors.border,
        backgroundColor: active ? (color || themeColors.primary) : isDark ? '#1E293B' : '#F8FAFC',
      }]}
    >
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : themeColors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const StatTile = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
    <View style={[styles.statTile, card]}>
      <Text style={[styles.statValue, { color: tone || themeColors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{label}</Text>
    </View>
  );

  const Stepper = ({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) => (
    <View style={[styles.stepper, card]}>
      <TouchableOpacity onPress={onPrev} style={styles.stepBtn}><ChevronLeft size={18} color={themeColors.text} /></TouchableOpacity>
      <Text style={[styles.stepLabel, { color: themeColors.text }]}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.stepBtn}><ChevronRight size={18} color={themeColors.text} /></TouchableOpacity>
    </View>
  );

  const Empty = ({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) => (
    <View style={[styles.empty, card]}>
      <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>{text}</Text>
      {action && onPress && (
        <TouchableOpacity onPress={onPress} style={[styles.primaryBtn, { backgroundColor: themeColors.primary, marginTop: 10 }]}>
          <Plus size={15} color="#FFF" /><Text style={styles.primaryBtnText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const attSummary = useMemo(() => ({
    marked: attendance.filter((r) => r.status).length,
    present: attendance.filter((r) => ['P', 'OT', 'HD'].includes(r.status)).length,
  }), [attendance]);

  const renderOverview = () => (
    <>
      <View style={styles.statGrid}>
        <StatTile label="Cars available" value={`${summary?.cars_available ?? 0} / ${summary?.cars_total ?? 0}`} tone="#059669" />
        <StatTile label="On trip" value={summary?.cars_on_trip ?? 0} tone="#2563EB" />
        <StatTile label="In maintenance" value={summary?.cars_maintenance ?? 0} tone="#D97706" />
        <StatTile label="Present today" value={`${summary?.present_today ?? 0} / ${summary?.drivers_total ?? 0}`} />
        <StatTile label="This month's expenses" value={money(summary?.month_expenses_total)} />
        <StatTile label="Advances outstanding" value={money(summary?.advances_outstanding)} tone={(summary?.advances_outstanding || 0) > 0 ? '#DC2626' : undefined} />
      </View>

      {summary && summary.drivers_total > 0 && summary.attendance_marked_today < summary.drivers_total && (
        <TouchableOpacity style={[styles.alertCard, { borderColor: '#FDE68A', backgroundColor: isDark ? '#422006' : '#FFFBEB' }]} onPress={() => setTab('attendance')}>
          <CalendarCheck size={18} color="#D97706" />
          <Text style={{ flex: 1, color: themeColors.text, fontSize: 13, fontWeight: '600' }}>
            Today's attendance marked for {summary.attendance_marked_today} of {summary.drivers_total} drivers - tap to mark
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>DOCUMENTS EXPIRING IN 30 DAYS</Text>
      {(summary?.expiring_documents || []).length === 0 ? (
        <Empty text="All car and driver documents are valid for the next 30 days." />
      ) : (
        (summary.expiring_documents as any[]).map((d, i) => (
          <View key={i} style={[styles.rowCard, card]}>
            <AlertTriangle size={16} color={d.expired ? '#DC2626' : '#D97706'} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: themeColors.text }]}>{d.document} · {d.name}</Text>
              <Text style={{ color: d.expired ? '#DC2626' : '#D97706', fontSize: 12, fontWeight: '700' }}>
                {d.expired ? 'Expired' : 'Expires'} {showDate(d.expires_on)}
              </Text>
            </View>
          </View>
        ))
      )}
    </>
  );

  const renderCars = () => (
    <>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]} onPress={() => openModal('car')}>
        <Plus size={15} color="#FFF" /><Text style={styles.primaryBtnText}>Add company car</Text>
      </TouchableOpacity>
      {cars.length === 0 ? <Empty text="No company cars yet." /> : cars.map((c) => {
        const meta = CAR_STATUS_META[c.status] || CAR_STATUS_META.AVAILABLE;
        return (
          <View key={c.id} style={[styles.itemCard, card]}>
            <View style={styles.itemTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: themeColors.text }]}>{c.name}</Text>
                <Text style={[styles.itemSub, { color: themeColors.textSecondary }]}>{c.car_number} · {carTypeLabel(c.car_type)}</Text>
              </View>
              <TouchableOpacity onPress={() => setCarStatus(c)} style={[styles.pill, { backgroundColor: meta.color + '1A', borderColor: meta.color }]}>
                <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.itemMeta, { color: themeColors.textSecondary }]}>
              Insurance: {c.insurance_expiry ? showDate(c.insurance_expiry) : '—'} · FC: {c.fc_expiry ? showDate(c.fc_expiry) : '—'} · Permit: {c.permit_expiry ? showDate(c.permit_expiry) : '—'}
            </Text>
            {(c.odometer_km || c.next_service_km) ? (
              <Text style={[styles.itemMeta, { color: themeColors.textSecondary }]}>
                Odometer {c.odometer_km ?? '—'} km · Next service {c.next_service_km ?? '—'} km
              </Text>
            ) : null}
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => openModal('car', c)}><Text style={[styles.link, { color: themeColors.primary }]}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => openModal('expense', { car_id: c.id, category: 'SERVICE' })}><Text style={[styles.link, { color: themeColors.primary }]}>Add expense</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => deactivate('car', c)}><Text style={[styles.link, { color: '#DC2626' }]}>Remove</Text></TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );

  const renderDrivers = () => (
    <>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]} onPress={() => openModal('driver')}>
        <Plus size={15} color="#FFF" /><Text style={styles.primaryBtnText}>Add company driver</Text>
      </TouchableOpacity>
      {drivers.length === 0 ? <Empty text="No company drivers yet." /> : drivers.map((d) => (
        <View key={d.id} style={[styles.itemCard, card]}>
          <View style={styles.itemTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: themeColors.text }]}>{d.name}</Text>
              <Text style={[styles.itemSub, { color: themeColors.textSecondary }]}>
                {d.phone}{d.assigned_car_number ? ` · ${d.assigned_car_number}` : ' · No car assigned'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${d.phone}`)} style={[styles.iconBtn, { borderColor: themeColors.border }]}>
              <Phone size={16} color="#059669" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.itemMeta, { color: themeColors.textSecondary }]}>
            {d.salary_type === 'DAILY' ? `${money(d.daily_wage)}/day` : `${money(d.base_salary)}/month`}
            {d.per_trip_bata ? ` · Bata ${money(d.per_trip_bata)}/trip` : ''}
            {d.ot_rate_per_hour ? ` · OT ${money(d.ot_rate_per_hour)}/hr` : ''}
          </Text>
          <Text style={[styles.itemMeta, { color: themeColors.textSecondary }]}>
            Licence: {d.licence_number || '—'}{d.licence_expiry ? ` (till ${showDate(d.licence_expiry)})` : ''}
          </Text>
          <View style={styles.itemActions}>
            <TouchableOpacity onPress={() => openModal('driver', { ...d, base_salary: String(d.base_salary), daily_wage: String(d.daily_wage), per_trip_bata: String(d.per_trip_bata), ot_rate_per_hour: String(d.ot_rate_per_hour) })}><Text style={[styles.link, { color: themeColors.primary }]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => openModal('advance', { driver_id: d.id })}><Text style={[styles.link, { color: themeColors.primary }]}>Give advance</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => deactivate('driver', d)}><Text style={[styles.link, { color: '#DC2626' }]}>Remove</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );

  const renderAttendance = () => (
    <>
      <Stepper label={showDate(attDate)} onPrev={() => shiftDay(-1)} onNext={() => shiftDay(1)} />
      {attendance.length === 0 ? <Empty text="Add company drivers first." action="Add driver" onPress={() => { setTab('drivers'); openModal('driver'); }} /> : (
        <>
          <View style={styles.attHeader}>
            <Text style={{ color: themeColors.textSecondary, fontSize: 12.5, fontWeight: '600' }}>
              Marked {attSummary.marked}/{attendance.length} · Present {attSummary.present}
            </Text>
            <TouchableOpacity onPress={() => setAttendance((prev) => prev.map((r) => (r.status ? r : { ...r, status: 'P' })))}>
              <Text style={[styles.link, { color: themeColors.primary }]}>Mark rest present</Text>
            </TouchableOpacity>
          </View>
          {attendance.map((r) => (
            <View key={r.driver_id} style={[styles.itemCard, card]}>
              <Text style={[styles.itemTitle, { color: themeColors.text }]}>{r.name}</Text>
              <View style={styles.chipRow}>
                {ATT_OPTIONS.map((o) => (
                  <Chip key={o.key} label={o.label} color={o.color} active={r.status === o.key} onPress={() => setAtt(r.driver_id, { status: o.key })} />
                ))}
              </View>
              {r.status && r.status !== 'A' && r.status !== 'L' && (
                <View style={styles.inlineInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>Trips today</Text>
                    <TextInput style={inputStyle} keyboardType="numeric" value={String(r.trips_count ?? 0)} onChangeText={(v) => setAtt(r.driver_id, { trips_count: v })} />
                  </View>
                  {r.status === 'OT' && (
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: themeColors.textSecondary }]}>OT hours</Text>
                      <TextInput style={inputStyle} keyboardType="numeric" value={String(r.ot_hours ?? 0)} onChangeText={(v) => setAtt(r.driver_id, { ot_hours: v })} />
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#059669', opacity: savingAtt ? 0.7 : 1 }]} onPress={saveAttendance} disabled={savingAtt}>
            {savingAtt ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryBtnText}>Save attendance</Text>}
          </TouchableOpacity>
        </>
      )}
    </>
  );

  const renderPayroll = () => (
    <>
      <Stepper label={showMonth(month)} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
      <View style={[styles.totalCard, card]}>
        <Text style={{ color: themeColors.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Total still due</Text>
        <Text style={{ color: themeColors.text, fontSize: 22, fontWeight: '800' }}>{money(payroll?.total_due)}</Text>
      </View>
      {(payroll?.drivers || []).length === 0 ? <Empty text="No company drivers yet." /> : (payroll.drivers as any[]).map((r) => (
        <View key={r.driver_id} style={[styles.itemCard, card]}>
          <View style={styles.itemTop}>
            <Text style={[styles.itemTitle, { color: themeColors.text, flex: 1 }]}>{r.name}</Text>
            <View style={[styles.pill, { backgroundColor: r.status === 'PAID' ? '#05966922' : '#D9770622', borderColor: r.status === 'PAID' ? '#059669' : '#D97706' }]}>
              <Text style={[styles.pillText, { color: r.status === 'PAID' ? '#059669' : '#D97706' }]}>{r.status === 'PAID' ? `Paid · ${r.paid_via}` : 'Due'}</Text>
            </View>
          </View>
          <View style={styles.breakdown}>
            <Line k={`Salary (${r.paid_days} paid days)`} v={money(r.salary_amount)} c={themeColors} />
            <Line k={`Trip bata${r.trips != null ? ` (${r.trips} trips)` : ''}`} v={money(r.bata_amount)} c={themeColors} />
            {r.ot_amount ? <Line k={`Overtime${r.ot_hours != null ? ` (${r.ot_hours} hrs)` : ''}`} v={money(r.ot_amount)} c={themeColors} /> : null}
            {r.advances_deducted ? <Line k="Advance deducted" v={`- ${money(r.advances_deducted)}`} c={themeColors} tone="#DC2626" /> : null}
            <Line k="Net pay" v={money(r.net_payable)} c={themeColors} bold />
          </View>
          {r.status === 'DUE' && r.days_marked === 0 && (
            <Text style={{ color: '#D97706', fontSize: 12, marginTop: 4 }}>No attendance marked for this month yet.</Text>
          )}
          {r.status === 'DUE' && r.days_marked > 0 && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#059669', marginTop: 8 }]} onPress={() => paySalary(r)}>
              <Text style={styles.primaryBtnText}>Mark salary paid</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </>
  );

  const renderExpenses = () => (
    <>
      <Stepper label={showMonth(month)} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
      <View style={[styles.totalCard, card]}>
        <Text style={{ color: themeColors.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Total this month</Text>
        <Text style={{ color: themeColors.text, fontSize: 22, fontWeight: '800' }}>{money(expenses?.total)}</Text>
        <View style={[styles.chipRow, { marginTop: 6 }]}>
          {Object.entries(expenses?.by_category || {}).map(([k, v]) => (
            <Text key={k} style={[styles.catTag, { color: themeColors.text, borderColor: themeColors.border }]}>{k}: {money(v as number)}</Text>
          ))}
        </View>
      </View>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]} onPress={() => openModal('expense')}>
        <Plus size={15} color="#FFF" /><Text style={styles.primaryBtnText}>Add expense</Text>
      </TouchableOpacity>
      {(expenses?.entries || []).length === 0 ? <Empty text="No expenses recorded this month." /> : (expenses.entries as any[]).map((e) => (
        <View key={e.id} style={[styles.rowCard, card]}>
          <Wrench size={16} color={themeColors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: themeColors.text }]}>{e.category}{e.car_number ? ` · ${e.car_number}` : ''}</Text>
            <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>{showDate(e.date)}{e.note ? ` · ${e.note}` : ''}</Text>
          </View>
          <Text style={{ color: themeColors.text, fontWeight: '800' }}>{money(e.amount)}</Text>
        </View>
      ))}
    </>
  );

  const renderAdvances = () => (
    <>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]} onPress={() => openModal('advance')}>
        <Plus size={15} color="#FFF" /><Text style={styles.primaryBtnText}>Give advance</Text>
      </TouchableOpacity>
      {advances.length === 0 ? <Empty text="No advances given yet." /> : advances.map((a) => (
        <View key={a.id} style={[styles.rowCard, card]}>
          <HandCoins size={16} color={a.recovered_in_month ? '#059669' : '#D97706'} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: themeColors.text }]}>{a.driver_name}</Text>
            <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
              {showDate(a.date)}{a.note ? ` · ${a.note}` : ''} · {a.recovered_in_month ? `Recovered in ${showMonth(a.recovered_in_month)}` : 'Pending recovery'}
            </Text>
          </View>
          <Text style={{ color: themeColors.text, fontWeight: '800' }}>{money(a.amount)}</Text>
        </View>
      ))}
    </>
  );

  const renderModal = () => {
    if (!modal) return null;
    const titles: Record<string, string> = {
      car: form.id ? 'Edit car' : 'Add company car',
      driver: form.id ? 'Edit driver' : 'Add company driver',
      expense: 'Add expense',
      advance: 'Give salary advance',
    };
    const F = ({ label, field, numeric, placeholder }: { label: string; field: string; numeric?: boolean; placeholder?: string }) => (
      <View style={{ marginBottom: 10 }}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text>
        <TextInput
          style={inputStyle}
          value={form[field] != null ? String(form[field]) : ''}
          onChangeText={(v) => setForm((f: any) => ({ ...f, [field]: v }))}
          keyboardType={numeric ? 'numeric' : 'default'}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
          autoCapitalize={field === 'car_number' ? 'characters' : 'sentences'}
        />
      </View>
    );
    const D = ({ label, field }: { label: string; field: string }) => (
      <View style={{ marginBottom: 10 }}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text>
        <DatePickButton
          value={form[field] || ''}
          onChange={(v) => setForm((f: any) => ({ ...f, [field]: v }))}
          style={inputStyle}
          textStyle={{ color: themeColors.text, fontSize: 13.5 }}
          placeholder="Not set"
        />
      </View>
    );
    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: themeColors.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: themeColors.text }]}>{titles[modal]}</Text>
              <TouchableOpacity onPress={() => setModal(null)}><X size={20} color={themeColors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {modal === 'car' && (
                <>
                  {F({ label: "Car model *", field: "name", placeholder: "e.g. Innova Crysta" })}
                  {F({ label: "Car number *", field: "car_number", placeholder: "TN 09 AB 1234" })}
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Car type</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    {CAR_TYPES.map((t) => <Chip key={t.value} label={t.label} active={form.car_type === t.value} onPress={() => setForm((f: any) => ({ ...f, car_type: t.value }))} />)}
                  </View>
                  {D({ label: "Insurance valid till", field: "insurance_expiry" })}
                  {D({ label: "FC valid till", field: "fc_expiry" })}
                  {D({ label: "Permit valid till", field: "permit_expiry" })}
                  <View style={styles.inlineInputs}>
                    <View style={{ flex: 1 }}>{F({ label: "Odometer (km)", field: "odometer_km", numeric: true })}</View>
                    <View style={{ flex: 1 }}>{F({ label: "Next service at (km)", field: "next_service_km", numeric: true })}</View>
                  </View>
                  {F({ label: "Notes", field: "notes" })}
                </>
              )}
              {modal === 'driver' && (
                <>
                  {F({ label: "Name *", field: "name" })}
                  {F({ label: "Phone *", field: "phone", numeric: true, placeholder: "10-digit mobile" })}
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Salary type</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    <Chip label="Monthly salary" active={form.salary_type === 'MONTHLY'} onPress={() => setForm((f: any) => ({ ...f, salary_type: 'MONTHLY' }))} />
                    <Chip label="Daily wage" active={form.salary_type === 'DAILY'} onPress={() => setForm((f: any) => ({ ...f, salary_type: 'DAILY' }))} />
                  </View>
                  {form.salary_type === 'DAILY'
                    ? F({ label: "Daily wage (₹)", field: "daily_wage", numeric: true })
                    : F({ label: "Monthly salary (₹)", field: "base_salary", numeric: true })}
                  <View style={styles.inlineInputs}>
                    <View style={{ flex: 1 }}>{F({ label: "Bata per trip (₹)", field: "per_trip_bata", numeric: true })}</View>
                    <View style={{ flex: 1 }}>{F({ label: "OT rate per hour (₹)", field: "ot_rate_per_hour", numeric: true })}</View>
                  </View>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Assigned car</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    <Chip label="None" active={!form.assigned_car_id} onPress={() => setForm((f: any) => ({ ...f, assigned_car_id: null }))} />
                    {cars.map((c) => <Chip key={c.id} label={c.car_number} active={form.assigned_car_id === c.id} onPress={() => setForm((f: any) => ({ ...f, assigned_car_id: c.id }))} />)}
                  </View>
                  {F({ label: "Licence number", field: "licence_number" })}
                  {D({ label: "Licence valid till", field: "licence_expiry" })}
                </>
              )}
              {modal === 'expense' && (
                <>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Category</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    {EXPENSE_CATEGORIES.map((c) => <Chip key={c} label={c} active={form.category === c} onPress={() => setForm((f: any) => ({ ...f, category: c }))} />)}
                  </View>
                  {F({ label: "Amount (₹) *", field: "amount", numeric: true })}
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Car (optional)</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    <Chip label="General" active={!form.car_id} onPress={() => setForm((f: any) => ({ ...f, car_id: null }))} />
                    {cars.map((c) => <Chip key={c.id} label={c.car_number} active={form.car_id === c.id} onPress={() => setForm((f: any) => ({ ...f, car_id: c.id }))} />)}
                  </View>
                  {D({ label: "Date (default today)", field: "date" })}
                  {F({ label: "Note", field: "note" })}
                </>
              )}
              {modal === 'advance' && (
                <>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Driver *</Text>
                  <View style={[styles.chipRow, { marginBottom: 10 }]}>
                    {drivers.map((d) => <Chip key={d.id} label={d.name} active={form.driver_id === d.id} onPress={() => setForm((f: any) => ({ ...f, driver_id: d.id }))} />)}
                  </View>
                  {F({ label: "Amount (₹) *", field: "amount", numeric: true })}
                  {F({ label: "Note", field: "note" })}
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Deducted automatically from the next salary when payroll is marked paid.</Text>
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary, marginTop: 10, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Own Fleet</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Company cars, drivers, attendance & payroll</Text>
        </View>
      </View>

      <View style={[styles.tabWrap, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          const Icon = t.icon;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabChip, { borderColor: on ? themeColors.primary : themeColors.border, backgroundColor: on ? themeColors.primary : 'transparent' }]}
            >
              <Icon size={13} color={on ? '#FFF' : themeColors.textSecondary} />
              <Text style={[styles.tabChipText, { color: on ? '#FFF' : themeColors.text }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={themeColors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'overview' && renderOverview()}
          {tab === 'cars' && renderCars()}
          {tab === 'drivers' && renderDrivers()}
          {tab === 'attendance' && renderAttendance()}
          {tab === 'payroll' && renderPayroll()}
          {tab === 'expenses' && renderExpenses()}
          {tab === 'advances' && renderAdvances()}
        </ScrollView>
      )}
      {renderModal()}
    </View>
  );
}

function Line({ k, v, c, tone, bold }: { k: string; v: string; c: any; tone?: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: bold ? '800' : '500' }}>{k}</Text>
      <Text style={{ color: tone || c.text, fontSize: 12.5, fontWeight: bold ? '800' : '700' }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  tabWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  tabChipText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 14, gap: 10, paddingBottom: 60 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statTile: { width: '48.5%', borderWidth: 1, borderRadius: 10, padding: 12 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 6 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  rowTitle: { fontSize: 13.5, fontWeight: '700' },
  itemCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { fontSize: 14.5, fontWeight: '800' },
  itemSub: { fontSize: 12.5, marginTop: 1 },
  itemMeta: { fontSize: 12, marginTop: 2 },
  itemActions: { flexDirection: 'row', gap: 18, marginTop: 8 },
  link: { fontSize: 12.5, fontWeight: '700' },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  iconBtn: { borderWidth: 1, borderRadius: 8, padding: 7 },
  primaryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingVertical: 11 },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  empty: { borderWidth: 1, borderRadius: 10, padding: 18, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingVertical: 4 },
  stepBtn: { padding: 10 },
  stepLabel: { fontSize: 14, fontWeight: '800' },
  attHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700' },
  inlineInputs: { flexDirection: 'row', gap: 10, marginTop: 8 },
  label: { fontSize: 11.5, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13.5 },
  totalCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
  catTag: { fontSize: 11.5, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  breakdown: { marginTop: 6, gap: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
});
