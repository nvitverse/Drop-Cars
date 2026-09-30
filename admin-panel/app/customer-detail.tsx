import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Phone, Mail, Clock, Lock, UserCheck, AlertTriangle, Eye, EyeOff } from 'lucide-react-native';
import { apiService, resetUserPassword } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Btn, EmptyState, SkeletonRow } from '@/components/ui';

interface CustomerProfile {
  id: string;
  customer_id: string;
  full_name: string;
  primary_number: string;
  email?: string | null;
  saved_addresses?: Array<{ label?: string; address?: string }> | null;
  created_at: string;
  current_password?: string | null;
}

interface BookingRequest {
  id: string;
  customer_id: string;
  trip_type: string;
  car_type: string;
  status: string;
  is_paid: boolean;
  quoted_total_amount?: number;
  admin_total_amount?: number;
  created_at: string;
}

const formatCurrency = (amount?: number) => (amount === undefined || amount === null ? '—' : `₹${amount.toLocaleString('en-IN')}`);
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function CustomerDetailScreen() {
  const { customerId, customerDetailsId, fullName, primaryNumber, email } = useLocalSearchParams<{
    customerId: string;
    customerDetailsId?: string;
    fullName?: string;
    primaryNumber?: string;
    email?: string;
  }>();
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const fetchCustomerData = useCallback(async () => {
    try {
      setError(null);
      let loadedProfile: CustomerProfile | null = null;
      if (customerDetailsId) {
        try {
          const detail = await apiService.getCustomerDetails(customerDetailsId);
          if (detail) {
            loadedProfile = {
              id: detail.id,
              customer_id: detail.customer_id || customerId,
              full_name: detail.full_name,
              primary_number: detail.primary_number,
              email: detail.email,
              saved_addresses: detail.saved_addresses,
              created_at: detail.created_at,
              current_password: detail.current_password,
            };
          }
        } catch {}
      }

      if (!loadedProfile && fullName && primaryNumber) {
        loadedProfile = {
          id: customerDetailsId || customerId,
          customer_id: customerId,
          full_name: fullName,
          primary_number: primaryNumber,
          email: email || null,
          created_at: new Date().toISOString(),
        };
      }
      setProfile(loadedProfile);

      try {
        const bookingsData = await apiService.getCustomerBookings(customerId);
        setBookings(bookingsData || []);
      } catch {
        setBookings([]);
      }
    } catch (e: any) {
      setError('Failed to load customer profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, customerDetailsId, fullName, primaryNumber, email]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setResettingPassword(true);
    try {
      await resetUserPassword(customerId, 'customer', newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast('Customer password has been reset successfully', 'success');
      fetchCustomerData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Customer Account',
      'This will delete the customer credentials and profile permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteAccount(customerId, 'customer');
              showToast('Customer account deleted successfully', 'success');
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete account');
            }
          },
        },
      ]
    );
  };

  const getStatusVariant = (st: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    const s = (st || '').toUpperCase();
    if (s === 'COMPLETED' || s === 'CONFIRMED') return 'success';
    if (s === 'CANCELLED') return 'danger';
    if (s === 'PENDING') return 'warning';
    return 'neutral';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>
          {profile?.full_name || 'Customer Details'}
        </Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCustomerData(); }} tintColor={themeColors.primary} />}
        >
          {profile && (
            <Card style={styles.profileCard}>
              <View style={styles.avatarRow}>
                <View style={[styles.avatarBox, { backgroundColor: themeColors.primaryTint }]}>
                  <UserCheck size={22} color={themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nameText, { color: themeColors.text }]}>{profile.full_name}</Text>
                  <Text style={[styles.idText, { color: themeColors.textMuted }]}>ID: {profile.customer_id}</Text>
                </View>
              </View>

              <View style={[styles.infoGrid, { borderTopColor: themeColors.border }]}>
                <View style={styles.infoItem}>
                  <Phone size={13} color={themeColors.textMuted} />
                  <Text style={[styles.infoValue, { color: themeColors.text }]}>{profile.primary_number}</Text>
                </View>
                {!!profile.email && (
                  <View style={styles.infoItem}>
                    <Mail size={13} color={themeColors.textMuted} />
                    <Text style={[styles.infoValue, { color: themeColors.text }]}>{profile.email}</Text>
                  </View>
                )}
                <View style={styles.infoItem}>
                  <Clock size={13} color={themeColors.textMuted} />
                  <Text style={[styles.infoValue, { color: themeColors.textSecondary }]}>Joined {formatDate(profile.created_at)}</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Password Reset Section */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Lock size={16} color={themeColors.primary} />
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Reset Password</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>New Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="Enter new password"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showNewPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff size={16} color={themeColors.textMuted} /> : <Eye size={16} color={themeColors.textMuted} />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Confirm Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="Confirm new password"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff size={16} color={themeColors.textMuted} /> : <Eye size={16} color={themeColors.textMuted} />}
                </TouchableOpacity>
              </View>
            </View>

            <Btn
              label={resettingPassword ? 'Updating...' : 'Update Password'}
              variant="primary"
              size="sm"
              onPress={handleResetPassword}
              disabled={resettingPassword || !newPassword}
              style={{ marginTop: 6 }}
            />
          </Card>

          {/* Booking History */}
          <View style={styles.bookingSection}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 8 }]}>Booking Requests ({bookings.length})</Text>
            {bookings.map((b) => (
              <Card
                key={b.id}
                style={styles.bookingCard}
                onPress={() => router.push({ pathname: '/(tabs)/orders', params: { search: b.id } })}
              >
                <View style={styles.bookingHeader}>
                  <View>
                    <Text style={[styles.tripTypeText, { color: themeColors.text }]}>{b.trip_type} • {b.car_type}</Text>
                    <Text style={[styles.bookingDate, { color: themeColors.textMuted }]}>{formatDate(b.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <StatusPill label={b.status} variant={getStatusVariant(b.status)} size="sm" />
                    <Text style={[styles.bookingAmount, { color: themeColors.primary }]}>
                      {formatCurrency(b.admin_total_amount || b.quoted_total_amount)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
            {bookings.length === 0 && (
              <EmptyState
                icon={<Clock size={32} color={themeColors.textMuted} />}
                title="No bookings"
                message="This customer has not created any booking requests."
              />
            )}
          </View>

          {/* Danger Zone */}
          <Card style={[styles.dangerCard, { borderColor: themeColors.errorTint }]}>
            <View style={styles.dangerRow}>
              <AlertTriangle size={18} color={themeColors.error} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.dangerTitle, { color: themeColors.error }]}>Delete Account</Text>
                <Text style={[styles.dangerSub, { color: themeColors.textMuted }]}>Permanently remove customer credentials.</Text>
              </View>
              <Btn label="Delete" variant="danger" size="sm" onPress={handleDeleteAccount} />
            </View>
          </Card>
        </ScrollView>
      )}
      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  loadingContainer: { padding: 16, gap: 8 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  profileCard: { padding: 14 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatarBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nameText: { fontSize: 16, fontWeight: '800' },
  idText: { fontSize: 11, marginTop: 1 },
  infoGrid: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoValue: { fontSize: 13, fontWeight: '500' },
  sectionCard: { padding: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  inputGroup: { marginBottom: 10 },
  inputLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 4 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
  },
  inputField: { flex: 1, fontSize: 13, padding: 0 },
  bookingSection: { gap: 6 },
  bookingCard: { padding: 12, marginBottom: 4 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripTypeText: { fontSize: 13, fontWeight: '700' },
  bookingDate: { fontSize: 11, marginTop: 2 },
  bookingAmount: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  dangerCard: { padding: 12, borderWidth: 1 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dangerTitle: { fontSize: 13, fontWeight: '700' },
  dangerSub: { fontSize: 11 },
});
