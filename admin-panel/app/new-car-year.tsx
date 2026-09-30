import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Car } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function NewCarYearScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minYear, setMinYear] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await apiService.getNewCarYearThreshold();
      setMinYear(String(settings.new_car_min_year));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load setting');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const year = parseInt(minYear, 10);
    if (isNaN(year) || year < 1990 || year > 2100) {
      Alert.alert('Invalid', 'Enter a valid 4-digit year');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateNewCarYearThreshold(year);
      showToast('New car year updated - drivers can only self-register NEW SEDAN with this model year or later.', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>New Car Year</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <Car size={18} color="#EA580C" />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Minimum Model Year</Text>
            </View>
            <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
              Drivers registering their own car can only select the "NEW SEDAN" car type if
              their car's model year is this value or later. Older cars can still register under
              the regular SEDAN category. This does not apply when an admin adds a car on a
              vehicle owner's behalf.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={minYear}
              onChangeText={setMinYear}
              keyboardType="numeric"
              maxLength={4}
              placeholder="e.g. 2022"
              placeholderTextColor={themeColors.textMuted}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
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
  title: { fontSize: 19, fontWeight: '700' },
  card: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#EA580C',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
