import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Search } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

/**
 * Money that looks added twice. DEFINITE = the same reference was credited twice; POSSIBLE = the same amount and reason credited to the same
 * person twice inside a day (check it - a second, separate payment is normal). Search a name or phone to look at one person.
 * Read-only: to take back a double credit use Wallet > Deduct, with a note.
 */
type Entry = { id: string; when: string; amount: number; type: string; reference_type?: string | null; notes?: string | null };
type Group = { strength: 'DEFINITE' | 'POSSIBLE'; why: string; name?: string | null; phone?: string | null; amount: number; total_extra: number; entries: Entry[] };

export default function WalletDuplicatesScreen() {
  const router = useRouter();
  const { colors } = useTheme() as any;
  const [days, setDays] = useState(14);
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [meta, setMeta] = useState<{ checked: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term?: string) => {
    setError(null);
    try {
      const r = await apiService.getWalletDuplicateAudit(days, (term ?? search).trim() || undefined);
      setGroups(r.groups || []);
      setMeta({ checked: r.checked_entries || 0, total: r.possible_extra_total || 0 });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, search]);

  useEffect(() => { setLoading(true); load(); }, [days]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Duplicate credits check</Text>
      </View>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => { setLoading(true); load(); }} returnKeyType="search" placeholder="Name or phone (optional)" placeholderTextColor={colors.textSecondary} style={{ flex: 1, color: colors.text, paddingVertical: 8, marginLeft: 6 }} />
        </View>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={[styles.go, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Check</Text></TouchableOpacity>
      </View>
      <View style={styles.chips}>
        {[7, 14, 30, 60].map((d) => (
          <TouchableOpacity key={d} onPress={() => setDays(d)} style={[styles.chip, { borderColor: days === d ? colors.primary : colors.border, backgroundColor: days === d ? colors.primary : 'transparent' }]}>
            <Text style={{ color: days === d ? '#fff' : colors.text, fontWeight: '600' }}>{d} days</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error ? <Text style={{ color: '#DC2626', marginBottom: 10 }}>{error}</Text> : null}
          {meta ? <Text style={{ color: colors.textSecondary, marginBottom: 10 }}>{meta.checked} credits checked in the last {days} days. {groups.length ? `Possibly doubled: Rs ${meta.total}.` : 'Nothing looks doubled.'}</Text> : null}
          {groups.map((g, i) => (
            <View key={i} style={[styles.card, { borderColor: g.strength === 'DEFINITE' ? '#DC2626' : '#D97706', backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color={g.strength === 'DEFINITE' ? '#DC2626' : '#D97706'} />
                <Text style={{ color: g.strength === 'DEFINITE' ? '#DC2626' : '#D97706', fontWeight: '800' }}>{g.strength === 'DEFINITE' ? 'Definitely doubled' : 'Check this'}</Text>
                <Text style={{ marginLeft: 'auto', color: colors.text, fontWeight: '800' }}>Extra Rs {g.total_extra}</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>{g.name || 'Unknown'}{g.phone ? `  ·  ${g.phone}` : ''}</Text>
              <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{g.why}</Text>
              {g.entries.map((e) => (
                <View key={e.id} style={{ marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.text }}>{e.when}  ·  Rs {e.amount}  ·  {e.reference_type || e.type}</Text>
                  {e.notes ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{e.notes}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  title: { fontSize: 20, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  go: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  card: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 12 },
});
