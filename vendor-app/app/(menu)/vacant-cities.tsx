import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Clock, RefreshCw, Star, ChevronDown, ChevronUp, Phone, Copy, Check } from 'lucide-react-native';
import api from '../api/api';

interface VacantCityEntry {
  vehicle_owner_id: string;
  masked_phone: string;
  cities: string[];
  updated_at: string | null;
  avg_driver_rating: number | null;
}

export default function VacantCitiesScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<VacantCityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/users/vacant-cities');
      const rawData: VacantCityEntry[] = Array.isArray(res.data) ? res.data : [];
      
      // Client-side 24-hour freshness filter
      const now = new Date().getTime();
      const cutoff = 24 * 60 * 60 * 1000; // 24 hours
      const freshEntries = rawData.filter(entry => {
        if (!entry.updated_at) return false;
        const entryTime = new Date(entry.updated_at).getTime();
        return !isNaN(entryTime) && (now - entryTime) < cutoff;
      });

      setEntries(freshEntries);
    } catch (e: any) {
      setError('Could not load vacant driver updates. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCopyId = (id: string) => {
    Clipboard.setString(id);
    setCopiedId(id);
    Alert.alert('ID Copied!', `Fleet/Driver ID ${id} copied to clipboard. You can paste this ID when manually assigning a booking.`);
    setTimeout(() => setCopiedId(null), 3000);
  };

  // Group by city so the vendor can see supply at a glance, keeping each
  // city's individual owner entries around for the expanded view.
  const cityCounts: Record<string, number> = {};
  const cityOwners: Record<string, VacantCityEntry[]> = {};
  entries.forEach(entry => {
    entry.cities.forEach(city => {
      cityCounts[city] = (cityCounts[city] || 0) + 1;
      (cityOwners[city] = cityOwners[city] || []).push(entry);
    });
  });
  const sortedCities = Object.keys(cityCounts).sort((a, b) => cityCounts[b] - cityCounts[a]);

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color="#1F2937" size={24} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Vacant Drivers</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <RefreshCw color="#3B82F6" size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error && <Text style={styles.errorText}>{error}</Text>}

          {!error && sortedCities.length === 0 && (
            <View style={styles.emptyState}>
              <MapPin color="#9CA3AF" size={40} />
              <Text style={styles.emptyTitle}>No vacant drivers right now</Text>
              <Text style={styles.emptySubtitle}>
                When fleets mark themselves as waiting in a city, it will show up here (auto-cleared after 24 hrs).
              </Text>
            </View>
          )}

          {sortedCities.map(city => {
            const isExpanded = expandedCity === city;
            return (
              <View key={city} style={styles.cityCard}>
                <TouchableOpacity
                  style={styles.cityRow}
                  onPress={() => setExpandedCity(isExpanded ? null : city)}
                  activeOpacity={0.7}
                >
                  <MapPin color="#10B981" size={20} />
                  <Text style={styles.cityName}>{city}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {cityCounts[city]} {cityCounts[city] === 1 ? 'driver' : 'drivers'}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp color="#6B7280" size={18} />
                  ) : (
                    <ChevronDown color="#6B7280" size={18} />
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.ownerList}>
                    {cityOwners[city].map(owner => (
                      <View key={owner.vehicle_owner_id} style={styles.ownerCardContainer}>
                        <View style={styles.ownerRow}>
                          <View style={styles.ownerInfo}>
                            <View style={styles.ownerPhoneRow}>
                              <Phone color="#6B7280" size={13} />
                              <Text style={styles.ownerPhone}>{owner.masked_phone}</Text>
                              <View style={styles.idBadge}>
                                <Text style={styles.idBadgeText}>ID: {owner.vehicle_owner_id}</Text>
                              </View>
                            </View>
                            {owner.updated_at && (
                              <Text style={styles.ownerUpdated}>Waiting since {formatTime(owner.updated_at)}</Text>
                            )}
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <View style={styles.ratingBox}>
                              {owner.avg_driver_rating != null ? (
                                <>
                                  <Star color="#F59E0B" fill="#F59E0B" size={13} />
                                  <Text style={styles.ratingText}>{owner.avg_driver_rating.toFixed(1)}</Text>
                                </>
                              ) : (
                                <Text style={styles.noRatingText}>No ratings yet</Text>
                              )}
                            </View>

                            <TouchableOpacity
                              style={styles.copyButton}
                              onPress={() => handleCopyId(owner.vehicle_owner_id)}
                              activeOpacity={0.8}
                            >
                              {copiedId === owner.vehicle_owner_id ? (
                                <Check color="#16A34A" size={13} />
                              ) : (
                                <Copy color="#2563EB" size={13} />
                              )}
                              <Text style={[styles.copyButtonText, copiedId === owner.vehicle_owner_id && { color: '#16A34A' }]}>
                                {copiedId === owner.vehicle_owner_id ? 'Copied' : 'Copy ID'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {sortedCities.length > 0 && (
            <View style={styles.freshnessNote}>
              <Clock color="#6B7280" size={14} />
              <Text style={styles.freshnessText}>
                Contact vendors' bookings normally - driver identity is kept private until an order is placed.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  refreshButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    flexGrow: 1,
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
  },
  cityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cityName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  ownerList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerInfo: {
    flex: 1,
  },
  ownerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerPhone: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  ownerCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  ownerUpdated: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  idBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginLeft: 4,
  },
  idBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1D4ED8',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  copyButtonText: {
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#2563EB',
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  noRatingText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  freshnessNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  freshnessText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
});
