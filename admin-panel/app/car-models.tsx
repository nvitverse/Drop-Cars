import React, { useState, useEffect, useMemo } from 'react';
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
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Car, Plus, Trash2, Save, ChevronDown, Search } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { formatCarType } from '@/utils/format';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface CarModelRow {
  name: string;
  type: string;
}

// Settings > Car Models: the car name -> category catalog that drives the
// "Car Name" picker in the driver app's Add Car screen (auto-fills Car Type
// on selection, still changeable afterward). Editable without a code change.
export default function CarModelsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<CarModelRow[]>([]);
  const [carTypes, setCarTypes] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('');
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [modelsData, typesData] = await Promise.all([
          apiService.getAdminCarModels(),
          apiService.getAdminCarTypes(),
        ]);
        setModels((modelsData.car_models || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
        setCarTypes(typesData.car_types || []);
        setNewType((typesData.car_types || [])[0] || '');
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load car models');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addModel = () => {
    const name = newName.trim();
    if (!name) return;
    if (!newType) {
      Alert.alert('Pick a category', 'Choose a Car Type for this model first');
      return;
    }
    if (models.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', `"${name}" is already in the list`);
      return;
    }
    setModels((prev) => [...prev, { name, type: newType }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
    setDirty(true);
  };

  const removeModel = (name: string) => {
    setModels((prev) => prev.filter((m) => m.name !== name));
    setDirty(true);
  };

  const saveAll = async () => {
    if (models.length === 0) {
      Alert.alert('Error', 'The car model list cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const result = await apiService.updateAdminCarModels(models);
      setModels((result.car_models || models).slice().sort((a: CarModelRow, b: CarModelRow) => a.name.localeCompare(b.name)));
      setDirty(false);
      showToast('Car model list updated for the driver app.', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(
    () => models.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [models, search]
  );

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Car Models ({models.length})</Text>
        <ThemeToggle size={20} />
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
          onPress={saveAll}
          disabled={!dirty || saving}
        >
          {saving ? <ActivityIndicator size="small" color="white" /> : (
            <>
              <Save size={15} color="white" />
              <Text style={styles.saveBtnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
        This list powers the "Car Name" dropdown in the driver app's Add Car screen and auto-fills
        Car Type on selection. Changes apply after saving - no code update needed.
      </Text>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.addInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="Add a car name (e.g. Kia Seltos)"
          placeholderTextColor={themeColors.textMuted}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addModel}
        />
        <TouchableOpacity style={[styles.typeSelect, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={() => setTypePickerOpen(true)}>
          <Text style={[styles.typeSelectText, { color: themeColors.text }]} numberOfLines={1}>
            {newType ? formatCarType(newType) : 'Type'}
          </Text>
          <ChevronDown size={14} color={themeColors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={addModel} accessibilityLabel="Add car model">
          <Plus size={18} color="white" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search car models..."
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.name}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: themeColors.surface }]}>
            <Car size={16} color={colors.primary} />
            <Text style={[styles.modelText, { color: themeColors.text }]}>{item.name}</Text>
            <Text style={[styles.typeBadge, { backgroundColor: isDark ? '#312E81' : '#E0E7FF', color: isDark ? '#C7D2FE' : '#3730A3' }]}>{formatCarType(item.type)}</Text>
            <TouchableOpacity onPress={() => removeModel(item.name)} style={{ padding: 6 }} accessibilityLabel="Remove car model">
              <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No car models match your search</Text>}
      />

      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTypePickerOpen(false)}>
          <View style={[styles.modalSheet, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Select Car Type</Text>
            <FlatList
              data={carTypes}
              keyExtractor={(t) => t}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderTopColor: themeColors.border }]}
                  onPress={() => {
                    setNewType(item);
                    setTypePickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: themeColors.text }]}>{formatCarType(item)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937', flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  hint: { fontSize: 12, color: '#6B7280', paddingHorizontal: 16, paddingTop: 12, lineHeight: 17 },
  addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  addInput: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    minWidth: 0,
  },
  typeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 10,
    maxWidth: 110,
  },
  typeSelectText: { fontSize: 12, color: '#1F2937', flexShrink: 1 },
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
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modelText: { flex: 1, fontSize: 14, color: '#1F2937' },
  typeBadge: {
    fontSize: 11,
    color: '#3730A3',
    backgroundColor: '#E0E7FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 30, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12, paddingBottom: 24 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', paddingHorizontal: 16, paddingBottom: 8 },
  modalItem: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  modalItemText: { fontSize: 14, color: '#1F2937' },
});
