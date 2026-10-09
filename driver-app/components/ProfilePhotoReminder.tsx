import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosDriver from '@/app/api/axiosDriver';
import { appendFileToFormData } from '@/utils/formDataFile';

// Local MIME type resolver, same as add-driver.tsx's (no shared util for
// this - kept local to avoid a cross-file dependency for one small helper).
const guessMimeTypeFromUri = (uri: string): string => {
  try {
    const lower = (uri || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.heic')) return 'image/heic';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
};

// Prompts an EXISTING driver (one who signed up before profile_img was a
// mandatory field) to add a live profile photo - added 2026-09-04. Checks
// once per app open via GET /cardriver/me; a driver who already has one
// never sees this at all. "Later" just dismisses for this session - no
// permanent snooze, since a missing photo is a real gap worth re-asking
// about rather than silently forgetting.
export default function ProfilePhotoReminder() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    (async () => {
      try {
        const res = await axiosDriver.get('/api/users/cardriver/me', { silentAuthCheck: true } as any);
        if (!res.data?.profile_img) {
          setVisible(true);
        }
      } catch (e) {
        // Not a driver session (e.g. pure fleet-owner browsing without
        // ever switching to Duty) or a transient network error - either
        // way, never worth surfacing as an error here.
      } finally {
        setChecked(true);
      }
    })();
  }, [checked]);

  const takePhotoAndUpload = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        quality: 0.6,
      });
      if (result.canceled) return;

      setUploading(true);
      const uri = result.assets[0].uri;
      const name = uri.split('/').pop() || 'profile.jpg';
      const type = guessMimeTypeFromUri(uri) || 'image/jpeg';

      const form = new FormData();
      await appendFileToFormData(form, 'profile_img', uri, name, type);

      const res = await axiosDriver.post('/api/users/cardriver/update-profile-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const faceMatch = res.data?.face_match;
      setVisible(false);
      if (faceMatch?.status === 'OK' && faceMatch?.is_match === false) {
        Alert.alert('Photo Saved', `Didn't clearly match your licence photo (${faceMatch.match_percent}%) - you can retake it in Settings.`);
      } else {
        Alert.alert('Photo Saved', '');
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Could not save photo.';
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not save photo.');
    } finally {
      setUploading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
            <Camera size={28} color="#3B82F6" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Add Your Profile Photo</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={takePhotoAndUpload} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Camera size={16} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Take Photo Now</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.laterBtn} onPress={() => setVisible(false)} disabled={uploading}>
            <Text style={[styles.laterBtnText, { color: colors.textSecondary }]}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 10, padding: 24, alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 14, right: 14, padding: 4 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontFamily: 'Inter-Bold', marginBottom: 6, textAlign: 'center' },
  body: { fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 19 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', paddingVertical: 13, paddingHorizontal: 24, borderRadius: 6, width: '100%' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' },
  laterBtn: { marginTop: 10, paddingVertical: 8 },
  laterBtnText: { fontSize: 13, fontFamily: 'Inter-Medium' },
});
