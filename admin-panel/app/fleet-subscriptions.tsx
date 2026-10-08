import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  CreditCard,
  History,
  Phone,
  Car,
  Users,
  Wallet,
  Calendar,
  X,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';
import DatePickButton from '@/components/DatePickButton';
import Toast, { useToast } from '@/components/Toast';

// The first one takes the money from the partner's own wallet (the server debits it in the same step). All others mean the money
// already arrived outside the app (UPI / bank / cash) and staff only record it.
const WALLET_CHANNEL = 'Wallet (deduct from partner wallet)';
// Share a Razorpay payment link on WhatsApp: the partner pays by UPI/card and the plan activates by itself.
const LINK_CHANNEL = 'Payment Link (share on WhatsApp)';
// Fallback only - the real list (and the plan fees) come from the server (/admin/fleet-subscriptions/options), which the owner can change.
const PAYMENT_CHANNELS = [
  WALLET_CHANNEL,
  'GPay (Google Pay)',
  'PhonePe',
  'Direct Bank Transfer (NEFT/IMPS)',
  'Cash in Hand / Office',
  'UPI QR Code',
  'Paytm',
  'Razorpay / Online',
  'Cheque',
  'Other',
];

export default function FleetSubscriptionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; openPay?: string }>();
  const openedFromLink = useRef(false);
  const { isDark } = useTheme();
  const { toast, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fleets, setFleets] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    total_fleets: 0,
    paid_count: 0,
    overdue_count: 0,
    paused_count: 0,
    trusted_count: 0,
  });

  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'OVERDUE' | 'PAUSED' | 'TRUSTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState(typeof params.search === 'string' ? params.search : '');

  // Modals state
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedFleet, setSelectedFleet] = useState<any>(null);

  // Form states - Payment
  const [payChannel, setPayChannel] = useState(PAYMENT_CHANNELS[0]);
  const [payRef, setPayRef] = useState('');
  const [payAmount, setPayAmount] = useState('199');
  const [payPlan, setPayPlan] = useState<'MONTHLY' | 'YEARLY' | 'CUSTOM'>('MONTHLY');
  const [payDurationDays, setPayDurationDays] = useState('30');
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [payStartDate, setPayStartDate] = useState<string>(todayIso());   // the day the partner subscribed
  const [markTrusted, setMarkTrusted] = useState(true);
  const [payNotes, setPayNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [opts, setOpts] = useState<any>(null);                       // plans / fees / channels from the server
  const [linkInfo, setLinkInfo] = useState<any>(null);               // the payment link just created
  const [checkingLink, setCheckingLink] = useState(false);

  // Form states - Pause
  const [pauseReason, setPauseReason] = useState('');

  // History state
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await apiService.getFleetSubscriptions(activeTab, searchQuery, 0, 100);
      setFleets(res.items || []);
      if (res.summary) setSummary(res.summary);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load fleet subscriptions', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    apiService.getFleetUpgradeOptions().then(setOpts).catch(() => setOpts(null));
  }, []);

  const planFeeFor = (plan: string, fallback: number) => {
    const fee = Number(opts?.plans?.find((x: any) => x.key === plan)?.fee || 0);
    return fee > 0 ? fee : fallback;
  };
  const channelList: string[] = (() => {
    if (!opts?.channels?.length) return PAYMENT_CHANNELS;
    const others = opts.channels.filter((c: string) => !/^wallet/i.test(c));
    return [...(opts.payment_link_enabled ? [LINK_CHANNEL] : []), WALLET_CHANNEL, ...others];
  })();

  // Open Payment Modal
  const openPayModal = (fleet: any) => {
    setSelectedFleet(fleet);
    const planFee = fleet.subscription_type === 'YEARLY' ? planFeeFor('YEARLY', 0) : planFeeFor('MONTHLY', 0);
    const canLink = !!opts?.payment_link_enabled;
    setLinkInfo(null);
    // wallet when it can pay, else a shareable payment link (if Razorpay is set up), else just record the payment
    setPayChannel(planFee > 0 && Number(fleet.wallet_balance || 0) >= planFee ? WALLET_CHANNEL : canLink ? LINK_CHANNEL : (channelList.find((c) => c !== WALLET_CHANNEL && c !== LINK_CHANNEL) || WALLET_CHANNEL));
    setPayRef('');
    setPayAmount(planFee > 0 ? String(planFee) : '');
    setPayPlan(fleet.subscription_type === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
    setPayDurationDays(fleet.subscription_type === 'YEARLY' ? '365' : '30');
    setPayStartDate(todayIso());
    setMarkTrusted(true);
    setPayNotes('');
    setPayModalVisible(true);
  };

  const sendPaymentLink = async () => {
    if (!selectedFleet) return;
    if (payPlan === 'CUSTOM') {
      Alert.alert('Choose Monthly or Yearly', 'A payment link works for the Monthly or Yearly plan.');
      return;
    }
    const amountNum = parseInt(payAmount, 10);
    setSubmittingAction(true);
    try {
      const res = await apiService.createFleetPaymentLink(selectedFleet.id, { plan_type: payPlan, amount: amountNum > 0 ? amountNum : undefined });
      setLinkInfo(res);
      if (res.whatsapp_url) {
        Linking.openURL(res.whatsapp_url).catch(() => Share.share({ message: res.message }));
      } else {
        await Share.share({ message: res.message });
      }
    } catch (e: any) {
      Alert.alert('Could not create the link', e?.message || 'Try again in a minute.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const checkPaymentLink = async () => {
    if (!selectedFleet) return;
    setCheckingLink(true);
    try {
      const res = await apiService.checkFleetPaymentLink(selectedFleet.id);
      if (res.status === 'PAID') {
        showToast('Payment received. Partner is now Trusted.', 'success');
        setPayModalVisible(false);
        setLinkInfo(null);
        loadData();
      } else if (res.status === 'EXPIRED') {
        showToast('That link expired. Create a new one.', 'error');
        setLinkInfo(null);
      } else {
        showToast('Not paid yet. It activates automatically once the partner pays.', 'info');
      }
    } catch (e: any) {
      showToast(e?.message || 'Could not check the payment', 'error');
    } finally {
      setCheckingLink(false);
    }
  };

  // Arrived from a partner's page ("Upgrade to Trusted"): open the payment sheet for the one matching partner.
  useEffect(() => {
    if (params.openPay && !openedFromLink.current && !loading && fleets.length > 0 && opts !== null) {
      openedFromLink.current = true;
      openPayModal(fleets[0]);
    }
  }, [loading, fleets, opts, params.openPay]);

  const submitManualPayment = async () => {
    if (!selectedFleet) return;
    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount (₹).');
      return;
    }
    if (!payChannel) {
      Alert.alert('Payment Channel Required', 'Please specify where the payment was received.');
      return;
    }
    if (payChannel === WALLET_CHANNEL && payStartDate && payStartDate < todayIso()) {
      Alert.alert('Already paid earlier', 'This subscription started on an earlier day, so it was already paid. Choose how it was paid (UPI / bank / cash) - the wallet is not charged again.');
      return;
    }
    if (payChannel === WALLET_CHANNEL && Number(selectedFleet.wallet_balance || 0) < amountNum) {
      Alert.alert('Wallet is short', `Wallet has ₹${selectedFleet.wallet_balance || 0}, this needs ₹${amountNum}. Ask the partner to add money, or choose UPI / bank / cash if they paid outside.`);
      return;
    }

    setSubmittingAction(true);
    try {
      await apiService.recordManualFleetPayment(selectedFleet.id, {
        payment_channel: payChannel,
        payment_ref: payRef || undefined,
        amount: amountNum,
        plan_type: payPlan,
        duration_days: payPlan === 'YEARLY' ? 365 : 30,
        start_date: payStartDate && payStartDate !== todayIso() ? payStartDate : undefined,
        mark_as_trusted: markTrusted,
        notes: payNotes || undefined,
      });

      showToast(payChannel === WALLET_CHANNEL ? `₹${amountNum} taken from the wallet. Partner is now Trusted.` : `Subscription marked PAID via ${payChannel}!`, 'success');
      setPayModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Payment Record Failed', e?.message || 'Failed to record manual payment');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Pause Modal
  const openPauseModal = (fleet: any) => {
    setSelectedFleet(fleet);
    setPauseReason('');
    setPauseModalVisible(true);
  };

  const submitPauseSubscription = async () => {
    if (!selectedFleet) return;
    if (!pauseReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a clear reason for pausing this fleet subscription.');
      return;
    }

    setSubmittingAction(true);
    try {
      await apiService.pauseFleetSubscription(selectedFleet.id, pauseReason.trim());
      showToast(`Subscription paused for ${selectedFleet.full_name}`, 'info');
      setPauseModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Pause Failed', e?.message || 'Could not pause subscription');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Resume Subscription
  const handleResumeSubscription = (fleet: any) => {
    Alert.alert(
      'Resume Subscription?',
      `Are you sure you want to resume subscription for ${fleet.full_name}? Lapsed days during the pause will be extended automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume & Extend Days',
          onPress: async () => {
            try {
              await apiService.resumeFleetSubscription(fleet.id, true);
              showToast(`Subscription resumed for ${fleet.full_name}`, 'success');
              loadData();
            } catch (e: any) {
              Alert.alert('Resume Failed', e?.message || 'Could not resume subscription');
            }
          },
        },
      ]
    );
  };

  // Open History Modal
  const openHistoryModal = async (fleet: any) => {
    setSelectedFleet(fleet);
    setHistoryModalVisible(true);
    setHistoryLoading(true);
    try {
      const items = await apiService.getFleetSubscriptionHistory(fleet.id);
      setHistoryItems(items || []);
    } catch (e: any) {
      showToast('Failed to load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const bg = isDark ? '#090D16' : '#F8FAFC';
  const cardBg = isDark ? '#131B2E' : '#FFFFFF';
  const borderCol = isDark ? '#1E293B' : '#E2E8F0';
  const textCol = isDark ? '#F1F5F9' : '#0F172A';
  const subText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderCol }]}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/fleet-hub');
            }
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={textCol} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: textCol }]}>Fleet Subscriptions & Accounts</Text>
          <Text style={styles.headerSub}>Live Payment & Partner Trust Tracking</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => loadData(true)} style={styles.iconBtn}>
            <RefreshCw size={19} color={subText} />
          </TouchableOpacity>
          <ThemeToggle />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#0D47A1" />}
      >
        {/* KPI Strip */}
        <View style={styles.kpiContainer}>
          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: '#10B981', borderLeftWidth: 4 }]}>
            <Text style={styles.kpiNum}>{summary.paid_count}</Text>
            <Text style={styles.kpiLabel}>🟢 Paid / Active</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: '#EF4444', borderLeftWidth: 4 }]}>
            <Text style={styles.kpiNum}>{summary.overdue_count}</Text>
            <Text style={styles.kpiLabel}>🔴 Unpaid / Due</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: '#F59E0B', borderLeftWidth: 4 }]}>
            <Text style={styles.kpiNum}>{summary.paused_count}</Text>
            <Text style={styles.kpiLabel}>⏸️ Paused</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: '#6366F1', borderLeftWidth: 4 }]}>
            <Text style={styles.kpiNum}>{summary.trusted_count}</Text>
            <Text style={styles.kpiLabel}>⭐ Trusted</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
          <Search size={18} color={subText} />
          <TextInput
            style={[styles.searchInput, { color: textCol }]}
            placeholder="Search fleet by name, phone, Reg ID, or city..."
            placeholderTextColor={subText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={subText} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {[
            { id: 'ALL', label: `All Fleets (${summary.total_fleets})` },
            { id: 'PAID', label: `🟢 Paid (${summary.paid_count})` },
            { id: 'OVERDUE', label: `🔴 Unpaid (${summary.overdue_count})` },
            { id: 'PAUSED', label: `⏸️ Paused (${summary.paused_count})` },
            { id: 'TRUSTED', label: `⭐ Trusted (${summary.trusted_count})` },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id as any)}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: isActive ? '#0D47A1' : cardBg,
                    borderColor: isActive ? '#0D47A1' : borderCol,
                  },
                ]}
              >
                <Text style={[styles.tabChipText, { color: isActive ? '#FFFFFF' : textCol }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Fleet List */}
        {loading ? (
          <View style={{ padding: 40 }}>
            <ActivityIndicator size="large" color="#0D47A1" />
          </View>
        ) : fleets.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <AlertTriangle size={36} color="#F59E0B" />
            <Text style={[styles.emptyTitle, { color: textCol }]}>No Fleet Accounts Found</Text>
            <Text style={styles.emptySub}>No accounts match your current filter or search criteria.</Text>
          </View>
        ) : (
          fleets.map((fleet) => {
            const isPaused = fleet.subscription_status === 'PAUSED';
            const isPaid = fleet.subscription_status === 'PAID';
            const isOverdue = fleet.subscription_status === 'OVERDUE';

            return (
              <View key={fleet.id} style={[styles.fleetCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                {/* Top Row: Name, Reg ID, Badges */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.ownerName, { color: textCol }]}>{fleet.full_name}</Text>
                      <View style={styles.regBadge}>
                        <Text style={styles.regText}>#{fleet.reg_id}</Text>
                      </View>
                    </View>
                    <Text style={styles.cityText}>📍 {fleet.city} · {fleet.primary_number}</Text>
                  </View>

                  {/* Status Pills */}
                  <View style={styles.statusCol}>
                    {isPaused ? (
                      <View style={[styles.badge, { backgroundColor: isDark ? '#78350F40' : '#FEF3C7', borderColor: isDark ? '#F59E0B70' : '#F59E0B' }]}>
                        <Text style={[styles.badgeText, { color: isDark ? '#FDE68A' : '#B45309' }]}>⏸️ PAUSED</Text>
                      </View>
                    ) : isPaid ? (
                      <View style={[styles.badge, { backgroundColor: isDark ? '#064E3B40' : '#DCFCE7', borderColor: isDark ? '#10B98170' : '#10B981' }]}>
                        <Text style={[styles.badgeText, { color: isDark ? '#6EE7B7' : '#15803D' }]}>🟢 ACTIVE PAID</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, { backgroundColor: isDark ? '#7F1D1D40' : '#FEE2E2', borderColor: isDark ? '#EF444470' : '#EF4444' }]}>
                        <Text style={[styles.badgeText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                          {isOverdue ? '🔴 OVERDUE' : '⚠️ UNPAID'}
                        </Text>
                      </View>
                    )}

                    {fleet.is_trusted && (
                      <View style={[styles.badge, { backgroundColor: isDark ? '#312E8140' : '#EEF2FF', borderColor: isDark ? '#6366F170' : '#6366F1', marginTop: 4 }]}>
                        <Text style={[styles.badgeText, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>⭐ TRUSTED PARTNER{(fleet as any).trusted_via === 'YEARLY' ? ' · YEARLY' : (fleet as any).trusted_via === 'MONTHLY' ? ' · MONTHLY' : (fleet as any).trusted_via === 'ADMIN' ? ' · BY STAFF' : ''}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Pause Info Banner if Paused */}
                {isPaused && (
                  <View style={[styles.pausedAlert, { backgroundColor: isDark ? '#451A0340' : '#FEF3C7', borderColor: isDark ? '#F59E0B50' : '#F59E0B' }]}>
                    <Text style={[styles.pausedAlertTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                      ⏸️ Subscription Paused on: {fleet.billing_suspended_at ? fleet.billing_suspended_at.slice(0, 10) : 'Recorded'}
                    </Text>
                    <Text style={[styles.pausedAlertReason, { color: isDark ? '#FCD34D' : '#78350F' }]}>
                      Reason: <Text style={{ fontWeight: '700' }}>{fleet.billing_suspended_reason || 'Administrative pause'}</Text>
                    </Text>
                    {fleet.billing_suspended_by ? (
                      <Text style={[styles.pausedAlertBy, { color: isDark ? '#FBBF24' : '#B45309' }]}>By Admin: {fleet.billing_suspended_by}</Text>
                    ) : null}
                  </View>
                )}

                {/* Subscription Details Strip */}
                <View style={[styles.detailsStrip, { borderColor: borderCol, backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9' }]}>
                  <View style={styles.stripCol}>
                    <Text style={styles.stripLabel}>Plan / Renewal Due</Text>
                    <Text style={[styles.stripVal, { color: textCol }]}>
                      {fleet.subscription_type} · {fleet.billing_next_date || 'No Date'}
                    </Text>
                    {fleet.days_remaining !== null && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: fleet.days_remaining >= 0 ? '#10B981' : '#EF4444' }}>
                        {fleet.days_remaining >= 0 ? `(${fleet.days_remaining} days left)` : `(${Math.abs(fleet.days_remaining)} days late)`}
                      </Text>
                    )}
                  </View>

                  <View style={styles.stripCol}>
                    <Text style={styles.stripLabel}>Fleet Assets</Text>
                    <Text style={[styles.stripVal, { color: textCol }]}>
                      {fleet.cars_count} Cars · {fleet.drivers_count} Drivers
                    </Text>
                    <Text style={{ fontSize: 11, color: subText }}>Wallet: ₹{fleet.wallet_balance}</Text>
                  </View>
                </View>

                {/* Payment History / Channel Tag if recorded */}
                {fleet.subscription_payment_channel && (
                  <View style={[styles.payProofRow, { backgroundColor: isDark ? 'rgba(13, 71, 161, 0.25)' : 'rgba(13, 71, 161, 0.08)' }]}>
                    <CreditCard size={14} color={isDark ? '#60A5FA' : '#0D47A1'} />
                    <Text style={[styles.payProofText, { color: isDark ? '#93C5FD' : '#0D47A1' }]}>
                      Paid via <Text style={{ fontWeight: '700', color: isDark ? '#BFDBFE' : '#0D47A1' }}>{fleet.subscription_payment_channel}</Text>
                      {fleet.subscription_paid_amount ? ` (₹${fleet.subscription_paid_amount})` : ''}
                      {fleet.subscription_payment_ref ? ` · UTR: ${fleet.subscription_payment_ref}` : ''}
                    </Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.cardActions}>
                  {/* Mark Paid Button */}
                  <TouchableOpacity
                    onPress={() => openPayModal(fleet)}
                    style={[styles.btnAction, { backgroundColor: '#0D47A1' }]}
                  >
                    <CreditCard size={14} color="#FFFFFF" />
                    <Text style={styles.btnActionText}>Mark Paid & Trust</Text>
                  </TouchableOpacity>

                  {/* Pause / Resume Button */}
                  {isPaused ? (
                    <TouchableOpacity
                      onPress={() => handleResumeSubscription(fleet)}
                      style={[styles.btnAction, { backgroundColor: '#10B981' }]}
                    >
                      <PlayCircle size={14} color="#FFFFFF" />
                      <Text style={styles.btnActionText}>Resume Plan</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openPauseModal(fleet)}
                      style={[styles.btnAction, { backgroundColor: '#F59E0B' }]}
                    >
                      <PauseCircle size={14} color="#FFFFFF" />
                      <Text style={styles.btnActionText}>Pause</Text>
                    </TouchableOpacity>
                  )}

                  {/* History Button */}
                  <TouchableOpacity
                    onPress={() => openHistoryModal(fleet)}
                    style={[styles.btnIconAction, { borderColor: borderCol }]}
                    accessibilityLabel="Audit History"
                  >
                    <History size={16} color={textCol} />
                  </TouchableOpacity>

                  {/* Phone Call */}
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${fleet.primary_number}`)}
                    style={[styles.btnIconAction, { borderColor: borderCol }]}
                    accessibilityLabel="Call Partner"
                  >
                    <Phone size={15} color="#10B981" />
                  </TouchableOpacity>

                  {/* View Details */}
                  <TouchableOpacity
                    onPress={() => router.push(`/fleet-owner-detail?id=${fleet.id}`)}
                    style={[styles.btnIconAction, { borderColor: borderCol }]}
                    accessibilityLabel="View Full Profile"
                  >
                    <ChevronRight size={18} color={textCol} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── MODAL 1: MANUAL PAYMENT & TRUST OVERRIDE ── */}
      <Modal visible={payModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textCol }]}>Record Subscription Payment</Text>
                <Text style={styles.modalSub}>{selectedFleet?.full_name} (#{selectedFleet?.reg_id})</Text>
              </View>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <X size={22} color={subText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Payment Channel (Where they paid) */}
              <Text style={[styles.fieldLabel, { color: textCol }]}>Payment Channel (Where they paid) *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: 12 }}>
                {channelList.map((ch) => {
                  const isSel = payChannel === ch;
                  return (
                    <TouchableOpacity
                      key={ch}
                      onPress={() => setPayChannel(ch)}
                      style={[
                        styles.chipOption,
                        {
                          backgroundColor: isSel ? '#0D47A1' : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: isSel ? '#0D47A1' : borderCol,
                          marginRight: 0,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#FFFFFF' : textCol }}>
                        {ch}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {payChannel === LINK_CHANNEL ? (
                <Text style={{ fontSize: 12, marginBottom: 12, color: subText, lineHeight: 16 }}>
                  Creates a secure Razorpay link and opens WhatsApp with the message ready to send. When the partner pays, the plan activates and the partner becomes Trusted automatically.
                </Text>
              ) : payChannel === WALLET_CHANNEL ? (
                <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 12, color: Number(selectedFleet?.wallet_balance || 0) >= (parseFloat(payAmount) || 0) ? '#047857' : '#B91C1C' }}>
                  Wallet ₹{selectedFleet?.wallet_balance || 0}
                  {(parseFloat(payAmount) || 0) > 0 ? `  →  after payment ₹${Number(selectedFleet?.wallet_balance || 0) - (parseFloat(payAmount) || 0)}` : ''}
                  {Number(selectedFleet?.wallet_balance || 0) < (parseFloat(payAmount) || 0) ? '  (not enough)' : ''}
                </Text>
              ) : (
                <Text style={{ fontSize: 12, marginBottom: 12, color: subText, lineHeight: 16 }}>Money already received outside the app: only record it (the wallet is not touched).</Text>
              )}

              {/* UTR / Ref Number */}
              <Text style={[styles.fieldLabel, { color: textCol }]}>Transaction ID / UTR / Receipt Ref</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC', borderColor: borderCol, color: textCol }]}
                placeholder="e.g. 402919283921 / IMPS98212 / CASH-01"
                placeholderTextColor={subText}
                value={payRef}
                onChangeText={setPayRef}
              />

              {/* Amount */}
              <Text style={[styles.fieldLabel, { color: textCol }]}>Amount Paid (₹) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC', borderColor: borderCol, color: textCol }]}
                placeholder="Amount in Rupees"
                placeholderTextColor={subText}
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              {/* Plan Type */}
              <Text style={[styles.fieldLabel, { color: textCol }]}>Plan</Text>
              <View style={styles.planBtnRow}>
                {[
                  { plan: 'MONTHLY', days: '30', label: 'Monthly' },
                  { plan: 'YEARLY', days: '365', label: 'Yearly' },
                ].map((p) => {
                  const isSel = payPlan === p.plan;
                  return (
                    <TouchableOpacity
                      key={p.plan}
                      onPress={() => {
                        setPayPlan(p.plan as any);
                        setPayDurationDays(p.days);
                        const fee = p.plan === 'CUSTOM' ? 0 : planFeeFor(p.plan, 0);
                        if (fee > 0) setPayAmount(String(fee));
                      }}
                      style={[
                        styles.planBtn,
                        {
                          backgroundColor: isSel ? '#0D47A1' : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: isSel ? '#0D47A1' : borderCol,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: isSel ? '#FFFFFF' : textCol, textAlign: 'center' }}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* The day the partner subscribed - the valid-until date is worked out from it (no "days left" to type) */}
              <Text style={[styles.fieldLabel, { color: textCol, marginTop: 8 }]}>Subscribed on</Text>
              <DatePickButton
                value={payStartDate}
                onChange={(d) => setPayStartDate(d > todayIso() ? todayIso() : d)}
                title="Subscribed on"
                style={[styles.input, { backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC', borderColor: borderCol, justifyContent: 'center' }]}
                textStyle={{ color: textCol, fontSize: 14 }}
                placeholderColor={subText}
              />
              {(() => {
                const days = payPlan === 'YEARLY' ? 365 : 30;
                const base = payStartDate && payStartDate !== todayIso() ? new Date(`${payStartDate}T00:00:00`)
                  : (selectedFleet?.billing_next_date && selectedFleet.days_remaining > 0 ? new Date(`${selectedFleet.billing_next_date}T00:00:00`) : new Date());
                const until = new Date(base.getTime() + days * 86400000);
                const lapsed = until.getTime() < Date.now();
                return (
                  <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 10, color: lapsed ? '#B91C1C' : '#047857' }}>
                    Valid until {until.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}{lapsed ? '  (already over - the partner would need to renew)' : ''}
                  </Text>
                );
              })()}

              {/* Mark as Trusted Partner */}
              <TouchableOpacity
                onPress={() => setMarkTrusted(!markTrusted)}
                style={[styles.checkRow, { backgroundColor: isDark ? '#1A2338' : '#EEF2FF', borderColor: '#6366F1' }]}
              >
                <CheckCircle2 size={20} color={markTrusted ? '#6366F1' : subText} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#4338CA' }}>
                    Grant / Maintain "Trusted Partner" Status
                  </Text>
                  <Text style={{ fontSize: 11, color: subText }}>
                    Allows fleet to post bookings to driver network & hold customer advances
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Admin Notes */}
              <Text style={[styles.fieldLabel, { color: textCol, marginTop: 12 }]}>Internal Notes (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC', borderColor: borderCol, color: textCol }]}
                placeholder="Reason or verification note"
                placeholderTextColor={subText}
                value={payNotes}
                onChangeText={setPayNotes}
              />
              {payChannel === LINK_CHANNEL && linkInfo ? (
                <View style={[styles.checkRow, { backgroundColor: isDark ? '#12261C' : '#ECFDF5', borderColor: '#10B981', flexDirection: 'column', alignItems: 'flex-start', padding: 12 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#047857' }}>Link created: ₹{linkInfo.amount} {String(linkInfo.plan).toLowerCase()} plan</Text>
                  <Text selectable style={{ fontSize: 12, color: textCol, marginVertical: 6 }}>{linkInfo.short_url}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                    <TouchableOpacity onPress={() => (linkInfo.whatsapp_url ? Linking.openURL(linkInfo.whatsapp_url) : Share.share({ message: linkInfo.message }))} style={[styles.planBtn, { flex: 1.3, backgroundColor: '#25D366', borderColor: '#25D366', paddingVertical: 10 }]}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>Send on WhatsApp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => Share.share({ message: linkInfo.message })} style={[styles.planBtn, { flex: 0.7, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: borderCol, paddingVertical: 10 }]}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: textCol, textAlign: 'center' }}>Share…</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setPayModalVisible(false)}
                style={[styles.modalCancelBtn, { borderColor: borderCol, minWidth: 80, alignItems: 'center' }]}
              >
                <Text style={{ fontWeight: '700', color: textCol }}>{payChannel === LINK_CHANNEL && linkInfo ? 'Close' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={payChannel === LINK_CHANNEL ? (linkInfo ? checkPaymentLink : sendPaymentLink) : submitManualPayment}
                disabled={submittingAction || checkingLink}
                style={[styles.modalConfirmBtn, { flex: 1, backgroundColor: '#0D47A1', alignItems: 'center', justifyContent: 'center' }]}
              >
                {submittingAction || checkingLink ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 13, textAlign: 'center' }} numberOfLines={1}>
                    {payChannel === LINK_CHANNEL ? (linkInfo ? 'Check Payment' : 'Create & Send Link') : 'Confirm Payment'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: PAUSE SUBSCRIPTION ── */}
      <Modal visible={pauseModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: borderCol, maxHeight: 380 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textCol }]}>Pause Fleet Subscription</Text>
                <Text style={styles.modalSub}>{selectedFleet?.full_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setPauseModalVisible(false)}>
                <X size={22} color={subText} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={[styles.alertBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <AlertTriangle size={18} color="#B45309" />
                <Text style={{ fontSize: 12, color: '#92400E', marginLeft: 8, flex: 1 }}>
                  Pausing this account stops active status. The exact timestamp and reason will be permanently recorded in the audit trail.
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: textCol, marginTop: 12 }]}>Reason for Pausing *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC', borderColor: borderCol, color: textCol, height: 75 }]}
                placeholder="e.g. Vehicle major overhaul, seasonal hiatus, owner request"
                placeholderTextColor={subText}
                multiline
                value={pauseReason}
                onChangeText={setPauseReason}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setPauseModalVisible(false)}
                style={[styles.modalCancelBtn, { borderColor: borderCol }]}
              >
                <Text style={{ fontWeight: '700', color: textCol }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitPauseSubscription}
                disabled={submittingAction}
                style={[styles.modalConfirmBtn, { backgroundColor: '#F59E0B' }]}
              >
                {submittingAction ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Confirm Pause</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 3: AUDIT & PAYMENT HISTORY ── */}
      <Modal visible={historyModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: borderCol, height: '70%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textCol }]}>Subscription Audit History</Text>
                <Text style={styles.modalSub}>{selectedFleet?.full_name} (#{selectedFleet?.reg_id})</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <X size={22} color={subText} />
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0D47A1" />
              </View>
            ) : historyItems.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <History size={36} color={subText} />
                <Text style={{ marginTop: 10, fontSize: 14, color: subText }}>No past subscription history recorded yet.</Text>
              </View>
            ) : (
              <ScrollView style={{ padding: 16 }}>
                {historyItems.map((item) => (
                  <View key={item.id} style={[styles.historyRow, { borderColor: borderCol }]}>
                    <View style={styles.historyBadgeRow}>
                      <Text style={[styles.historyBadge, { color: item.event_type === 'PAUSED' ? '#EF4444' : item.event_type === 'RESUMED' ? '#10B981' : '#0D47A1' }]}>
                        {item.event_type === 'MANUAL_PAYMENT' ? '💳 PAYMENT' : item.event_type}
                      </Text>
                      <Text style={{ fontSize: 11, color: subText }}>{item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : ''}</Text>
                    </View>

                    {item.payment_channel && (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: textCol, marginTop: 4 }}>
                        Paid: ₹{item.amount} via {item.payment_channel}
                        {item.payment_ref ? ` (Ref: ${item.payment_ref})` : ''}
                      </Text>
                    )}

                    {item.duration_days ? (
                      <Text style={{ fontSize: 12, color: subText }}>Duration: {item.duration_days} Days · Plan: {item.plan_type || '—'}</Text>
                    ) : null}

                    {item.reason ? (
                      <Text style={{ fontSize: 12, color: subText, marginTop: 4, fontStyle: 'italic' }}>
                        Note: "{item.reason}"
                      </Text>
                    ) : null}

                    <Text style={{ fontSize: 11, color: '#6366F1', marginTop: 4 }}>Recorded by Admin: {item.admin_username || 'Staff'}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setHistoryModalVisible(false)}
                style={[styles.modalConfirmBtn, { backgroundColor: '#0D47A1', width: '100%' }]}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11, color: '#64748B' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 6 },
  scrollContent: { padding: 14, paddingBottom: 40 },
  kpiContainer: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiNum: { fontSize: 18, fontWeight: '900', color: '#0D47A1' },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13 },
  tabScroll: { marginBottom: 14 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  tabChipText: { fontSize: 12, fontWeight: '700' },
  emptyBox: {
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center' },
  fleetCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerName: { fontSize: 15, fontWeight: '800' },
  regBadge: { backgroundColor: 'rgba(13, 71, 161, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  regText: { fontSize: 11, fontWeight: '800', color: '#0D47A1' },
  cityText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusCol: { alignItems: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  pausedAlert: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  pausedAlertTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  pausedAlertReason: { fontSize: 11, color: '#78350F', marginTop: 2 },
  pausedAlertBy: { fontSize: 10, color: '#B45309', marginTop: 1 },
  detailsStrip: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  stripCol: { flex: 1 },
  stripLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  stripVal: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  payProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13, 71, 161, 0.06)',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  payProofText: { fontSize: 11, color: '#0D47A1' },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  btnIconAction: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modalBody: { paddingVertical: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  chipOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 12,
  },
  planBtnRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  planBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalConfirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  historyRow: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  historyBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBadge: {
    fontSize: 11,
    fontWeight: '900',
  },
});
