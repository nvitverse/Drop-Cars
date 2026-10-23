import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldAlert, PhoneCall, CreditCard, LogOut } from 'lucide-react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { openWaUrl } from '@/utils/whatsapp';
import { clearAccountGate } from '@/utils/accountGate';

const SUPPORT_PHONE = '7200217986';

/**
 * The one plain screen for an account that cannot use the app:
 *  - kind=blocked        -> blocked for good or switched off by the office: "contact the operations team"
 *  - kind=subscription   -> the free Standard period / grace ran out: "subscribe to continue" (+ contact)
 * Shown right after login and whenever the server answers 403 with [ACCOUNT_BLOCKED] / [ACCOUNT_SUSPENDED_SUBSCRIPTION].
 */
export default function AccountBlockedScreen() {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const needsSubscription = kind === 'subscription';

  const signOut = useCallback(async () => {
    clearAccountGate();
    try { await logout(); } catch { /* ignore */ }
    router.replace('/login');
  }, [logout, router]);

  const accent = needsSubscription ? '#D97706' : '#DC2626';
  const bg = isDarkMode ? '#0F172A' : '#F8FAFC';
  const card = isDarkMode ? '#1E293B' : '#FFFFFF';
  const text = isDarkMode ? '#F8FAFC' : '#0F172A';
  const sub = isDarkMode ? '#CBD5E1' : '#475569';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: card, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
          <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
            <ShieldAlert size={44} color={accent} />
          </View>
          <Text style={[styles.title, { color: text }]}>
            {needsSubscription ? 'Account suspended' : 'Account blocked'}
          </Text>
          <Text style={[styles.body, { color: sub }]}>
            {needsSubscription
              ? 'Your free Standard period has ended and the monthly subscription is not active. Subscribe to start using Drop Cars again.'
              : 'Your account is blocked. You cannot use this app. Please contact the Drop Cars operations team.'}
          </Text>
          {needsSubscription ? (
            <Text style={[styles.note, { color: sub }]}>
              Your wallet money is safe. Subscribing takes the monthly fee from your wallet or lets you pay it now.
            </Text>
          ) : null}

          {needsSubscription ? (
            <TouchableOpacity style={[styles.primary, { backgroundColor: '#16A34A' }]} onPress={() => router.push('/subscription')} activeOpacity={0.85}>
              <CreditCard size={18} color="#FFFFFF" />
              <Text style={styles.primaryText}>Subscribe now</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[styles.primary, { backgroundColor: '#2563EB' }]} onPress={() => Linking.openURL('tel:' + SUPPORT_PHONE)} activeOpacity={0.85}>
            <PhoneCall size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>Call operations team</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, { borderColor: isDarkMode ? '#475569' : '#CBD5E1' }]} onPress={() => openWaUrl('https://wa.me/91' + SUPPORT_PHONE)} activeOpacity={0.85}>
            <Text style={[styles.secondaryText, { color: text }]}>WhatsApp the operations team</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logout} onPress={signOut} activeOpacity={0.7}>
            <LogOut size={16} color={sub} />
            <Text style={[styles.logoutText, { color: sub }]}>Log out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  iconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, lineHeight: 30, fontFamily: 'Inter-Bold', textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter-Medium', textAlign: 'center', marginBottom: 10 },
  note: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter-Medium', textAlign: 'center', marginBottom: 14 },
  primary: { width: '100%', minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontFamily: 'Inter-Bold' },
  secondary: { width: '100%', minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 14 },
  secondaryText: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter-SemiBold' },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, padding: 8 },
  logoutText: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter-Medium' },
});
