import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, User, Car, Users, ListChecks, Settings, Crown, Bell, IdCard, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

// The fleet owner's everything-else menu. It replaced the Duty tab: an owner who also drives starts and ends his own trips from
// My Trips (see active.tsx), so he no longer needs a tab of his own for that (owner decision 2026-10-24).
export default function MoreScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const items: { icon: any; title: string; sub: string; route: string }[] = [
    { icon: Wallet, title: t('drawer.transactions'), sub: t('Wallet balance, add money, payouts'), route: '/(tabs)/wallet' },
    { icon: User, title: t('My Profile'), sub: t('Personal, KYC & Account details'), route: '/(tabs)/profile' },
    { icon: Car, title: t('My Cars'), sub: t('Cars and their documents'), route: '/my-cars' },
    { icon: Users, title: t('My Drivers'), sub: t('Drivers and their licences'), route: '/my-drivers' },
    { icon: ListChecks, title: t('Trip history'), sub: t('Completed and cancelled trips'), route: '/(tabs)/executed' },
    { icon: IdCard, title: t('My duty (own trips)'), sub: t('Trips you drive yourself'), route: '/(tabs)/duty' },
    { icon: Crown, title: t('Trusted Partner'), sub: t('Plans and benefits'), route: '/subscription' },
    { icon: Bell, title: t('Notifications'), sub: t('Alerts and sounds'), route: '/notifications' },
    { icon: Settings, title: t('Settings'), sub: t('Language, theme, support'), route: '/(tabs)/settings' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.text }]}>{t('tabBar.more')}</Text>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <TouchableOpacity
              key={it.route + it.title}
              onPress={() => router.push(it.route as any)}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                <Icon size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{it.title}</Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{it.sub}</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontFamily: 'Inter-Bold', paddingHorizontal: 16, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
});
