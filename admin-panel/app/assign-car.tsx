import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, User, Car, ChevronDown } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, Btn } from '@/components/ui';

interface FoundOwner {
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  account_status: string;
}

const CAR_TYPES = [
  'HATCHBACK',
  'SEDAN_4_PLUS_1',
  'NEW_SEDAN_2022_MODEL',
  'ETIOS_4_PLUS_1',
  'SUV',
  'SUV_6_PLUS_1',
  'SUV_7_PLUS_1',
  'INNOVA',
  'INNOVA_6_PLUS_1',
  'INNOVA_7_PLUS_1',
  'INNOVA_CRYSTA',
  'INNOVA_CRYSTA_6_PLUS_1',
  'INNOVA_CRYSTA_7_PLUS_1',
];

export default function AssignCarScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [owner, setOwner] = useState<FoundOwner | null>(null);

  const [carName, setCarName] = useState('');
  const [carType, setCarType] = useState('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [carNumber, setCarNumber] = useState('');
  const [year, setYear] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSearchOwner = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid Number', 'Enter a 10-digit mobile number');
      return;
    }
    setSearching(true);
    setOwner(null);
    try {
      const res = await apiService.searchVehicleOwner(cleaned);
      setOwner(res);
    } catch (e: any) {
      Alert.alert('Not Found', e?.message || 'No fleet driver found with this phone number');
    } finally {
      setSearching(false);
    }
  };

  const handleAssignCar = async () => {
    if (!owner) {
      Alert.alert('Fleet Driver Required', 'Search and select a fleet driver first');
      return;
    }
    if (!carName.trim()) {
      Alert.alert('Car Name Required', 'Enter car model (e.g. Swift Dzire, Innova)');
      return;
    }
    if (!carType) {
      Alert.alert('Car Type Required', 'Select a category (e.g. SEDAN_4_PLUS_1)');
      return;
    }
    if (!carNumber.trim()) {
      Alert.alert('Vehicle Number Required', 'Enter registration number (e.g. TN 01 AB 1234)');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.createCar({
        vehicle_owner_id: owner.vehicle_owner_id,
        car_name: carName.trim(),
        car_type: carType,
        car_number: carNumber.trim().toUpperCase(),
        year_of_the_car: year.trim() || undefined,
      });
      showToast(`Car ${carNumber.trim().toUpperCase()} assigned to ${owner.full_name}`, 'success');
      setCarName('');
      setCarType('');
      setCarNumber('');
      setYear('');
    } catch (e: any) {
      Alert.alert('Assign Failed', e?.message || 'Failed to assign car');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Assign Car to Fleet Driver</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <User size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>1. Find Fleet Driver</Text>
            </View>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="10-digit mobile number..."
                placeholderTextColor={themeColors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />
              <TouchableOpacity style={[styles.searchBtn, { backgroundColor: themeColors.primary }]} onPress={handleSearchOwner} disabled={searching}>
                {searching ? <ActivityIndicator size="small" color="white" /> : <Search size={18} color="white" />}
              </TouchableOpacity>
            </View>

            {owner && (
              <View style={[styles.ownerFound, { backgroundColor: isDark ? themeColors.surfaceAlt : '#F0FDF4', borderColor: themeColors.success, borderWidth: 1 }]}>
                <Text style={[styles.ownerName, { color: themeColors.success }]}>{owner.full_name}</Text>
                <Text style={[styles.ownerPhone, { color: themeColors.textSecondary }]}>Phone: {owner.primary_number} • ID: #{owner.vehicle_owner_id}</Text>
              </View>
            )}
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Car size={18} color={themeColors.success} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>2. Car Details</Text>
            </View>

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Car Model / Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. Swift Dzire, Etios, Innova Crysta"
              placeholderTextColor={themeColors.textMuted}
              value={carName}
              onChangeText={setCarName}
            />

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Car Category / Type</Text>
            <TouchableOpacity style={[styles.dropdownBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]} onPress={() => setShowTypeDropdown(!showTypeDropdown)}>
              <Text style={[styles.dropdownText, { color: carType ? themeColors.text : themeColors.textMuted }]}>{carType || 'Select car type...'}</Text>
              <ChevronDown size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {showTypeDropdown && (
              <View style={[styles.dropdownList, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                  {CAR_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                      onPress={() => {
                        setCarType(t);
                        setShowTypeDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, { color: themeColors.text }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Registration / Vehicle Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. TN 01 AB 1234"
              placeholderTextColor={themeColors.textMuted}
              value={carNumber}
              onChangeText={setCarNumber}
              autoCapitalize="characters"
            />

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Manufacturing Year (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. 2021"
              placeholderTextColor={themeColors.textMuted}
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={[styles.hint, { color: themeColors.textMuted }]}>
              Admin assignment bypasses vehicle year restrictions. RC/Insurance documents can be attached later from the Cars list.
            </Text>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.success }, submitting && { opacity: 0.6 }]} onPress={handleAssignCar} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Assign Car Now</Text>}
            </TouchableOpacity>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  card: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBtn: {
    borderRadius: 8,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerFound: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  ownerName: { fontSize: 14, fontWeight: '800' },
  ownerPhone: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dropdownBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 14 },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 11, marginTop: 10, lineHeight: 15 },
  saveBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
