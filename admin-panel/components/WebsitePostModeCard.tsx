import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Hand, Zap, UserX, CheckCircle2 } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

type Mode = 'MANUAL' | 'AUTO' | 'AUTO_IF_NO_STAFF';

const OPTIONS: { key: Mode; title: string; body: string; Icon: any }[] = [
  {
    key: 'MANUAL',
    title: 'Manual',
    body: 'Nothing is posted by itself. Staff approve every website booking before it reaches the driver apps.',
    Icon: Hand,
  },
  {
    key: 'AUTO',
    title: 'Auto',
    body: 'Every confirmed website booking is posted automatically once its review time is over, even if staff are on duty.',
    Icon: Zap,
  },
  {
    key: 'AUTO_IF_NO_STAFF',
    title: 'Auto when no staff is on duty',
    body: 'If any staff member is on duty, they handle bookings by hand. When nobody is on duty, bookings are posted automatically.',
    Icon: UserX,
  },
];

// How confirmed website bookings reach the driver apps. Saved straight away when a choice is tapped.
export default function WebsitePostModeCard() {
  const { themeColors, isDark } = useTheme();
  const [mode, setMode] = useState<Mode>('AUTO');
  const [staffOnDuty, setStaffOnDuty] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Mode | null>(null);

  const load = useCallback(async () => {
    try {
      const s: any = await apiService.getSystemSettings();
      const m = String(s?.website_booking_post_mode || 'AUTO').toUpperCase();
      setMode((['MANUAL', 'AUTO', 'AUTO_IF_NO_STAFF'].includes(m) ? m : 'AUTO') as Mode);
      setStaffOnDuty(typeof s?.staff_on_duty_count === 'number' ? s.staff_on_duty_count : null);
    } catch {
      // keep the defaults - the card stays usable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const choose = async (next: Mode) => {
    if (next === mode || saving) return;
    setSaving(next);
    try {
      await apiService.updateSystemSettings({ website_booking_post_mode: next });
      setMode(next);
    } catch (e: any) {
      Alert.alert('Could not change this setting', e?.message || 'Only the owner account can change how bookings are posted. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>WEBSITE BOOKINGS - HOW THEY ARE POSTED</Text>
      <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        {loading ? (
          <ActivityIndicator style={{ margin: 20 }} color="#6366F1" />
        ) : (
          <>
            {OPTIONS.map(({ key, title, body, Icon }, i) => {
              const on = mode === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => choose(key)}
                  activeOpacity={0.8}
                  style={[
                    styles.option,
                    i > 0 && { borderTopWidth: 1, borderTopColor: themeColors.border },
                    on && { backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF' },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: on ? '#6366F1' : (isDark ? '#334155' : '#F1F5F9') }]}>
                    <Icon size={18} color={on ? '#FFFFFF' : themeColors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
                    <Text style={[styles.body, { color: themeColors.textSecondary }]}>{body}</Text>
                  </View>
                  {saving === key ? <ActivityIndicator size="small" color="#6366F1" /> : on ? <CheckCircle2 size={20} color="#6366F1" /> : null}
                </TouchableOpacity>
              );
            })}
            {staffOnDuty !== null && (
              <Text style={[styles.foot, { color: themeColors.textSecondary }]}>
                Staff on duty right now: {staffOnDuty}. Staff switch themselves on or off duty in their own profile.
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconWrap: { width: 38, height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  foot: { fontSize: 12, padding: 12, paddingTop: 8 },
});
