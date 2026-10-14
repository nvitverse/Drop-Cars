import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, AppState } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Clock, ShieldOff, Phone, Mail, MessageCircle, RefreshCw, LogOut, FileCheck, BellRing, Rocket } from 'lucide-react-native';
import { useSupportContact } from '@/utils/supportContact';
import { fetchVendorStatus, routeForActiveVendor } from '@/utils/vendorSession';

const POLL_MS = 30000;

// Shown while a new vendor account waits for approval (PENDING) or after the office switched it off (INACTIVE).
// It checks the real status by itself every 30 s and the moment the account is approved it opens the app - no calling the office to ask.
export default function AccountStatusScreen() {
  const { status = 'Pending' } = useLocalSearchParams<{ status?: string }>();
  const isPending = String(status).toUpperCase() === 'PENDING';
  const { contact, call, whatsapp, mail } = useSupportContact();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const leaving = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (leaving.current) return;
    if (manual) { setChecking(true); setNote(null); }
    const me = await fetchVendorStatus();
    if (manual) setChecking(false);
    if (!me) {
      if (manual) setNote('Could not reach the server. Please check your internet and try again.');
      return;
    }
    if (me.name) setName(me.name);
    if (me.status === 'ACTIVE') {
      leaving.current = true;
      router.replace((await routeForActiveVendor()) as any);
    } else if (manual) {
      setNote(me.status === 'PENDING' ? 'Still being checked. We will let you in as soon as it is approved.' : 'This account is switched off. Please contact support.');
    }
  }, []);

  useEffect(() => {
    check(false);
    const id = setInterval(() => check(false), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(false); });
    return () => { clearInterval(id); sub.remove(); };
  }, [check]);

  const signOut = async () => {
    await AsyncStorage.multiRemove(['accessToken', 'vendorData']).catch(() => {});
    router.replace('/(auth)/sign-in');
  };

  const steps = isPending
    ? [
        { icon: FileCheck, title: 'We check your details', text: 'Our team verifies your Aadhaar and mobile number.' },
        { icon: BellRing, title: 'You get a notification', text: 'It is usually done within 24 hours. This page also checks by itself.' },
        { icon: Rocket, title: 'Start posting bookings', text: 'As soon as you are approved the app opens - nothing more to do.' },
      ]
    : [
        { icon: Phone, title: 'Talk to us', text: 'Call or WhatsApp support and tell us your registered mobile number.' },
        { icon: FileCheck, title: 'We look into it', text: 'We will tell you what is needed and switch the account back on.' },
      ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={isPending ? ['#1E3A8A', '#312E81'] : ['#7F1D1D', '#431407']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.background}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.iconWrap}>{isPending ? <Clock size={54} color="#FFFFFF" /> : <ShieldOff size={54} color="#FFFFFF" />}</View>
          <View style={[styles.badge, { backgroundColor: isPending ? '#F59E0B' : '#EF4444' }]}>
            <Text style={styles.badgeText}>{isPending ? 'WAITING FOR APPROVAL' : 'ACCOUNT SWITCHED OFF'}</Text>
          </View>
          <Text style={styles.title}>{isPending ? `Welcome${name ? ', ' + name.split(' ')[0] : ''}!` : 'Your account is not active'}</Text>
          <Text style={styles.message}>
            {isPending
              ? 'Your account is created. We are checking your details; you can start posting bookings as soon as it is approved.'
              : 'The office has switched this account off, so you cannot post bookings right now. Please contact support to know why and how to turn it back on.'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{isPending ? 'What happens next' : 'What to do'}</Text>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.stepRow, i === steps.length - 1 && { marginBottom: 0 }]}>
                <View style={styles.stepIcon}><s.icon size={18} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepText}>{s.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => check(true)} disabled={checking} activeOpacity={0.85}>
            {checking ? <ActivityIndicator color="#1E3A8A" /> : <RefreshCw size={18} color="#1E3A8A" />}
            <Text style={styles.primaryBtnText}>{checking ? 'Checking...' : 'Check status now'}</Text>
          </TouchableOpacity>
          {!!note && <Text style={styles.note}>{note}</Text>}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Need help?</Text>
            <View style={styles.contactRow}>
              <TouchableOpacity style={styles.contactBtn} onPress={call} activeOpacity={0.8}>
                <Phone size={18} color="#34D399" />
                <Text style={styles.contactLabel}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={() => whatsapp('Hello, I need help with my Drop Cars vendor account.')} activeOpacity={0.8}>
                <MessageCircle size={18} color="#34D399" />
                <Text style={styles.contactLabel}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={() => mail('Vendor account help')} activeOpacity={0.8}>
                <Mail size={18} color="#34D399" />
                <Text style={styles.contactLabel}>Email</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.contactValue}>{contact.phone}</Text>
            <Text style={styles.contactSub}>{contact.email}</Text>
          </View>

          <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.7}>
            <LogOut size={16} color="#E5E7EB" />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 40, alignItems: 'center' },
  iconWrap: { width: 108, height: 108, borderRadius: 54, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  badge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, marginBottom: 16 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  message: { color: '#E5E7EB', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 22, maxWidth: 420 },
  card: { width: '100%', maxWidth: 460, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 18, padding: 16, marginBottom: 16 },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stepText: { color: '#D1D5DB', fontSize: 13, lineHeight: 18, marginTop: 2 },
  primaryBtn: { width: '100%', maxWidth: 460, minHeight: 50, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  primaryBtnText: { color: '#1E3A8A', fontSize: 15, fontWeight: '800' },
  note: { color: '#FDE68A', fontSize: 13, textAlign: 'center', marginBottom: 14, maxWidth: 420 },
  contactRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  contactBtn: { flex: 1, minHeight: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  contactLabel: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  contactValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  contactSub: { color: '#D1D5DB', fontSize: 12.5, textAlign: 'center', marginTop: 2 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, marginTop: 4 },
  signOutText: { color: '#E5E7EB', fontSize: 14, fontWeight: '600' },
});
