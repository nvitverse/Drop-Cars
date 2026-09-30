import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useCallback } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Car,
  User,
  Clock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Shield,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/app/api/axiosInstance';
import VacantCityPicker from '@/components/VacantCityPicker';
import { fetchAvailableCars, fetchAvailableDrivers, AvailableCar, AvailableDriver } from '@/services/orders/assignmentService';

interface VacantFleetEntry {
  car_id?: string;
  car_number?: string;
  car_type?: string;
  driver_id?: string;
  driver_name?: string;
  cities: string[];
  updated_at?: string;
  hours_since_update?: number;
  needs_confirmation?: boolean;
}

export default function VacantsScreen() {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fleetEntries, setFleetEntries] = useState<VacantFleetEntry[]>([]);
  const [cars, setCars] = useState<AvailableCar[]>([]);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);

  // Modal controls
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editingCar, setEditingCar] = useState<AvailableCar | null>(null);
  const [editingDriver, setEditingDriver] = useState<AvailableDriver | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [fleetRes, carList, driverList] = await Promise.all([
        axiosInstance.get('/api/users/vehicle-owner/vacant-fleet').catch(() => ({ data: { fleet_entries: [] } })),
        fetchAvailableCars().catch(() => []),
        fetchAvailableDrivers().catch(() => []),
      ]);

      const entries = fleetRes.data?.fleet_entries || [];
      setFleetEntries(entries);
      setCars(carList);
      setDrivers(driverList);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenAdd = () => {
    setEditingCar(null);
    setEditingDriver(null);
    setPickerVisible(true);
  };

  const handleEditVehicleVacant = (car: AvailableCar) => {
    const existingEntry = fleetEntries.find(
      (e) => String(e.car_id) === String(car.id) || e.car_number === car.car_number
    );
    let matchedDriver: AvailableDriver | null = null;
    if (existingEntry?.driver_id) {
      matchedDriver = drivers.find((d) => String(d.id) === String(existingEntry.driver_id)) || null;
    }

    setEditingCar(car);
    setEditingDriver(matchedDriver);
    setPickerVisible(true);
  };

  const handleClearCarVacant = async (carId: string, carNumber: string) => {
    Alert.alert(
      'Remove Vacant Status',
      `Are you sure you want to remove vacant status for ${carNumber}? Vendors will no longer see this car waiting.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await axiosInstance.delete(`/api/users/vehicle-owner/vacant-fleet/${carId}`);
              loadData();
            } catch {
              Alert.alert('Error', 'Failed to remove vacant status. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleRenew24h = async (entry: VacantFleetEntry) => {
    try {
      await axiosInstance.post('/api/users/vehicle-owner/vacant-cities', {
        vacant_cities: entry.cities,
        driver_id: entry.driver_id,
        driver_name: entry.driver_name,
        car_id: entry.car_id,
        car_number: entry.car_number,
        car_type: entry.car_type,
      });
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to renew vacant status.');
    }
  };

  const activeVacantCount = fleetEntries.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#090D16' : '#F8FAFC' }]}>
      {/* Top App Bar */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderBottomColor: colors.border }]}>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => safeBack(router)}
            style={[styles.backBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Fleet Vacant Cities</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
              Manage idle vehicle locations
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleOpenAdd}
          style={[styles.headerActionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12.5 }}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Banner */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.06)',
              borderColor: colors.primary + '30',
            },
          ]}
        >
          <View style={[styles.infoIconCircle, { backgroundColor: colors.primary + '20' }]}>
            <MapPin size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.primary }]}>
              {activeVacantCount > 0
                ? `${activeVacantCount} of ${cars.length || 1} Vehicle(s) Waiting for Trips`
                : 'No Vehicles Currently Marked Vacant'}
            </Text>
            <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>
              Mark idle cars in waiting cities. Other vendors see your available fleet to send direct targeted trip requests ($0 cost).
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' }}>
              Loading fleet vacant statuses...
            </Text>
          </View>
        ) : cars.length === 0 ? (
          /* Empty State: No cars attached */
          <View style={[styles.emptyCard, { backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderColor: colors.border }]}>
            <Car size={36} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Fleet Cars Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              You can set vacant waiting cities for your vehicle.
            </Text>
            <TouchableOpacity
              onPress={handleOpenAdd}
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>Set Vacant Cities</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Cars List */
          <View style={{ gap: 12 }}>
            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
              YOUR REGISTERED FLEET ({cars.length})
            </Text>

            {cars.map((car) => {
              const matchedEntry = fleetEntries.find(
                (e) => String(e.car_id) === String(car.id) || e.car_number === car.car_number
              );
              const isVacant = Boolean(matchedEntry && matchedEntry.cities && matchedEntry.cities.length > 0);
              const hoursSince = matchedEntry?.hours_since_update ?? 0;
              const isStale = hoursSince >= 12;

              return (
                <View
                  key={String(car.id)}
                  style={[
                    styles.carCard,
                    {
                      backgroundColor: isDarkMode ? '#111827' : '#FFFFFF',
                      borderColor: isVacant ? colors.primary + '50' : colors.border,
                    },
                  ]}
                >
                  {/* Card Header: Car Number & Vacant Status Pill */}
                  <View style={styles.carCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={[
                          styles.carIconBox,
                          {
                            backgroundColor: isVacant
                              ? (isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)')
                              : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.04)'),
                          },
                        ]}
                      >
                        <Car size={18} color={isVacant ? colors.primary : colors.textSecondary} />
                      </View>
                      <View>
                        <Text style={[styles.carNumberText, { color: colors.text }]}>
                          {car.car_name ? `${car.car_name} - ` : ''}{car.car_number}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
                          {car.car_type || 'Sedan'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: isVacant
                            ? (isStale ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)')
                            : (isDarkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: isVacant ? (isStale ? '#F59E0B' : '#10B981') : '#94A3B8' },
                        ]}
                      />
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontFamily: 'Inter-Bold',
                          color: isVacant ? (isStale ? '#D97706' : '#10B981') : colors.textSecondary,
                        }}
                      >
                        {isVacant ? (isStale ? 'Waiting > 12h' : 'Active Vacant') : 'Not Set'}
                      </Text>
                    </View>
                  </View>

                  {/* Body: Driver & Cities */}
                  {isVacant && matchedEntry ? (
                    <View style={styles.carCardBody}>
                      {/* Driver Assigned */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <User size={13} color={colors.primary} />
                        <Text style={{ flexShrink: 1, fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                          Driver: {matchedEntry.driver_name && matchedEntry.driver_name !== 'Owner / Self' ? matchedEntry.driver_name : (user?.fullName || 'Driver')}
                        </Text>
                      </View>

                      {/* Cities Chips */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {matchedEntry.cities.map((city) => (
                          <View
                            key={city}
                            style={[
                              styles.cityTag,
                              { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.08)' },
                            ]}
                          >
                            <MapPin size={11} color={colors.primary} />
                            <Text style={[styles.cityTagText, { color: colors.primary }]}>{city}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Time ago */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                        <Clock size={12} color={colors.textSecondary} />
                        <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>
                          Updated {hoursSince < 1 ? 'Just now' : `${Math.floor(hoursSince)}h ago`} · Auto-expires in{' '}
                          {Math.max(0, Math.floor(24 - hoursSince))}h
                        </Text>
                      </View>

                      {/* Actions row */}
                      <View style={styles.carActionsRow}>
                        {isStale && (
                          <TouchableOpacity
                            onPress={() => handleRenew24h(matchedEntry)}
                            style={[styles.renewBtn, { backgroundColor: '#F59E0B' }]}
                            activeOpacity={0.8}
                          >
                            <RefreshCw size={13} color="#FFFFFF" />
                            <Text style={styles.btnLabelWhite}>Still Waiting</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          onPress={() => handleEditVehicleVacant(car)}
                          style={[styles.editBtn, { borderColor: colors.primary }]}
                          activeOpacity={0.8}
                        >
                          <Edit3 size={13} color={colors.primary} />
                          <Text style={[styles.btnLabel, { color: colors.primary }]}>Change Cities</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleClearCarVacant(String(car.id), car.car_number || car.car_name)}
                          style={styles.clearIconBtn}
                          activeOpacity={0.8}
                        >
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* Not Vacant Prompt */
                    <View style={styles.carCardEmptyBody}>
                      <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontFamily: 'Inter-Regular', marginBottom: 10 }}>
                        This vehicle has no vacant cities set. Tap below to select where it's waiting for a trip.
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleEditVehicleVacant(car)}
                        style={[styles.setVacantBtn, { backgroundColor: colors.primary }]}
                        activeOpacity={0.85}
                      >
                        <Plus size={14} color="#FFFFFF" />
                        <Text style={styles.btnLabelWhite}>Set Vacant Cities</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Shared Compact Vacant Picker Modal */}
      <VacantCityPicker
        visible={pickerVisible}
        onClose={() => {
          setPickerVisible(false);
          setEditingCar(null);
          setEditingDriver(null);
        }}
        initialCar={editingCar}
        initialDriver={editingDriver}
        onSavedSuccess={loadData}
      />
      <RefreshFab onRefresh={handleRefresh} />
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
    fontFamily: 'Inter-Bold',
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  infoSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter-Regular',
  },
  sectionHeading: {
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
    marginVertical: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 6,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 13.5,
  },
  carCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  carCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  carIconBox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carNumberText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  carCardBody: {
    padding: 14,
    paddingTop: 10,
  },
  carCardEmptyBody: {
    padding: 14,
  },
  cityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cityTagText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  carActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  renewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  clearIconBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  setVacantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 6,
  },
  btnLabel: {
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
  },
  btnLabelWhite: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
  },
});
