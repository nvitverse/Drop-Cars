import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Search,
  Calendar,
  Wallet,
  Send,
  Car,
  Briefcase,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  WifiOff,
  Wifi,
  ChevronRight,
  Shield,
  Phone,
  MessageCircle,
  Check,
  X,
  CreditCard,
  Building,
  FileText,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Role definitions
export const ROLE_CONFIG: { [key: string]: { label: string; color: string; ta: string } } = {
  operations: { label: 'Operations Team', color: '#3B82F6', ta: 'ஆபரேஷன்ஸ்' },
  driver: { label: 'Company Driver', color: '#10B981', ta: 'டிரைவர்' },
  own_fleet_manager: { label: 'Own Fleet Mgr', color: '#8B5CF6', ta: 'ஃபிளீட் மேனேஜர்' },
  telecaller: { label: 'Telecaller / CRM', color: '#F59E0B', ta: 'டெலிகாலர்' },
  accounts_manager: { label: 'Accounts Mgr', color: '#EC4899', ta: 'கணக்காளர்' },
  feedback_support: { label: 'Customer Support', color: '#06B6D4', ta: 'சப்போர்ட்' },
  social_media: { label: 'Social Media Mgr', color: '#6366F1', ta: 'சோஷியல் மீடியா' },
  manager: { label: 'General Manager', color: '#EF4444', ta: 'மேலாளர்' },
  mechanic_yard: { label: 'Mechanic / Yard Staff', color: '#64748B', ta: 'மெக்கானிக்/யார்டு' },
};

const ATTENDANCE_STATUSES = [
  { code: 'P', label: 'Present', short: 'P', color: '#10B981', factor: 1.0 },
  { code: 'A', label: 'Absent', short: 'A', color: '#EF4444', factor: 0.0 },
  { code: 'HD', label: 'Half Day', short: 'HD', color: '#F59E0B', factor: 0.5 },
  { code: 'OT', label: 'Overtime', short: 'OT', color: '#8B5CF6', factor: 1.0 },
  { code: 'P_HALF', label: '1.5 Shift', short: '1.5D', color: '#06B6D4', factor: 1.5 },
  { code: 'DOUBLE_DUTY', label: 'Double', short: '2.0D', color: '#EC4899', factor: 2.0 },
  { code: 'PA', label: 'Paid Leave', short: 'PA', color: '#6366F1', factor: 1.0 },
];

const OFFLINE_QUEUE_KEY = 'dropcars_offline_sync_queue';
const CACHE_WORKERS_KEY = 'dropcars_cached_workers';
const CACHE_ATTENDANCE_KEY = 'dropcars_cached_attendance_';

export default function TeamHubScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'hajri' | 'staff' | 'fleet' | 'advances' | 'cashbook' | 'audit'>('hajri');

  // General State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [currentUsername, setCurrentUsername] = useState('Admin');

  // Hajri / Attendance State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>({ total: 0, present: 0, absent: 0, half_day: 0, overtime: 0 });
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Overtime Modal State
  const [otModalVisible, setOtModalVisible] = useState(false);
  const [selectedOtWorker, setSelectedOtWorker] = useState<any>(null);
  const [otHoursInput, setOtHoursInput] = useState('2');
  const [otRateInput, setOtRateInput] = useState('');

  // Workers Catalog State
  const [workersList, setWorkersList] = useState<any[]>([]);
  const [addWorkerModalVisible, setAddWorkerModalVisible] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerPhone, setNewWorkerPhone] = useState('');
  const [newWorkerRoles, setNewWorkerRoles] = useState<string[]>(['operations']);
  const [newWorkerWageType, setNewWorkerWageType] = useState('daily');
  const [newWorkerBaseWage, setNewWorkerBaseWage] = useState('700');
  const [newWorkerOtRate, setNewWorkerOtRate] = useState('100');
  const [newWorkerIsDriver, setNewWorkerIsDriver] = useState(false);
  const [newWorkerVehicle, setNewWorkerVehicle] = useState('');

  // Advances & Payroll State
  const [advancesList, setAdvancesList] = useState<any[]>([]);
  // Own Fleet Return Matches & Commission State
  const [ownFleetReturnMatches, setOwnFleetReturnMatches] = useState<any[]>([]);
  const [loadingReturnMatches, setLoadingReturnMatches] = useState(false);
  const [commissionModalVisible, setCommissionModalVisible] = useState(false);
  const [commOrderId, setCommOrderId] = useState('');
  const [commAgentName, setCommAgentName] = useState('');
  const [commAmount, setCommAmount] = useState('');
  const [commPaidBy, setCommPaidBy] = useState<'DRIVER_CASH' | 'OFFICE_UPI'>('DRIVER_CASH');
  const [commVehicleNumber, setCommVehicleNumber] = useState('');
  const [commNotes, setCommNotes] = useState('');
  const [submittingComm, setSubmittingComm] = useState(false);
  const [addAdvanceModalVisible, setAddAdvanceModalVisible] = useState(false);
  const [advanceWorkerId, setAdvanceWorkerId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState('cash');
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [payrollSummaryModalVisible, setPayrollSummaryModalVisible] = useState(false);
  const [selectedPayrollData, setSelectedPayrollData] = useState<any>(null);

  // Cashbook State
  const [cashbookData, setCashbookData] = useState<any>({ total_cash_in: 0, total_cash_out: 0, net_cash_balance: 0, entries: [] });
  const [addCashModalVisible, setAddCashModalVisible] = useState(false);
  const [cashType, setCashType] = useState<'IN' | 'OUT'>('OUT');
  const [cashAmount, setCashAmount] = useState('');
  const [cashCategory, setCashCategory] = useState('diesel');
  const [cashNotes, setCashNotes] = useState('');
  const [cashPaymentMode, setCashPaymentMode] = useState('cash');

  // Audit Feed State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // 1. Initial Load & Auth Check
  useEffect(() => {
    (async () => {
      try {
        const adminData = await AsyncStorage.getItem('admin_user');
        if (adminData) {
          const parsed = JSON.parse(adminData);
          setCurrentUsername(parsed.username || 'Admin');
        }
      } catch {}
      await loadInitialData();
    })();
  }, [selectedDate]);

  // Check offline queue on mount
  useEffect(() => {
    checkOfflineQueue();
  }, []);

  const checkOfflineQueue = async () => {
    try {
      const q = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (q) {
        const parsed = JSON.parse(q);
        const count = (parsed.attendance_records?.length || 0) + (parsed.advances?.length || 0) + (parsed.cashbook_entries?.length || 0);
        setPendingSyncCount(count);
      } else {
        setPendingSyncCount(0);
      }
    } catch {}
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Load Workers (with offline cache fallback)
      try {
        const wRes = await apiService.getWorkers(true);
        if (wRes && wRes.workers) {
          setWorkersList(wRes.workers);
          await AsyncStorage.setItem(CACHE_WORKERS_KEY, JSON.stringify(wRes.workers));
        }
        setIsOffline(false);
      } catch (e) {
        // Fallback to cache
        const cached = await AsyncStorage.getItem(CACHE_WORKERS_KEY);
        if (cached) setWorkersList(JSON.parse(cached));
        setIsOffline(true);
      }

      // 2. Load Attendance for selected date
      try {
        const attRes = await apiService.getDailyAttendance(selectedDate);
        if (attRes) {
          setAttendanceRecords(attRes.records || []);
          setAttendanceSummary(attRes.summary || {});
          await AsyncStorage.setItem(CACHE_ATTENDANCE_KEY + selectedDate, JSON.stringify(attRes));
        }
      } catch (e) {
        const cachedAtt = await AsyncStorage.getItem(CACHE_ATTENDANCE_KEY + selectedDate);
        if (cachedAtt) {
          const parsed = JSON.parse(cachedAtt);
          setAttendanceRecords(parsed.records || []);
          setAttendanceSummary(parsed.summary || {});
        }
      }

      // 3. Load Advances
      try {
        const advRes = await apiService.getWorkerAdvances();
        if (advRes && advRes.advances) setAdvancesList(advRes.advances);
      } catch {}

      // 4. Load Cashbook
      try {
        const cbRes = await apiService.getCashbook(selectedDate);
        if (cbRes) setCashbookData(cbRes);
      } catch {}

      // 5. Load Audit Feed
      try {
        const auditRes = await apiService.getTeamAuditTrail(30);
        if (auditRes && auditRes.logs) setAuditLogs(auditRes.logs);
      } catch {}

    } catch (err) {
      console.log('Error loading team hub data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadInitialData();
  };

  // --- Fast Hajri Action (Mark Status) ---
  const handleMarkStatus = async (workerId: string, status: string) => {
    if (status === 'OT') {
      const w = workersList.find((x) => x.id === workerId);
      setSelectedOtWorker(w);
      setOtRateInput(String(w?.ot_rate_per_hour || 100));
      setOtModalVisible(true);
      return;
    }

    // Optimistically update UI immediately (0ms UI latency!)
    const updated = attendanceRecords.map((r) => {
      if (r.worker_id === workerId) {
        return { ...r, status, marked_by_admin_username: currentUsername };
      }
      return r;
    });
    setAttendanceRecords(updated);

    // Recalculate summary locally
    let p = 0, a = 0, hd = 0, ot = 0;
    updated.forEach((r) => {
      if (r.status === 'P') p++;
      else if (r.status === 'A') a++;
      else if (r.status === 'HD') hd++;
      else if (r.status === 'OT') ot++;
    });
    setAttendanceSummary({ ...attendanceSummary, present: p, absent: a, half_day: hd, overtime: ot });

    // Send single/bulk update or queue if offline
    try {
      await apiService.markBulkAttendance(selectedDate, [
        { worker_id: workerId, status, ot_minutes: 0, ot_amount: 0.0 },
      ]);
    } catch (e) {
      // Queue offline
      await queueOfflineAction('attendance', { worker_id: workerId, date: selectedDate, status, ot_minutes: 0, ot_amount: 0.0 });
    }
  };

  // Mark all un-marked as Present
  const handleMarkAllPresent = async () => {
    const toUpdate: any[] = [];
    const updated = attendanceRecords.map((r) => {
      if (!r.status || r.status === 'A') {
        toUpdate.push({ worker_id: r.worker_id, status: 'P', ot_minutes: 0, ot_amount: 0.0 });
        return { ...r, status: 'P', marked_by_admin_username: currentUsername };
      }
      return r;
    });
    setAttendanceRecords(updated);

    if (toUpdate.length === 0) return;

    try {
      await apiService.markBulkAttendance(selectedDate, toUpdate);
    } catch (e) {
      for (const item of toUpdate) {
        await queueOfflineAction('attendance', { ...item, date: selectedDate });
      }
    }
  };

  // Confirm Overtime Modal
  const handleConfirmOt = async () => {
    if (!selectedOtWorker) return;
    const minutes = Math.round((parseFloat(otHoursInput) || 0) * 60);
    const rate = parseFloat(otRateInput) || selectedOtWorker.ot_rate_per_hour || 0;
    const otAmount = roundToTwo((minutes / 60.0) * rate);

    const updated = attendanceRecords.map((r) => {
      if (r.worker_id === selectedOtWorker.id) {
        return {
          ...r,
          status: 'OT',
          ot_minutes: minutes,
          ot_amount: otAmount,
          marked_by_admin_username: currentUsername,
        };
      }
      return r;
    });
    setAttendanceRecords(updated);
    setOtModalVisible(false);

    try {
      await apiService.markBulkAttendance(selectedDate, [
        { worker_id: selectedOtWorker.id, status: 'OT', ot_minutes: minutes, ot_amount: otAmount },
      ]);
    } catch (e) {
      await queueOfflineAction('attendance', {
        worker_id: selectedOtWorker.id,
        date: selectedDate,
        status: 'OT',
        ot_minutes: minutes,
        ot_amount: otAmount,
      });
    }
  };

  // --- Offline Queue Engine ---
  const queueOfflineAction = async (type: 'attendance' | 'advance' | 'cashbook', payload: any) => {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : { attendance_records: [], advances: [], cashbook_entries: [] };
      if (type === 'attendance') queue.attendance_records.push(payload);
      else if (type === 'advance') queue.advances.push(payload);
      else if (type === 'cashbook') queue.cashbook_entries.push(payload);

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      setIsOffline(true);
      checkOfflineQueue();
    } catch (err) {
      console.log('Failed to queue offline action:', err);
    }
  };

  // Sync Offline Queue to Cloud Run
  const handleSyncOfflineNow = async () => {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) {
        Alert.alert('In Sync', 'All changes are already saved to the server.');
        return;
      }
      const queue = JSON.parse(raw);
      setLoading(true);
      const res = await apiService.syncOfflineBatch(queue);
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
      setPendingSyncCount(0);
      setIsOffline(false);
      Alert.alert('Sync Complete', res.message || 'All offline changes synced to server!');
      loadInitialData();
    } catch (e: any) {
      Alert.alert('Sync Failed', 'Could not reach server. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  // --- Worker Creation ---
  const handleCreateWorker = async () => {
    if (!newWorkerName.trim() || !newWorkerPhone.trim()) {
      Alert.alert('Required', 'Please enter staff name and phone number.');
      return;
    }
    setLoading(true);
    try {
      await apiService.createWorker({
        name: newWorkerName.trim(),
        phone: newWorkerPhone.trim(),
        roles: newWorkerRoles,
        wage_type: newWorkerWageType,
        base_wage: parseFloat(newWorkerBaseWage) || 0,
        ot_rate_per_hour: parseFloat(newWorkerOtRate) || 0,
        is_company_driver: newWorkerIsDriver,
        assigned_vehicle_number: newWorkerIsDriver ? newWorkerVehicle.trim() : null,
      });
      setAddWorkerModalVisible(false);
      setNewWorkerName('');
      setNewWorkerPhone('');
      setNewWorkerVehicle('');
      Alert.alert('Success', 'Staff member added successfully!');
      loadInitialData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create worker');
    } finally {
      setLoading(false);
    }
  };

  // --- Advance Disbursal ---
  const handleRecordAdvance = async () => {
    const amt = parseFloat(advanceAmount);
    if (!advanceWorkerId || !amt || amt <= 0) {
      Alert.alert('Invalid', 'Please select a worker and valid amount.');
      return;
    }
    setLoading(true);
    try {
      await apiService.recordWorkerAdvance({
        worker_id: advanceWorkerId,
        date: selectedDate,
        amount: amt,
        payment_mode: advanceMode,
        remarks: advanceRemarks.trim(),
        record_in_petty_cash: true,
      });
      setAddAdvanceModalVisible(false);
      setAdvanceAmount('');
      setAdvanceRemarks('');
      Alert.alert('Advance Recorded', `₹${amt} disbursed and logged to Petty Cash.`);
      loadInitialData();
    } catch (e: any) {
      await queueOfflineAction('advance', {
        worker_id: advanceWorkerId,
        date: selectedDate,
        amount: amt,
        payment_mode: advanceMode,
        remarks: advanceRemarks.trim(),
      });
      setAddAdvanceModalVisible(false);
      Alert.alert('Saved Offline', 'Advance stored locally and will sync when online.');
    } finally {
      setLoading(false);
    }
  };

  // --- View Monthly Payroll & WhatsApp Share ---
  const handleViewPayroll = async (workerId: string) => {
    setLoading(true);
    try {
      const monthStr = selectedDate.slice(0, 7);
      const res = await apiService.getWorkerPayrollSummary(workerId, monthStr);
      setSelectedPayrollData(res);
      setPayrollSummaryModalVisible(true);
    } catch (e: any) {
      Alert.alert('Error', 'Could not load monthly payroll statement.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsAppSlip = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`);
        }
      })
      .catch(() => {
        Alert.alert('WhatsApp Error', 'Could not open WhatsApp app.');
      });
  };

  // --- Own Fleet Return Trip Matcher ---
  const handleFetchReturnMatches = async () => {
    setLoadingReturnMatches(true);
    try {
      const res = await apiService.getOwnFleetReturnMatches();
      setOwnFleetReturnMatches(res.own_fleet_matches || []);
      if ((res.own_fleet_matches || []).length === 0) {
        Alert.alert('No Return Matches', 'All company vehicles are currently in home cities or no pending bookings matched.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to fetch return matches');
    } finally {
      setLoadingReturnMatches(false);
    }
  };

  // --- Record Booking / Agent Commission ---
  const handleSaveCommission = async () => {
    const oId = parseInt(commOrderId, 10);
    const amt = parseFloat(commAmount);
    if (!oId || !commAgentName.trim() || !amt || amt <= 0 || !commVehicleNumber.trim()) {
      Alert.alert('Invalid', 'Please fill Booking ID, Agent Name, Amount, and Vehicle Number.');
      return;
    }
    setSubmittingComm(true);
    try {
      const res = await apiService.recordBookingCommission({
        order_id: oId,
        agent_name: commAgentName.trim(),
        amount: amt,
        paid_by: commPaidBy,
        vehicle_number: commVehicleNumber.trim().toUpperCase(),
        notes: commNotes.trim(),
      });
      Alert.alert('Commission Recorded', `₹${amt} commission saved! Paid via ${commPaidBy}.`);
      setCommissionModalVisible(false);
      setCommOrderId('');
      setCommAgentName('');
      setCommAmount('');
      setCommNotes('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to record commission');
    } finally {
      setSubmittingComm(false);
    }
  };

  // --- Add Cash In / Cash Out ---
  const handleAddCashbook = async () => {
    const amt = parseFloat(cashAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid', 'Please enter a valid amount.');
      return;
    }
    setLoading(true);
    try {
      await apiService.addCashbookEntry({
        date: selectedDate,
        transaction_type: cashType,
        amount: amt,
        category: cashCategory,
        payment_mode: cashPaymentMode,
        notes: cashNotes.trim(),
      });
      setAddCashModalVisible(false);
      setCashAmount('');
      setCashNotes('');
      Alert.alert('Success', `Cash ${cashType === 'IN' ? 'In (+)' : 'Out (−)'} logged.`);
      loadInitialData();
    } catch (e: any) {
      await queueOfflineAction('cashbook', {
        date: selectedDate,
        transaction_type: cashType,
        amount: amt,
        category: cashCategory,
        payment_mode: cashPaymentMode,
        notes: cashNotes.trim(),
      });
      setAddCashModalVisible(false);
      Alert.alert('Saved Offline', 'Cash entry saved locally.');
    } finally {
      setLoading(false);
    }
  };

  // Helper
  const roundToTwo = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Filtered workers for Hajri list
  const filteredAttendance = attendanceRecords.filter((r) => {
    const matchRole = roleFilter === 'all' || (r.roles || []).includes(roleFilter);
    const matchSearch =
      !searchQuery.trim() ||
      r.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);
    return matchRole && matchSearch;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* 1. Header Bar */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Team & Operations Hub</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
              பணியாளர்கள் & தினசரி ஹாஜிரி மேலாண்மை
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {pendingSyncCount > 0 ? (
            <TouchableOpacity onPress={handleSyncOfflineNow} style={styles.syncBadge}>
              <RefreshCw size={14} color="#FFF" />
              <Text style={styles.syncBadgeText}>{pendingSyncCount} Sync</Text>
            </TouchableOpacity>
          ) : isOffline ? (
            <View style={[styles.statusPill, { backgroundColor: '#FEF3C7' }]}>
              <WifiOff size={12} color="#D97706" />
              <Text style={[styles.statusPillText, { color: '#D97706' }]}>Offline</Text>
            </View>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: '#D1FAE5' }]}>
              <Wifi size={12} color="#059669" />
              <Text style={[styles.statusPillText, { color: '#059669' }]}>Online</Text>
            </View>
          )}
          <ThemeToggle />
        </View>
      </View>

      {/* 2. Top Navigation Tabs */}
      <View style={[styles.tabBarContainer, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity
            style={[styles.navTab, activeTab === 'hajri' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('hajri')}>
            <Calendar size={16} color={activeTab === 'hajri' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'hajri' ? themeColors.primary : themeColors.textSecondary }]}>
              Daily Hajri
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'staff' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('staff')}>
            <Users size={16} color={activeTab === 'staff' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'staff' ? themeColors.primary : themeColors.textSecondary }]}>
              Staff & Roles
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'fleet' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('fleet')}>
            <Car size={16} color={activeTab === 'fleet' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'fleet' ? themeColors.primary : themeColors.textSecondary }]}>
              Own Fleet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'advances' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('advances')}>
            <Wallet size={16} color={activeTab === 'advances' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'advances' ? themeColors.primary : themeColors.textSecondary }]}>
              Advances & Payroll
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'cashbook' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('cashbook')}>
            <CreditCard size={16} color={activeTab === 'cashbook' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'cashbook' ? themeColors.primary : themeColors.textSecondary }]}>
              Petty Cash
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'audit' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('audit')}>
            <Shield size={16} color={activeTab === 'audit' ? themeColors.primary : themeColors.textSecondary} />
            <Text style={[styles.navTabText, { color: activeTab === 'audit' ? themeColors.primary : themeColors.textSecondary }]}>
              Owner Audit
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Content Area */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading Operations Hub...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.mainScrollView}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColors.primary]} />}>
          {/* TAB 1: DAILY HAJRI */}
          {activeTab === 'hajri' && (
            <View style={styles.tabContent}>
              {/* Date & Quick Action Row */}
              <View style={[styles.dateControlCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.datePickerRow}>
                  <Calendar size={18} color={themeColors.primary} />
                  <TextInput
                    style={[styles.dateInput, { color: themeColors.text, borderColor: themeColors.border }]}
                    value={selectedDate}
                    onChangeText={setSelectedDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                  <TouchableOpacity
                    style={[styles.todayBtn, { backgroundColor: themeColors.primary }]}
                    onPress={() => setSelectedDate(new Date().toISOString().slice(0, 10))}>
                    <Text style={styles.todayBtnText}>Today</Text>
                  </TouchableOpacity>
                </View>

                {/* Summary Badges Bar */}
                <View style={styles.hajriSummaryRow}>
                  <View style={[styles.hajriStatBox, { backgroundColor: '#E0F2FE' }]}>
                    <Text style={[styles.hajriStatNum, { color: '#0369A1' }]}>{attendanceSummary.total || 0}</Text>
                    <Text style={[styles.hajriStatLabel, { color: '#0369A1' }]}>Total</Text>
                  </View>
                  <View style={[styles.hajriStatBox, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.hajriStatNum, { color: '#059669' }]}>{attendanceSummary.present || 0}</Text>
                    <Text style={[styles.hajriStatLabel, { color: '#059669' }]}>Present</Text>
                  </View>
                  <View style={[styles.hajriStatBox, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.hajriStatNum, { color: '#DC2626' }]}>{attendanceSummary.absent || 0}</Text>
                    <Text style={[styles.hajriStatLabel, { color: '#DC2626' }]}>Absent</Text>
                  </View>
                  <View style={[styles.hajriStatBox, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.hajriStatNum, { color: '#D97706' }]}>{attendanceSummary.half_day || 0}</Text>
                    <Text style={[styles.hajriStatLabel, { color: '#D97706' }]}>Half-Day</Text>
                  </View>
                  <View style={[styles.hajriStatBox, { backgroundColor: '#EDE9FE' }]}>
                    <Text style={[styles.hajriStatNum, { color: '#7C3AED' }]}>{attendanceSummary.overtime || 0}</Text>
                    <Text style={[styles.hajriStatLabel, { color: '#7C3AED' }]}>OT</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllPresent}>
                  <CheckCircle2 size={16} color="#FFF" />
                  <Text style={styles.markAllBtnText}>Mark Remaining as Present (P)</Text>
                </TouchableOpacity>
              </View>

              {/* Role Filters Pill Bar */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleFilterScroll}>
                <TouchableOpacity
                  style={[styles.rolePill, roleFilter === 'all' && styles.rolePillActive]}
                  onPress={() => setRoleFilter('all')}>
                  <Text style={[styles.rolePillText, roleFilter === 'all' && styles.rolePillTextActive]}>All Staff</Text>
                </TouchableOpacity>
                {Object.keys(ROLE_CONFIG).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.rolePill, roleFilter === k && { backgroundColor: ROLE_CONFIG[k].color }]}
                    onPress={() => setRoleFilter(k)}>
                    <Text
                      style={[
                        styles.rolePillText,
                        roleFilter === k && { color: '#FFF', fontWeight: '700' },
                      ]}>
                      {ROLE_CONFIG[k].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Worker Attendance Cards List */}
              <View style={styles.recordsList}>
                {filteredAttendance.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Users size={36} color={themeColors.textSecondary} />
                    <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                      No staff records found for this filter.
                    </Text>
                  </View>
                ) : (
                  filteredAttendance.map((worker) => (
                    <View
                      key={worker.worker_id}
                      style={[
                        styles.workerHajriCard,
                        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      ]}>
                      <View style={styles.workerCardHeader}>
                        <View>
                          <Text style={[styles.workerName, { color: themeColors.text }]}>{worker.worker_name}</Text>
                          <View style={styles.rolesRow}>
                            {(worker.roles || []).map((r: string) => (
                              <View
                                key={r}
                                style={[styles.roleMiniTag, { backgroundColor: (ROLE_CONFIG[r]?.color || '#666') + '22' }]}>
                                <Text style={[styles.roleMiniText, { color: ROLE_CONFIG[r]?.color || '#666' }]}>
                                  {ROLE_CONFIG[r]?.label || r}
                                </Text>
                              </View>
                            ))}
                            {worker.assigned_vehicle_number && (
                              <View style={[styles.roleMiniTag, { backgroundColor: '#ECFDF5' }]}>
                                <Text style={[styles.roleMiniText, { color: '#059669' }]}>
                                  🚗 {worker.assigned_vehicle_number}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {worker.marked_by_admin_username && (
                          <View style={styles.attributionTag}>
                            <Text style={styles.attributionText}>By: {worker.marked_by_admin_username}</Text>
                          </View>
                        )}
                      </View>

                      {/* Fast Action Attendance Buttons (Laborbook Style) */}
                      <View style={styles.statusButtonsRow}>
                        {ATTENDANCE_STATUSES.map((st) => {
                          const isActive = worker.status === st.code;
                          return (
                            <TouchableOpacity
                              key={st.code}
                              style={[
                                styles.statusBtn,
                                { borderColor: st.color },
                                isActive && { backgroundColor: st.color },
                              ]}
                              onPress={() => handleMarkStatus(worker.worker_id, st.code)}>
                              <Text
                                style={[
                                  styles.statusBtnText,
                                  { color: st.color },
                                  isActive && { color: '#FFF', fontWeight: '800' },
                                ]}>
                                {st.short}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Overtime Info Display */}
                      {worker.status === 'OT' && worker.ot_minutes > 0 && (
                        <View style={styles.otInfoBanner}>
                          <Clock size={12} color="#7C3AED" />
                          <Text style={styles.otInfoText}>
                            Overtime: {worker.ot_minutes / 60} hrs • Earned: ₹{worker.ot_amount}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* TAB 2: STAFF & ROLES CATALOG */}
          {activeTab === 'staff' && (
            <View style={styles.tabContent}>
              <View style={styles.catalogTopBar}>
                <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <Search size={18} color={themeColors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder="Search name or mobile..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
                <TouchableOpacity style={styles.addNewStaffBtn} onPress={() => setAddWorkerModalVisible(true)}>
                  <Plus size={18} color="#FFF" />
                  <Text style={styles.addNewStaffBtnText}>+ Add Staff</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.recordsList}>
                {workersList.map((w) => (
                  <View
                    key={w.id}
                    style={[styles.staffCatalogCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.staffMainRow}>
                      <View style={styles.staffAvatar}>
                        <Text style={styles.staffAvatarText}>{w.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.staffCardName, { color: themeColors.text }]}>{w.name}</Text>
                        <Text style={[styles.staffCardPhone, { color: themeColors.textSecondary }]}>📱 {w.phone}</Text>
                        <View style={styles.rolesRow}>
                          {(w.roles || []).map((r: string) => (
                            <View
                              key={r}
                              style={[styles.roleMiniTag, { backgroundColor: (ROLE_CONFIG[r]?.color || '#666') + '22' }]}>
                              <Text style={[styles.roleMiniText, { color: ROLE_CONFIG[r]?.color || '#666' }]}>
                                {ROLE_CONFIG[r]?.label || r}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>

                    <View style={[styles.staffWageFooter, { borderTopColor: themeColors.border }]}>
                      <Text style={[styles.wageText, { color: themeColors.textSecondary }]}>
                        Wage: <Text style={{ color: themeColors.text, fontWeight: '700' }}>₹{w.base_wage}</Text> ({w.wage_type})
                      </Text>
                      <Text style={[styles.wageText, { color: themeColors.textSecondary }]}>
                        OT Rate: <Text style={{ color: '#7C3AED', fontWeight: '700' }}>₹{w.ot_rate_per_hour}/hr</Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* TAB 3: OWN FLEET & DRIVERS */}
          {activeTab === 'fleet' && (
            <View style={styles.tabContent}>
              <View style={[styles.ownFleetBanner, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Car size={24} color="#2563EB" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.fleetBannerTitle, { color: '#1E40AF' }]}>Own Fleet & Company Drivers</Text>
                  <Text style={[styles.fleetBannerSub, { color: '#1E3A8A' }]}>
                    வாகன ஒதுக்கீடு, ரிட்டர்ன் டிரிப் ஆட்டோ-மேட்சிங் & புக்கிங் கமிஷன்
                  </Text>
                </View>
              </View>

              {/* Action Buttons: Return Trip Matcher & Log Commission */}
              <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 14 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 10, gap: 6 }}
                  onPress={handleFetchReturnMatches}
                  disabled={loadingReturnMatches}
                >
                  {loadingReturnMatches ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Car size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 12.5, fontFamily: 'Inter-Bold' }}>Scan Return Trips</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669', paddingVertical: 10, borderRadius: 10, gap: 6 }}
                  onPress={() => setCommissionModalVisible(true)}
                >
                  <Wallet size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 12.5, fontFamily: 'Inter-Bold' }}>+ Booking Commission</Text>
                </TouchableOpacity>
              </View>

              {/* Own Fleet Return Trip Matches Card List */}
              {ownFleetReturnMatches.length > 0 && (
                <View style={{ marginHorizontal: 16, marginBottom: 16, padding: 14, backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderRadius: 12, borderWidth: 1, borderColor: '#86EFAC' }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: '#166534', marginBottom: 8 }}>
                    🎯 Own Fleet Return Matches Found ({ownFleetReturnMatches.length} vehicles)
                  </Text>
                  {ownFleetReturnMatches.map((m: any, idx: number) => (
                    <View key={idx} style={{ marginBottom: 10, padding: 10, backgroundColor: themeColors.surface, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: themeColors.text }}>
                        🚗 {m.vehicle_number} ({m.driver_name}) in {m.current_location}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 2 }}>
                        Matched Bookings to Avoid Empty Run:
                      </Text>
                      {(m.matched_bookings || []).map((b: any) => (
                        <View key={b.order_id} style={{ marginTop: 6, padding: 6, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 6 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#2563EB' }}>
                            Booking #{b.order_id}: {b.pickup} ➔ {b.drop}
                          </Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                            Customer: {b.customer_name} ({b.customer_number})
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.recordsList}>
                {workersList
                  .filter((w) => w.is_company_driver || (w.roles || []).includes('driver'))
                  .map((d) => (
                    <View
                      key={d.id}
                      style={[styles.fleetDriverCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                      <View style={styles.fleetCardTop}>
                        <View>
                          <Text style={[styles.driverNameText, { color: themeColors.text }]}>{d.name}</Text>
                          <Text style={[styles.driverPhoneText, { color: themeColors.textSecondary }]}>📞 {d.phone}</Text>
                        </View>
                        <View style={[styles.carNumberPlate]}>
                          <Text style={styles.carPlateText}>{d.assigned_vehicle_number || 'No Car Assigned'}</Text>
                        </View>
                      </View>

                      <View style={styles.fleetCardActions}>
                        <TouchableOpacity
                          style={[styles.fleetActionBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleViewPayroll(d.id)}>
                          <FileText size={14} color="#FFF" />
                          <Text style={styles.fleetActionText}>Monthly Slip</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.fleetActionBtn, { backgroundColor: '#3B82F6' }]}
                          onPress={() => {
                            setAdvanceWorkerId(d.id);
                            setAddAdvanceModalVisible(true);
                          }}>
                          <Wallet size={14} color="#FFF" />
                          <Text style={styles.fleetActionText}>+ Advance</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* TAB 4: ADVANCES & PAYROLL */}
          {activeTab === 'advances' && (
            <View style={styles.tabContent}>
              <View style={styles.advancesHeaderRow}>
                <View>
                  <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Worker Advances & Loans</Text>
                  <Text style={[styles.sectionSub, { color: themeColors.textSecondary }]}>முன்பணம் மற்றும் சம்பள பாக்கி</Text>
                </View>
                <TouchableOpacity style={styles.newAdvanceBtn} onPress={() => setAddAdvanceModalVisible(true)}>
                  <Plus size={16} color="#FFF" />
                  <Text style={styles.newAdvanceBtnText}>+ Pay Advance</Text>
                </TouchableOpacity>
              </View>

              {/* Workers Payroll Quick Cards */}
              <View style={styles.recordsList}>
                {workersList.map((w) => (
                  <View
                    key={w.id}
                    style={[styles.payrollWorkerCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.payrollTop}>
                      <View>
                        <Text style={[styles.payrollWorkerName, { color: themeColors.text }]}>{w.name}</Text>
                        <Text style={[styles.payrollRole, { color: themeColors.textSecondary }]}>
                          {(w.roles || []).join(', ')} • ₹{w.base_wage}/day
                        </Text>
                      </View>

                      <TouchableOpacity style={styles.calcSlipBtn} onPress={() => handleViewPayroll(w.id)}>
                        <TrendingUp size={14} color="#FFF" />
                        <Text style={styles.calcSlipBtnText}>Calculate Slip</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* TAB 5: PETTY CASHBOOK */}
          {activeTab === 'cashbook' && (
            <View style={styles.tabContent}>
              {/* Running Balance Cards */}
              <View style={styles.cashbookCardsRow}>
                <View style={[styles.cashBox, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={[styles.cashBoxNum, { color: '#059669' }]}>₹{cashbookData.total_cash_in || 0}</Text>
                  <Text style={[styles.cashBoxLabel, { color: '#059669' }]}>Total In (+)</Text>
                </View>
                <View style={[styles.cashBox, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.cashBoxNum, { color: '#DC2626' }]}>₹{cashbookData.total_cash_out || 0}</Text>
                  <Text style={[styles.cashBoxLabel, { color: '#DC2626' }]}>Total Out (−)</Text>
                </View>
                <View style={[styles.cashBox, { backgroundColor: '#E0F2FE' }]}>
                  <Text style={[styles.cashBoxNum, { color: '#0284C7' }]}>₹{cashbookData.net_cash_balance || 0}</Text>
                  <Text style={[styles.cashBoxLabel, { color: '#0284C7' }]}>Cash in Hand</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.cashActionsRow}>
                <TouchableOpacity
                  style={[styles.cashInBtn, { backgroundColor: '#059669' }]}
                  onPress={() => {
                    setCashType('IN');
                    setAddCashModalVisible(true);
                  }}>
                  <Plus size={16} color="#FFF" />
                  <Text style={styles.cashActionBtnText}>+ Cash In (வரவு)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cashOutBtn, { backgroundColor: '#DC2626' }]}
                  onPress={() => {
                    setCashType('OUT');
                    setAddCashModalVisible(true);
                  }}>
                  <Plus size={16} color="#FFF" />
                  <Text style={styles.cashActionBtnText}>− Cash Out (செலவு)</Text>
                </TouchableOpacity>
              </View>

              {/* Cash Entries Ledger */}
              <View style={styles.recordsList}>
                {(cashbookData.entries || []).map((item: any) => (
                  <View
                    key={item.id}
                    style={[styles.cashEntryCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.entryLeft}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: item.type === 'IN' ? '#D1FAE5' : '#FEE2E2' },
                        ]}>
                        <Text style={{ color: item.type === 'IN' ? '#059669' : '#DC2626', fontWeight: '800' }}>
                          {item.type === 'IN' ? '+ IN' : '− OUT'}
                        </Text>
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={[styles.entryCategory, { color: themeColors.text }]}>
                          {item.category.toUpperCase()}
                        </Text>
                        <Text style={[styles.entryNotes, { color: themeColors.textSecondary }]}>
                          {item.notes || 'No description'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.entryRight}>
                      <Text
                        style={[
                          styles.entryAmount,
                          { color: item.type === 'IN' ? '#059669' : '#DC2626' },
                        ]}>
                        ₹{item.amount}
                      </Text>
                      <Text style={styles.entryByText}>By: {item.logged_by_admin_username || 'Admin'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* TAB 6: OWNER AUDIT STREAM */}
          {activeTab === 'audit' && (
            <View style={styles.tabContent}>
              <View style={[styles.auditHeaderBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Shield size={22} color={themeColors.primary} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={[styles.auditHeaderTitle, { color: themeColors.text }]}>
                    Owner Accountability Stream
                  </Text>
                  <Text style={[styles.auditHeaderSub, { color: themeColors.textSecondary }]}>
                    யார் எந்த வேலையை எப்போது செய்தார்கள் என்ற நேரடி பதிவுகள்
                  </Text>
                </View>
              </View>

              <View style={styles.recordsList}>
                {auditLogs.map((log) => (
                  <View
                    key={log.id}
                    style={[styles.auditLogCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.auditLogTop}>
                      <Text style={[styles.auditUsername, { color: themeColors.primary }]}>👤 {log.admin_username}</Text>
                      <Text style={[styles.auditTime, { color: themeColors.textSecondary }]}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    <Text style={[styles.auditActionText, { color: themeColors.text }]}>
                      Action: <Text style={{ fontWeight: '700' }}>{log.action}</Text> ({log.target_name || log.target_type})
                    </Text>

                    {log.details && (
                      <Text style={[styles.auditDetailsText, { color: themeColors.textSecondary }]}>
                        {JSON.stringify(log.details)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* MODAL: BOOKING / AGENT COMMISSION MODAL */}
      <Modal visible={commissionModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Record Booking Commission</Text>
            <Text style={[styles.modalSub, { color: themeColors.textSecondary }]}>
              ஏஜென்ட் அல்லது புரோக்கர் கமிஷன் பதிவு செய்தல்
            </Text>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Booking ID (புக்கிங் எண்):</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              keyboardType="numeric"
              placeholder="e.g. 1840"
              placeholderTextColor={themeColors.textSecondary}
              value={commOrderId}
              onChangeText={setCommOrderId}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Agent / Broker Name:</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="e.g. Agent Karthik / Kovai Travels"
              placeholderTextColor={themeColors.textSecondary}
              value={commAgentName}
              onChangeText={setCommAgentName}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Vehicle Number (வாகனம்):</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="e.g. TN 01 AB 1234"
              placeholderTextColor={themeColors.textSecondary}
              value={commVehicleNumber}
              onChangeText={setCommVehicleNumber}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Commission Amount (₹ தொகை):</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              keyboardType="numeric"
              placeholder="500"
              placeholderTextColor={themeColors.textSecondary}
              value={commAmount}
              onChangeText={setCommAmount}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Paid By (பணம் கொடுத்த விதம்):</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: commPaidBy === 'DRIVER_CASH' ? '#2563EB' : themeColors.border,
                }}
                onPress={() => setCommPaidBy('DRIVER_CASH')}
              >
                <Text style={{ color: commPaidBy === 'DRIVER_CASH' ? '#FFF' : themeColors.text, fontSize: 12, fontFamily: 'Inter-Bold' }}>
                  Driver Trip Cash (டிரைவர் பணம்)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: commPaidBy === 'OFFICE_UPI' ? '#059669' : themeColors.border,
                }}
                onPress={() => setCommPaidBy('OFFICE_UPI')}
              >
                <Text style={{ color: commPaidBy === 'OFFICE_UPI' ? '#FFF' : themeColors.text, fontSize: 12, fontFamily: 'Inter-Bold' }}>
                  Office UPI (அலுவலகம்)
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                onPress={() => setCommissionModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#059669' }]}
                onPress={handleSaveCommission}
                disabled={submittingComm}
              >
                {submittingComm ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Commission</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 1: OVERTIME ENTRY MODAL */}
      <Modal visible={otModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Add Overtime (OT)</Text>
            <Text style={[styles.modalSub, { color: themeColors.textSecondary }]}>
              {selectedOtWorker?.name} - {selectedDate}
            </Text>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>OT Hours (மணிநேரம்):</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              keyboardType="numeric"
              value={otHoursInput}
              onChangeText={setOtHoursInput}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Hourly Rate (₹ ஒரு மணி நேரத்திற்கு):</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              keyboardType="numeric"
              value={otRateInput}
              onChangeText={setOtRateInput}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setOtModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#7C3AED' }]} onPress={handleConfirmOt}>
                <Text style={styles.modalSaveText}>Confirm OT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: ADD WORKER MODAL */}
      <Modal visible={addWorkerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBoxLarge, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Add New Staff / Worker</Text>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Full Name (பெயர்) *:</Text>
              <TextInput
                style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
                value={newWorkerName}
                onChangeText={setNewWorkerName}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={themeColors.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Mobile Number (போன் எண்) *:</Text>
              <TextInput
                style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
                value={newWorkerPhone}
                onChangeText={setNewWorkerPhone}
                keyboardType="phone-pad"
                placeholder="10 digit mobile"
                placeholderTextColor={themeColors.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Assign Roles (பணிகள் & பொறுப்புகள்):</Text>
              <View style={styles.rolesCheckboxGrid}>
                {Object.keys(ROLE_CONFIG).map((rk) => {
                  const isChecked = newWorkerRoles.includes(rk);
                  return (
                    <TouchableOpacity
                      key={rk}
                      style={[
                        styles.roleCheckChip,
                        isChecked && { backgroundColor: ROLE_CONFIG[rk].color },
                      ]}
                      onPress={() => {
                        if (isChecked) {
                          setNewWorkerRoles(newWorkerRoles.filter((x) => x !== rk));
                        } else {
                          setNewWorkerRoles([...newWorkerRoles, rk]);
                        }
                      }}>
                      <Text style={[styles.roleCheckText, isChecked && { color: '#FFF', fontWeight: '700' }]}>
                        {ROLE_CONFIG[rk].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Daily Base Wage (₹ தினக்கூலி):</Text>
              <TextInput
                style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
                value={newWorkerBaseWage}
                onChangeText={setNewWorkerBaseWage}
                keyboardType="numeric"
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>OT Hourly Rate (₹ மணிநேர விகிதம்):</Text>
              <TextInput
                style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
                value={newWorkerOtRate}
                onChangeText={setNewWorkerOtRate}
                keyboardType="numeric"
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setNewWorkerIsDriver(!newWorkerIsDriver)}>
                <View style={[styles.checkboxSquare, newWorkerIsDriver && { backgroundColor: '#10B981' }]}>
                  {newWorkerIsDriver && <Check size={14} color="#FFF" />}
                </View>
                <Text style={[styles.checkboxLabel, { color: themeColors.text }]}>Is Company Fleet Driver?</Text>
              </TouchableOpacity>

              {newWorkerIsDriver && (
                <>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>Assigned Vehicle (வண்டி எண்):</Text>
                  <TextInput
                    style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
                    value={newWorkerVehicle}
                    onChangeText={setNewWorkerVehicle}
                    placeholder="e.g. TN 01 AB 1234"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddWorkerModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: themeColors.primary }]} onPress={handleCreateWorker}>
                <Text style={styles.modalSaveText}>Save Staff</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: PAY ADVANCE MODAL */}
      <Modal visible={addAdvanceModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Pay Advance (முன்பணம்)</Text>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Select Staff / Worker:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {workersList.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    styles.rolePill,
                    advanceWorkerId === w.id && { backgroundColor: themeColors.primary },
                  ]}
                  onPress={() => setAdvanceWorkerId(w.id)}>
                  <Text style={[styles.rolePillText, advanceWorkerId === w.id && { color: '#FFF' }]}>{w.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Amount (₹ தொகை) *:</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              value={advanceAmount}
              onChangeText={setAdvanceAmount}
              keyboardType="numeric"
              placeholder="e.g. 1000"
              placeholderTextColor={themeColors.textSecondary}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Payment Mode:</Text>
            <View style={styles.modeToggleRow}>
              {['cash', 'upi', 'bank'].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modeBtn,
                    advanceMode === m && { backgroundColor: themeColors.primary },
                  ]}
                  onPress={() => setAdvanceMode(m)}>
                  <Text style={[styles.modeBtnText, advanceMode === m && { color: '#FFF' }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Remarks / குறிப்புகள்:</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              value={advanceRemarks}
              onChangeText={setAdvanceRemarks}
              placeholder="Reason for advance"
              placeholderTextColor={themeColors.textSecondary}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddAdvanceModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#10B981' }]} onPress={handleRecordAdvance}>
                <Text style={styles.modalSaveText}>Disburse ₹</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 4: PAYROLL STATEMENT & WHATSAPP SLIP */}
      <Modal visible={payrollSummaryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBoxLarge, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Monthly Payroll Statement</Text>

            {selectedPayrollData && (
              <ScrollView style={{ maxHeight: 380 }}>
                <View style={styles.payrollCardBox}>
                  <Text style={[styles.payrollModalWorker, { color: themeColors.text }]}>
                    {selectedPayrollData.worker?.name}
                  </Text>
                  <Text style={[styles.payrollModalSub, { color: themeColors.textSecondary }]}>
                    Month: {selectedPayrollData.month}
                  </Text>

                  <View style={styles.payrollCalcRow}>
                    <Text style={[styles.calcRowLabel, { color: themeColors.textSecondary }]}>Work Units (நாட்கள்):</Text>
                    <Text style={[styles.calcRowVal, { color: themeColors.text }]}>
                      {selectedPayrollData.effective_days} days
                    </Text>
                  </View>

                  <View style={styles.payrollCalcRow}>
                    <Text style={[styles.calcRowLabel, { color: themeColors.textSecondary }]}>Base Wage Earned:</Text>
                    <Text style={[styles.calcRowVal, { color: themeColors.text }]}>
                      ₹{selectedPayrollData.base_earned}
                    </Text>
                  </View>

                  <View style={styles.payrollCalcRow}>
                    <Text style={[styles.calcRowLabel, { color: themeColors.textSecondary }]}>Overtime Earned:</Text>
                    <Text style={[styles.calcRowVal, { color: '#7C3AED' }]}>
                      + ₹{selectedPayrollData.total_ot_amount}
                    </Text>
                  </View>

                  <View style={styles.payrollCalcRow}>
                    <Text style={[styles.calcRowLabel, { color: themeColors.textSecondary }]}>Advance Deductions:</Text>
                    <Text style={[styles.calcRowVal, { color: '#DC2626' }]}>
                      − ₹{selectedPayrollData.total_advance_deduction}
                    </Text>
                  </View>

                  <View style={styles.netPayableCard}>
                    <Text style={styles.netPayableLabel}>Net Balance Payable (மீதி சம்பளம்):</Text>
                    <Text style={styles.netPayableAmount}>₹{selectedPayrollData.net_balance_payable}</Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPayrollSummaryModalVisible(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#25D366' }]}
                onPress={() =>
                  handleSendWhatsAppSlip(
                    selectedPayrollData?.worker?.phone || '',
                    selectedPayrollData?.whatsapp_slip_text || ''
                  )
                }>
                <MessageCircle size={16} color="#FFF" />
                <Text style={styles.modalSaveText}>Share WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 5: ADD CASH IN / CASH OUT MODAL */}
      <Modal visible={addCashModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              {cashType === 'IN' ? '+ Cash In (வரவு)' : '− Cash Out (செலவு)'}
            </Text>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Amount (₹ தொகை) *:</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="numeric"
              placeholder="e.g. 500"
              placeholderTextColor={themeColors.textSecondary}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Category:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {['diesel', 'toll', 'maintenance', 'tea_food', 'advance', 'office', 'other'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.rolePill,
                    cashCategory === cat && { backgroundColor: themeColors.primary },
                  ]}
                  onPress={() => setCashCategory(cat)}>
                  <Text style={[styles.rolePillText, cashCategory === cat && { color: '#FFF' }]}>
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Notes / குறிப்புகள்:</Text>
            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border }]}
              value={cashNotes}
              onChangeText={setCashNotes}
              placeholder="Description"
              placeholderTextColor={themeColors.textSecondary}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddCashModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  { backgroundColor: cashType === 'IN' ? '#059669' : '#DC2626' },
                ]}
                onPress={handleAddCashbook}>
                <Text style={styles.modalSaveText}>Save Entry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  syncBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  tabBarContainer: {
    borderBottomWidth: 1,
  },
  tabScroll: {
    paddingHorizontal: 12,
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mainScrollView: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  dateControlCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dateInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  todayBtn: {
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
    borderRadius: 8,
  },
  todayBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  hajriSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hajriStatBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  hajriStatNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  hajriStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 8,
  },
  markAllBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  roleFilterScroll: {
    marginBottom: 14,
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  rolePillActive: {
    backgroundColor: '#1E293B',
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  rolePillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  recordsList: {
    gap: 12,
  },
  workerHajriCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  workerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  workerName: {
    fontSize: 15,
    fontWeight: '800',
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  roleMiniTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleMiniText: {
    fontSize: 9,
    fontWeight: '700',
  },
  attributionTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    fontSize: 9,
    color: '#64748B',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  statusBtn: {
    flex: 1,
    height: 36,
    borderWidth: 1.5,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  otInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: '#F5F3FF',
    padding: 6,
    borderRadius: 6,
  },
  otInfoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 13,
  },
  catalogTopBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  addNewStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 10,
    gap: 6,
  },
  addNewStaffBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  staffCatalogCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  staffMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  staffCardName: {
    fontSize: 15,
    fontWeight: '800',
  },
  staffCardPhone: {
    fontSize: 12,
    marginTop: 2,
  },
  staffWageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
  },
  wageText: {
    fontSize: 11,
  },
  ownFleetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  fleetBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  fleetBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  fleetDriverCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  fleetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverNameText: {
    fontSize: 16,
    fontWeight: '800',
  },
  driverPhoneText: {
    fontSize: 12,
    marginTop: 2,
  },
  carNumberPlate: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  carPlateText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
  },
  fleetCardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  fleetActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  fleetActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  advancesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  newAdvanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  newAdvanceBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  payrollWorkerCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  payrollTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payrollWorkerName: {
    fontSize: 15,
    fontWeight: '800',
  },
  payrollRole: {
    fontSize: 12,
    marginTop: 2,
  },
  calcSlipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  calcSlipBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cashbookCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  cashBox: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  cashBoxNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  cashBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  cashActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  cashInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  cashOutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  cashActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cashEntryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  entryCategory: {
    fontSize: 13,
    fontWeight: '800',
  },
  entryNotes: {
    fontSize: 11,
    marginTop: 2,
  },
  entryRight: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  entryByText: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },
  auditHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  auditHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  auditHeaderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  auditLogCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  auditLogTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  auditUsername: {
    fontSize: 13,
    fontWeight: '800',
  },
  auditTime: {
    fontSize: 11,
  },
  auditActionText: {
    fontSize: 12,
  },
  auditDetailsText: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
  },
  modalBoxLarge: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelText: {
    color: '#64748B',
    fontWeight: '700',
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  modalSaveText: {
    color: '#FFF',
    fontWeight: '800',
  },
  rolesCheckboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleCheckChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  roleCheckText: {
    fontSize: 11,
    color: '#334155',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  payrollCardBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payrollModalWorker: {
    fontSize: 18,
    fontWeight: '800',
  },
  payrollModalSub: {
    fontSize: 12,
    marginBottom: 12,
  },
  payrollCalcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcRowLabel: {
    fontSize: 12,
  },
  calcRowVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  netPayableCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  netPayableLabel: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '700',
  },
  netPayableAmount: {
    fontSize: 22,
    color: '#047857',
    fontWeight: '900',
    marginTop: 2,
  },
});
