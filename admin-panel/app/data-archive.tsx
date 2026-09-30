import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Database, Link, Archive, Info } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useAuthPermissions } from '@/utils/auth';
import { useTheme } from '@/context/ThemeContext';

// Old COMPLETED/CANCELLED bookings piling up in `orders` slow the whole app
// down (see this session's earlier trigram-index work) - this screen exports
// them to a Google Sheet for backup/reporting, same webhook pattern as the
// Activity Log's own backup (staff-activity.tsx). Export-only for now - see
// the backend route's docstring (api/routes/admin.py's archive_old_orders)
// for why delete-after-sync isn't wired up yet.
export default function DataArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();
  const { isOwner, loading: authLoading } = useAuthPermissions();

  const [webhookUrl, setWebhookUrl] = useState('');
  const [loadingWebhook, setLoadingWebhook] = useState(true);
  const [savingWebhook, setSavingWebhook] = useState(false);

  const [olderThanDays, setOlderThanDays] = useState('180');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadWebhook = useCallback(async () => {
    try {
      setLoadingWebhook(true);
      const res = await apiService.getDataArchiveWebhookUrl();
      setWebhookUrl(res.url || '');
    } catch {
      // ignore
    } finally {
      setLoadingWebhook(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) loadWebhook();
  }, [authLoading, loadWebhook]);

  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await apiService.updateDataArchiveWebhookUrl(webhookUrl);
      Alert.alert('Saved', 'Google Sheets Webhook URL updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update Webhook URL');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handlePreview = async () => {
    const days = parseInt(olderThanDays, 10) || 180;
    setLoadingPreview(true);
    setPreviewCount(null);
    try {
      const res = await apiService.previewArchivableOrders(days);
      setPreviewCount(res.archivable_count);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to preview archivable bookings');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleArchive = () => {
    if (!webhookUrl.trim()) {
      Alert.alert('Webhook Required', 'Add and save a Google Sheets webhook URL first.');
      return;
    }
    const days = parseInt(olderThanDays, 10) || 180;
    Alert.alert(
      'Export to Google Sheets',
      `Export completed/cancelled bookings older than ${days} days to your Google Sheet? This only reads and exports - nothing is deleted from the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export Now',
          onPress: async () => {
            setArchiving(true);
            try {
              const res = await apiService.archiveOldOrders(days);
              Alert.alert(
                'Export Complete',
                `Synced ${res.synced} of ${res.total_attempted} bookings to Google Sheets.` +
                (res.failed > 0 ? `\n\n${res.failed} failed - check the webhook URL and try again.` : '')
              );
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to run the archive export');
            } finally {
              setArchiving(false);
            }
          },
        },
      ]
    );
  };

  if (authLoading || loadingWebhook) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (!isOwner) {
    router.replace('/(tabs)' as any);
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9', paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={18} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Data Archive</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Export old bookings to Google Sheets
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#334155' : '#BFDBFE' }]}>
          <Info size={16} color="#3B82F6" />
          <Text style={[styles.infoBannerText, { color: themeColors.textSecondary }]}>
            Only completed or cancelled bookings are ever exported - pending and active bookings are never touched. Nothing is deleted from the app; this is a backup/reporting export only.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Link size={18} color="#10B981" />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Google Sheets Webhook</Text>
          </View>
          <Text style={[styles.paramLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>
            Same Google Apps Script setup as the Activity Log's backup (Staff Activity screen) - reuse that Web App URL, or deploy a new one and paste it here.
          </Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
            placeholder="https://script.google.com/macros/s/.../exec"
            placeholderTextColor={themeColors.textMuted}
            value={webhookUrl}
            onChangeText={setWebhookUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: themeColors.primary, opacity: savingWebhook ? 0.7 : 1 }]}
            onPress={handleSaveWebhook}
            disabled={savingWebhook}
          >
            {savingWebhook ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Webhook URL</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Database size={18} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Export Old Bookings</Text>
          </View>

          <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>Older than (days)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
            keyboardType="numeric"
            value={olderThanDays}
            onChangeText={(v) => { setOlderThanDays(v); setPreviewCount(null); }}
          />

          <TouchableOpacity
            style={[styles.previewBtn, { borderColor: themeColors.primary }]}
            onPress={handlePreview}
            disabled={loadingPreview}
          >
            {loadingPreview ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Text style={[styles.previewBtnText, { color: themeColors.primary }]}>Preview Count</Text>
            )}
          </TouchableOpacity>

          {previewCount !== null && (
            <Text style={[styles.previewResult, { color: themeColors.text }]}>
              {previewCount} booking{previewCount === 1 ? '' : 's'} will be exported.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.archiveBtn, { backgroundColor: '#F59E0B', opacity: archiving ? 0.7 : 1 }]}
            onPress={handleArchive}
            disabled={archiving}
          >
            {archiving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Archive size={16} color="#FFFFFF" />
                <Text style={styles.archiveBtnText}>Export to Google Sheets</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSubtitle: { fontSize: 11.5, marginTop: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  infoBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoBannerText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  card: { borderRadius: 10, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  paramLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  saveBtn: { borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  previewBtn: { borderWidth: 1, borderRadius: 6, paddingVertical: 9, alignItems: 'center', marginBottom: 6 },
  previewBtnText: { fontWeight: '800', fontSize: 12.5 },
  previewResult: { fontSize: 12.5, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  archiveBtn: { flexDirection: 'row', gap: 6, borderRadius: 6, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  archiveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
});
