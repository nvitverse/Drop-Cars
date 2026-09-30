import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MapPin, Phone, Clock } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface VacantOwner {
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  cities: string[];
  updated_at: string | null;
}

const formatUpdatedAt = (value: string | null): string => {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
};

export default function VacantCitiesScreen() {
  const { isDark, themeColors } = useTheme();
  const [owners, setOwners] = useState<VacantOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchVacantCities = async () => {
    try {
      setError(null);
      const data = await apiService.getVacantCities();
      // Newest updates first
      const sorted = [...data].sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      });
      setOwners(sorted);
    } catch (err) {
      console.error('Failed to fetch vacant cities:', err);
      setError('Failed to load vacant cities. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVacantCities();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVacantCities();
  };

  const handleCall = (phone: string) => {
    if (!phone) return;
    const url = Platform.OS === 'web' ? `tel:${phone}` : `tel:${phone}`;
    Linking.openURL(url).catch(() => {});
  };

  const filteredOwners = owners.filter((owner) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (owner.full_name || '').toLowerCase().includes(q) ||
      (owner.primary_number || '').toLowerCase().includes(q) ||
      (owner.cities || []).some((c) => c.toLowerCase().includes(q))
    );
  });

  const renderItem = ({ item }: { item: VacantOwner }) => (
    <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
      <View style={styles.cardTop}>
        <View style={styles.ownerInfo}>
          <Text style={[styles.ownerName, { color: themeColors.text }]} numberOfLines={1}>
            {item.full_name || 'Unknown owner'}
          </Text>
          <View style={styles.updatedRow}>
            <Clock size={12} color={themeColors.textMuted} />
            <Text style={[styles.updatedText, { color: themeColors.textSecondary }]}>{formatUpdatedAt(item.updated_at)}</Text>
          </View>
        </View>
        {!!item.primary_number && (
          <TouchableOpacity style={[styles.callButton, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]} onPress={() => handleCall(item.primary_number)}>
            <Phone size={16} color="#10B981" />
            <Text style={[styles.callButtonText, { color: '#10B981' }]}>{item.primary_number}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cityChipsRow}>
        {(item.cities || []).map((city, idx) => (
          <View key={`${item.vehicle_owner_id}-${idx}`} style={[styles.cityChip, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
            <MapPin size={12} color={isDark ? '#60A5FA' : '#3B82F6'} />
            <Text style={[styles.cityChipText, { color: isDark ? '#93C5FD' : '#2563EB' }]}>{city}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  if (error && !loading) {
    return <ErrorMessage message={error} onRetry={fetchVacantCities} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: themeColors.text }]}>Vacant Cities</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{owners.length} fleets waiting for trips</Text>
          </View>
          <ThemeToggle size={20} />
        </View>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
        <Search size={18} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by name, mobile, or city..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={themeColors.textMuted}
          returnKeyType="search"
        />
      </View>

      <FlatList
        style={styles.list}
        data={filteredOwners}
        renderItem={renderItem}
        keyExtractor={(item) => item.vehicle_owner_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MapPin size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>No vacant city updates</Text>
          </View>
        }
      />

      {loading && <LoadingSpinner overlay />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    position: 'relative',
  },
  list: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    padding: 0,
  },
  listContainer: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  ownerInfo: {
    flex: 1,
    gap: 4,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatedText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  cityChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
  },
  cityChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#3B82F6',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
