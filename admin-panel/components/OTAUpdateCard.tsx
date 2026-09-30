import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  DownloadCloud,
  Zap,
  Smartphone,
} from 'lucide-react-native';
import { checkOTAUpdate, fetchAndApplyOTAUpdate, getActiveUpdateInfo } from '@/utils/otaUpdates';
import { useTheme } from '@/context/ThemeContext';

export default function OTAUpdateCard() {
  const { themeColors, isDark } = useTheme();
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeInfo = getActiveUpdateInfo();

  const handleCheckUpdate = async () => {
    setChecking(true);
    setStatusMessage(null);
    try {
      const res = await checkOTAUpdate();
      setStatusMessage(res.message);
      if (res.isAvailable) {
        setUpdateAvailable(true);
      } else {
        setUpdateAvailable(false);
        if (Platform.OS !== 'web' && !__DEV__) {
          Alert.alert('Up to Date! 🎉', 'You are currently running the latest live version of Drop Cars Admin.');
        }
      }
    } catch (e: any) {
      setStatusMessage(e?.message || 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    setDownloading(true);
    try {
      const res = await fetchAndApplyOTAUpdate();
      if (!res.success) {
        Alert.alert('Update Notice', res.message);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to download update');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>
          <Zap size={18} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>Live OTA Updates</Text>
          <Text style={[styles.cardSubtitle, { color: themeColors.textSecondary }]}>
            Zero-build instant app updates over the cloud
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>Active</Text>
        </View>
      </View>

      <View style={[styles.infoBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Runtime Version:</Text>
          <Text style={[styles.infoValue, { color: themeColors.text }]}>{activeInfo.runtimeVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Update Channel:</Text>
          <Text style={[styles.infoValue, { color: '#2563EB', fontWeight: '700' }]}>{activeInfo.channel}</Text>
        </View>
      </View>

      {statusMessage && (
        <View style={[styles.statusMsgBox, { backgroundColor: updateAvailable ? '#FEF3C7' : isDark ? '#064E3B' : '#ECFDF5' }]}>
          <Text style={[styles.statusMsgText, { color: updateAvailable ? '#B45309' : '#059669' }]}>
            {statusMessage}
          </Text>
        </View>
      )}

      {updateAvailable ? (
        <TouchableOpacity
          style={[styles.applyBtn, downloading && { opacity: 0.7 }]}
          onPress={handleApplyUpdate}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <DownloadCloud size={16} color="#FFFFFF" />
              <Text style={styles.applyBtnText}>Install Live Update & Reload App</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.checkBtn, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }, checking && { opacity: 0.6 }]}
          onPress={handleCheckUpdate}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <>
              <RefreshCw size={15} color="#2563EB" />
              <Text style={[styles.checkBtnText, { color: '#2563EB' }]}>Check for Live Updates</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  infoBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusMsgBox: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusMsgText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  checkBtn: {
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
