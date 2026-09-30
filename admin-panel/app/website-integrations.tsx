import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Globe, Plus } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface WebsiteIntegration {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

export default function WebsiteIntegrationsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<WebsiteIntegration[]>([]);
  const [newName, setNewName] = useState('');

  const load = async () => {
    try {
      const data = await apiService.getWebsiteIntegrations();
      setIntegrations(data);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load website integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Error', 'Enter a name for the new website (e.g. dropcars.in, dropcars-tn.in)');
      return;
    }
    setCreating(true);
    try {
      await apiService.createWebsiteIntegration(name);
      setNewName('');
      await load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to create website integration');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: WebsiteIntegration) => {
    setTogglingId(item.id);
    try {
      await apiService.setWebsiteIntegrationActive(item.id, !item.is_active);
      await load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update website integration');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Partner websites</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <Text style={[styles.introText, { color: themeColors.textSecondary }]}>
          API keys allow external websites (such as dropcars.in) to post bookings directly into this admin app. Keep keys secret.
        </Text>

        <View style={[styles.addCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Text style={[styles.addLabel, { color: themeColors.text }]}>Add New Website</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. dropcars-kerala.in"
              placeholderTextColor={themeColors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <TouchableOpacity
              style={[styles.addButton, creating && styles.addButtonDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Plus size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>

        {integrations.length === 0 ? (
          <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>No website integrations yet.</Text>
        ) : (
          integrations.map((integration) => (
            <View key={integration.id} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Globe size={18} color="#3B82F6" />
                  <Text style={[styles.cardTitle, { color: themeColors.text }]}>{integration.name}</Text>
                </View>
                <Switch
                  value={integration.is_active}
                  onValueChange={() => handleToggle(integration)}
                  disabled={togglingId === integration.id}
                  trackColor={{ false: isDark ? '#334155' : '#D1D5DB', true: '#3B82F6' }}
                />
              </View>
              <Text style={[styles.cardKeyLabel, { color: themeColors.textMuted }]}>API Key (long-press to select/copy)</Text>
              <Text style={[styles.cardKey, { backgroundColor: themeColors.background, color: themeColors.text }]} selectable>
                {integration.api_key}
              </Text>
              <Text style={[styles.cardMeta, { color: themeColors.textMuted }]}>
                {integration.is_active ? 'Active' : 'Inactive'} · Added {new Date(integration.created_at).toLocaleDateString('en-IN')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  introText: { fontSize: 13, marginBottom: 20, lineHeight: 19 },
  addCard: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  addLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.6 },
  emptyText: { textAlign: 'center', marginTop: 20 },
  card: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardKeyLabel: { fontSize: 11, marginBottom: 4 },
  cardKey: {
    fontSize: 12,
    fontFamily: 'monospace',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  cardMeta: { fontSize: 11 },
});
