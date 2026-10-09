import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Users,
  Calendar,
  DollarSign,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet,
  Receipt,
  FileText,
  RotateCcw,
  Check,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Truck,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';

type TabMode = 'attendance' | 'workers' | 'advances' | 'cashbook' | 'payroll';

interface WorkerItem {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  wage_type: string;
  base_wage: number;
  ot_rate_per_hour: number;
  is_company_driver: boolean;
  assigned_vehicle_number?: string;
  is_active: boolean;
  joined_at?: string;
  notes?: string;
}

interface AttendanceRow {
  worker_id: string;
  worker_name: string;
  phone: string;
  roles: string[];
  base_wage: number;
  ot_rate_per_hour: number;
  is_company_driver: boolean;
  assigned_vehicle_number?: string;
  status: string | null; // P, A, HD, OT
  ot_minutes: number;
  ot_amount: number;
  remarks?: string;
}

export default function WorkersPayrollScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabMode>('attendance');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Date selection
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Data states
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>({ total: 0, present: 0, absent: 0, half_day: 0, overtime: 0 });
  const [advances, setAdvances] = useState<any[]>([]);
  const [cashbook, setCashbook] = useState<any[]>([]);
  const [payrollRows, setPayrollRows] = useState<any[]>([]);

  // Local unsaved attendance edits map: worker_id -> status
  const [pendingAttendance, setPendingAttendance] = useState<Record<string, { status: string; ot_minutes: number }>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Modal states
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerItem | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerWageType, setWorkerWageType] = useState('daily');
  const [workerBaseWage, setWorkerBaseWage] = useState('');
  const [workerOtRate, setWorkerOtRate] = useState('');
  const [workerIsDriver, setWorkerIsDriver] = useState(false);
  const [workerVehicle, setWorkerVehicle] = useState('');
  const [savingWorker, setSavingWorker] = useState(false);

  // Advance modal
  const [showAddAdvanceModal, setShowAddAdvanceModal] = useState(false);
  const [advanceWorkerId, setAdvanceWorkerId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [advanceMode, setAdvanceMode] = useState('cash');
  const [savingAdvance, setSavingAdvance] = useState(false);

  // Petty cash modal
  const [showAddCashModal, setShowAddCashModal] = useState(false);
  const [cashType, setCashType] = useState<'IN' | 'OUT'>('OUT');
  const [cashAmount, setCashAmount] = useState('');
  const [cashCategory, setCashCategory] = useState('tea_food');
  const [cashNotes, setCashNotes] = useState('');
  const [savingCash, setSavingCash] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      if (activeTab === 'attendance') {
        const attRes = await apiService.getDailyAttendance(selectedDate);
        if (attRes) {
          setAttendanceRecords(attRes.records || []);
          setAttendanceSummary(attRes.summary || {});
          // Sync pending state with server state
          const initialMap: Record<string, { status: string; ot_minutes: number }> = {};
          (attRes.records || []).forEach((r: AttendanceRow) => {
            if (r.status) initialMap[r.worker_id] = { status: r.status, ot_minutes: r.ot_minutes || 0 };
          });
          setPendingAttendance(initialMap);
        }
      } else if (activeTab === 'workers') {
        const wRes = await apiService.getWorkers(false);
        setWorkers(wRes?.workers || []);
      } else if (activeTab === 'advances') {
        const advRes = await apiService.getWorkerAdvances(undefined, selectedMonth);
        setAdvances(advRes?.advances || advRes || []);
      } else if (activeTab === 'cashbook') {
        const cashRes = await apiService.getPettyCashBook();
        setCashbook(cashRes?.entries || cashRes || []);
      } else if (activeTab === 'payroll') {
        const payRes = await apiService.getWorkersPayroll(selectedMonth);
        setPayrollRows(payRes?.payroll || payRes?.records || payRes || []);
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to load data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedDate, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleToggleAttendance = (workerId: string, status: string) => {
    setPendingAttendance((prev) => {
      const current = prev[workerId];
      if (current?.status === status) {
        // Toggle off
        const next = { ...prev };
        delete next[workerId];
        return next;
      }
      return {
        ...prev,
        [workerId]: { status, ot_minutes: current?.ot_minutes || 0 },
      };
    });
  };

  const handleSaveBulkAttendance = async () => {
    setSavingAttendance(true);
    try {
      const records = Object.entries(pendingAttendance).map(([wId, val]) => ({
        worker_id: wId,
        status: val.status,
        ot_minutes: val.ot_minutes || 0,
        ot_amount: 0,
      }));
      await apiService.markBulkAttendance({
        date: selectedDate,
        records,
      });
      showToast('Attendance saved successfully', 'success');
      loadData(true);
    } catch (e: any) {
      showToast(e?.message || 'Failed to save attendance', 'error');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleSaveWorker = async () => {
    if (!workerName.trim()) {
      Alert.alert('Validation Error', 'Worker name is required');
      return;
    }
    if (!workerPhone.trim() || workerPhone.trim().length < 10) {
      Alert.alert('Validation Error', 'Enter a valid 10-digit phone number');
      return;
    }
    setSavingWorker(true);
    try {
      const payload = {
        name: workerName.trim(),
        phone: workerPhone.trim(),
        wage_type: workerWageType,
        base_wage: parseFloat(workerBaseWage) || 0,
        ot_rate_per_hour: parseFloat(workerOtRate) || 0,
        is_company_driver: workerIsDriver,
        assigned_vehicle_number: workerIsDriver ? workerVehicle.trim() || null : null,
      };
      if (editingWorker) {
        await apiService.updateWorker(editingWorker.id, payload);
        showToast('Worker updated', 'success');
      } else {
        await apiService.createWorker(payload);
        showToast('Worker created', 'success');
      }
      setShowAddWorkerModal(false);
      resetWorkerForm();
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save worker');
    } finally {
      setSavingWorker(false);
    }
  };

  const resetWorkerForm = () => {
    setEditingWorker(null);
    setWorkerName('');
    setWorkerPhone('');
    setWorkerWageType('daily');
    setWorkerBaseWage('');
    setWorkerOtRate('');
    setWorkerIsDriver(false);
    setWorkerVehicle('');
  };

  const openEditWorker = (w: WorkerItem) => {
    setEditingWorker(w);
    setWorkerName(w.name);
    setWorkerPhone(w.phone);
    setWorkerWageType(w.wage_type || 'daily');
    setWorkerBaseWage(String(w.base_wage || 0));
    setWorkerOtRate(String(w.ot_rate_per_hour || 0));
    setWorkerIsDriver(!!w.is_company_driver);
    setWorkerVehicle(w.assigned_vehicle_number || '');
    setShowAddWorkerModal(true);
  };

  const handleSaveAdvance = async () => {
    const amt = parseFloat(advanceAmount);
    if (!advanceWorkerId || isNaN(amt) || amt <= 0) {
      Alert.alert('Validation Error', 'Select a worker and enter a valid advance amount');
      return;
    }
    setSavingAdvance(true);
    try {
      await apiService.recordWorkerAdvance({
        worker_id: advanceWorkerId,
        date: selectedDate,
        amount: amt,
        payment_mode: advanceMode,
        remarks: advanceRemarks.trim() || undefined,
        record_in_petty_cash: true,
      });
      showToast('Advance recorded', 'success');
      setShowAddAdvanceModal(false);
      setAdvanceAmount('');
      setAdvanceRemarks('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to record advance');
    } finally {
      setSavingAdvance(false);
    }
  };

  const handleSaveCash = async () => {
    const amt = parseFloat(cashAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Validation Error', 'Enter a valid amount');
      return;
    }
    setSavingCash(true);
    try {
      await apiService.recordPettyCashEntry({
        date: selectedDate,
        transaction_type: cashType,
        amount: amt,
        category: cashCategory,
        payment_mode: 'cash',
        notes: cashNotes.trim() || undefined,
      });
      showToast('Cash entry recorded', 'success');
      setShowAddCashModal(false);
      setCashAmount('');
      setCashNotes('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to record entry');
    } finally {
      setSavingCash(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const itemBorder = isDark ? '#334155' : '#E2E8F0';
  const subText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <Toast {...toast} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Workers & Payroll</Text>
          <Text style={[styles.headerSub, { color: subText }]}>Attendance, advances, cashbook & monthly salary</Text>
        </View>
        {activeTab === 'workers' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: '#6366F1' }]}
            onPress={() => { resetWorkerForm(); setShowAddWorkerModal(true); }}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Worker</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'advances' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => setShowAddAdvanceModal(true)}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Advance</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'cashbook' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: '#F59E0B' }]}
            onPress={() => setShowAddCashModal(true)}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Entry</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {[
          { id: 'attendance', label: 'Attendance', icon: CheckCircle2 },
          { id: 'workers', label: 'Team List', icon: Users },
          { id: 'advances', label: 'Advances', icon: Wallet },
          { id: 'cashbook', label: 'Petty Cash', icon: Receipt },
          { id: 'payroll', label: 'Payroll', icon: DollarSign },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, active && { borderBottomColor: '#6366F1', borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.id as TabMode)}
            >
              <Icon size={16} color={active ? '#6366F1' : subText} />
              <Text style={[styles.tabText, { color: active ? '#6366F1' : subText, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#6366F1" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        >
          {/* ---------------- ATTENDANCE TAB ---------------- */}
          {activeTab === 'attendance' && (
            <View>
              {/* Date Header & Summary */}
              <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={18} color="#6366F1" />
                    <Text style={[styles.cardTitle, { color: themeColors.text }]}>{selectedDate}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.saveBtnSmall, { backgroundColor: '#6366F1', opacity: savingAttendance ? 0.6 : 1 }]}
                    onPress={handleSaveBulkAttendance}
                    disabled={savingAttendance}
                  >
                    {savingAttendance ? <ActivityIndicator size="small" color="#FFF" /> : <><Check size={14} color="#FFF" /><Text style={styles.saveBtnText}>Save All</Text></>}
                  </TouchableOpacity>
                </View>
                <View style={styles.metricsGrid}>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#10B981' }]}>{attendanceSummary.present || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Present</Text>
                  </View>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#EF4444' }]}>{attendanceSummary.absent || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Absent</Text>
                  </View>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#F59E0B' }]}>{attendanceSummary.half_day || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Half Day</Text>
                  </View>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#8B5CF6' }]}>{attendanceSummary.overtime || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Overtime</Text>
                  </View>
                </View>
              </View>

              {/* Attendance List */}
              <Text style={[styles.sectionTitle, { color: subText }]}>1-TAP DAILY HAJRI</Text>
              {attendanceRecords.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Users size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No active workers found. Add workers first.</Text>
                </View>
              ) : (
                attendanceRecords.map((row) => {
                  const currentStatus = pendingAttendance[row.worker_id]?.status || null;
                  return (
                    <View key={row.worker_id} style={[styles.workerRowCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                      <View style={styles.workerInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.workerName, { color: themeColors.text }]}>{row.worker_name}</Text>
                          {row.is_company_driver && (
                            <View style={styles.driverTag}><Truck size={10} color="#0284C7" /><Text style={styles.driverTagText}>{row.assigned_vehicle_number || 'Driver'}</Text></View>
                          )}
                        </View>
                        <Text style={[styles.workerMeta, { color: subText }]}>₹{row.base_wage}/day · {row.phone}</Text>
                      </View>
                      {/* Attendance Buttons */}
                      <View style={styles.attBtnRow}>
                        {[
                          { key: 'P', label: 'P', color: '#10B981', bg: '#D1FAE5' },
                          { key: 'HD', label: '½', color: '#F59E0B', bg: '#FEF3C7' },
                          { key: 'A', label: 'A', color: '#EF4444', bg: '#FEE2E2' },
                          { key: 'OT', label: 'OT', color: '#8B5CF6', bg: '#EDE9FE' },
                        ].map((btn) => {
                          const isSel = currentStatus === btn.key;
                          return (
                            <TouchableOpacity
                              key={btn.key}
                              style={[
                                styles.attBtn,
                                {
                                  borderColor: isSel ? btn.color : itemBorder,
                                  backgroundColor: isSel ? btn.color : (isDark ? '#0F172A' : '#F8FAFC'),
                                },
                              ]}
                              onPress={() => handleToggleAttendance(row.worker_id, btn.key)}
                            >
                              <Text style={[styles.attBtnText, { color: isSel ? '#FFFFFF' : (isDark ? '#94A3B8' : '#475569'), fontWeight: isSel ? '800' : '600' }]}>
                                {btn.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ---------------- WORKERS LIST TAB ---------------- */}
          {activeTab === 'workers' && (
            <View>
              {workers.map((w) => (
                <View key={w.id} style={[styles.workerCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.workerName, { color: themeColors.text }]}>{w.name}</Text>
                        {!w.is_active && <View style={styles.inactiveTag}><Text style={styles.inactiveTagText}>Inactive</Text></View>}
                      </View>
                      <Text style={[styles.workerMeta, { color: subText }]}>{w.phone} · {w.wage_type.toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditWorker(w)} style={styles.editBtn}>
                      <Edit2 size={16} color="#6366F1" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.wageInfoBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                    <Text style={[styles.wageText, { color: themeColors.text }]}>Base: ₹{w.base_wage}</Text>
                    <Text style={[styles.wageText, { color: themeColors.text }]}>OT: ₹{w.ot_rate_per_hour}/hr</Text>
                    {w.is_company_driver && <Text style={[styles.wageText, { color: '#0284C7' }]}>🚗 {w.assigned_vehicle_number || 'Company Fleet'}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ---------------- ADVANCES TAB ---------------- */}
          {activeTab === 'advances' && (
            <View>
              <View style={[styles.monthSelector, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <Calendar size={16} color="#6366F1" />
                <Text style={[styles.monthText, { color: themeColors.text }]}>Month: {selectedMonth}</Text>
              </View>
              {advances.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Wallet size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No advances recorded for this month.</Text>
                </View>
              ) : (
                advances.map((adv, idx) => (
                  <View key={adv.id || idx} style={[styles.logRowCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.logTitle, { color: themeColors.text }]}>{adv.worker_name || 'Worker'}</Text>
                      <Text style={[styles.logSub, { color: subText }]}>{adv.date} · {adv.payment_mode?.toUpperCase()}{adv.remarks ? ` · ${adv.remarks}` : ''}</Text>
                    </View>
                    <Text style={[styles.logAmount, { color: '#EF4444' }]}>-₹{adv.amount}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---------------- CASHBOOK TAB ---------------- */}
          {activeTab === 'cashbook' && (
            <View>
              {cashbook.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Receipt size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No petty cash entries logged yet.</Text>
                </View>
              ) : (
                cashbook.map((entry, idx) => {
                  const isOut = entry.transaction_type === 'OUT';
                  return (
                    <View key={entry.id || idx} style={[styles.logRowCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.logTitle, { color: themeColors.text }]}>{entry.category?.toUpperCase() || 'GENERAL'}</Text>
                        <Text style={[styles.logSub, { color: subText }]}>{entry.date} · {entry.notes || 'Expense'}</Text>
                      </View>
                      <Text style={[styles.logAmount, { color: isOut ? '#EF4444' : '#10B981' }]}>
                        {isOut ? '-' : '+'}₹{entry.amount}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ---------------- PAYROLL TAB ---------------- */}
          {activeTab === 'payroll' && (
            <View>
              <View style={[styles.monthSelector, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <Calendar size={16} color="#6366F1" />
                <Text style={[styles.monthText, { color: themeColors.text }]}>Month: {selectedMonth}</Text>
              </View>
              {payrollRows.length === 0 ? (
                <View style={styles.emptyCard}>
                  <DollarSign size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No payroll data available for this period.</Text>
                </View>
              ) : (
                payrollRows.map((p, idx) => (
                  <View key={p.worker_id || idx} style={[styles.payrollCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={[styles.workerName, { color: themeColors.text }]}>{p.worker_name}</Text>
                      <Text style={[styles.payrollNet, { color: '#10B981' }]}>Net: ₹{p.net_payable ?? p.total_earned ?? 0}</Text>
                    </View>
                    <View style={[styles.payrollBreakdown, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                      <View style={styles.breakdownItem}>
                        <Text style={[styles.breakdownVal, { color: themeColors.text }]}>{p.present_days ?? p.days_worked ?? 0}</Text>
                        <Text style={[styles.breakdownLbl, { color: subText }]}>Days</Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={[styles.breakdownVal, { color: themeColors.text }]}>₹{p.base_earned ?? 0}</Text>
                        <Text style={[styles.breakdownLbl, { color: subText }]}>Base</Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={[styles.breakdownVal, { color: '#8B5CF6' }]}>+₹{p.ot_earned ?? 0}</Text>
                        <Text style={[styles.breakdownLbl, { color: subText }]}>OT</Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={[styles.breakdownVal, { color: '#EF4444' }]}>-₹{p.total_advances ?? p.advances ?? 0}</Text>
                        <Text style={[styles.breakdownLbl, { color: subText }]}>Advances</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------- ADD / EDIT WORKER MODAL ---------------- */}
      <Modal visible={showAddWorkerModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddWorkerModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]} edges={['top']}>
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>{editingWorker ? 'Edit Worker' : 'Add New Worker'}</Text>
            <TouchableOpacity onPress={() => setShowAddWorkerModal(false)}><Text style={{ color: '#6366F1', fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.inputLbl, { color: subText }]}>Full Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={workerName}
              onChangeText={setWorkerName}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Phone (10 digits)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={workerPhone}
              onChangeText={setWorkerPhone}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="9876543210"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Base Wage (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={workerBaseWage}
              onChangeText={setWorkerBaseWage}
              keyboardType="numeric"
              placeholder="e.g. 600"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>OT Rate per Hour (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={workerOtRate}
              onChangeText={setWorkerOtRate}
              keyboardType="numeric"
              placeholder="e.g. 75"
              placeholderTextColor={subText}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 14 }}>
              <Text style={[styles.workerName, { color: themeColors.text }]}>Is Company Fleet Driver?</Text>
              <TouchableOpacity
                style={[styles.toggleBtn, { backgroundColor: workerIsDriver ? '#6366F1' : (isDark ? '#334155' : '#E2E8F0') }]}
                onPress={() => setWorkerIsDriver(!workerIsDriver)}
              >
                <Text style={{ color: workerIsDriver ? '#FFF' : subText, fontWeight: '700', fontSize: 12 }}>{workerIsDriver ? 'YES' : 'NO'}</Text>
              </TouchableOpacity>
            </View>

            {workerIsDriver && (
              <View>
                <Text style={[styles.inputLbl, { color: subText }]}>Assigned Vehicle Number</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
                  value={workerVehicle}
                  onChangeText={setWorkerVehicle}
                  autoCapitalize="characters"
                  placeholder="TN 01 AB 1234"
                  placeholderTextColor={subText}
                />
              </View>
            )}

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#6366F1' }]} onPress={handleSaveWorker} disabled={savingWorker}>
              {savingWorker ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Worker Details</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ---------------- RECORD ADVANCE MODAL ---------------- */}
      <Modal visible={showAddAdvanceModal} transparent animationType="fade" onRequestClose={() => setShowAddAdvanceModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginBottom: 12 }]}>Record Worker Advance</Text>
            <Text style={[styles.inputLbl, { color: subText }]}>Select Worker</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {workers.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.chip, { backgroundColor: advanceWorkerId === w.id ? '#6366F1' : (isDark ? '#0F172A' : '#F1F5F9'), borderColor: advanceWorkerId === w.id ? '#6366F1' : itemBorder }]}
                  onPress={() => setAdvanceWorkerId(w.id)}
                >
                  <Text style={{ color: advanceWorkerId === w.id ? '#FFF' : themeColors.text, fontWeight: '700', fontSize: 12 }}>{w.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLbl, { color: subText }]}>Advance Amount (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={advanceAmount}
              onChangeText={setAdvanceAmount}
              keyboardType="numeric"
              placeholder="e.g. 2000"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Remarks / Reason</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={advanceRemarks}
              onChangeText={setAdvanceRemarks}
              placeholder="Emergency, travel, etc."
              placeholderTextColor={subText}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: itemBorder }]} onPress={() => setShowAddAdvanceModal(false)}>
                <Text style={{ color: subText, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtnSmall, { backgroundColor: '#10B981' }]} onPress={handleSaveAdvance} disabled={savingAdvance}>
                {savingAdvance ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Give Advance</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------------- PETTY CASH MODAL ---------------- */}
      <Modal visible={showAddCashModal} transparent animationType="fade" onRequestClose={() => setShowAddCashModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginBottom: 12 }]}>Log Petty Cash</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['OUT', 'IN'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toggleBtnFlex, { backgroundColor: cashType === t ? (t === 'OUT' ? '#EF4444' : '#10B981') : (isDark ? '#0F172A' : '#F1F5F9') }]}
                  onPress={() => setCashType(t)}
                >
                  <Text style={{ color: cashType === t ? '#FFF' : subText, fontWeight: '800' }}>{t === 'OUT' ? 'EXPENSE (OUT)' : 'TOP UP (IN)'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLbl, { color: subText }]}>Amount (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="numeric"
              placeholder="e.g. 500"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Category / Notes</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={cashNotes}
              onChangeText={setCashNotes}
              placeholder="Tea, office supplies, repairs..."
              placeholderTextColor={subText}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: itemBorder }]} onPress={() => setShowAddCashModal(false)}>
                <Text style={{ color: subText, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtnSmall, { backgroundColor: '#F59E0B' }]} onPress={handleSaveCash} disabled={savingCash}>
                {savingCash ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Entry</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  primaryActionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabText: { fontSize: 11 },
  scroll: { flex: 1 },
  summaryCard: { borderRadius: 8, borderWidth: 1, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  saveBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  saveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', gap: 6 },
  metricBox: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
  metricVal: { fontSize: 16, fontWeight: '800' },
  metricLbl: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  workerRowCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  workerInfo: { flex: 1, marginRight: 8 },
  workerName: { fontSize: 14, fontWeight: '700' },
  workerMeta: { fontSize: 11, marginTop: 2 },
  driverTag: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  driverTagText: { fontSize: 10, fontWeight: '700', color: '#0284C7' },
  attBtnRow: { flexDirection: 'row', gap: 6 },
  attBtn: { width: 34, height: 34, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  attBtnText: { fontSize: 12 },
  workerCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  editBtn: { padding: 6 },
  inactiveTag: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inactiveTagText: { color: '#EF4444', fontSize: 10, fontWeight: '700' },
  wageInfoBox: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: 6, borderWidth: 1, marginTop: 10 },
  wageText: { fontSize: 11.5, fontWeight: '600' },
  monthSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  monthText: { fontSize: 13, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13 },
  logRowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  logTitle: { fontSize: 13.5, fontWeight: '700' },
  logSub: { fontSize: 11, marginTop: 2 },
  logAmount: { fontSize: 15, fontWeight: '800' },
  payrollCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  payrollNet: { fontSize: 15, fontWeight: '800' },
  payrollBreakdown: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderRadius: 6, borderWidth: 1 },
  breakdownItem: { alignItems: 'center' },
  breakdownVal: { fontSize: 13, fontWeight: '700' },
  breakdownLbl: { fontSize: 10, marginTop: 2 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  inputLbl: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  modalInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  submitBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 10, borderWidth: 1, padding: 18 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, marginRight: 8 },
  toggleBtnFlex: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6, borderWidth: 1 },
  submitBtnSmall: { flex: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6 },
});
