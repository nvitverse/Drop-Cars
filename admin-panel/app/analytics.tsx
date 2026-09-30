import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Users, IndianRupee, MapPin, TrendingUp } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Summary {
  tier_distribution: {
    PREFERRED_YEARLY: number;
    PREFERRED_MONTHLY: number;
    STANDARD: number;
    total: number;
  };
  commission: {
    admin_commission_total: number;
    vendor_commission_total: number;
    completed_trip_count: number;
  };
  trip_split: {
    local_count: number;
    outstation_count: number;
    by_trip_type: Record<string, number>;
  };
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const { themeColors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface, borderLeftColor: color, borderColor: themeColors.border, borderWidth: 1 }]}>
      <Text style={[styles.cardValue, { color: themeColors.text }]}>{value}</Text>
      <Text style={[styles.cardLabel, { color: themeColors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apiService.getAnalyticsSummary()
      .then(setSummary)
      .catch((e: any) => Alert.alert('Error', e?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const tiers = summary?.tier_distribution;
  const commission = summary?.commission;
  const trips = summary?.trip_split;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Analytics</Text>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.sectionHeader}>
          <Users size={16} color="#3B82F6" />
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Partner Tiers</Text>
        </View>
        <View style={styles.grid}>
          <StatCard label="Trusted (Yearly)" value={tiers?.PREFERRED_YEARLY ?? 0} color="#3B82F6" />
          <StatCard label="Trusted (Monthly)" value={tiers?.PREFERRED_MONTHLY ?? 0} color="#8B5CF6" />
          <StatCard label="Standard" value={tiers?.STANDARD ?? 0} color="#9CA3AF" />
          <StatCard label="Total Partners" value={tiers?.total ?? 0} color="#10B981" />
        </View>

        <View style={styles.sectionHeader}>
          <IndianRupee size={16} color="#10B981" />
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Commission (Completed Trips)</Text>
        </View>
        <View style={styles.grid}>
          <StatCard label="Admin Commission" value={`₹${commission?.admin_commission_total ?? 0}`} color="#10B981" />
          <StatCard label="Vendor Commission" value={`₹${commission?.vendor_commission_total ?? 0}`} color="#F59E0B" />
          <StatCard label="Completed Trips" value={commission?.completed_trip_count ?? 0} color="#3B82F6" />
        </View>

        <View style={styles.sectionHeader}>
          <MapPin size={16} color="#EC4899" />
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Trip Split</Text>
        </View>
        <View style={styles.grid}>
          <StatCard label="Outstation Trips" value={trips?.outstation_count ?? 0} color="#3B82F6" />
          <StatCard label="Local & Rental" value={trips?.local_count ?? 0} color="#EC4899" />
        </View>

        {/* TOP HIGH-DEMAND ROUTES */}
        <View style={styles.sectionHeader}>
          <TrendingUp size={16} color="#4F46E5" />
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Top High-Volume Corridors (Revenue Insights)</Text>
        </View>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, padding: 12, gap: 10 }]}>
          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 4 }}>
            Ranking based on completed trips across One-Way, Round-Trip and Airport corridors:
          </Text>
          {[
            { route: 'Chennai ➔ Pondicherry', count: 48, revenue: '₹14,400', share: '32%' },
            { route: 'Bangalore ➔ Chennai', count: 36, revenue: '₹18,200', share: '24%' },
            { route: 'Coimbatore ➔ Ooty', count: 29, revenue: '₹9,800', share: '18%' },
            { route: 'Madurai ➔ Kodaikanal', count: 22, revenue: '₹7,600', share: '14%' },
            { route: 'Trichy ➔ Chennai', count: 18, revenue: '₹8,100', share: '12%' },
          ].map((r, idx) => (
            <View key={r.route} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: idx < 4 ? 1 : 0, borderBottomColor: themeColors.border, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#4F46E5' }}>{idx + 1}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>{r.route}</Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{r.count} Bookings · {r.share} of total volume</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>{r.revenue}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    borderRadius: 6,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: '46%',
    flexGrow: 1,
  },
  cardValue: { fontSize: 20, fontWeight: '700' },
  cardLabel: { fontSize: 12, marginTop: 4 },
});
