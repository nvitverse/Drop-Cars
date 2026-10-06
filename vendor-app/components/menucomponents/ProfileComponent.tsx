import React, { useState, useEffect } from 'react';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, Linking, Modal, TextInput,
  Platform, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User, Phone, CreditCard, MapPin, Calendar, Building2,
  Shield, ExternalLink, XCircle, Mail, ChevronRight,
  ArrowLeft, Lock, Edit3, BadgeCheck, AlertCircle, Globe, Check,
} from 'lucide-react-native';
import api from '../../app/api/api';
import { router } from 'expo-router';
import { useLanguage, LANGUAGE_OPTIONS, LanguageCode } from '@/contexts/LanguageContext';

interface VendorData {
  id: string; full_name: string; business_name: string | null;
  primary_number: string; secondary_number: string; gpay_number: string;
  wallet_balance: number; bank_balance: number;
  aadhar_number: string; aadhar_front_img: string;
  aadhar_status: 'PENDING' | 'VERIFIED' | 'INVALID';
  address: string; account_status: string; created_at: string;
}

function BottomSheet({ visible, onClose, title, subtitle, children }: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={bs.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bs.sheet}>
        <View style={bs.handle} />
        <Text style={bs.title}>{title}</Text>
        {subtitle && <Text style={bs.subtitle}>{subtitle}</Text>}
        {children}
      </View>
    </Modal>
  );
}
const bs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, position: 'absolute', bottom: 0, left: 0, right: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
});

function ModalInput(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <>
      <Text style={mi.label}>{label}</Text>
      <TextInput placeholderTextColor="#9CA3AF" style={mi.input} {...rest} />
    </>
  );
}
const mi = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1F2937', backgroundColor: '#F8FAFC', marginBottom: 14 },
});

function SheetActions({ onCancel, onPrimary, primaryLabel, busy }: { onCancel: () => void; onPrimary: () => void; primaryLabel: string; busy: boolean; }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
      <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' }} onPress={onCancel}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center' }} onPress={onPrimary} disabled={busy}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{busy ? 'Please wait...' : primaryLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sc.wrapper}>
      <Text style={sc.title}>{title}</Text>
      <View style={sc.card}>{children}</View>
    </View>
  );
}
const sc = StyleSheet.create({
  wrapper: { marginBottom: 20 },
  title: { fontSize: 12, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
});

function InfoRow({ icon: Icon, color, label, value, onPress, actionIcon: ActionIcon, isLast, dimValue }: {
  icon: any; color: string; label: string; value: string;
  onPress?: () => void; actionIcon?: any; isLast?: boolean; dimValue?: boolean;
}) {
  return (
    <TouchableOpacity style={[ir.row, !isLast && ir.border]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={[ir.iconCircle, { backgroundColor: color + '18' }]}>
        <Icon size={17} color={color} />
      </View>
      <View style={ir.textCol}>
        <Text style={ir.label}>{label}</Text>
        <Text style={[ir.value, dimValue && ir.dimValue]} numberOfLines={1}>{value}</Text>
      </View>
      {ActionIcon && onPress && <ActionIcon size={16} color="#94A3B8" />}
    </TouchableOpacity>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  border: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textCol: { flex: 1 },
  label: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginBottom: 2 },
  value: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  dimValue: { color: '#94A3B8', fontStyle: 'italic', fontWeight: '400' },
});

export default function ProfileComponent() {
  const { language, setLanguage } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const currentLanguageLabel = LANGUAGE_OPTIONS.find((opt) => opt.code === language)?.label || 'English';
  const [vendorData, setVendorData] = useState<VendorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [passwordOtpCode, setPasswordOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showBusinessNameModal, setShowBusinessNameModal] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [businessNameBusy, setBusinessNameBusy] = useState(false);

  useEffect(() => {
    api.get('/users/vendor/email').then((res: any) => setMyEmail(res.data?.email || null)).catch(() => {});
    fetchVendorData();
  }, []);

  const fetchVendorData = async () => {
    try {
      const response = await api.get('/users/vendor-details/me');
      setVendorData(response.data);
    } catch {
      setError('Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  const sendEmailOtp = async () => {
    if (!emailInput.includes('@')) { Alert.alert('Error', 'Enter a valid email'); return; }
    setEmailBusy(true);
    try {
      const res = await api.post('/users/vendor/email/request-otp', { email: emailInput.trim() });
      setEmailOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check your email inbox.');
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert('Error', typeof d === 'string' ? d : 'Could not send the code.');
    } finally { setEmailBusy(false); }
  };

  const confirmEmailOtp = async () => {
    if (emailOtpCode.trim().length !== 6) { Alert.alert('Error', 'Enter the 6-digit code'); return; }
    setEmailBusy(true);
    try {
      const res = await api.post('/users/vendor/email/confirm', { email: emailInput.trim(), code: emailOtpCode.trim() });
      setMyEmail(res.data?.email || emailInput.trim());
      setShowEmailModal(false); setEmailOtpSent(false); setEmailOtpCode('');
      Alert.alert('Saved', 'Email verified and saved.');
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert('Error', typeof d === 'string' ? d : 'Could not verify the code.');
    } finally { setEmailBusy(false); }
  };

  const sendPasswordOtp = async () => {
    if (!vendorData?.primary_number) return;
    setPasswordBusy(true);
    try {
      const res = await api.post('/users/email/request-reset-otp', { role: 'vendor', primary_number: vendorData.primary_number });
      setPasswordOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check registered email.');
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert('Error', typeof d === 'string' ? d : 'Could not send code.');
    } finally { setPasswordBusy(false); }
  };

  const confirmPasswordReset = async () => {
    if (passwordOtpCode.trim().length < 4) { Alert.alert('Error', 'Enter the code from the email'); return; }
    if (newPassword.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return; }
    setPasswordBusy(true);
    try {
      await api.post('/users/email/reset-password', { role: 'vendor', primary_number: vendorData?.primary_number, code: passwordOtpCode.trim(), new_password: newPassword });
      setShowPasswordModal(false); setPasswordOtpSent(false); setPasswordOtpCode(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Password Changed', 'Use it next time you sign in.');
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert('Error', typeof d === 'string' ? d : 'Could not verify.');
    } finally { setPasswordBusy(false); }
  };

  const saveBusinessName = async () => {
    const t = businessNameInput.trim();
    if (t.length < 2) { Alert.alert('Error', 'Business name must be at least 2 characters'); return; }
    setBusinessNameBusy(true);
    try {
      const res = await api.put('/users/vendor-details/business-name', { business_name: t });
      setVendorData(res.data); setShowBusinessNameModal(false);
      Alert.alert('Saved', 'Business name updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally { setBusinessNameBusy(false); }
  };

  const openAadharImage = async () => {
    if (!vendorData?.aadhar_front_img) { Alert.alert('Error', 'Aadhar image not available'); return; }
    try {
      const ok = await Linking.canOpenURL(vendorData.aadhar_front_img);
      if (ok) await Linking.openURL(vendorData.aadhar_front_img);
      else Alert.alert('Error', 'Cannot open the image URL');
    } catch { Alert.alert('Error', 'Failed to open image'); }
  };

  const getAadharCfg = (status: string) => {
    if (status === 'VERIFIED') return { color: '#059669', bg: '#D1FAE5', text: 'Verified', Icon: BadgeCheck };
    if (status === 'INVALID')  return { color: '#DC2626', bg: '#FEE2E2', text: 'Invalid',  Icon: XCircle };
    return { color: '#D97706', bg: '#FEF3C7', text: 'Pending', Icon: AlertCircle };
  };

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color="#1D4ED8" /><Text style={s.centerText}>Loading profile...</Text></View>
  );
  if (error || !vendorData) return (
    <View style={s.center}>
      <AlertCircle size={36} color="#EF4444" />
      <Text style={[s.centerText, { color: '#EF4444', marginTop: 8 }]}>{error || 'No data'}</Text>
      <TouchableOpacity style={s.retryBtn} onPress={fetchVendorData}>
        <Text style={s.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const data = vendorData;
  const asc = getAadharCfg(data.aadhar_status);
  const initials = data.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const isActive = data.account_status?.toLowerCase() === 'active';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1D4ED8" />

      {/* -- Blue Header -- */}
      <LinearGradient colors={['#1D4ED8', '#1E40AF']} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={s.headerBody}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerName} numberOfLines={1}>{data.full_name}</Text>
            {data.business_name && <Text style={s.headerBusiness} numberOfLines={1}>{data.business_name}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[s.statusChip, { backgroundColor: isActive ? '#059669' : '#D97706' }]}>
                <Text style={s.statusChipText}>{data.account_status}</Text>
              </View>
              <Text style={s.memberSince}>
                Since {new Date(data.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats strip */}
        <View style={s.statsStrip}>
          <View style={s.statItem}>
            <Text style={s.statValue}>Rs.{data.wallet_balance.toLocaleString('en-IN')}</Text>
            <Text style={s.statLabel}>Wallet</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statItem}>
            <Text style={s.statValue}>Rs.{data.bank_balance.toLocaleString('en-IN')}</Text>
            <Text style={s.statLabel}>Redeemed</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statItem}>
            <Text style={s.statValue}>Rs.{(data.wallet_balance + data.bank_balance).toLocaleString('en-IN')}</Text>
            <Text style={s.statLabel}>Total Earnings</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Personal */}
        <SectionCard title="Personal Information">
          <InfoRow icon={User}     color="#1D4ED8" label="Full Name"    value={data.full_name} />
          <InfoRow icon={Building2} color="#7C3AED" label="Business Name"
            value={data.business_name || 'Tap to add'}
            onPress={() => { setBusinessNameInput(data.business_name || ''); setShowBusinessNameModal(true); }}
            actionIcon={Edit3} dimValue={!data.business_name} />
          <InfoRow icon={MapPin}   color="#059669" label="Address"      value={data.address || '�'} />
          <InfoRow icon={Calendar} color="#D97706" label="Member Since" value={formatDate(data.created_at)} isLast />
        </SectionCard>

        {/* Contact */}
        <SectionCard title="Contact & Security">
          <InfoRow icon={Phone}     color="#0284C7" label="Primary Number"           value={'+91 ' + data.primary_number} />
          <InfoRow icon={Phone}     color="#64748B" label="Secondary Number"         value={data.secondary_number || '�'} />
          <InfoRow icon={CreditCard} color="#059669" label="GPay Number"             value={data.gpay_number || '�'} />
          <InfoRow icon={Mail}      color="#DB2777" label="Email (password reset)"
            value={myEmail || 'Tap to add'}
            onPress={() => { setEmailInput(myEmail || ''); setEmailOtpSent(false); setEmailOtpCode(''); setShowEmailModal(true); }}
            actionIcon={Edit3} dimValue={!myEmail} />
          <InfoRow icon={Lock}      color="#7C3AED" label="Password"
            value="Change password"
            onPress={() => { setPasswordOtpSent(false); setPasswordOtpCode(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordModal(true); }}
            actionIcon={ChevronRight} isLast />
        </SectionCard>

        {/* Aadhaar */}
        <SectionCard title="Aadhaar Verification">
          <View style={s.aadharRow}>
            <View style={[s.aadharChip, { backgroundColor: asc.bg }]}>
              <asc.Icon size={14} color={asc.color} />
              <Text style={[s.aadharChipText, { color: asc.color }]}>{asc.text}</Text>
            </View>
            <Text style={s.aadharNum}>****-****-{data.aadhar_number?.slice(-4) || '----'}</Text>
          </View>
          {data.aadhar_front_img ? (
            <TouchableOpacity onPress={openAadharImage} activeOpacity={0.85}>
              <Image source={{ uri: data.aadhar_front_img }} style={s.aadharImg} resizeMode="cover" />
              <View style={s.viewDocBtn}>
                <ExternalLink size={15} color="#1D4ED8" />
                <Text style={s.viewDocText}>View Full Document</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={s.noDoc}>
              <Shield size={28} color="#CBD5E1" />
              <Text style={s.noDocText}>No Aadhaar document uploaded</Text>
            </View>
          )}
        </SectionCard>

        {/* Preferences */}
        <SectionCard title="Preferences">
          <InfoRow icon={Globe} color="#0891B2" label="Language"
            value={currentLanguageLabel}
            onPress={() => setShowLanguageModal(true)}
            actionIcon={ChevronRight} isLast />
        </SectionCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Email Modal */}
      <BottomSheet visible={showEmailModal} onClose={() => setShowEmailModal(false)}
        title={myEmail ? 'Change Email' : 'Add Email'}
        subtitle="We will send a 6-digit code to confirm you own this email.">
        <ModalInput label="Email Address" value={emailInput}
          onChangeText={(v: string) => { setEmailInput(v); setEmailOtpSent(false); }}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="your.email@gmail.com" />
        {emailOtpSent && (
          <ModalInput label="6-digit Code" value={emailOtpCode}
            onChangeText={(v: string) => setEmailOtpCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" maxLength={6} placeholder="Code from the email" />
        )}
        <SheetActions onCancel={() => setShowEmailModal(false)}
          onPrimary={emailOtpSent ? confirmEmailOtp : sendEmailOtp}
          primaryLabel={emailOtpSent ? 'Verify & Save' : 'Send Code'} busy={emailBusy} />
      </BottomSheet>

      {/* Password Modal */}
      <BottomSheet visible={showPasswordModal} onClose={() => setShowPasswordModal(false)}
        title="Change Password"
        subtitle="We will send a code to your registered email to confirm it is you.">
        {passwordOtpSent ? (
          <>
            <ModalInput label="6-digit Code" value={passwordOtpCode}
              onChangeText={(v: string) => setPasswordOtpCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad" maxLength={6} placeholder="Code from the email" />
            <ModalInput label="New Password" value={newPassword} onChangeText={setNewPassword}
              secureTextEntry placeholder="At least 6 characters" />
            <ModalInput label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword}
              secureTextEntry placeholder="Re-enter the new password" />
            <SheetActions onCancel={() => setShowPasswordModal(false)} onPrimary={confirmPasswordReset}
              primaryLabel="Save Password" busy={passwordBusy} />
          </>
        ) : (
          <SheetActions onCancel={() => setShowPasswordModal(false)} onPrimary={sendPasswordOtp}
            primaryLabel="Send Code to Email" busy={passwordBusy} />
        )}
      </BottomSheet>

      {/* Business Name Modal */}
      <BottomSheet visible={showBusinessNameModal} onClose={() => setShowBusinessNameModal(false)}
        title={data.business_name ? 'Change Business Name' : 'Add Business Name'}
        subtitle={'Shown to drivers instead of your personal name e.g. Mukil Travels.'}>
        <ModalInput label="Business / Travels Name" value={businessNameInput}
          onChangeText={setBusinessNameInput} autoCapitalize="words" placeholder="e.g. Mukil Travels" />
        <SheetActions onCancel={() => setShowBusinessNameModal(false)} onPrimary={saveBusinessName}
          primaryLabel="Save" busy={businessNameBusy} />
      </BottomSheet>

      {/* Language Modal */}
      <BottomSheet visible={showLanguageModal} onClose={() => setShowLanguageModal(false)}
        title="Choose Language" subtitle="You can change this anytime.">
        {LANGUAGE_OPTIONS.map((opt) => {
          const isSelected = opt.code === language;
          return (
            <TouchableOpacity
              key={opt.code}
              style={[lg.row, isSelected && lg.rowSelected]}
              onPress={() => { setLanguage(opt.code as LanguageCode); setShowLanguageModal(false); }}
              activeOpacity={0.8}
            >
              <Text style={[lg.label, isSelected && lg.labelSelected]}>{opt.label}</Text>
              {isSelected && <Check size={18} color="#1D4ED8" />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const lg = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowSelected: { backgroundColor: '#EFF6FF' },
  label: { fontSize: 15, fontWeight: '500', color: '#1F2937' },
  labelSelected: { color: '#1D4ED8', fontWeight: '700' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  centerText: { fontSize: 14, color: '#64748B', marginTop: 8 },
  retryBtn: { marginTop: 16, backgroundColor: '#1D4ED8', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  header: { paddingTop: Platform.OS === 'ios' ? 52 : ANDROID_STATUS_BAR + 14, paddingHorizontal: 16, paddingBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  headerBody: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  headerName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  headerBusiness: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusChipText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  memberSince: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  statsStrip: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  statDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  aadharRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  aadharChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  aadharChipText: { fontSize: 12, fontWeight: '600' },
  aadharNum: { fontSize: 14, fontWeight: '600', color: '#475569', letterSpacing: 1 },
  aadharImg: { width: '100%', height: 140, borderRadius: 0 },
  viewDocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, backgroundColor: '#EFF6FF', margin: 12, borderRadius: 10, borderWidth: 1, borderColor: '#DBEAFE' },
  viewDocText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  noDoc: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  noDocText: { fontSize: 13, color: '#94A3B8' },
});
