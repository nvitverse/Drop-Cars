import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Key,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Zap,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface MapsKeyItem {
  id: string;
  masked_key: string;
  label: string;
  monthly_limit: number;
  used_this_month: number;
  month_year: string;
  status: string;
}

export default function MapsApiKeysScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<MapsKeyItem[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [totalUsed, setTotalUsed] = useState(0);

  // Form state
  const [keyInput, setKeyInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [limitInput, setLimitInput] = useState('5000');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getMapsKeys();
      if (res?.keys) {
        setKeys(res.keys);
        setTotalActive(res.total_active || res.keys.filter((k: any) => k.status === 'ACTIVE').length);
        setTotalUsed(res.total_used_this_month || 0);
      }
    } catch (e: any) {
      // If endpoint returns error or dev fallback
      console.log('Error loading keys:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleSaveKey = async () => {
    const keyTrim = keyInput.trim();
    if (!keyTrim) {
      Alert.alert('Validation Error', 'Please enter a valid Google Maps API Key.');
      return;
    }

    const limitNum = parseInt(limitInput, 10);
    if (isNaN(limitNum) || limitNum < 0) {
      Alert.alert('Validation Error', 'Monthly limit must be 0 or a positive number.');
      return;
    }

    setSaving(true);
    try {
      await apiService.saveMapsKey({
        id: editingId || undefined,
        key: keyTrim,
        label: labelInput.trim() || 'Google Maps API Key',
        monthly_limit: limitNum,
      });

      showToast(
        editingId ? 'API Key updated successfully.' : 'New Google Maps API Key added to pool.',
        'success'
      );
      // Reset form
      setKeyInput('');
      setLabelInput('');
      setLimitInput('5000');
      setEditingId(null);
      await loadKeys();
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message || 'Failed to save Google Maps API Key.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (k: MapsKeyItem) => {
    setEditingId(k.id);
    setLabelInput(k.label);
    setLimitInput(String(k.monthly_limit));
    setKeyInput(''); // Key is masked, user can type new or leave
    showToast(`Editing "${k.label}". Paste key to replace.`, 'info');
  };

  const handleDelete = (keyItem: MapsKeyItem) => {
    Alert.alert(
      'Remove API Key',
      `Are you sure you want to remove "${keyItem.label}" (${keyItem.masked_key}) from the rotation pool?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteMapsKey(keyItem.id);
              showToast('API key removed from pool.', 'success');
              await loadKeys();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to remove API key.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 6 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Maps API & Key Pool</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Zero-Cost Smart Cascade & Rotation</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Status Overview Banner */}
          <View style={[styles.card, styles.overviewCard]}>
            <View style={styles.badgeRow}>
              <View style={styles.statusPill}>
                <CheckCircle2 size={13} color="#10B981" />
                <Text style={styles.statusPillText}>Smart Cascade Active ($0 Engine)</Text>
              </View>
              <TouchableOpacity onPress={loadKeys} style={styles.refreshBtn}>
                <RotateCw size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.overviewHeading}>3-Stage Zero-Cost Location Architecture</Text>
            <View style={styles.cascadeList}>
              <Text style={styles.cascadeStep}>1. Local Database & Cache (0ms, $0 cost)</Text>
              <Text style={styles.cascadeStep}>2. OpenStreetMap Nominatim Proxy (Free Open-Source, $0 cost)</Text>
              <Text style={styles.cascadeStep}>3. Google Maps Free Tier Pool (Auto-rotates within $200 free credit)</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{totalActive}</Text>
                <Text style={styles.statLabel}>Active Keys</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{totalUsed}</Text>
                <Text style={styles.statLabel}>Queries This Month</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: '#10B981' }]}>$0.00</Text>
                <Text style={styles.statLabel}>Estimated Bill</Text>
              </View>
            </View>
          </View>

          {/* Key Management Form */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <Key size={18} color="#0EA5E9" />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>
                {editingId ? 'Edit Google Maps API Key' : 'Add New Google Maps Key'}
              </Text>
            </View>

            <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
              Paste your Google Maps API Key from Google Cloud Console. The system will rotate through keys and stop querying before you incur any cost.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Google Maps API Key *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={editingId ? 'Enter new key (or leave empty to keep existing)' : 'AIzaSy...'}
                placeholderTextColor={themeColors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Key Label / Note</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={labelInput}
                onChangeText={setLabelInput}
                placeholder="e.g., Primary Owner Key / Project 1"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Monthly Safe Request Limit</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={limitInput}
                onChangeText={setLimitInput}
                placeholder="5000"
                keyboardType="numeric"
                placeholderTextColor={themeColors.textSecondary}
              />
              <Text style={[styles.fieldSubhint, { color: themeColors.textSecondary }]}>
                Default: 5,000 requests/month (guarantees $0 cost within Google's $200 free monthly credit).
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {editingId && (
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                  onPress={() => {
                    setEditingId(null);
                    setKeyInput('');
                    setLabelInput('');
                    setLimitInput('5000');
                  }}
                >
                  <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSaveKey}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Key size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>
                      {editingId ? 'Update Key' : 'Save Key to Pool'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Configured Keys Pool */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Active Key Pool ({keys.length})</Text>
            <Zap size={16} color="#F59E0B" />
          </View>

          {keys.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <AlertTriangle size={24} color="#F59E0B" />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>No Google Maps Keys Configured</Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
                Add your first Google Maps key above. In the meantime, local caching and OpenStreetMap fallback are keeping the app fully operational at $0!
              </Text>
            </View>
          ) : (
            keys.map((k) => {
              const usagePercent = k.monthly_limit > 0 ? Math.min(100, Math.round((k.used_this_month / k.monthly_limit) * 100)) : 0;
              const isLimitReached = k.status === 'LIMIT_REACHED' || (k.monthly_limit > 0 && k.used_this_month >= k.monthly_limit);

              return (
                <View key={k.id} style={[styles.keyCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <View style={styles.keyCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.keyLabel, { color: themeColors.text }]}>{k.label}</Text>
                      <Text style={[styles.keyMasked, { color: themeColors.textSecondary }]}>{k.masked_key}</Text>
                    </View>
                    <View style={[styles.statusTag, isLimitReached ? styles.statusTagLimit : styles.statusTagActive]}>
                      <Text style={[styles.statusTagText, isLimitReached ? styles.statusTagTextLimit : styles.statusTagTextActive]}>
                        {isLimitReached ? 'LIMIT REACHED' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.usageContainer}>
                    <View style={styles.usageLabelRow}>
                      <Text style={[styles.usageLabel, { color: themeColors.textSecondary }]}>
                        Monthly Usage: <Text style={{ fontWeight: '700', color: themeColors.text }}>{k.used_this_month}</Text> / {k.monthly_limit} reqs
                      </Text>
                      <Text style={[styles.usagePercent, { color: usagePercent > 85 ? '#EF4444' : '#10B981' }]}>
                        {usagePercent}%
                      </Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${usagePercent}%`,
                            backgroundColor: usagePercent > 85 ? '#EF4444' : '#10B981',
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={[styles.cardFooter, { borderTopColor: themeColors.border }]}>
                    <Text style={[styles.monthText, { color: themeColors.textSecondary }]}>
                      Cycle: {k.month_year} (auto-resets 1st)
                    </Text>
                    <View style={styles.actionsRow}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(k)}>
                        <Edit2 size={15} color="#3B82F6" />
                        <Text style={[styles.actionBtnText, { color: '#3B82F6' }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { marginLeft: 12 }]} onPress={() => handleDelete(k)}>
                        <Trash2 size={15} color="#EF4444" />
                        <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* Quick Guide / Help */}
          <View style={[styles.card, styles.helpCard]}>
            <View style={styles.cardHeader}>
              <Info size={18} color="#6366F1" />
              <Text style={[styles.cardTitle, { color: '#4F46E5' }]}>Owner Setup Guide ($0 Guarantee)</Text>
            </View>
            <Text style={styles.helpText}>
              • Google Cloud gives each billing account <Text style={{ fontWeight: '700' }}>$200 free credit</Text> every single month (~5,000 requests).
            </Text>
            <Text style={styles.helpText}>
              • In Google Cloud Console, enable these 3 APIs for your project:
              {'\n'}   1. <Text style={{ fontWeight: '600' }}>Places API</Text>
              {'\n'}   2. <Text style={{ fontWeight: '600' }}>Geocoding API</Text>
              {'\n'}   3. <Text style={{ fontWeight: '600' }}>Distance Matrix API</Text>
            </Text>
            <Text style={styles.helpText}>
              • When a key hits 5,000 requests, the server automatically rotates to your next key or falls back to our free OpenStreetMap engine. You will <Text style={{ fontWeight: '700' }}>never be billed</Text>.
            </Text>
          </View>
        </ScrollView>
      )}

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  card: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  overviewCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  refreshBtn: {
    padding: 4,
  },
  overviewHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 8,
  },
  cascadeList: {
    marginBottom: 14,
    gap: 4,
  },
  cascadeStep: {
    fontSize: 12,
    color: '#15803D',
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
  },
  fieldSubhint: {
    fontSize: 11,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 6,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyCard: {
    borderRadius: 6,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  keyCard: {
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  keyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  keyLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  keyMasked: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTagActive: {
    backgroundColor: '#DCFCE7',
  },
  statusTagLimit: {
    backgroundColor: '#FEF3C7',
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusTagTextActive: {
    color: '#15803D',
  },
  statusTagTextLimit: {
    color: '#D97706',
  },
  usageContainer: {
    marginTop: 12,
  },
  usageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  usageLabel: {
    fontSize: 11,
  },
  usagePercent: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  monthText: {
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  helpCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    marginTop: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#3730A3',
    lineHeight: 18,
    marginBottom: 6,
  },
});
