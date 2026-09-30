import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  MapPin,
  Car,
  User,
  Clock,
  Sparkles,
  AlertTriangle,
  Check,
  ChevronDown,
  Calendar as CalendarIcon,
  ShieldCheck,
  ArrowRight,
  Zap,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { MASTER_CITIES } from '@/constants/cities';
import { fuzzyFilterCities } from '@/utils/fuzzyCitySearch';
import { CustomDatePickerModal, CustomTimePickerModal } from '@/components/DateTimePickerModals';
import axiosInstance from '@/app/api/axiosInstance';
import { fetchAvailableDrivers } from '@/services/orders/assignmentService';

export interface RouteRequestData {
  driverId: string | number;
  driverName: string;
  carId: string | number;
  carNumber: string;
  carType: string;
  fromCity: string;
  toCity: string;
  targetDate: string;
  timeWindow: string;
  tillDate?: string;
  tillTime?: string;
  active: boolean;
}

interface RouteRequestModalProps {
  visible: boolean;
  onClose: () => void;
  isTrustedPartner: boolean;
  onUpgradePress: () => void;
  availableDrivers: Array<{ id: string | number; full_name?: string; name?: string; primary_number?: string }>;
  availableCars: Array<{ id: string | number; car_name?: string; model?: string; car_number?: string; car_type?: string }>;
  activeRequest: RouteRequestData | null;
  onSaveRequest: (request: RouteRequestData) => void;
  onClearRequest: () => void;
  onSimulateMatchingRide: () => void;
}

const POPULAR_MAJOR_CITIES = [
  'Chennai',
  'Bengaluru',
  'Bangalore',
  'Coimbatore',
  'Madurai',
  'Trichy',
  'Tiruchirappalli',
  'Salem',
  'Pondicherry',
  'Puducherry',
  'Vellore',
  'Tiruppur',
  'Erode',
  'Tirunelveli',
  'Kanyakumari',
  'Nagercoil',
  'Dindigul',
  'Hosur',
  'Thanjavur',
  'Tanjore',
  'Cuddalore',
  'Villupuram',
  'Karur',
  'Ramanathapuram',
  'Hyderabad',
  'Batlagundu',
  'Bhavani',
  'Bhuvanagiri',
];

export default function RouteRequestModal({
  visible,
  onClose,
  isTrustedPartner,
  onUpgradePress,
  availableDrivers = [],
  availableCars = [],
  activeRequest,
  onSaveRequest,
  onClearRequest,
  onSimulateMatchingRide,
}: RouteRequestModalProps) {
  const { colors, isDarkMode } = useTheme();

  // Form states
  const [selectedDriver, setSelectedDriver] = useState<{ id: string | number; name: string } | null>(
    activeRequest ? { id: activeRequest.driverId, name: activeRequest.driverName } : null
  );
  const [selectedCar, setSelectedCar] = useState<{ id: string | number; number: string; type: string } | null>(
    activeRequest ? { id: activeRequest.carId, number: activeRequest.carNumber, type: activeRequest.carType } : null
  );
  const [fromCity, setFromCity] = useState(activeRequest?.fromCity || '');
  const [toCity, setToCity] = useState(activeRequest?.toCity || '');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [showCarDropdown, setShowCarDropdown] = useState(false);

  // Fleet self-loading for drivers and cars
  const [internalDrivers, setInternalDrivers] = useState<Array<{ id: string | number; full_name?: string; name?: string; primary_number?: string }>>([]);
  const [internalCars, setInternalCars] = useState<Array<{ id: string | number; car_name?: string; model?: string; car_number?: string; car_type?: string }>>([]);
  const [fleetLoading, setFleetLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const loadFleetIfNeeded = async () => {
      if ((!availableDrivers || availableDrivers.length === 0) || (!availableCars || availableCars.length === 0)) {
        try {
          setFleetLoading(true);
          const [dRes, cRes] = await Promise.all([
            fetchAvailableDrivers().catch(() => []),
            axiosInstance.get('/api/assignments/available-cars', { noCache: true } as any).catch(() => ({ data: [] })),
          ]);
          if (Array.isArray(dRes) && dRes.length > 0) {
            setInternalDrivers(dRes);
          }
          if (cRes?.data && Array.isArray(cRes.data) && cRes.data.length > 0) {
            setInternalCars(cRes.data);
          }
        } catch (e) {
          console.warn('Failed to load fleet in RouteRequestModal', e);
        } finally {
          setFleetLoading(false);
        }
      }
    };

    loadFleetIfNeeded();
  }, [visible, availableDrivers.length, availableCars.length]);

  const effectiveDrivers = availableDrivers.length > 0 ? availableDrivers : internalDrivers;
  const effectiveCars = availableCars.length > 0 ? availableCars : internalCars;

  // Auto-select first available driver/car if none selected
  useEffect(() => {
    if (!selectedDriver && effectiveDrivers.length > 0) {
      const first = effectiveDrivers[0];
      setSelectedDriver({ id: first.id, name: first.full_name || (first as any).name || 'Driver' });
    }
  }, [effectiveDrivers, selectedDriver]);

  useEffect(() => {
    if (!selectedCar && effectiveCars.length > 0) {
      const first = effectiveCars[0];
      setSelectedCar({
        id: first.id,
        number: first.car_number || 'TN-XX-XXXX',
        type: first.car_type || first.car_name || 'Sedan',
      });
    }
  }, [effectiveCars, selectedCar]);

  // DATE & TIME RANGE STATES (From Date & Time -> Till Date & Time)
  const [rangePreset, setRangePreset] = useState<'TODAY' | 'NEXT_24H' | 'NEXT_3D' | 'NEXT_7D' | 'CUSTOM'>('NEXT_24H');
  
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [fromTime, setFromTime] = useState<Date>(new Date());

  const defaultTillDate = new Date();
  defaultTillDate.setDate(defaultTillDate.getDate() + 1);
  const [tillDate, setTillDate] = useState<Date>(defaultTillDate);
  const [tillTime, setTillTime] = useState<Date>(defaultTillDate);

  const [datePickerTarget, setDatePickerTarget] = useState<'FROM_DATE' | 'TILL_DATE' | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<'FROM_TIME' | 'TILL_TIME' | null>(null);

  // Apply Quick Range Presets
  const applyRangePreset = (preset: 'TODAY' | 'NEXT_24H' | 'NEXT_3D' | 'NEXT_7D' | 'CUSTOM') => {
    setRangePreset(preset);
    const now = new Date();
    setFromDate(now);
    setFromTime(now);

    if (preset === 'TODAY') {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      setTillDate(endOfDay);
      setTillTime(endOfDay);
    } else if (preset === 'NEXT_24H') {
      const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      setTillDate(nextDay);
      setTillTime(nextDay);
    } else if (preset === 'NEXT_3D') {
      const next3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      setTillDate(next3Days);
      setTillTime(next3Days);
    } else if (preset === 'NEXT_7D') {
      const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setTillDate(next7Days);
      setTillTime(next7Days);
    }
  };

  const handleActivate = () => {
    if (!fromCity.trim()) {
      Alert.alert('Missing Route', 'Please select a Pickup (From City).');
      return;
    }
    if (!toCity.trim()) {
      Alert.alert('Missing Route', 'Please select a Drop (To City).');
      return;
    }
    if (!selectedDriver) {
      Alert.alert('Missing Driver', 'Please assign a driver for this request.');
      return;
    }
    if (!selectedCar) {
      Alert.alert('Missing Vehicle', 'Please select a vehicle for this request.');
      return;
    }

    const fromDateStr = fromDate.toISOString().split('T')[0];
    const fromTimeStr = fromTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const tillDateStr = tillDate.toISOString().split('T')[0];
    const tillTimeStr = tillTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const timeWindowStr = `From ${fromDateStr} (${fromTimeStr}) Till ${tillDateStr} (${tillTimeStr})`;

    const newRequest: RouteRequestData = {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name,
      carId: selectedCar.id,
      carNumber: selectedCar.number,
      carType: selectedCar.type,
      fromCity: fromCity.trim(),
      toCity: toCity.trim(),
      targetDate: fromDateStr,
      timeWindow: timeWindowStr,
      tillDate: tillDateStr,
      tillTime: tillTimeStr,
      active: true,
    };

    onSaveRequest(newRequest);
    Alert.alert(
      '🎉 Booking Request Activated',
      `Drop Cars is now monitoring trips from ${fromCity} to ${toCity} starting ${fromDateStr} till ${tillDateStr}.\n\nWhen a matching trip is posted, a 10-second HUD Alert will notify you to accept or decline.`,
      [{ text: 'OK', onPress: onClose }]
    );
  };

  const renderCityDropdownList = (
    currentQuery: string,
    onSelectCity: (city: string) => void
  ) => {
    const trimmed = currentQuery.trim();
    const filteredMaster = fuzzyFilterCities(MASTER_CITIES, trimmed);

    let displayPopular = POPULAR_MAJOR_CITIES.filter((c) =>
      c.toLowerCase().includes(trimmed.toLowerCase())
    );

    const hasExactMatch = MASTER_CITIES.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );

    return (
      <View style={[styles.dropdownBox, { borderColor: colors.border, backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
          {/* Popular Major Cities Section */}
          {!trimmed && (
            <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: colors.primary, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              🔥 POPULAR MAJOR CITIES
            </Text>
          )}

          {!trimmed &&
            POPULAR_MAJOR_CITIES.map((city) => (
              <TouchableOpacity
                key={`pop-${city}`}
                style={styles.dropdownItem}
                onPress={() => onSelectCity(city)}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} color={colors.primary} />
                  <Text style={{ flexShrink: 1, color: colors.text, fontSize: 13, fontFamily: 'Inter-SemiBold' }}>{city}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>Major City</Text>
              </TouchableOpacity>
            ))}

          {/* Search Results */}
          {trimmed ? (
            <>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: colors.textSecondary, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
                SEARCH RESULTS ({filteredMaster.length})
              </Text>
              {filteredMaster.slice(0, 30).map((city: string) => (
                <TouchableOpacity
                  key={`filtered-${city}`}
                  style={styles.dropdownItem}
                  onPress={() => onSelectCity(city)}
                >
                  <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>{city}</Text>
                </TouchableOpacity>
              ))}

              {!hasExactMatch && trimmed.length >= 2 && (
                <TouchableOpacity
                  style={[styles.dropdownItem, { backgroundColor: colors.primary + '10' }]}
                  onPress={() => onSelectCity(trimmed)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MapPin size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter-Bold' }}>
                      Add custom location: "{trimmed}"
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: colors.textSecondary, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                ALL CITIES & TOWNS ({MASTER_CITIES.length})
              </Text>
              {MASTER_CITIES.slice(0, 40).map((city: string) => (
                <TouchableOpacity
                  key={`all-${city}`}
                  style={styles.dropdownItem}
                  onPress={() => onSelectCity(city)}
                >
                  <Text style={{ color: colors.text, fontSize: 12.5, fontFamily: 'Inter-Regular' }}>{city}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
          {/* Header Grab Bar */}
          <View
            style={[
              styles.grabHandle,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
            ]}
          />

          {/* Title Header */}
          <View style={[styles.headerRow, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.iconPill, { backgroundColor: '#6366F115' }]}>
                <Sparkles size={18} color="#6366F1" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Request Booking</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Exclusive for Trusted Partners • Auto-matches incoming trips
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Gating: If NOT Trusted Partner */}
          {!isTrustedPartner ? (
            <View style={styles.unauthorizedContainer}>
              <View style={styles.crownCircle}>
                <ShieldCheck size={36} color="#6366F1" />
              </View>
              <Text style={[styles.lockTitle, { color: colors.text }]}>
                Trusted Partner Feature Only
              </Text>
              <Text style={[styles.lockDesc, { color: colors.textSecondary }]}>
                Pre-book and guarantee priority dispatch for your available fleet! When a passenger books a trip on your requested route, our system auto-matches it with a 10-second alert window.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onUpgradePress();
                }}
                style={styles.upgradeButton}
                activeOpacity={0.85}
              >
                <Sparkles size={16} color="#FFFFFF" />
                <Text style={styles.upgradeButtonText}>Upgrade to Trusted Partner</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Authorized: Form Body */
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Active Route Request Alert if already active */}
              {activeRequest && activeRequest.active && (
                <View style={styles.activeBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={styles.liveBeacon} />
                    <Text style={styles.activeBannerTitle}>Active Route Monitoring</Text>
                  </View>
                  <Text style={styles.activeBannerText}>
                    {activeRequest.fromCity} ➔ {activeRequest.toCity} ({activeRequest.carType})
                  </Text>
                  <Text style={styles.activeBannerSub}>
                    Driver: {activeRequest.driverName} • Vehicle: {activeRequest.carNumber}
                  </Text>
                  {activeRequest.timeWindow ? (
                    <Text style={{ fontSize: 11, color: '#047857', marginTop: 2, fontFamily: 'Inter-Medium' }}>
                      📅 {activeRequest.timeWindow}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={onClearRequest}
                      style={styles.cancelRequestBtn}
                    >
                      <Text style={styles.cancelRequestText}>Cancel Request</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onSimulateMatchingRide}
                      style={styles.testAlertBtn}
                    >
                      <Zap size={13} color="#FFFFFF" />
                      <Text style={styles.testAlertText}>Test 10s Alert HUD</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Section 1: Route Setup (From / To) */}
              <View style={[styles.sectionBox, { borderColor: colors.border, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC' }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Preferred Route Setup</Text>

                {/* Pickup City */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Pickup (From City)</Text>
                  <View style={[styles.inputBox, { borderColor: fromCity ? '#10B981' : colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}>
                    <MapPin size={16} color="#10B981" style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="Search or enter pickup city..."
                      placeholderTextColor={colors.textSecondary}
                      value={fromCity}
                      onChangeText={(t) => {
                        setFromCity(t);
                        setShowFromDropdown(true);
                      }}
                      onFocus={() => setShowFromDropdown(true)}
                    />
                    {fromCity.length > 0 && (
                      <TouchableOpacity onPress={() => setFromCity('')} style={{ marginRight: 4 }}>
                        <X size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowFromDropdown(!showFromDropdown)}>
                      <ChevronDown size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {showFromDropdown && renderCityDropdownList(fromCity, (selected) => {
                    setFromCity(selected);
                    setShowFromDropdown(false);
                  })}
                </View>

                {/* Drop City */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Drop (To City)</Text>
                  <View style={[styles.inputBox, { borderColor: toCity ? '#EF4444' : colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}>
                    <MapPin size={16} color="#EF4444" style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="Search or enter destination city..."
                      placeholderTextColor={colors.textSecondary}
                      value={toCity}
                      onChangeText={(t) => {
                        setToCity(t);
                        setShowToDropdown(true);
                      }}
                      onFocus={() => setShowToDropdown(true)}
                    />
                    {toCity.length > 0 && (
                      <TouchableOpacity onPress={() => setToCity('')} style={{ marginRight: 4 }}>
                        <X size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowToDropdown(!showToDropdown)}>
                      <ChevronDown size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {showToDropdown && renderCityDropdownList(toCity, (selected) => {
                    setToCity(selected);
                    setShowToDropdown(false);
                  })}
                </View>
              </View>

              {/* Section 2: Driver & Vehicle Selection */}
              <View style={[styles.sectionBox, { borderColor: colors.border, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC' }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Assign Driver & Vehicle</Text>

                {/* Driver */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Select Driver</Text>
                  <TouchableOpacity
                    onPress={() => setShowDriverDropdown(!showDriverDropdown)}
                    style={[styles.selectTrigger, { borderColor: selectedDriver ? colors.primary : colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}
                  >
                    <User size={16} color={colors.primary} />
                    <Text style={[styles.selectTriggerText, { color: selectedDriver ? colors.text : colors.textSecondary }]}>
                      {selectedDriver ? selectedDriver.name : 'Select from available drivers...'}
                    </Text>
                    <ChevronDown size={16} color={colors.textSecondary} />
                  </TouchableOpacity>

                  {showDriverDropdown && (
                    <View style={[styles.dropdownBox, { borderColor: colors.border, backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 140 }}>
                        {fleetLoading ? (
                          <View style={{ padding: 12, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={colors.primary} />
                          </View>
                        ) : effectiveDrivers.length > 0 ? (
                          effectiveDrivers.map((d) => (
                            <TouchableOpacity
                              key={`drv-${d.id}`}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setSelectedDriver({ id: d.id, name: d.full_name || (d as any).name || 'Driver' });
                                setShowDriverDropdown(false);
                              }}
                            >
                              <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
                                {d.full_name || (d as any).name}
                              </Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          <Text style={{ padding: 10, color: colors.textSecondary, fontSize: 12 }}>
                            No drivers registered. Add a driver first in Drivers tab.
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Vehicle */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Select Vehicle</Text>
                  <TouchableOpacity
                    onPress={() => setShowCarDropdown(!showCarDropdown)}
                    style={[styles.selectTrigger, { borderColor: selectedCar ? colors.primary : colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}
                  >
                    <Car size={16} color={colors.primary} />
                    <Text style={[styles.selectTriggerText, { color: selectedCar ? colors.text : colors.textSecondary }]}>
                      {selectedCar ? `${selectedCar.number} (${selectedCar.type})` : 'Select from your cars...'}
                    </Text>
                    <ChevronDown size={16} color={colors.textSecondary} />
                  </TouchableOpacity>

                  {showCarDropdown && (
                    <View style={[styles.dropdownBox, { borderColor: colors.border, backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 140 }}>
                        {fleetLoading ? (
                          <View style={{ padding: 12, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={colors.primary} />
                          </View>
                        ) : effectiveCars.length > 0 ? (
                          effectiveCars.map((c) => (
                            <TouchableOpacity
                              key={`car-${c.id}`}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setSelectedCar({
                                  id: c.id,
                                  number: c.car_number || 'TN-XX-XXXX',
                                  type: c.car_type || c.car_name || 'Sedan',
                                });
                                setShowCarDropdown(false);
                              }}
                            >
                              <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>
                                {c.car_name || c.model} • {c.car_number} ({c.car_type || 'Car'})
                              </Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          <Text style={{ padding: 10, color: colors.textSecondary, fontSize: 12 }}>
                            No cars available. Add vehicles in My Cars.
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              {/* Section 3: Availability Period (From Date/Time ➔ Till Date/Time) */}
              <View style={[styles.sectionBox, { borderColor: colors.border, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                    3. Availability Period (From ➔ Till)
                  </Text>
                  <View style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: '#6366F1' }}>Range Active</Text>
                  </View>
                </View>

                {/* Side-by-Side Range Selector (From ➔ Till) */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {/* FROM Column */}
                  <View style={{ flex: 1, backgroundColor: colors.surface, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#10B981' }}>🟢 FROM (START)</Text>

                    <TouchableOpacity
                      style={styles.rangeTileBtn}
                      onPress={() => setDatePickerTarget('FROM_DATE')}
                    >
                      <CalendarIcon size={13} color="#10B981" />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.text }}>
                        {fromDate.toISOString().slice(0, 10)}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rangeTileBtn}
                      onPress={() => setTimePickerTarget('FROM_TIME')}
                    >
                      <Clock size={13} color="#10B981" />
                      <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                        {fromTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <ArrowRight size={16} color={colors.textSecondary} />
                  </View>

                  {/* TILL Column */}
                  <View style={{ flex: 1, backgroundColor: colors.surface, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#EF4444' }}>🔴 TILL (END)</Text>

                    <TouchableOpacity
                      style={styles.rangeTileBtn}
                      onPress={() => setDatePickerTarget('TILL_DATE')}
                    >
                      <CalendarIcon size={13} color="#EF4444" />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.text }}>
                        {tillDate.toISOString().slice(0, 10)}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rangeTileBtn}
                      onPress={() => setTimePickerTarget('TILL_TIME')}
                    >
                      <Clock size={13} color="#EF4444" />
                      <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                        {tillTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Quick Range Duration Chips */}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Quick Duration Presets</Text>
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                  {[
                    { key: 'TODAY', label: 'Today Only' },
                    { key: 'NEXT_24H', label: 'Next 24 Hrs' },
                    { key: 'NEXT_3D', label: 'Next 3 Days' },
                    { key: 'NEXT_7D', label: 'Next 7 Days' },
                  ].map((p) => {
                    const isSel = rangePreset === p.key;
                    return (
                      <TouchableOpacity
                        key={p.key}
                        onPress={() => applyRangePreset(p.key as any)}
                        style={[
                          styles.miniChip,
                          {
                            borderColor: isSel ? '#6366F1' : colors.border,
                            backgroundColor: isSel ? '#6366F1' : (isDarkMode ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                            paddingHorizontal: 9,
                            paddingVertical: 5,
                          },
                        ]}
                      >
                        <Text style={[styles.miniChipText, { color: isSel ? '#FFFFFF' : colors.textSecondary }]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* High-Priority Terms & ₹500 Penalty Warning Notice */}
              <View style={styles.penaltyNoticeCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AlertTriangle size={18} color="#D97706" />
                  <Text style={styles.penaltyTitle}>Auto-Assignment Rules & ₹500 Penalty</Text>
                </View>
                <Text style={styles.penaltyText}>
                  • When a matching ride is found, a <Text style={{ fontWeight: '700', color: '#B45309' }}>10-Second HUD Alert</Text> will notify you.
                </Text>
                <Text style={styles.penaltyText}>
                  • You can <Text style={{ fontWeight: '700', color: '#10B981' }}>Decline within 10 seconds</Text> with <Text style={{ fontWeight: '700' }}>zero penalty</Text>.
                </Text>
                <Text style={styles.penaltyText}>
                  • If not declined within 10 seconds, the ride will be <Text style={{ fontWeight: '700', color: '#6366F1' }}>automatically assigned</Text> to your selected driver and car.
                </Text>
                <Text style={[styles.penaltyText, { color: '#DC2626', fontWeight: '700', marginTop: 4 }]}>
                  • ⚠️ Any cancellation AFTER auto-assignment will incur a ₹500 penalty deducted from your wallet balance.
                </Text>
              </View>

              {/* Actions Footer */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 24 }}>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>
                    Close
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleActivate}
                  style={styles.activateButton}
                  activeOpacity={0.85}
                >
                  <Sparkles size={16} color="#FFFFFF" />
                  <Text style={styles.activateButtonText}>
                    {activeRequest?.active ? 'Update Request' : 'Activate Booking Request'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Date Picker Modal for From / Till */}
      {!!datePickerTarget && (
        <CustomDatePickerModal
          visible={!!datePickerTarget}
          title={datePickerTarget === 'FROM_DATE' ? 'Select From Date' : 'Select Till Date'}
          initialDate={datePickerTarget === 'FROM_DATE' ? fromDate : tillDate}
          minimumDate={new Date()}
          onConfirm={(d) => {
            if (datePickerTarget === 'FROM_DATE') {
              setFromDate(d);
              if (d > tillDate) setTillDate(d);
            } else {
              setTillDate(d);
            }
            setRangePreset('CUSTOM');
            setDatePickerTarget(null);
          }}
          onClose={() => setDatePickerTarget(null)}
        />
      )}

      {/* Time Picker Modal for From / Till */}
      {!!timePickerTarget && (
        <CustomTimePickerModal
          visible={!!timePickerTarget}
          title={timePickerTarget === 'FROM_TIME' ? 'Select From Time' : 'Select Till Time'}
          initialDate={timePickerTarget === 'FROM_TIME' ? fromTime : tillTime}
          onConfirm={(t) => {
            if (timePickerTarget === 'FROM_TIME') {
              setFromTime(t);
            } else {
              setTillTime(t);
            }
            setRangePreset('CUSTOM');
            setTimePickerTarget(null);
          }}
          onClose={() => setTimePickerTarget(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    maxHeight: '94%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  grabHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 2.25,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  iconPill: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unauthorizedContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  crownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6366F115',
    borderWidth: 1.5,
    borderColor: '#6366F135',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  lockDesc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  upgradeButton: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 15,
  },
  activeBanner: {
    backgroundColor: '#10B98112',
    borderWidth: 1,
    borderColor: '#10B98135',
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  liveBeacon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeBannerTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#059669',
  },
  activeBannerText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    color: '#065F46',
  },
  activeBannerSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  cancelRequestBtn: {
    backgroundColor: '#EF444415',
    borderWidth: 1,
    borderColor: '#EF444435',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  cancelRequestText: {
    color: '#DC2626',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  testAlertBtn: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  testAlertText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  sectionBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    padding: 0,
  },
  dropdownBox: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginHorizontal: 8,
  },
  rangeTileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  miniChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  miniChipText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  penaltyNoticeCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  penaltyTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    color: '#B45309',
  },
  penaltyText: {
    fontSize: 11.5,
    color: '#92400E',
    fontFamily: 'Inter-Medium',
    lineHeight: 17,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButton: {
    flex: 2,
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14.5,
  },
});
