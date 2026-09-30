import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useCallback } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import {
  ArrowLeft,
  Phone,
  MapPin,
  ShieldCheck,
  Car,
  CircleDollarSign,
  Clock,
  Star,
  ChevronRight,
  Pencil,
  User,
  IdCard,
  Route as RouteIcon,
} from 'lucide-react-native';
import axiosDriver from '@/app/api/axiosDriver';

export default function CarDriverProfileScreen() {
  const { colors } = useTheme();
  const { driver, refreshDriverData } = useCarDriver();
  const router = useRouter();
  // Real profile numbers + fleet owner contact from the backend (the stats used to be hard-coded 0 / ₹0 / 5.0)
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await axiosDriver.get('/api/users/cardriver/me/summary');
      setSummary(res.data);
    } catch (e) {
      // profile still renders from the driver record
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const saveName = async () => {
    setSavingName(true);
    try {
      await axiosDriver.put('/api/users/cardriver/me/name', { full_name: nameInput });
      setShowNameModal(false);
      await refreshDriverData();
      await loadSummary();
      Alert.alert('Saved', 'Your name is updated. It now shows on your trips and reviews.');
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert('Could not save', typeof d === 'string' ? d : 'Please try again.');
    } finally {
      setSavingName(false);
    }
  };
  const call = (n?: string | null) => { if (n) Linking.openURL(`tel:${n}`); };

  const driverName = summary?.full_name || driver?.full_name || (driver as any)?.name || 'Driver';
  const orgSub = 'Duty Driver • Fleet Partner';
  const driverPhone = driver?.primary_number || (driver as any)?.phone || 'Not available';
  const driverLocation = (driver as any)?.city ? `${(driver as any).city}, TN` : (driver?.address || 'Location not set');

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 6,
      marginRight: 12,
      borderRadius: 6,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      letterSpacing: -0.3,
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    // Compact Hero Banner
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    avatarText: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
    },
    heroInfo: {
      flex: 1,
    },
    driverName: {
      fontSize: 17,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 2,
    },
    driverSub: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#10B98115',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#10B98130',
    },
    verifiedBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter-Bold',
      color: '#059669',
    },
    // Section Header
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    // Grouped Details Card
    groupedCard: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18,
      overflow: 'hidden',
    },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 48,
    },
    iconBox: {
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: colors.primary + '12',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    rowLabel: {
      fontSize: 11,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    rowValue: {
      fontSize: 13.5,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      marginTop: 1,
    },
    callPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    callPillText: {
      fontSize: 11.5,
      fontFamily: 'Inter-Bold',
      color: colors.primary,
    },
    // Stats Compact Grid
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    compactStatCard: {
      width: '48.5%',
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statIconBox: {
      width: 34,
      height: 34,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statVal: {
      fontSize: 15,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      lineHeight: 18,
    },
    statLbl: {
      fontSize: 10.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              safeBack(router);
            } else {
              router.replace('/car-driver/dashboard' as any);
            }
          }}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSummary(); }} colors={[colors.primary]} />}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{driverName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.driverName}>{driverName}</Text>
            <Text style={styles.driverSub}>{summary?.is_owner_driver ? 'Fleet driver on duty' : orgSub}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <ShieldCheck color="#10B981" size={13} />
                <Text style={styles.verifiedBadgeText}>Verified Fleet Partner</Text>
              </View>
            </View>
          </View>
          {summary?.is_owner_driver && (
            <TouchableOpacity onPress={() => { setNameInput(driverName); setShowNameModal(true); }} style={{ padding: 8 }} accessibilityLabel="Edit driver name">
              <Pencil size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {summary?.is_owner_driver && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: -8, marginBottom: 14, lineHeight: 17 }}>
            The trip shows this name as the driver. Tap the pencil to enter your own name instead of the fleet name.
          </Text>
        )}

        {/* Performance - real numbers */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Performance</Text>
        </View>
        <View style={styles.statsGrid}>
          {[
            { label: 'Trips completed', val: String(summary?.stats?.total_trips ?? 0), sub: `${summary?.stats?.today_trips ?? 0} today`, icon: <Car color="#3B82F6" size={16} />, bg: '#3B82F612' },
            { label: 'Earnings', val: `₹${summary?.stats?.earnings_total ?? 0}`, sub: `₹${summary?.stats?.earnings_today ?? 0} today`, icon: <CircleDollarSign color="#10B981" size={16} />, bg: '#10B98112' },
            { label: 'Distance driven', val: `${summary?.stats?.total_km ?? 0} km`, sub: 'all trips', icon: <RouteIcon color="#8B5CF6" size={16} />, bg: '#8B5CF612' },
            { label: 'Rating', val: summary?.stats?.avg_rating != null ? `${summary.stats.avg_rating} ★` : '-', sub: `${summary?.stats?.rating_count ?? 0} review(s)`, icon: <Star color="#F59E0B" size={16} />, bg: '#F59E0B12' },
          ].map((st) => (
            <View key={st.label} style={styles.compactStatCard}>
              <View style={[styles.statIconBox, { backgroundColor: st.bg }]}>{st.icon}</View>
              <View>
                <Text style={styles.statVal}>{st.val}</Text>
                <Text style={styles.statLbl}>{st.label} · {st.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* About me (no call button on your own number - a call button is only for OTHER people's numbers) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Details</Text>
        </View>
        <View style={styles.groupedCard}>
          {[
            { icon: <Phone color={colors.primary} size={16} />, label: 'Mobile number', value: driverPhone },
            { icon: <User color={colors.primary} size={16} />, label: 'Driver ID', value: summary?.reg_id || '-' },
            { icon: <IdCard color={colors.primary} size={16} />, label: 'Licence number', value: summary?.licence_number || '-' },
            {
              icon: <Clock color={summary?.licence_days_left != null && summary.licence_days_left <= 15 ? '#DC2626' : colors.primary} size={16} />,
              label: 'Licence valid till',
              value: summary?.licence_expiry_date
                ? `${new Date(summary.licence_expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}${summary.licence_days_left != null && summary.licence_days_left <= 15 ? (summary.licence_days_left < 0 ? ' - EXPIRED, renew now' : ` - expires in ${summary.licence_days_left} day(s)`) : ''}`
                : 'Not added',
              warn: summary?.licence_days_left != null && summary.licence_days_left <= 15,
            },
            { icon: <MapPin color={colors.primary} size={16} />, label: 'Address', value: [summary?.address, summary?.city, summary?.pincode].filter(Boolean).join(', ') || driverLocation },
            ...(summary?.current_car ? [{ icon: <Car color={colors.primary} size={16} />, label: 'Car on duty', value: `${summary.current_car.name} · ${summary.current_car.number}` }] : []),
          ].map((row: any, i: number, arr: any[]) => (
            <React.Fragment key={row.label}>
              <View style={styles.rowItem}>
                <View style={styles.iconBox}>{row.icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={[styles.rowValue, row.warn ? { color: '#DC2626' } : null]}>{row.value}</Text>
                </View>
              </View>
              {i < arr.length - 1 && <View style={styles.rowDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Contacts - the people you may need to call */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Contacts</Text>
        </View>
        <View style={styles.groupedCard}>
          {!summary?.is_owner_driver && !!summary?.fleet_owner?.phone && (
            <>
              <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={() => call(summary.fleet_owner.phone)}>
                <View style={styles.iconBox}><User color={colors.primary} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Fleet driver</Text>
                  <Text style={styles.rowValue}>{summary.fleet_owner.name} · {summary.fleet_owner.phone}</Text>
                </View>
                <View style={styles.callPill}><Text style={styles.callPillText}>Call</Text></View>
              </TouchableOpacity>
              <View style={styles.rowDivider} />
            </>
          )}
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={() => call(summary?.support_phone || '+917200217986')}>
            <View style={[styles.iconBox, { backgroundColor: '#10B98112' }]}><ShieldCheck color="#10B981" size={16} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Drop Cars support</Text>
              <Text style={styles.rowValue}>{summary?.support_phone || '+917200217986'}</Text>
            </View>
            <View style={styles.callPill}><Text style={styles.callPillText}>Call</Text></View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showNameModal} transparent animationType="fade" onRequestClose={() => setShowNameModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 10, padding: 20, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'Inter-Bold' }}>Your name as driver</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              This is shown to the booking owner and the customer as the driver of the trip.
            </Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Naveen"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: colors.background }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => setShowNameModal(false)} disabled={savingName}>
                <Text style={{ color: colors.text, fontFamily: 'Inter-Bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1.4, paddingVertical: 12, borderRadius: 6, backgroundColor: colors.primary, alignItems: 'center' }} onPress={saveName} disabled={savingName || nameInput.trim().length < 2}>
                {savingName ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold' }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
