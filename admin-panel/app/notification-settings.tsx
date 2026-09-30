import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { ArrowLeft, Bell, Save, Upload, Play, Square, RotateCcw, Search, Music } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface EventSetting {
  sound: string;
  speak_text: string;
}

type AppKey = 'driver' | 'vendor' | 'customer' | 'admin' | 'all';

const APP_TABS: { key: AppKey | 'every'; label: string }[] = [
  { key: 'every', label: 'All' },
  { key: 'driver', label: 'Driver App' },
  { key: 'vendor', label: 'Vendor App' },
  { key: 'customer', label: 'Customer App' },
  { key: 'admin', label: 'Admin App' },
  { key: 'all', label: 'Every app' },
];

const APP_NAME: Record<AppKey, string> = {
  driver: 'Driver App',
  vendor: 'Vendor App',
  customer: 'Customer App',
  admin: 'Admin App',
  all: 'Every app',
};

const isCustom = (sound?: string) => /^https?:\/\//i.test(sound || '');

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [apps, setApps] = useState<Record<string, AppKey>>({});
  const [events, setEvents] = useState<Record<string, EventSetting>>({});
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [playingFor, setPlayingFor] = useState<string | null>(null);
  const [tab, setTab] = useState<AppKey | 'every'>('every');
  const [query, setQuery] = useState('');
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data: any = await apiService.getNotificationSettings();
        setLabels(data.labels || {});
        setApps(data.apps || {});
        setEvents(data.events || {});
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      try { player.current?.remove(); } catch {}
    };
  }, []);

  const keys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.keys(labels).filter((k) => {
      if (tab !== 'every' && (apps[k] || 'driver') !== tab) return false;
      return !q || labels[k].toLowerCase().includes(q) || k.includes(q);
    });
  }, [labels, apps, tab, query]);

  const uploadedCount = Object.keys(labels).filter((k) => isCustom(events[k]?.sound)).length;

  const stopPreview = () => {
    try { player.current?.remove(); } catch {}
    player.current = null;
    setPlayingFor(null);
  };

  const preview = (eventKey: string) => {
    const url = events[eventKey]?.sound;
    if (playingFor === eventKey) return stopPreview();
    stopPreview();
    if (!isCustom(url)) {
      showToast('This type uses the default Drop Cars tone.', 'info');
      return;
    }
    try {
      const p = createAudioPlayer({ uri: url! });
      player.current = p;
      setPlayingFor(eventKey);
      p.play();
      setTimeout(() => { if (player.current === p) stopPreview(); }, 15000);
    } catch (e: any) {
      showToast(e?.message || 'Could not play the sound', 'error');
      setPlayingFor(null);
    }
  };

  const handleSave = async (eventKey: string) => {
    setSaving(eventKey);
    try {
      const result = await apiService.updateNotificationSettings({
        [eventKey]: { speak_text: events[eventKey]?.speak_text },
      });
      setEvents((prev) => ({ ...prev, ...result.events }));
      showToast('Spoken sentence saved.', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const handleUploadSound = async (eventKey: string) => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to open file picker');
      return;
    }
    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('File too large', 'Please pick a sound under 5 MB (a few seconds long is best).');
      return;
    }
    stopPreview();
    setBusyFor(eventKey);
    try {
      const response = await apiService.uploadNotificationSound(eventKey, {
        uri: asset.uri,
        name: asset.name || 'custom-sound.mp3',
        type: asset.mimeType || 'audio/mpeg',
      });
      setEvents((prev) => ({ ...prev, ...response.events }));
      showToast(`Sound saved for "${labels[eventKey]}".`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to upload sound');
    } finally {
      setBusyFor(null);
    }
  };

  const handleReset = (eventKey: string) => {
    Alert.alert('Use default tone?', `"${labels[eventKey]}" will go back to the default Drop Cars tone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use default',
        style: 'destructive',
        onPress: async () => {
          stopPreview();
          setBusyFor(eventKey);
          try {
            const response = await apiService.resetNotificationSound(eventKey);
            setEvents((prev) => ({ ...prev, ...response.events }));
            showToast('Back to the default tone.', 'success');
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to reset');
          } finally {
            setBusyFor(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Notification Sounds</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {uploadedCount} of {Object.keys(labels).length} types have your own sound
          </Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}>
        <Text style={[styles.introText, { color: themeColors.textSecondary }]}>
          Upload an MP3 for any notification type. Phones download it the next time the app opens and then play it
          for that notification, even when the app is closed (needs the latest app version). Until then the default
          Drop Cars tone plays.
        </Text>

        <View style={[styles.filterBar, { backgroundColor: themeColors.background }]}>
          <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Search size={16} color={themeColors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notification type"
              placeholderTextColor={themeColors.textMuted}
              style={[styles.searchInput, { color: themeColors.text }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {APP_TABS.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[
                    styles.chip,
                    { borderColor: active ? '#3B82F6' : themeColors.border, backgroundColor: active ? '#3B82F6' : themeColors.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFFFFF' : themeColors.text }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {keys.length === 0 && (
          <Text style={[styles.empty, { color: themeColors.textSecondary }]}>No notification types match.</Text>
        )}

        {keys.map((eventKey) => {
          const setting = events[eventKey] || { sound: '', speak_text: '' };
          const custom = isCustom(setting.sound);
          const busy = busyFor === eventKey;
          return (
            <View key={eventKey} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardTitleRow}>
                <Bell size={18} color="#3B82F6" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: themeColors.text }]}>{labels[eventKey]}</Text>
                  <Text style={[styles.appTag, { color: themeColors.textSecondary }]}>{APP_NAME[apps[eventKey] || 'driver']}</Text>
                </View>
              </View>

              <View style={[styles.statusPill, custom ? styles.statusCustom : styles.statusDefault]}>
                <Music size={13} color={custom ? '#047857' : '#6B7280'} />
                <Text style={[styles.statusText, { color: custom ? '#047857' : '#6B7280' }]}>
                  {custom ? 'Your uploaded sound' : 'Default Drop Cars tone'}
                </Text>
              </View>

              <View style={styles.soundRow}>
                <TouchableOpacity
                  style={[styles.soundBtn, { borderColor: themeColors.border }, !custom && styles.soundBtnDisabled]}
                  onPress={() => preview(eventKey)}
                  disabled={!custom || busy}
                  accessibilityLabel="Play sound"
                >
                  {playingFor === eventKey ? <Square size={15} color="#3B82F6" /> : <Play size={15} color="#3B82F6" />}
                  <Text style={styles.soundBtnText}>{playingFor === eventKey ? 'Stop' : 'Play'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.soundBtn, styles.uploadBtn]}
                  onPress={() => handleUploadSound(eventKey)}
                  disabled={busy}
                >
                  {busy ? <LoadingSpinner size="small" color="#3B82F6" /> : (
                    <>
                      <Upload size={15} color="#3B82F6" />
                      <Text style={styles.soundBtnText}>{custom ? 'Replace MP3' : 'Upload MP3'}</Text>
                    </>
                  )}
                </TouchableOpacity>
                {custom && (
                  <TouchableOpacity
                    style={[styles.soundBtn, { borderColor: themeColors.border }]}
                    onPress={() => handleReset(eventKey)}
                    disabled={busy}
                    accessibilityLabel="Use default tone"
                  >
                    <RotateCcw size={15} color="#DC2626" />
                    <Text style={[styles.soundBtnText, { color: '#DC2626' }]}>Default</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Spoken sentence (read out when the app is open or the notification is tapped)
              </Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={setting.speak_text}
                onChangeText={(v) => setEvents((prev) => ({ ...prev, [eventKey]: { ...setting, speak_text: v } }))}
                multiline
                placeholder="e.g. New booking from Drop Cars! Have a safe journey."
                placeholderTextColor="#9CA3AF"
              />

              <TouchableOpacity style={styles.saveButton} onPress={() => handleSave(eventKey)} disabled={saving === eventKey}>
                {saving === eventKey ? <LoadingSpinner size="small" color="white" /> : (
                  <>
                    <Save size={16} color="white" />
                    <Text style={styles.saveButtonText}>Save sentence</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  introText: { fontSize: 13, lineHeight: 19, padding: 16, paddingBottom: 4 },
  filterBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', padding: 24, fontSize: 14 },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  appTag: { fontSize: 12, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusCustom: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  statusDefault: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  statusText: { fontSize: 12, fontWeight: '600' },
  soundRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  soundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minWidth: 92,
  },
  soundBtnDisabled: { opacity: 0.45 },
  uploadBtn: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', flexGrow: 1 },
  soundBtnText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 56, textAlignVertical: 'top' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 11,
    marginTop: 12,
  },
  saveButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
