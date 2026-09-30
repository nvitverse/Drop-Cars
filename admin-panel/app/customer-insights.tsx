import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Users,
  MapPin,
  Calendar,
  Sparkles,
  Send,
  TrendingUp,
  Tag,
  Search,
  Clock,
  Compass,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';

interface CustomerInsight {
  id: string;
  name: string;
  phone: string;
  nativeCity: string;
  topRoute: string;
  preferredDays: 'WEEKEND_OUTBOUND' | 'WEEKSTART_RETURN' | 'REGULAR_BUSINESS';
  totalBookings: number;
  lastTravelDate: string;
  recommendedOffer: string;
}

export default function CustomerInsightsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'WEEKEND' | 'WEEKSTART'>('ALL');

  const [customers, setCustomers] = useState<CustomerInsight[]>([
    {
      id: 'cust1',
      name: 'Venkatesh R',
      phone: '9840112233',
      nativeCity: 'Chennai',
      topRoute: 'Chennai ➔ Madurai',
      preferredDays: 'WEEKEND_OUTBOUND',
      totalBookings: 14,
      lastTravelDate: 'Last Friday',
      recommendedOffer: '10% OFF Friday Outbound (Code: CHNFRIDAY10)',
    },
    {
      id: 'cust2',
      name: 'Anand Kumar',
      phone: '9876543210',
      nativeCity: 'Coimbatore',
      topRoute: 'Coimbatore ➔ Chennai',
      preferredDays: 'WEEKSTART_RETURN',
      totalBookings: 9,
      lastTravelDate: 'Last Sunday',
      recommendedOffer: 'Free Tolls on Sunday Return (Code: SUNRETURN)',
    },
    {
      id: 'cust3',
      name: 'Priya Sundaram',
      phone: '9790123456',
      nativeCity: 'Madurai',
      topRoute: 'Madurai ➔ Trichy',
      preferredDays: 'REGULAR_BUSINESS',
      totalBookings: 22,
      lastTravelDate: '2 days ago',
      recommendedOffer: '₹200 OFF Business Pass (Code: BIZ200)',
    },
  ]);

  const handleSendOffer = (customer: CustomerInsight) => {
    Alert.alert(
      'Dispatch Personalized Offer?',
      `Send "${customer.recommendedOffer}" via WhatsApp / SMS to ${customer.name} (${customer.phone})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Offer',
          onPress: () => {
            showToast(`Personalized offer sent to ${customer.name}!`, 'success');
          },
        },
      ]
    );
  };

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.nativeCity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.topRoute.toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedFilter === 'WEEKEND') return matchesSearch && c.preferredDays === 'WEEKEND_OUTBOUND';
    if (selectedFilter === 'WEEKSTART') return matchesSearch && c.preferredDays === 'WEEKSTART_RETURN';
    return matchesSearch;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Customer Behavior Intelligence</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Banner Box */}
        <View style={[styles.bannerBox, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <Sparkles size={22} color="#3B82F6" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: themeColors.text }]}>Customer Pattern Recognition Engine</Text>
            <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginTop: 2 }}>
              Tracks customer living city, weekend outbound surges (Friday-Saturday), and return travel patterns (Sunday-Monday) to automatically dispatch high-converting targeted offers!
            </Text>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'ALL' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('ALL')}
          >
            <Text style={[styles.filterPillText, selectedFilter === 'ALL' && styles.filterPillTextActive]}>All Customers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'WEEKEND' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('WEEKEND')}
          >
            <Text style={[styles.filterPillText, selectedFilter === 'WEEKEND' && styles.filterPillTextActive]}>Fri-Sat Weekend Surge</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedFilter === 'WEEKSTART' && styles.filterPillActive]}
            onPress={() => setSelectedFilter('WEEKSTART')}
          >
            <Text style={[styles.filterPillText, selectedFilter === 'WEEKSTART' && styles.filterPillTextActive]}>Sun-Mon Return Surge</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Search size={16} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search by customer name, phone, native city or route"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={themeColors.textMuted}
          />
        </View>

        {/* Customer Intelligence Cards */}
        {filteredCustomers.map((customer) => (
          <View key={customer.id} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Users size={18} color="#3B82F6" />
                <View>
                  <Text style={[styles.customerName, { color: themeColors.text }]}>{customer.name}</Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>📞 {customer.phone}</Text>
                </View>
              </View>
              <View style={[styles.cityBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <MapPin size={12} color="#3B82F6" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#3B82F6' }}>{customer.nativeCity}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Compass size={14} color="#0EA5E9" />
              <Text style={{ fontSize: 13, color: '#0EA5E9', fontWeight: '700' }}>Most Booked Route: {customer.topRoute}</Text>
            </View>

            <View style={styles.row}>
              <Calendar size={14} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                Travel Pattern:{' '}
                <Text style={{ fontWeight: '800', color: customer.preferredDays === 'WEEKEND_OUTBOUND' ? '#F59E0B' : '#10B981' }}>
                  {customer.preferredDays === 'WEEKEND_OUTBOUND' ? '🗓️ Friday-Saturday Outbound' : '🗓️ Sunday-Monday Return'}
                </Text>
              </Text>
            </View>

            <View style={styles.row}>
              <TrendingUp size={14} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                Total Trips: {customer.totalBookings} trips (Last active: {customer.lastTravelDate})
              </Text>
            </View>

            {/* Smart Offer Trigger Box */}
            <View style={[styles.offerBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
              <Tag size={16} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>RECOMMENDED TARGET OFFER</Text>
                <Text style={{ fontSize: 12.5, color: themeColors.text, fontWeight: '700', marginTop: 1 }}>
                  {customer.recommendedOffer}
                </Text>
              </View>
              <TouchableOpacity style={styles.sendBtn} onPress={() => handleSendOffer(customer)}>
                <Send size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>Send Offer</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
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
  bannerBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerTitle: { fontSize: 14, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
  },
  filterPillActive: { backgroundColor: '#3B82F6' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  filterPillTextActive: { color: '#FFFFFF' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 13.5 },
  card: { borderRadius: 8, padding: 16, borderWidth: 1, marginBottom: 12 },
  customerName: { fontSize: 15, fontWeight: '800' },
  cityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  divider: { height: 1, backgroundColor: 'rgba(156, 163, 175, 0.2)', marginVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  offerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 12,
  },
  sendBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
});
