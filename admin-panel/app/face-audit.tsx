import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  UserCheck,
  ShieldAlert,
  Car,
  BellRing,
  RefreshCw,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';

interface FlaggedDutyPhoto {
  id: string;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  matchScore: number; // e.g. 54%
  noFaceDetected: boolean;
  selfieUrl: string;
  registeredPhotoUrl: string;
  vehicleFrontPhotoUrl: string;
  timestamp: string;
  status: 'PENDING_AUDIT' | 'APPROVED' | 'REJECTED';
}

export default function FaceAuditScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [flaggedItems, setFlaggedItems] = useState<FlaggedDutyPhoto[]>([
    {
      id: 'f1',
      driverName: 'Ramesh Kumar',
      driverPhone: '9876543210',
      vehicleNumber: 'TN 09 AB 1001',
      matchScore: 52,
      noFaceDetected: false,
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300',
      registeredPhotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300',
      vehicleFrontPhotoUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=300',
      timestamp: 'Today, 08:30 AM',
      status: 'PENDING_AUDIT',
    },
    {
      id: 'f2',
      driverName: 'Karthik V',
      driverPhone: '9876543211',
      vehicleNumber: 'TN 09 CB 2002',
      matchScore: 0,
      noFaceDetected: true,
      selfieUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300',
      registeredPhotoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300',
      vehicleFrontPhotoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300',
      timestamp: 'Today, 09:15 AM',
      status: 'PENDING_AUDIT',
    },
  ]);

  const handleApprove = (id: string) => {
    setFlaggedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'APPROVED' } : item))
    );
    showToast('Duty start manually verified & approved', 'success');
  };

  const handleReject = (id: string) => {
    Alert.alert(
      'Reject & Hold Duty?',
      'Driver will be blocked from starting duty and prompted to re-take verification photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject & Hold',
          style: 'destructive',
          onPress: () => {
            setFlaggedItems((prev) =>
              prev.map((item) => (item.id === id ? { ...item, status: 'REJECTED' } : item))
            );
            showToast('Duty verification rejected', 'error');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Duty face checks</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            🚨 Flagged Duty Starts (&lt;70% Face Match or No Face Detected)
          </Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {flaggedItems.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              { backgroundColor: themeColors.surface, borderColor: item.status === 'PENDING_AUDIT' ? '#EF4444' : themeColors.border },
            ]}
          >
            {/* Alert Banner Header */}
            <View style={[styles.alertBanner, { backgroundColor: item.noFaceDetected ? '#EF4444' : '#F59E0B' }]}>
              <ShieldAlert size={18} color="#FFFFFF" />
              <Text style={styles.alertBannerText}>
                {item.noFaceDetected ? '🚨 NO FACE DETECTED IN SELFIE!' : `⚠️ LOW MATCH SCORE: ${item.matchScore}% (Below 70% Threshold)`}
              </Text>
            </View>

            {/* Driver Metadata */}
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[styles.driverName, { color: themeColors.text }]}>{item.driverName}</Text>
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>📞 {item.driverPhone} · 🚘 {item.vehicleNumber}</Text>
                </View>
                <Text style={{ fontSize: 12, color: themeColors.textMuted }}>{item.timestamp}</Text>
              </View>

              {/* Photos Comparison Grid */}
              <View style={styles.photosGrid}>
                <View style={styles.photoCol}>
                  <Text style={styles.photoLabel}>Duty Start Selfie</Text>
                  <Image source={{ uri: item.selfieUrl }} style={styles.photoImg} />
                </View>

                <View style={styles.photoCol}>
                  <Text style={styles.photoLabel}>Registered Profile</Text>
                  <Image source={{ uri: item.registeredPhotoUrl }} style={styles.photoImg} />
                </View>

                <View style={styles.photoCol}>
                  <Text style={styles.photoLabel}>Vehicle Front Photo</Text>
                  <Image source={{ uri: item.vehicleFrontPhotoUrl }} style={styles.photoImg} />
                </View>
              </View>

              {/* Status Action Buttons */}
              {item.status === 'PENDING_AUDIT' ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981', flex: 1 }]}
                    onPress={() => handleApprove(item.id)}
                  >
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Approve & Clear Duty</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#EF4444', flex: 1 }]}
                    onPress={() => handleReject(item.id)}
                  >
                    <XCircle size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Reject & Hold Duty</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.resolvedBadge, { backgroundColor: item.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: item.status === 'APPROVED' ? '#10B981' : '#EF4444' }}>
                    {item.status === 'APPROVED' ? '✓ MANUALLY APPROVED BY STAFF' : '✕ REJECTED & DUTY HELD'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
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
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 1 },
  card: {
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  alertBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  driverName: { fontSize: 16, fontWeight: '800' },
  photosGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  photoCol: {
    flex: 1,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
    textAlign: 'center',
  },
  photoImg: {
    width: '100%',
    height: 90,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  resolvedBadge: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 14,
  },
});
