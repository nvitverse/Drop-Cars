import React, { useState, useEffect, useCallback } from 'react';
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
import { ArrowLeft, Route, Trash2, Pencil, Plus, Minus, Search } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface RouteRow {
  id: string;
  origin: string;
  destination: string;
  distance_km: number;
  duration_text: string | null;
  source: string;
  updated_at: string | null;
}

export default function RouteDistancesScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newKm, setNewKm] = useState('');
  const [newTime, setNewTime] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (query: string) => {
    try {
      setLoading(true);
      const data = await apiService.getRouteDistances(query);
      setRoutes(data.routes || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load route distances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(search), 350);
    return () => clearTimeout(handle);
  }, [search, load]);

  const saveEdit = async (item: RouteRow) => {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid distance', 'Enter a positive number of kilometers');
      return;
    }
    setSavingEditId(item.id);
    try {
      await apiService.updateRouteDistance(item.id, parsed);
      setRoutes((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, distance_km: parsed, source: 'ADMIN' } : r))
      );
      setEditingId(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update distance');
    } finally {
      setSavingEditId(null);
    }
  };

  const remove = (item: RouteRow) => {
    Alert.alert('Delete route?', `${item.origin} → ${item.destination}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.deleteRouteDistance(item.id);
            setRoutes((prev) => prev.filter((r) => r.id !== item.id));
            setTotal((t) => Math.max(0, t - 1));
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete route');
          }
        },
      },
    ]);
  };

  const addRoute = async () => {
    const o = newOrigin.trim();
    const d = newDestination.trim();
    const km = parseFloat(newKm);
    if (!o || !d || isNaN(km) || km <= 0) {
      Alert.alert('Required fields', 'Origin, destination, and positive km are all required');
      return;
    }
    setAdding(true);
    try {
      await apiService.addRouteDistance(o, d, km, newTime.trim() || undefined);
      setNewOrigin('');
      setNewDestination('');
      setNewKm('');
      setNewTime('');
      setShowAdd(false);
      await load(search);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add route');
    } finally {
      setAdding(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>
          Route Distances ({total})
        </Text>
        <ThemeToggle size={20} />
      </View>

      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
        Cached route distances used for instant quotes. Edits override Google Maps and delete rows
        forces a fresh fetch next time the route is quoted.
      </Text>

      <TouchableOpacity
        style={styles.addToggle}
        onPress={() => setShowAdd(!showAdd)}
        accessibilityLabel="Toggle add form"
      >
        {showAdd ? <Minus size={16} color="#10B981" /> : <Plus size={16} color="#10B981" />}
        <Text style={styles.addToggleText}>{showAdd ? 'Hide Form' : 'Add Custom Route'}</Text>
      </TouchableOpacity>

      {showAdd && (
        <View style={[styles.addForm, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.addInput, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Origin (e.g. Chennai)"
              placeholderTextColor={themeColors.textMuted}
              value={newOrigin}
              onChangeText={setNewOrigin}
            />
            <TextInput
              style={[styles.addInput, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Destination (e.g. Salem)"
              placeholderTextColor={themeColors.textMuted}
              value={newDestination}
              onChangeText={setNewDestination}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.addInput, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Km (e.g. 340)"
              placeholderTextColor={themeColors.textMuted}
              keyboardType="numeric"
              value={newKm}
              onChangeText={setNewKm}
            />
            <TextInput
              style={[styles.addInput, { flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Time (e.g. 1h 30m)"
              placeholderTextColor={themeColors.textMuted}
              value={newTime}
              onChangeText={setNewTime}
            />
          </View>
          <TouchableOpacity
            style={[styles.addBtn, adding && { opacity: 0.5 }]}
            onPress={addRoute}
            disabled={adding}
          >
            {adding ? <ActivityIndicator size="small" color="white" /> : (
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 13 }}>Add Route</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by city..."
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
              <View style={styles.cardTop}>
                <Route size={16} color="#3B82F6" />
                <Text style={[styles.routeText, { color: themeColors.text }]} numberOfLines={2}>
                  {item.origin} → {item.destination}
                </Text>
              </View>
              <View style={styles.cardBottom}>
                {editingId === item.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <TextInput
                      style={[styles.editInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                      value={editValue}
                      onChangeText={setEditValue}
                      keyboardType="numeric"
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.okBtn, savingEditId === item.id && { opacity: 0.5 }]}
                      onPress={() => saveEdit(item)}
                      disabled={savingEditId === item.id}
                    >
                      <Text style={{ color: 'white', fontWeight: '600', fontSize: 12 }}>OK</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingId(null)}>
                      <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.kmText, { color: themeColors.textSecondary }]}>
                      {item.distance_km} km
                      {item.duration_text ? `  •  ${item.duration_text}` : ''}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: item.source === 'ADMIN' ? (isDark ? '#78350F' : '#FEF3C7') : (isDark ? '#1E3A8A' : '#DBEAFE') },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: item.source === 'ADMIN' ? (isDark ? '#FDE68A' : '#B45309') : (isDark ? '#93C5FD' : '#1D4ED8'),
                        }}
                      >
                        {item.source}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingId(item.id);
                        setEditValue(String(item.distance_km));
                      }}
                      style={{ padding: 6 }}
                      accessibilityLabel="Edit distance"
                    >
                      <Pencil size={15} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(item)} style={{ padding: 6 }} accessibilityLabel="Delete route">
                      <Trash2 size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: themeColors.textMuted }]}>
              No cached routes yet - they appear automatically as bookings are quoted.
            </Text>
          }
        />
      )}
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
  title: { fontSize: 19, fontWeight: '700', flex: 1 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingTop: 12, lineHeight: 17 },
  addToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  addToggleText: { color: '#10B981', fontWeight: '600', fontSize: 13 },
  addForm: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 6,
    padding: 12,
    gap: 8,
  },
  addInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  addBtn: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { flex: 1, fontSize: 13, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  kmText: { flex: 1, fontSize: 13 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  editInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    width: 90,
  },
  okBtn: { backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 13, paddingHorizontal: 30 },
});
