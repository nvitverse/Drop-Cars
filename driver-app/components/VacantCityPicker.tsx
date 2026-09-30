import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { X, Check, Search, MapPin, Trash2, User, Car, ChevronDown, ChevronUp, Sparkles, Plus } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/app/api/axiosInstance';
import { MASTER_CITIES } from '@/constants/cities';
import { fuzzyFilterCities } from '@/utils/fuzzyCitySearch';
import { getCitySuggestions } from '@/services/citySuggestions';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchAvailableDrivers, fetchAvailableCars, AvailableDriver, AvailableCar } from '@/services/orders/assignmentService';

interface VacantCityPickerProps {
  visible: boolean;
  onClose: () => void;
  maxCities?: number;
  variant?: 'compact' | 'full';
  onCitiesChange?: (cities: string[]) => void;
  initialCar?: AvailableCar | null;
  initialDriver?: AvailableDriver | null;
  onSavedSuccess?: () => void;
}

export default function VacantCityPicker({
  visible,
  onClose,
  maxCities = 5,
  variant = 'compact',
  onCitiesChange,
  initialCar,
  initialDriver,
  onSavedSuccess,
}: VacantCityPickerProps) {
  const { colors, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [vacantCities, setVacantCities] = useState<string[]>([]);
  const [fleetEntries, setFleetEntries] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [cars, setCars] = useState<AvailableCar[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<AvailableDriver | null>(initialDriver || null);
  const [selectedCar, setSelectedCar] = useState<AvailableCar | null>(initialCar || null);
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Dropdown expansion toggles
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [carDropdownOpen, setCarDropdownOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dynamicCities, setDynamicCities] = useState<string[]>([]);
  const [onlineSuggestions, setOnlineSuggestions] = useState<string[]>([]);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCityText, setCustomCityText] = useState('');

  const handleAddCustomCity = (nameToUse?: string) => {
    const target = (nameToUse || customCityText || search).trim();
    if (!target) return;
    if (!dynamicCities.includes(target)) {
      setDynamicCities((prev) => [...prev, target]);
    }
    toggleCity(target);
    setCustomCityText('');
    setSearch('');
    setShowCustomInput(false);
  };

  // Switch car and immediately load that vehicle's saved cities
  const handleSelectCar = (car: AvailableCar) => {
    setSelectedCar(car);
    setCarDropdownOpen(false);

    const matched = fleetEntries.find(
      (e: any) => String(e.car_id) === String(car.id) || e.car_number === car.car_number
    );
    if (matched && matched.cities) {
      setVacantCities(matched.cities);
      if (matched.driver_id) {
        const found = drivers.find((drv) => String(drv.id) === String(matched.driver_id));
        setSelectedDriver(found || null);
      } else if (matched.driver_name) {
        const found = drivers.find((drv) => drv.full_name === matched.driver_name);
        setSelectedDriver(found || null);
      } else {
        setSelectedDriver(null);
      }
    } else {
      setVacantCities([]);
    }
  };

  // Load existing vacant city info & fleet data when modal becomes visible
  useEffect(() => {
    if (visible) {
      setLoadingInitial(true);
      setDriverDropdownOpen(false);
      setCarDropdownOpen(false);
      setShowCustomInput(false);
      setSearch('');

      Promise.all([
        axiosInstance.get('/api/users/vehicle-owner/vacant-fleet').catch(() => ({ data: { fleet_entries: [] } })),
        fetchAvailableDrivers().catch(() => []),
        fetchAvailableCars().catch(() => []),
      ])
        .then(([fleetRes, driverList, carList]) => {
          const fEntries: any[] = fleetRes.data?.fleet_entries || [];
          setFleetEntries(fEntries);
          setDrivers(driverList);
          setCars(carList);

          const targetCar = initialCar || (carList.length > 0 ? carList[0] : null);
          setSelectedCar(targetCar);

          if (targetCar) {
            const matched = fEntries.find(
              (e: any) => String(e.car_id) === String(targetCar.id) || e.car_number === targetCar.car_number
            );
            if (matched && matched.cities) {
              setVacantCities(matched.cities);
              if (initialDriver) {
                setSelectedDriver(initialDriver);
              } else if (matched.driver_id) {
                const found = driverList.find((d: AvailableDriver) => String(d.id) === String(matched.driver_id));
                setSelectedDriver(found || null);
              } else if (matched.driver_name) {
                const found = driverList.find((d: AvailableDriver) => d.full_name === matched.driver_name);
                setSelectedDriver(found || null);
              } else {
                setSelectedDriver(null);
              }
            } else {
              setVacantCities([]);
              if (initialDriver) setSelectedDriver(initialDriver);
            }
          } else {
            // No fleet cars registered - check single vacant-cities endpoint
            axiosInstance
              .get('/api/users/vehicle-owner/vacant-cities')
              .then((vRes) => {
                setVacantCities(vRes.data?.vacant_cities || []);
              })
              .catch(() => {});
          }
        })
        .finally(() => setLoadingInitial(false));
    }
  }, [visible, initialCar, initialDriver]);

  useEffect(() => {
    onCitiesChange?.(vacantCities);
  }, [vacantCities]);

  useEffect(() => {
    const query = search.trim();
    setOnlineSuggestions([]);
    setSearchingOnline(false);
    if (query.length < 2) return;

    let cancelled = false;
    getCitySuggestions(query)
      .then((remote) => {
        if (cancelled || remote.length === 0) return;
        setOnlineSuggestions(remote.map((r) => r.description));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [search]);

  const toggleCity = (city: string) => {
    setVacantCities((prev) => {
      if (prev.includes(city)) {
        return prev.filter((c) => c !== city);
      }
      if (prev.length >= maxCities) {
        return prev;
      }
      return [...prev, city];
    });
  };

  const handleClearAll = () => {
    setVacantCities([]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const driverName = selectedDriver ? selectedDriver.full_name : (user?.fullName || 'Driver');
      const carNumber = selectedCar ? (selectedCar.car_number || selectedCar.car_name) : 'Vehicle';
      const carType = selectedCar ? ((selectedCar as any).car_type || (selectedCar as any).category || 'Sedan') : 'Sedan';
      const carId = selectedCar ? String(selectedCar.id) : null;

      await axiosInstance.post('/api/users/vehicle-owner/vacant-cities', {
        vacant_cities: vacantCities,
        driver_id: selectedDriver ? String(selectedDriver.id) : null,
        driver_name: driverName,
        car_id: carId,
        car_number: carNumber,
        car_type: carType,
      });
      onCitiesChange?.(vacantCities);
      onSavedSuccess?.();
      onClose();
    } catch {
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSearchOnline = async () => {
    setSearchingOnline(true);
    try {
      const suggestions = await getCitySuggestions(search.trim());
      setOnlineSuggestions(suggestions.map((s) => s.description));
    } catch {
      setOnlineSuggestions([]);
    } finally {
      setSearchingOnline(false);
    }
  };

  // When search is active, show only filtered matches
  const trimmedSearch = search.trim();
  const allAvailable = Array.from(
    new Set([...dynamicCities, ...onlineSuggestions, ...vacantCities, ...MASTER_CITIES])
  );
  const displayFilteredCities = trimmedSearch
    ? fuzzyFilterCities(allAvailable, trimmedSearch).slice(0, 10)
    : [];

  const showEmptyState = trimmedSearch.length > 0 && displayFilteredCities.length === 0 && !searchingOnline;
  const showAddOther =
    trimmedSearch.length > 0 &&
    !displayFilteredCities.some((c) => c.toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
              borderColor: isDarkMode ? '#1E293B' : '#E2E8F0',
            },
          ]}
        >
          {/* Grab Handle */}
          <View
            style={[
              styles.grabHandle,
              { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' },
            ]}
          />

          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View
                style={[
                  styles.headerIconCircle,
                  { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)' },
                ]}
              >
                <MapPin size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {t('vacantCityPicker.updateVacantCity')}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
                  Set location for idle vehicle dispatch
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {vacantCities.length > 0 && (
                <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
                  <Trash2 size={12} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontFamily: 'Inter-Bold', fontSize: 11.5 }}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.closeBtn,
                  { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 1. Select Driver Dropdown */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                Assign Driver
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setDriverDropdownOpen(!driverDropdownOpen);
                  setCarDropdownOpen(false);
                }}
                style={[
                  styles.dropdownTrigger,
                  {
                    backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC',
                    borderColor: driverDropdownOpen ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={[styles.miniIconCircle, { backgroundColor: colors.primary + '18' }]}>
                    <User size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.dropdownValueText, { color: colors.text }]} numberOfLines={1}>
                    {selectedDriver ? selectedDriver.full_name : (user?.fullName || 'Driver')}
                  </Text>
                </View>
                {driverDropdownOpen ? (
                  <ChevronUp size={18} color={colors.primary} />
                ) : (
                  <ChevronDown size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>

              {/* Driver Dropdown Menu */}
              {driverDropdownOpen && (
                <View
                  style={[
                    styles.dropdownMenu,
                    {
                      backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDriver(null);
                      setDriverDropdownOpen(false);
                    }}
                    style={[
                      styles.dropdownMenuItem,
                      !selectedDriver && { backgroundColor: colors.primary + '15' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontFamily: !selectedDriver ? 'Inter-Bold' : 'Inter-Medium', color: !selectedDriver ? colors.primary : colors.text }}>
                        {user?.fullName || 'Driver'}
                      </Text>
                      {!!user?.primaryMobile && (
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{user.primaryMobile}</Text>
                      )}
                    </View>
                    {!selectedDriver && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>

                  {drivers.map((drv) => {
                    const isSel = selectedDriver?.id === drv.id;
                    return (
                      <TouchableOpacity
                        key={String(drv.id)}
                        onPress={() => {
                          setSelectedDriver(drv);
                          setDriverDropdownOpen(false);
                        }}
                        style={[
                          styles.dropdownMenuItem,
                          isSel && { backgroundColor: colors.primary + '15' },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13.5, fontFamily: isSel ? 'Inter-Bold' : 'Inter-Medium', color: isSel ? colors.primary : colors.text }}>
                            {drv.full_name}
                          </Text>
                          {!!((drv as any).primary_number || (drv as any).phone) && (
                            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                              {(drv as any).primary_number || (drv as any).phone}
                            </Text>
                          )}
                        </View>
                        {isSel && <Check size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 2. Select Vehicle Dropdown */}
            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                Assign Vehicle
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setCarDropdownOpen(!carDropdownOpen);
                  setDriverDropdownOpen(false);
                }}
                style={[
                  styles.dropdownTrigger,
                  {
                    backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC',
                    borderColor: carDropdownOpen ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={[styles.miniIconCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Car size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.dropdownValueText, { color: colors.text }]} numberOfLines={1}>
                    {selectedCar
                      ? `${selectedCar.car_name ? `${selectedCar.car_name} - ` : ''}${selectedCar.car_number}`
                      : (cars.length > 0 ? `${cars[0].car_name ? `${cars[0].car_name} - ` : ''}${cars[0].car_number}` : 'Vehicle')}
                  </Text>
                </View>
                {carDropdownOpen ? (
                  <ChevronUp size={18} color={colors.primary} />
                ) : (
                  <ChevronDown size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>

              {/* Car Dropdown Menu */}
              {carDropdownOpen && (
                <View
                  style={[
                    styles.dropdownMenu,
                    {
                      backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {cars.length === 0 ? (
                    <View style={styles.dropdownMenuItem}>
                      <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Medium', color: colors.text }}>
                        Vehicle
                      </Text>
                      <Check size={16} color={colors.primary} />
                    </View>
                  ) : (
                    cars.map((car) => {
                      const isSel = selectedCar?.id === car.id;
                      const carVacantEntry = fleetEntries.find(
                        (e: any) => String(e.car_id) === String(car.id) || e.car_number === car.car_number
                      );
                      const hasCities = Boolean(carVacantEntry?.cities?.length);
                      return (
                        <TouchableOpacity
                          key={String(car.id)}
                          onPress={() => handleSelectCar(car)}
                          style={[
                            styles.dropdownMenuItem,
                            isSel && { backgroundColor: colors.primary + '15' },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 13.5, fontFamily: isSel ? 'Inter-Bold' : 'Inter-Medium', color: isSel ? colors.primary : colors.text }}>
                                {car.car_name ? `${car.car_name} - ` : ''}{car.car_number}
                              </Text>
                              {hasCities && (
                                <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, color: '#10B981', fontFamily: 'Inter-Bold' }}>
                                    {carVacantEntry.cities.length} {carVacantEntry.cities.length === 1 ? 'city' : 'cities'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                              {car.car_type || 'Fleet Car'}
                            </Text>
                          </View>
                          {isSel && <Check size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </View>

            {/* Subtitle & Selection Counter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', flex: 1 }}>
                Vacant Cities ({vacantCities.length}/{maxCities})
              </Text>
              <View
                style={{
                  backgroundColor: vacantCities.length >= maxCities ? 'rgba(239, 68, 68, 0.15)' : colors.primary + '18',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: 'Inter-Bold',
                    color: vacantCities.length >= maxCities ? '#EF4444' : colors.primary,
                  }}
                >
                  {vacantCities.length}/{maxCities} Selected
                </Text>
              </View>
            </View>

            {/* Selected Cities Removable Chips */}
            {vacantCities.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {vacantCities.map((city) => (
                  <TouchableOpacity
                    key={city}
                    onPress={() => toggleCity(city)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: colors.primary,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-SemiBold' }}>{city}</Text>
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={10} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Search City Input Bar */}
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
                  borderColor: colors.border,
                },
              ]}
            >
              <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search city, airport, or station (e.g. Nannilam)..."
                placeholderTextColor={colors.textSecondary}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Dedicated Custom / Other City Entry Toggle */}
            <TouchableOpacity
              onPress={() => setShowCustomInput(!showCustomInput)}
              style={[
                styles.customToggleBtn,
                {
                  backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.06)',
                  borderColor: colors.primary + '30',
                },
              ]}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Plus size={14} color={colors.primary} />
                <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.primary }}>
                  Add Custom Town or Station
                </Text>
              </View>
              {showCustomInput ? (
                <ChevronUp size={16} color={colors.primary} />
              ) : (
                <ChevronDown size={16} color={colors.primary} />
              )}
            </TouchableOpacity>

            {showCustomInput && (
              <View style={[styles.customInputContainer, { borderColor: colors.border, backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC' }]}>
                <TextInput
                  value={customCityText}
                  onChangeText={setCustomCityText}
                  placeholder="Type place name (e.g. Melur, Nannilam)..."
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.customTextInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => handleAddCustomCity()}
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Filtered Search Results Dropdown List (Shown ONLY while typing) */}
            {trimmedSearch.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                {displayFilteredCities.map((city) => {
                  const isSelected = vacantCities.includes(city);
                  return (
                    <TouchableOpacity
                      key={city}
                      onPress={() => toggleCity(city)}
                      style={[
                        styles.cityResultItem,
                        {
                          borderBottomColor: isDarkMode ? '#1E293B' : '#F1F5F9',
                          backgroundColor: isSelected ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)') : 'transparent',
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <MapPin size={14} color={isSelected ? colors.primary : colors.textSecondary} />
                        <Text
                          style={{
                            fontSize: 13.5,
                            fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Medium',
                            color: isSelected ? colors.primary : colors.text,
                          }}
                        >
                          {city}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkboxCircle,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {showEmptyState && (
                  <View style={{ paddingVertical: 14, alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      No exact cached match for "{trimmedSearch}"
                    </Text>
                    <TouchableOpacity
                      onPress={handleSearchOnline}
                      disabled={searchingOnline}
                      style={[styles.searchOnlineBtn, { backgroundColor: colors.primary + '15' }]}
                    >
                      {searchingOnline ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Search size={14} color={colors.primary} />
                      )}
                      <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter-SemiBold' }}>
                        {searchingOnline ? 'Searching online...' : 'Lookup Online & Add to Cache'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {showAddOther && (
                  <TouchableOpacity
                    onPress={() => handleAddCustomCity(trimmedSearch)}
                    style={styles.addOtherRow}
                  >
                    <Plus size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13.5, fontFamily: 'Inter-SemiBold' }}>
                      Add "{trimmedSearch}" as Vacant City
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>

          {/* Sticky Footer Action Buttons */}
          <View
            style={[
              styles.footerRow,
              { borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          >
            <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>
                {t('vacantCityPicker.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>
                {saving ? 'Saving...' : 'Save Vacant Status'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    maxHeight: '88%',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  grabHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  miniIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownValueText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
  },
  dropdownMenu: {
    marginTop: 6,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
  },
  customToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  customTextInput: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontSize: 13,
    borderWidth: 1,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  hubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  cityResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderBottomWidth: 1,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addOtherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1.5,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
