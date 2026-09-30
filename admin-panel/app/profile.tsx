import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft,
  User,
  Shield,
  ShieldCheck,
  Clock,
  LogOut,
  Mail,
  Key,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
  Calendar,
  Layers,
  Power,
  RotateCcw,
  Settings,
  ChevronRight,
  Star,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { AccentPicker, Row } from '@/components/ui';
import DutySignOffModal from '@/components/DutySignOffModal';

export default function ProfileScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [adminRole, setAdminRole] = useState('Owner');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [onDutyShift, setOnDutyShift] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [isSignOffViewOnly, setIsSignOffViewOnly] = useState(false);

  const isOwner = adminRole === 'Owner';

  useFocusEffect(
    React.useCallback(() => {
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    try {
      setLoading(true);
      const username = await apiService.getCachedAdminUsername();
      const role = await apiService.getCachedAdminRole();
      const perms = await apiService.getCachedAdminPermissions();
      const savedDuty = await AsyncStorage.getItem('@admin_staff_on_duty_shift');

      setAdminUsername(username || 'Admin');
      setAdminRole(role || 'Owner');
      setPermissions(perms || []);
      if (savedDuty !== null) {
        setOnDutyShift(savedDuty === 'true');
      }

      // Fetch live duty status from backend
      try {
        const liveDuty = await apiService.getMyOnDuty();
        if (typeof liveDuty?.is_on_duty === 'boolean') {
          setOnDutyShift(liveDuty.is_on_duty);
          AsyncStorage.setItem('@admin_staff_on_duty_shift', String(liveDuty.is_on_duty)).catch(() => {});
        }
        setProfileData(liveDuty);
      } catch {
        // Fallback to cached
      }
    } catch (e) {
      console.warn('Failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out from your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await apiService.logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleForceLogoutAll = () => {
    Alert.alert(
      'Force Logout All Sessions',
      'This will invalidate all active login sessions on all devices for this account. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force Logout All',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.forceLogoutAllSessions();
            } catch {}
            await apiService.logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleConfirmOffline = (ackType: 'acknowledged' | 'will_improve') => {
    setOnDutyShift(false);
    AsyncStorage.setItem('@admin_staff_on_duty_shift', 'false').catch(() => {});
    const shiftTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    apiService.submitOwnDailyRecord(`Duty shift concluded at ${shiftTime} (Sign-off: ${ackType})`).catch(() => {});
    apiService.setOnDuty(false).catch(() => {});
  };

  const toggleDutyStatus = () => {
    if (onDutyShift) {
      setIsSignOffViewOnly(false);
      setShowSignOffModal(true);
    } else {
      setOnDutyShift(true);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', 'true').catch(() => {});
      apiService.setOnDuty(true).catch(() => {});
    }
  };

  const openPerformanceSummary = () => {
    setIsSignOffViewOnly(true);
    setShowSignOffModal(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Admin Profile</Text>
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading profile...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Profile Card */}
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <View
              style={[
                styles.avatarContainer,
                {
                  backgroundColor: isDark ? '#312E81' : '#EEF2FF',
                  borderColor: isOwner ? '#6366F1' : (onDutyShift ? '#10B981' : '#EF4444'),
                },
              ]}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {(adminUsername || 'A').slice(0, 2).toUpperCase()}
              </Text>
              {!isOwner && (
                <View
                  style={[
                    styles.avatarStatusDot,
                    { backgroundColor: onDutyShift ? '#10B981' : '#EF4444', borderColor: themeColors.surface },
                  ]}
                />
              )}
            </View>

            <Text style={[styles.profileName, { color: themeColors.text }]}>
              {adminUsername}
            </Text>

            <View style={styles.roleBadgeRow}>
              <View
                style={[
                  styles.roleBadge,
                  {
                    backgroundColor: isOwner
                      ? (isDark ? '#4338CA35' : '#EEF2FF')
                      : (isDark ? '#065F4635' : '#ECFDF5'),
                    borderColor: isOwner ? '#6366F1' : '#10B981',
                  },
                ]}
              >
                <Shield size={12} color={isOwner ? '#6366F1' : '#10B981'} />
                <Text
                  style={[
                    styles.roleBadgeText,
                    { color: isOwner ? (isDark ? '#818CF8' : '#4F46E5') : (isDark ? '#34D399' : '#059669') },
                  ]}
                >
                  {isOwner ? '👑 SYSTEM OWNER' : `🛡️ ${adminRole.toUpperCase()} STAFF`}
                </Text>
              </View>

              {!isOwner && (
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: onDutyShift
                        ? (isDark ? '#064E3B30' : '#DCFCE7')
                        : (isDark ? '#7F1D1D30' : '#FEE2E2'),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.liveDot,
                      { backgroundColor: onDutyShift ? '#10B981' : '#EF4444' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: onDutyShift ? '#15803D' : '#B91C1C' },
                    ]}
                  >
                    {onDutyShift ? 'Online Duty' : 'Offline'}
                  </Text>
                </View>
              )}
            </View>
          </View>

            {/* Shift Duty Management (Only for Staff) */}
            {!isOwner && (
              <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Shift & Attendance</Text>
                <View style={styles.dutyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dutyLabel, { color: themeColors.text }]}>
                      Duty Status: {onDutyShift ? 'On Shift (Active)' : 'Clocked Out (Offline)'}
                    </Text>
                    <Text style={[styles.dutySub, { color: themeColors.textSecondary }]}>
                      {onDutyShift
                        ? 'You are currently active and ready for calls, assignments & leads'
                        : 'Shift is paused. Tap to go on duty when starting work'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={toggleDutyStatus}
                    style={[
                      styles.dutyToggleBtn,
                      {
                        backgroundColor: onDutyShift ? '#EF4444' : '#10B981',
                      },
                    ]}
                  >
                    <Power size={14} color="#FFFFFF" />
                    <Text style={styles.dutyToggleBtnText}>
                      {onDutyShift ? 'Clock Out' : 'Go On Duty'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* My Performance Today Card */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={openPerformanceSummary}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: themeColors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: '#F59E0B18', alignItems: 'center', justifyContent: 'center' }}>
                      <Star size={16} color="#F59E0B" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>My performance today</Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>View star scores, response speed & coaching notes</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Owner Administration / Settings Menu */}
            {isOwner && (
              <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Settings & Reports</Text>
                
                <TouchableOpacity
                  style={styles.settingsMenuBtn}
                  onPress={() => router.push('/(tabs)/settings' as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.settingsIconWrap, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}>
                    <Settings size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.settingsMenuTitle, { color: themeColors.text }]}>System Settings</Text>
                    <Text style={[styles.settingsMenuSubtitle, { color: themeColors.textSecondary }]}>
                      Staff roles, pricing, verification & system control
                    </Text>
                  </View>
                  <ChevronRight size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>

                {/* Staff Performance Reports (Coming Soon) */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 10,
                    marginTop: 4,
                    borderTopWidth: 1,
                    borderTopColor: themeColors.border,
                    opacity: 0.85,
                  }}
                >
                  <View style={[styles.settingsIconWrap, { backgroundColor: isDark ? '#064E3B20' : '#ECFDF5' }]}>
                    <Star size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.settingsMenuTitle, { color: themeColors.text }]}>Staff Performance Reports</Text>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: isDark ? '#334155' : '#E2E8F0' }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '800', color: themeColors.textSecondary }}>Coming soon</Text>
                      </View>
                    </View>
                    <Text style={[styles.settingsMenuSubtitle, { color: themeColors.textSecondary }]}>
                      Daily staff response star scorecards & conversion metrics
                    </Text>
                  </View>
                </View>
              </View>
            )}

          {/* Account Details Card */}
          <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Account Information</Text>

            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <User size={16} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Username</Text>
              </View>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{adminUsername}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <ShieldCheck size={16} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Role</Text>
              </View>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{adminRole}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Layers size={16} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Access Scope</Text>
              </View>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {isOwner ? 'Full System Administrator' : `${permissions.length} Module Permissions`}
              </Text>
            </View>
          </View>

          {/* Granted Permissions (for Staff) */}
          {!isOwner && permissions.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Assigned Permissions</Text>
              <View style={styles.permsWrap}>
                {permissions.map((perm, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.permChip,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    <CheckCircle2 size={12} color="#10B981" />
                    <Text style={[styles.permChipText, { color: themeColors.text }]}>
                      {perm.charAt(0).toUpperCase() + perm.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Look & feel: one of five colour themes */}
          <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, padding: 0 }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, padding: 14, paddingBottom: 0 }]}>Look & feel</Text>
            <AccentPicker />
          </View>

          {/* App Info & Version */}
          <View style={[styles.sectionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>About this app</Text>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Drop Cars staff app</Text>
              <Text style={[styles.infoValue, { color: themeColors.textSecondary }]}>v2.4.0 Live</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Connected to</Text>
              <Text style={[styles.infoValue, { color: '#10B981' }]}>Live server</Text>
            </View>
          </View>

          {/* ── Log Out Actions ── */}
          <View style={styles.logoutSection}>
            {isOwner && (
              <TouchableOpacity
                style={[
                  styles.forceLogoutBtn,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                    borderColor: isDark ? '#EF444440' : '#FECACA',
                  },
                ]}
                onPress={handleForceLogoutAll}
                activeOpacity={0.8}
              >
                <RotateCcw size={16} color="#DC2626" />
                <Text style={styles.forceLogoutText}>Force Logout All Sessions</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <LogOut size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.logoutBtnText}>Log Out from Account</Text>
            </TouchableOpacity>

            {/* Exit to NV OS Button */}
            {Platform.OS === 'web' && typeof window !== 'undefined' && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#0F172A',
                  borderWidth: 1.5,
                  borderColor: '#38BDF8',
                  paddingVertical: 14,
                  borderRadius: 14,
                  gap: 10,
                  marginTop: 12,
                }}
                onPress={() => {
                  try {
                    window.parent.postMessage({ type: 'NVOS_CLOSE_APP', appId: 'taxi' }, '*');
                  } catch (e) {
                    console.log('Exit to NV OS message failed', e);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 16 }}>🖥️</Text>
                <Text style={{ color: '#38BDF8', fontWeight: '800', fontSize: 15 }}>
                  Exit to NV OS Desktop
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Duty Sign-Off & Performance Scorecard Modal */}
      <DutySignOffModal
        visible={showSignOffModal}
        onClose={() => setShowSignOffModal(false)}
        onConfirmOffline={handleConfirmOffline}
        staffId={adminUsername}
        isViewOnly={isSignOffViewOnly}
      />
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dutyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dutyLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  dutySub: {
    fontSize: 11,
    lineHeight: 16,
  },
  dutyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dutyToggleBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  permsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  permChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  logoutSection: {
    gap: 10,
    marginTop: 6,
  },
  forceLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  forceLogoutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  settingsMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  settingsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsMenuTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  settingsMenuSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
