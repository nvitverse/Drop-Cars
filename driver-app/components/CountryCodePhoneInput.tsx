import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { ChevronDown, Phone } from 'lucide-react-native';

const COUNTRY_CODES = [
  { code: '+91', name: 'India (Default)', flag: '🇮🇳' },
  { code: '+1', name: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
];

interface CountryCodePhoneInputProps {
  value: string;
  onChangeText: (fullPhoneNumber: string) => void;
  label?: string;
  isDark?: boolean;
}

export default function CountryCodePhoneInput({
  value,
  onChangeText,
  label = 'Mobile Number (Customer)',
  isDark = false,
}: CountryCodePhoneInputProps) {
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const isInternational = countryCode !== '+91';
  const maxLength = isInternational ? 15 : 10;

  const handlePhoneChange = (txt: string) => {
    const cleaned = txt.replace(/\D/g, '').slice(0, maxLength);
    setPhoneNumber(cleaned);
    onChangeText(`${countryCode}${cleaned}`);
  };

  const handleSelectCountry = (code: string) => {
    setCountryCode(code);
    setShowPicker(false);
    onChangeText(`${code}${phoneNumber}`);
  };

  return (
    <View style={styles.container}>
      {!!label && (
        <Text style={[styles.label, { color: isDark ? '#E2E8F0' : '#334155' }]}>{label}</Text>
      )}

      <View style={styles.inputRow}>
        {/* Country Code Selector */}
        <TouchableOpacity
          style={[
            styles.codeBox,
            { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#CBD5E1' },
          ]}
          onPress={() => setShowPicker(true)}
        >
          <Text style={[styles.codeText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{countryCode}</Text>
          <ChevronDown size={14} color={isDark ? '#94A3B8' : '#64748B'} />
        </TouchableOpacity>

        {/* Phone Input Box */}
        <TextInput
          style={[
            styles.phoneInput,
            { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A' },
          ]}
          placeholder={isInternational ? 'Up to 15 digits' : '10-digit mobile number'}
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
          maxLength={maxLength}
          value={phoneNumber}
          onChangeText={handlePhoneChange}
        />
      </View>

      <Text style={styles.hintText}>
        {isInternational
          ? `🌐 International Format Enabled (Max ${maxLength} digits allowed)`
          : '🇮🇳 India Standard Format (10 digits)'}
      </Text>

      {/* Country Code Picker Modal */}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Select Country Code</Text>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.codeItem}
                  onPress={() => handleSelectCountry(item.code)}
                >
                  <Text style={{ fontSize: 18 }}>{item.flag}</Text>
                  <Text style={[styles.codeItemCode, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>{item.code}</Text>
                  <Text style={[styles.codeItemName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  label: { fontSize: 12.5, fontWeight: '700', marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  codeText: { fontSize: 14, fontWeight: '800' },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: { fontSize: 11, color: '#64748B', marginTop: 4, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: 300, maxHeight: 380, borderRadius: 8, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  codeItem: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  codeItemCode: { fontSize: 14, fontWeight: '800', width: 45 },
  codeItemName: { fontSize: 13.5 },
});
