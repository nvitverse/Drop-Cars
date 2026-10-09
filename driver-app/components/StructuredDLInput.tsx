import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { ChevronDown, CreditCard } from 'lucide-react-native';

const INDIAN_STATES = [
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'TS', name: 'Telangana' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
];

interface StructuredDLInputProps {
  value: string;
  onChangeText: (fullDlNumber: string) => void;
  isDark?: boolean;
}

export default function StructuredDLInput({
  value,
  onChangeText,
  isDark = false,
}: StructuredDLInputProps) {
  const [stateCode, setStateCode] = useState('TN');
  const [rtoCode, setRtoCode] = useState('');
  const [issueYear, setIssueYear] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [showStatePicker, setShowStatePicker] = useState(false);

  // Parse initial value if passed
  useEffect(() => {
    if (value && value.length >= 15) {
      const state = value.substring(0, 2).toUpperCase();
      const rto = value.substring(2, 4);
      const year = value.substring(4, 8);
      const num = value.substring(8);
      if (INDIAN_STATES.some((s) => s.code === state)) setStateCode(state);
      setRtoCode(rto);
      setIssueYear(year);
      setDlNumber(num);
    }
  }, []);

  const updateFullDL = (st: string, rto: string, yr: string, num: string) => {
    const cleanRto = rto.replace(/\D/g, '').padStart(2, '0').slice(-2);
    const cleanYr = yr.replace(/\D/g, '').slice(0, 4);
    const cleanNum = num.replace(/\D/g, '').slice(0, 7);
    const full = `${st}${cleanRto}${cleanYr}${cleanNum}`;
    onChangeText(full);
  };

  const handleStateSelect = (code: string) => {
    setStateCode(code);
    setShowStatePicker(false);
    updateFullDL(code, rtoCode, issueYear, dlNumber);
  };

  const handleRtoChange = (txt: string) => {
    const cleaned = txt.replace(/\D/g, '').slice(0, 2);
    setRtoCode(cleaned);
    updateFullDL(stateCode, cleaned, issueYear, dlNumber);
  };

  const handleYearChange = (txt: string) => {
    const cleaned = txt.replace(/\D/g, '').slice(0, 4);
    setIssueYear(cleaned);
    updateFullDL(stateCode, rtoCode, cleaned, dlNumber);
  };

  const handleNumChange = (txt: string) => {
    const cleaned = txt.replace(/\D/g, '').slice(0, 7);
    setDlNumber(cleaned);
    updateFullDL(stateCode, rtoCode, issueYear, cleaned);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: isDark ? '#E2E8F0' : '#334155' }]}>
        Driving License Number (Savaari Format)
      </Text>

      <View style={styles.inputRow}>
        {/* State Code Dropdown */}
        <TouchableOpacity
          style={[
            styles.stateBox,
            { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#CBD5E1' },
          ]}
          onPress={() => setShowStatePicker(true)}
        >
          <Text style={[styles.stateText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{stateCode}</Text>
          <ChevronDown size={14} color={isDark ? '#94A3B8' : '#64748B'} />
        </TouchableOpacity>

        {/* RTO Code (2 digits) */}
        <TextInput
          style={[
            styles.segmentInput,
            { width: 50, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A' },
          ]}
          placeholder="09"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          maxLength={2}
          value={rtoCode}
          onChangeText={handleRtoChange}
        />

        {/* Issue Year (4 digits) */}
        <TextInput
          style={[
            styles.segmentInput,
            { width: 65, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A' },
          ]}
          placeholder="2016"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          maxLength={4}
          value={issueYear}
          onChangeText={handleYearChange}
        />

        {/* 7-digit Number */}
        <TextInput
          style={[
            styles.segmentInput,
            { flex: 1, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A' },
          ]}
          placeholder="0012345"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          maxLength={7}
          value={dlNumber}
          onChangeText={handleNumChange}
        />
      </View>

      <Text style={styles.previewText}>
        Preview: <Text style={{ fontWeight: '800', color: '#10B981' }}>{`${stateCode}${rtoCode.padStart(2, '0')}${issueYear}${dlNumber}`}</Text>
      </Text>

      {/* State Picker Modal */}
      <Modal visible={showStatePicker} transparent animationType="fade" onRequestClose={() => setShowStatePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Select State Code</Text>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.stateItem}
                  onPress={() => handleStateSelect(item.code)}
                >
                  <Text style={[styles.stateItemCode, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>{item.code}</Text>
                  <Text style={[styles.stateItemName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{item.name}</Text>
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
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  stateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stateText: { fontSize: 13.5, fontWeight: '800' },
  segmentInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 9,
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewText: { fontSize: 11, color: '#64748B', marginTop: 4, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: 280, maxHeight: 360, borderRadius: 8, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  stateItem: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  stateItemCode: { fontSize: 14, fontWeight: '800', width: 30 },
  stateItemName: { fontSize: 14 },
});
