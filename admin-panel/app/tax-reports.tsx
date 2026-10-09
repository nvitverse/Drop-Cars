import React, { useState, useEffect, useCallback } from 'react';
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
  Receipt,
  FileSpreadsheet,
  Building,
  Percent,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  RotateCcw,
  Shield,
  CreditCard,
  ChevronRight,
  Plus,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';

type TaxTab = 'reports' | 'invoices' | 'settlements' | 'settings';

export default function TaxReportsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TaxTab>('reports');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string>('Staff');

  // Month selector
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Data states
  const [setupStatus, setSetupStatus] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [taxRates, setTaxRates] = useState<any>(null);
  const [gstr1Report, setGstr1Report] = useState<any>(null);
  const [gstr3bReport, setGstr3bReport] = useState<any>(null);
  const [section95Report, setSection95Report] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);

  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [gstin, setGstin] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [stateCode, setStateCode] = useState('33');
  const [savingProfile, setSavingProfile] = useState(false);

  // Credit Note Modal
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<any>(null);
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);

  // Generating settlements
  const [generatingSettlements, setGeneratingSettlements] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const role = await apiService.getCachedAdminRole();
      setUserRole(role || 'Staff');

      const [statusRes, profileRes, ratesRes] = await Promise.allSettled([
        apiService.getTaxSetupStatus(),
        apiService.getTaxCompanyProfile(),
        apiService.getTaxRates(),
      ]);

      if (statusRes.status === 'fulfilled') setSetupStatus(statusRes.value);
      if (profileRes.status === 'fulfilled') {
        setCompanyProfile(profileRes.value);
        setGstin(profileRes.value?.gstin || '');
        setLegalName(profileRes.value?.legal_name || '');
        setTradeName(profileRes.value?.trade_name || '');
        setRegAddress(profileRes.value?.registered_address || '');
        setStateCode(profileRes.value?.state_code || '33');
      }
      if (ratesRes.status === 'fulfilled') setTaxRates(ratesRes.value);

      if (activeTab === 'reports') {
        const [r1, r3b, s95] = await Promise.allSettled([
          apiService.getGstr1Report(selectedMonth),
          apiService.getGstr3bReport(selectedMonth),
          apiService.getSection95Report(selectedMonth),
        ]);
        if (r1.status === 'fulfilled') setGstr1Report(r1.value);
        if (r3b.status === 'fulfilled') setGstr3bReport(r3b.value);
        if (s95.status === 'fulfilled') setSection95Report(s95.value);
      } else if (activeTab === 'invoices') {
        const invRes: any = await apiService.getTaxInvoices({ limit: 50 });
        setInvoices(Array.isArray(invRes) ? invRes : (invRes?.invoices || invRes?.items || []));
      } else if (activeTab === 'settlements') {
        const setRes: any = await apiService.getDriverSettlements(selectedMonth);
        setSettlements(Array.isArray(setRes) ? setRes : (setRes?.settlements || []));
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to load tax data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleSaveProfile = async () => {
    const cleanGst = gstin.trim().toUpperCase();
    if (cleanGst && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(cleanGst)) {
      Alert.alert('Invalid GSTIN', 'Please enter a valid 15-character GSTIN');
      return;
    }
    setSavingProfile(true);
    try {
      await apiService.updateTaxCompanyProfile({
        gstin: cleanGst || undefined,
        legal_name: legalName.trim() || undefined,
        trade_name: tradeName.trim() || undefined,
        registered_address: regAddress.trim() || undefined,
        state_code: stateCode.trim() || undefined,
      });
      showToast('Company tax profile saved', 'success');
      setShowProfileModal(false);
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleIssueCreditNote = async () => {
    if (!creditNoteInvoice || !creditNoteReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for the credit note');
      return;
    }
    setIssuingCreditNote(true);
    try {
      await apiService.issueCreditNote(creditNoteInvoice.id, creditNoteReason.trim());
      showToast('Credit note issued successfully', 'success');
      setCreditNoteInvoice(null);
      setCreditNoteReason('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to issue credit note');
    } finally {
      setIssuingCreditNote(false);
    }
  };

  const handleGenerateSettlements = async () => {
    setGeneratingSettlements(true);
    try {
      const res = await apiService.generateDriverSettlements(selectedMonth);
      showToast(res?.message || 'Driver settlements generated', 'success');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to generate settlements');
    } finally {
      setGeneratingSettlements(false);
    }
  };

  const handleFinalizeSettlement = (settlementId: string) => {
    Alert.alert('Finalize Settlement?', 'Once finalized, this settlement is locked and cannot be regenerated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finalize',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.finalizeDriverSettlement(settlementId);
            showToast('Settlement finalized', 'success');
            loadData(true);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to finalize');
          }
        },
      },
    ]);
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
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Accounts & GST Reports</Text>
          <Text style={[styles.headerSub, { color: subText }]}>GSTR-1, GSTR-3B, Sec 9(5), invoices & driver settlements</Text>
        </View>
        {userRole === 'Owner' && activeTab === 'settings' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: '#6366F1' }]}
            onPress={() => setShowProfileModal(true)}
          >
            <Building size={14} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'settlements' && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: '#10B981', opacity: generatingSettlements ? 0.6 : 1 }]}
            onPress={handleGenerateSettlements}
            disabled={generatingSettlements}
          >
            {generatingSettlements ? <ActivityIndicator size="small" color="#FFF" /> : <><Plus size={14} color="#FFFFFF" /><Text style={styles.primaryActionBtnText}>Generate</Text></>}
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {[
          { id: 'reports', label: 'GST Reports', icon: FileSpreadsheet },
          { id: 'invoices', label: 'Invoices', icon: Receipt },
          { id: 'settlements', label: 'Settlements', icon: CreditCard },
          { id: 'settings', label: 'Tax Profile', icon: Building },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, active && { borderBottomColor: '#6366F1', borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.id as TaxTab)}
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
          {/* Setup status banner if profile incomplete */}
          {setupStatus && !setupStatus.is_complete && (
            <View style={[styles.alertBanner, { backgroundColor: isDark ? '#451A03' : '#FFF7ED', borderColor: isDark ? '#78350F' : '#FED7AA' }]}>
              <AlertTriangle size={18} color="#EA580C" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertTitle, { color: isDark ? '#FDBA74' : '#9A3412' }]}>Tax Setup Incomplete</Text>
                <Text style={[styles.alertSub, { color: isDark ? '#FED7AA' : '#C2410C' }]}>
                  {setupStatus.missing_items?.join(', ') || 'GSTIN or legal registered address is missing.'}
                </Text>
              </View>
              {userRole === 'Owner' && (
                <TouchableOpacity onPress={() => setShowProfileModal(true)} style={[styles.alertBtn, { backgroundColor: '#EA580C' }]}>
                  <Text style={styles.alertBtnText}>Complete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Month Selector for Reports & Settlements */}
          {(activeTab === 'reports' || activeTab === 'settlements') && (
            <View style={[styles.monthSelector, { backgroundColor: cardBg, borderColor: itemBorder }]}>
              <Calendar size={16} color="#6366F1" />
              <Text style={[styles.monthText, { color: themeColors.text }]}>Period: {selectedMonth}</Text>
            </View>
          )}

          {/* ---------------- REPORTS TAB ---------------- */}
          {activeTab === 'reports' && (
            <View>
              {/* GSTR-1 Summary */}
              <Text style={[styles.sectionTitle, { color: subText }]}>GSTR-1 OUTWARD SUPPLIES</Text>
              <View style={[styles.reportCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Total B2C Value</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>₹{gstr1Report?.b2c_total_taxable_value ?? gstr1Report?.total_taxable ?? 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>CGST (2.5%)</Text>
                  <Text style={[styles.reportVal, { color: '#6366F1' }]}>₹{gstr1Report?.cgst_amount ?? 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>SGST (2.5%)</Text>
                  <Text style={[styles.reportVal, { color: '#6366F1' }]}>₹{gstr1Report?.sgst_amount ?? 0}</Text>
                </View>
                <View style={[styles.reportRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.reportLblBold, { color: themeColors.text }]}>Total GST Liability</Text>
                  <Text style={[styles.reportValBold, { color: '#10B981' }]}>₹{gstr1Report?.total_tax ?? 0}</Text>
                </View>
              </View>

              {/* Section 9(5) E-Commerce Operator */}
              <Text style={[styles.sectionTitle, { color: subText }]}>SECTION 9(5) ECO REPORT (CAB SERVICES)</Text>
              <View style={[styles.reportCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <Text style={[styles.infoNote, { color: subText }]}>
                  Drop Cars reports & discharges 5% GST on passenger transport under CGST Act Section 9(5).
                </Text>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Total ECO Rides Billed</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{section95Report?.total_rides_count ?? 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Gross Passenger Fare</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>₹{section95Report?.gross_fare_amount ?? 0}</Text>
                </View>
                <View style={[styles.reportRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.reportLblBold, { color: themeColors.text }]}>GST Paid by ECO (5%)</Text>
                  <Text style={[styles.reportValBold, { color: '#6366F1' }]}>₹{section95Report?.gst_discharged_amount ?? 0}</Text>
                </View>
              </View>

              {/* GSTR-3B Summary */}
              <Text style={[styles.sectionTitle, { color: subText }]}>GSTR-3B RETURN SUMMARY</Text>
              <View style={[styles.reportCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Taxable Outward Supplies</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>₹{gstr3bReport?.taxable_supplies ?? 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Eligible ITC Claimed</Text>
                  <Text style={[styles.reportVal, { color: '#0284C7' }]}>{gstr3bReport?.itc_claimed == null ? 'Not tracked' : `₹${gstr3bReport.itc_claimed}`}</Text>
                </View>
                <View style={[styles.reportRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.reportLblBold, { color: themeColors.text }]}>Net Tax Payable in Cash</Text>
                  <Text style={[styles.reportValBold, { color: '#EF4444' }]}>₹{gstr3bReport?.net_tax_payable ?? 0}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ---------------- INVOICES TAB ---------------- */}
          {activeTab === 'invoices' && (
            <View>
              {invoices.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Receipt size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No tax invoices found.</Text>
                </View>
              ) : (
                invoices.map((inv) => (
                  <View key={inv.id} style={[styles.invoiceCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.invoiceNum, { color: themeColors.text }]}>{inv.invoice_number || 'INV-DRAFT'}</Text>
                      <View style={[styles.pill, { backgroundColor: inv.is_credit_noted ? '#FEE2E2' : '#DCFCE7' }]}>
                        <Text style={[styles.pillText, { color: inv.is_credit_noted ? '#EF4444' : '#16A34A' }]}>
                          {inv.is_credit_noted ? 'CREDIT NOTED' : (inv.invoice_type || 'B2C')}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.invoiceCustomer, { color: subText }]}>
                      {inv.customer_name_snapshot || 'Guest Customer'} · {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ''}
                    </Text>
                    <View style={[styles.invoiceAmounts, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                      <Text style={[styles.invAmtText, { color: themeColors.text }]}>Taxable: ₹{inv.taxable_amount ?? 0}</Text>
                      <Text style={[styles.invAmtText, { color: '#6366F1' }]}>GST: ₹{inv.total_tax ?? 0}</Text>
                      <Text style={[styles.invAmtText, { color: '#10B981', fontWeight: '800' }]}>Total: ₹{inv.total_amount ?? 0}</Text>
                    </View>
                    {userRole === 'Owner' && !inv.is_credit_noted && (
                      <TouchableOpacity
                        style={[styles.creditNoteBtn, { borderColor: itemBorder }]}
                        onPress={() => { setCreditNoteInvoice(inv); setCreditNoteReason(''); }}
                      >
                        <Text style={styles.creditNoteBtnText}>Issue Credit Note</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---------------- SETTLEMENTS TAB ---------------- */}
          {activeTab === 'settlements' && (
            <View>
              {settlements.length === 0 ? (
                <View style={styles.emptyCard}>
                  <CreditCard size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No driver settlements generated for this period.</Text>
                </View>
              ) : (
                settlements.map((st) => (
                  <View key={st.id} style={[styles.settlementCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.invoiceNum, { color: themeColors.text }]}>{st.driver_name || 'Driver'}</Text>
                      <View style={[styles.pill, { backgroundColor: st.is_finalized ? '#DCFCE7' : '#FEF3C7' }]}>
                        <Text style={[styles.pillText, { color: st.is_finalized ? '#16A34A' : '#D97706' }]}>
                          {st.is_finalized ? 'FINALIZED' : 'DRAFT'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.invoiceCustomer, { color: subText }]}>{st.period_month} · {st.total_trips_count || 0} Trips</Text>
                    <View style={[styles.invoiceAmounts, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                      <Text style={[styles.invAmtText, { color: themeColors.text }]}>Gross: ₹{st.gross_fare_earned ?? 0}</Text>
                      <Text style={[styles.invAmtText, { color: '#EF4444' }]}>Commission: -₹{st.commission_deducted ?? 0}</Text>
                      <Text style={[styles.invAmtText, { color: '#10B981', fontWeight: '800' }]}>Net: ₹{st.net_payout_amount ?? 0}</Text>
                    </View>
                    {userRole === 'Owner' && !st.is_finalized && (
                      <TouchableOpacity
                        style={[styles.finalizeBtn, { backgroundColor: '#10B981' }]}
                        onPress={() => handleFinalizeSettlement(st.id)}
                      >
                        <FileCheck size={14} color="#FFF" />
                        <Text style={styles.finalizeBtnText}>Finalize Settlement</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---------------- SETTINGS TAB ---------------- */}
          {activeTab === 'settings' && (
            <View>
              <Text style={[styles.sectionTitle, { color: subText }]}>LEGAL COMPANY TAX PROFILE</Text>
              <View style={[styles.reportCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>GSTIN</Text>
                  <Text style={[styles.reportVal, { color: '#6366F1', fontWeight: '800' }]}>{companyProfile?.gstin || 'Not Configured'}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Legal Business Name</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{companyProfile?.legal_name || 'Drop Cars'}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Trade / Brand Name</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{companyProfile?.trade_name || 'Drop Cars'}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>State Code</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{companyProfile?.state_code || '33 (Tamil Nadu)'}</Text>
                </View>
                <View style={[styles.reportRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 8 }]}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Registered Address</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text, flex: 1, textAlign: 'right' }]}>{companyProfile?.registered_address || 'Registered Office Address'}</Text>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: subText }]}>CONFIGURED GST RATES</Text>
              <View style={[styles.reportCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Cab Transport GST (Sec 9(5))</Text>
                  <Text style={[styles.reportVal, { color: '#10B981', fontWeight: '800' }]}>{taxRates?.cab_transport_gst_rate ?? 5}%</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>Software / Platform Service</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{taxRates?.platform_service_gst_rate ?? 18}%</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={[styles.reportLbl, { color: subText }]}>TCS Rate</Text>
                  <Text style={[styles.reportVal, { color: themeColors.text }]}>{taxRates?.tcs_rate ?? 0.5}%</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------- EDIT COMPANY PROFILE MODAL ---------------- */}
      <Modal visible={showProfileModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowProfileModal(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]} edges={['top']}>
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Edit Tax Profile</Text>
            <TouchableOpacity onPress={() => setShowProfileModal(false)}><Text style={{ color: '#6366F1', fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.inputLbl, { color: subText }]}>GSTIN (15 Characters)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={gstin}
              onChangeText={setGstin}
              autoCapitalize="characters"
              placeholder="33BBVPN8562P1ZJ"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Legal Business Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={legalName}
              onChangeText={setLegalName}
              placeholder="Drop Cars India Pvt Ltd"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Trade Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text }]}
              value={tradeName}
              onChangeText={setTradeName}
              placeholder="Drop Cars"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Registered Address (For Invoices)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: cardBg, borderColor: itemBorder, color: themeColors.text, minHeight: 70, textAlignVertical: 'top' }]}
              value={regAddress}
              onChangeText={setRegAddress}
              multiline
              numberOfLines={3}
              placeholder="Registered business address..."
              placeholderTextColor={subText}
            />

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#6366F1' }]} onPress={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Company Profile</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ---------------- ISSUE CREDIT NOTE MODAL ---------------- */}
      <Modal visible={!!creditNoteInvoice} transparent animationType="fade" onRequestClose={() => setCreditNoteInvoice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginBottom: 8 }]}>Issue GST Credit Note</Text>
            <Text style={[styles.infoNote, { color: subText }]}>
              Issue credit note for {creditNoteInvoice?.invoice_number} (₹{creditNoteInvoice?.total_amount}). This nullifies GST liability.
            </Text>
            <Text style={[styles.inputLbl, { color: subText, marginTop: 12 }]}>Reason for Credit Note</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={creditNoteReason}
              onChangeText={setCreditNoteReason}
              placeholder="Trip cancelled / Fare refund..."
              placeholderTextColor={subText}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: itemBorder }]} onPress={() => setCreditNoteInvoice(null)}>
                <Text style={{ color: subText, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtnSmall, { backgroundColor: '#EF4444' }]} onPress={handleIssueCreditNote} disabled={issuingCreditNote}>
                {issuingCreditNote ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Issue Note</Text>}
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
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 14 },
  alertTitle: { fontSize: 13, fontWeight: '800' },
  alertSub: { fontSize: 11, marginTop: 1 },
  alertBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  alertBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  monthSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  monthText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  reportCard: { borderRadius: 8, borderWidth: 1, padding: 14, marginBottom: 16 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  reportLbl: { fontSize: 12.5 },
  reportVal: { fontSize: 13, fontWeight: '700' },
  reportLblBold: { fontSize: 13.5, fontWeight: '800' },
  reportValBold: { fontSize: 15, fontWeight: '800' },
  infoNote: { fontSize: 11, fontStyle: 'italic', marginBottom: 10 },
  invoiceCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  invoiceNum: { fontSize: 14, fontWeight: '800' },
  invoiceCustomer: { fontSize: 11.5, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  pillText: { fontSize: 10, fontWeight: '800' },
  invoiceAmounts: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: 6, borderWidth: 1, marginTop: 10 },
  invAmtText: { fontSize: 11.5, fontWeight: '600' },
  creditNoteBtn: { alignItems: 'center', paddingVertical: 8, borderRadius: 6, borderWidth: 1, marginTop: 10 },
  creditNoteBtnText: { fontSize: 11.5, fontWeight: '700', color: '#EF4444' },
  settlementCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  finalizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 6, marginTop: 10 },
  finalizeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  inputLbl: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  modalInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  submitBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 10, borderWidth: 1, padding: 18 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6, borderWidth: 1 },
  submitBtnSmall: { flex: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6 },
});
