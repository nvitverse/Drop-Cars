import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Clock,
  Radio,
  Sparkles,
  User,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';

interface EmergencyBidBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  pickup: string;
  dropLocation: string;
  pickupTime: string; // e.g. "50 mins remaining"
  baseEstimate: number;
  liveBidsCount: number;
  topBidAmount: number;
  topBidDriver: string;
  status: 'LIVE_BIDDING_ACTIVE' | 'BID_ACCEPTED' | 'CANCELLED';
}

export default function EmergencyBidsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [biddingBookings, setBiddingBookings] = useState<EmergencyBidBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEmergencyBids = async () => {
      try {
        const { apiService } = await import('@/services/api');
        const data = await apiService.getEmergencyBids();
        setBiddingBookings(data || []);
      } catch (e: any) {
        console.error('Failed to load emergency bids:', e);
      } finally {
        setLoading(false);
      }
    };
    loadEmergencyBids();
  }, []);

  const handleAcceptTopBid = (item: EmergencyBidBooking) => {
    Alert.alert(
      'Accept Driver Bid?',
      `Confirm ${item.topBidDriver} for ₹${item.topBidAmount}? (15% Platform Commission: ₹${Math.round(item.topBidAmount * 0.15)})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept Bid & Assign',
          onPress: () => {
            setBiddingBookings((prev) =>
              prev.map((b) => (b.id === item.id ? { ...b, status: 'BID_ACCEPTED' } : b))
            );
            showToast('Bid accepted & driver assigned to customer!', 'success');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Urgent bids</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Auto-Triggered Bids for Unresponded Bookings (&lt;1 Hr Pickup)
          </Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <Radio size={22} color="#3B82F6" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: themeColors.text }]}>Last-Minute Cancellation Protection</Text>
            <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginTop: 2 }}>
              When a booking remains unassigned within 1 hour of pickup, the Customer App transforms into a Live Driver Bidding UI so drivers can submit competitive quotes! (15% Commission applies).
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : biddingBookings.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Radio size={36} color={themeColors.textSecondary} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text, marginTop: 12 }}>No Active Emergency Bids</Text>
            <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: 4 }}>All trips are currently assigned or outside the emergency bidding window.</Text>
          </View>
        ) : (
          biddingBookings.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#EF4444" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444' }}>{item.pickupTime}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: item.status === 'LIVE_BIDDING_ACTIVE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: item.status === 'LIVE_BIDDING_ACTIVE' ? '#EF4444' : '#10B981' }}>
                  {item.status === 'LIVE_BIDDING_ACTIVE' ? '🔴 LIVE DRIVER BIDS' : '✓ BID CONFIRMED'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={[styles.customerTitle, { color: themeColors.text }]}>{item.customerName} (📞 {item.customerPhone})</Text>
            <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: 2 }}>
              Route: {item.pickup} ➔ {item.dropLocation}
            </Text>

            {/* Bids Breakdown Box */}
            <View style={[styles.bidsBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
              <Sparkles size={18} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.text }}>
                  {item.liveBidsCount} Driver Quotes Received
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981', marginTop: 2 }}>
                  Best Offer: ₹{item.topBidAmount} by {item.topBidDriver}
                </Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                  Net Admin 15% Fee: ₹{Math.round(item.topBidAmount * 0.15)}
                </Text>
              </View>
            </View>

            {item.status === 'LIVE_BIDDING_ACTIVE' && (
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptTopBid(item)}>
                <CheckCircle2 size={16} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>Accept Top Driver Offer (₹{item.topBidAmount})</Text>
              </TouchableOpacity>
            )}
          </View>
          ))
        )}
      </ScrollView>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 1 },
  infoBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoTitle: { fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 8, padding: 16, borderWidth: 1, marginBottom: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  divider: { height: 1, backgroundColor: 'rgba(156, 163, 175, 0.2)', marginVertical: 10 },
  customerTitle: { fontSize: 15, fontWeight: '800' },
  bidsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 12,
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 14,
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
