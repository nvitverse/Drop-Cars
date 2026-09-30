import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Bell, Save, ChevronDown, Upload, Info } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface EventSetting {
  sound: string;
  speak_text: string;
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [availableSounds, setAvailableSounds] = useState<string[]>([]);
  const [events, setEvents] = useState<Record<string, EventSetting>>({});
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiService.getNotificationSettings();
        setLabels(data.labels || {});
        setAvailableSounds(data.available_sounds || []);
        setEvents(data.events || {});
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateField = (eventKey: string, field: keyof EventSetting, value: string) => {
    setEvents((prev) => ({ ...prev, [eventKey]: { ...prev[eventKey], [field]: value } }));
  };

  const handleSave = async (eventKey: string) => {
    setSaving(eventKey);
    try {
      const result = await apiService.updateNotificationSettings({
        [eventKey]: events[eventKey],
      });
      setEvents((prev) => ({ ...prev, ...result.events }));
      showToast('Notification setting updated.', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const handleUploadSound = async (eventKey: string) => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to open file picker');
      return;
    }

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setUploadingFor(eventKey);
    try {
      const response = await apiService.uploadNotificationSound(eventKey, {
        uri: asset.uri,
        name: asset.name || 'custom-sound.mp3',
        type: asset.mimeType || 'audio/mpeg',
      });
      setEvents((prev) => ({ ...prev, ...response.events }));
      Alert.alert('Uploaded', 'Custom sound uploaded and set for this event.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to upload sound');
    } finally {
      setUploadingFor(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
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
        <Text style={[styles.title, { color: themeColors.text }]}>Notification Settings</Text>
        <ThemeToggle size={20} />
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.introText, { color: themeColors.textSecondary }]}>
          A short alert sound always plays. If the app is open or the notification is tapped, the phone
          also SPEAKS the sentence below out loud. Edit the wording anytime - no app update needed.
        </Text>

        {Object.keys(labels).map((eventKey) => {
          const setting = events[eventKey] || { sound: availableSounds[0] || '', speak_text: '' };
          const isCustomSound = /^https?:\/\//i.test(setting.sound || '');
          return (
            <View key={eventKey} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardTitleRow}>
                <Bell size={18} color="#3B82F6" />
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>{labels[eventKey]}</Text>
              </View>

              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Alert sound</Text>

              {isCustomSound && (
                <View style={styles.customBadge}>
                  <Info size={14} color="#B45309" />
                  <Text style={styles.customBadgeText}>
                    Custom sound active (foreground only) - pick a sound below to revert
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.picker, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                onPress={() => setPickerOpenFor(pickerOpenFor === eventKey ? null : eventKey)}
              >
                <Text style={[styles.pickerText, { color: themeColors.text }]}>
                  {isCustomSound ? 'Custom uploaded sound' : setting.sound}
                </Text>
                <ChevronDown size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
              {pickerOpenFor === eventKey && (
                <View style={[styles.pickerOptions, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  {availableSounds.map((sound) => (
                    <TouchableOpacity
                      key={sound}
                      style={[styles.pickerOption, { borderBottomColor: themeColors.border }]}
                      onPress={() => {
                        updateField(eventKey, 'sound', sound);
                        setPickerOpenFor(null);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, { color: themeColors.text }]}>{sound}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => handleUploadSound(eventKey)}
                disabled={uploadingFor === eventKey}
              >
                {uploadingFor === eventKey ? (
                  <LoadingSpinner size="small" color="#3B82F6" />
                ) : (
                  <>
                    <Upload size={15} color="#3B82F6" />
                    <Text style={styles.uploadButtonText}>Upload Custom Sound</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Spoken sentence</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={setting.speak_text}
                onChangeText={(v) => updateField(eventKey, 'speak_text', v)}
                multiline
                placeholder="e.g. New booking from Drop Cars! Have a safe journey."
                placeholderTextColor="#9CA3AF"
              />

              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => handleSave(eventKey)}
                disabled={saving === eventKey}
              >
                {saving === eventKey ? <LoadingSpinner size="small" color="white" /> : (
                  <>
                    <Save size={16} color="white" />
                    <Text style={styles.saveButtonText}>Save</Text>
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  introText: { fontSize: 13, color: '#6B7280', lineHeight: 18, padding: 16, paddingBottom: 0 },
  card: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerText: { fontSize: 15, color: '#1F2937' },
  pickerOptions: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerOption: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  pickerOptionText: { fontSize: 14, color: '#1F2937' },
  customBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  customBadgeText: { flex: 1, fontSize: 12, color: '#B45309', lineHeight: 16 },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingVertical: 10,
    marginTop: 8,
  },
  uploadButtonText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 12,
    marginTop: 14,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
