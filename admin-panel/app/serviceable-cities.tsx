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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Plus, Trash2, Save, Search } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface CityRow {
  city: string;
  state: string;
  serviceable: boolean;
}

export default function ServiceableCitiesScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiService.getServiceableCities();
        setCities((data.cities || []).slice().sort((a, b) => a.city.localeCompare(b.city)));
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load serviceable cities');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addCity = () => {
    const name = newCity.trim();
    if (!name) return;
    if (cities.some((c) => c.city.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', `"${name}" is already in the list`);
      return;
    }
    setCities((prev) =>
      [...prev, { city: name, state: newState.trim(), serviceable: true }].sort((a, b) =>
        a.city.localeCompare(b.city)
      )
    );
    setNewCity('');
    setNewState('');
    setDirty(true);
  };

  const toggleServiceable = (city: string) => {
    setCities((prev) =>
      prev.map((c) => (c.city === city ? { ...c, serviceable: !c.serviceable } : c))
    );
    setDirty(true);
  };

  const removeCity = (city: string) => {
    setCities((prev) => prev.filter((c) => c.city !== city));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await apiService.updateServiceableCities(cities);
      setDirty(false);
      showToast('Serviceable cities saved successfully!', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save serviceable cities');
    } finally {
      setSaving(false);
    }
  };

  const visible = cities.filter(
    (c) =>
      c.city.toLowerCase().includes(search.toLowerCase()) ||
      c.state.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Local Bookings Cities ({cities.length})</Text>
        <ThemeToggle size={20} />
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
          onPress={saveAll}
          disabled={!dirty || saving}
        >
          {saving ? (
            <LoadingSpinner size="small" />
          ) : (
            <>
              <Save size={15} color="white" />
              <Text style={styles.saveBtnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
        Toggle which cities drivers and vendors can post/accept Local bookings in. Off by default
        outside Tamil Nadu.
      </Text>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.addInput, { flex: 2, backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="City (e.g. Salem)"
          placeholderTextColor={themeColors.textMuted}
          value={newCity}
          onChangeText={setNewCity}
        />
        <TextInput
          style={[styles.addInput, { flex: 1, backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="State"
          placeholderTextColor={themeColors.textMuted}
          value={newState}
          onChangeText={setNewState}
          onSubmitEditing={addCity}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addCity} accessibilityLabel="Add city">
          <Plus size={18} color="white" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search cities or states..."
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.city}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <MapPin size={16} color={item.serviceable ? '#10B981' : themeColors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cityText, { color: themeColors.text }]}>{item.city}</Text>
              {!!item.state && <Text style={[styles.stateText, { color: themeColors.textSecondary }]}>{item.state}</Text>}
            </View>
            <Switch
              value={item.serviceable}
              onValueChange={() => toggleServiceable(item.city)}
              trackColor={{ false: isDark ? '#334155' : '#E5E7EB', true: '#3B82F6' }}
            />
            <TouchableOpacity onPress={() => removeCity(item.city)} style={{ padding: 6 }} accessibilityLabel="Remove city">
              <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No cities match your search</Text>}
      />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingTop: 12, lineHeight: 17 },
  addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  addInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cityText: { fontSize: 14, fontWeight: '600' },
  stateText: { fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 13 },
});
