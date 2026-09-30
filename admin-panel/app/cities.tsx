import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Plus, Trash2, Search, Check } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import { Card, Btn, EmptyState, SkeletonRow } from '@/components/ui';

export default function CitiesScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [newCity, setNewCity] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiService.getAdminCities();
        setCities((data.cities || []).slice().sort((a, b) => a.localeCompare(b)));
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load cities');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addCity = () => {
    const name = newCity.trim();
    if (!name) return;
    if (cities.some((c) => c.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', `"${name}" is already in the list`);
      return;
    }
    setCities((prev) => [...prev, name].sort((a, b) => a.localeCompare(b)));
    setNewCity('');
    setDirty(true);
  };

  const removeCity = (city: string) => {
    setCities((prev) => prev.filter((c) => c !== city));
    setDirty(true);
  };

  const saveAll = async () => {
    if (cities.length === 0) {
      Alert.alert('Error', 'The city list cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const result = await apiService.updateAdminCities(cities);
      setCities((result.cities || cities).slice().sort((a: string, b: string) => a.localeCompare(b)));
      setDirty(false);
      showToast('City list updated for all apps.', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const visible = cities.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Service Cities</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{cities.length}</Text>
          </View>
        </View>
        {dirty && (
          <Btn
            label={saving ? 'Saving...' : 'Save'}
            variant="primary"
            size="sm"
            onPress={saveAll}
            disabled={saving}
          />
        )}
      </View>

      {/* Add City Row */}
      <View style={[styles.addCard, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TextInput
          style={[styles.addInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surfaceAlt }]}
          placeholder="Enter city name to add..."
          placeholderTextColor={themeColors.textMuted}
          value={newCity}
          onChangeText={setNewCity}
          onSubmitEditing={addCity}
        />
        <Btn
          label="Add"
          variant="secondary"
          size="sm"
          onPress={addCity}
          disabled={!newCity.trim()}
        />
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={15} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Filter cities..."
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <Card style={styles.cityCard}>
              <View style={styles.cityRow}>
                <View style={styles.leftInfo}>
                  <MapPin size={15} color={themeColors.primary} />
                  <Text style={[styles.cityName, { color: themeColors.text }]}>{item}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeCity(item)}
                  style={[styles.deleteBtn, { backgroundColor: themeColors.errorLight }]}
                >
                  <Trash2 size={13} color={themeColors.error} />
                </TouchableOpacity>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<MapPin size={36} color={themeColors.textMuted} />}
              title="No cities found"
              message="No matching cities in this view."
            />
          }
        />
      )}
      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginLeft: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: '700' },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  addInput: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  loadingContainer: { padding: 16, gap: 8 },
  listContainer: { padding: 16, gap: 6, paddingBottom: 40 },
  cityCard: { padding: 10, marginBottom: 2 },
  cityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cityName: { fontSize: 13.5, fontWeight: '600' },
  deleteBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
