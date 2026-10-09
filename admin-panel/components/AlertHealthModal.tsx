import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X, CheckCircle2, AlertTriangle, XCircle, Bell, RefreshCw, Smartphone, Radio, PlayCircle, Settings } from 'lucide-react-native';
import { alertHealth, AlertHealthState } from '@/services/alertHealth';
import { triggerTestEnquiryAlarm } from '@/components/EnquiryAlarmHost';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { useTheme } from '@/context/ThemeContext';

interface AlertHealthModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AlertHealthModal({ visible, onClose }: AlertHealthModalProps) {
  const { isDark, themeColors } = useTheme();
  const [health, setHealth] = useState<AlertHealthState>(alertHealth.getSnapshot());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const unsub = alertHealth.subscribe((updated) => setHealth(updated));
    return unsub;
  }, [visible]);

  const handleRefreshPushToken = async () => {
    setRefreshing(true);
    try {
      await registerForPushNotificationsAsync();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTestAlarm = () => {
    triggerTestEnquiryAlarm();
    onClose();
  };

  const handleOpenSettings = () => {
    if (Platform.OS !== 'web') {
      Linking.openSettings().catch(() => {});
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Radio size={18} color={themeColors.primary} />
              <Text style={[styles.title, { color: themeColors.text }]}>Alert Health & Diagnostics</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* FCM Setup Advisory */}
            {!health.hasGoogleServices && (
              <View style={[styles.warningBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7', borderColor: '#F59E0B' }]}>
                <AlertTriangle size={18} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warningTitle, { color: '#B45309' }]}>Background Push Setup</Text>
                  <Text style={[styles.warningText, { color: '#92400E' }]}>
                    Push alerts while the app is closed require FCM configuration (google-services.json). Active foreground polling is working normally.
                  </Text>
                </View>
              </View>
            )}

            {/* Diagnostics Rows */}
            <View style={[styles.sectionBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              {/* Push Token */}
              <View style={styles.diagRow}>
                <View style={styles.diagLabelRow}>
                  {health.pushToken ? <CheckCircle2 size={16} color="#10B981" /> : <AlertTriangle size={16} color="#F59E0B" />}
                  <Text style={[styles.diagLabel, { color: themeColors.text }]}>Push Token</Text>
                </View>
                <Text style={[styles.diagValue, { color: health.pushToken ? '#10B981' : '#F59E0B' }]}>
                  {health.pushToken ? `${health.pushToken.slice(0, 14)}...` : health.pushTokenError || 'Not registered'}
                </Text>
              </View>

              {/* High Importance Channel */}
              <View style={styles.diagRow}>
                <View style={styles.diagLabelRow}>
                  {health.isChannelSetup ? <CheckCircle2 size={16} color="#10B981" /> : <XCircle size={16} color="#EF4444" />}
                  <Text style={[styles.diagLabel, { color: themeColors.text }]}>Alerts Channel (MAX)</Text>
                </View>
                <Text style={[styles.diagValue, { color: health.isChannelSetup ? '#10B981' : '#EF4444' }]}>
                  {health.isChannelSetup ? 'Configured' : 'Pending'}
                </Text>
              </View>

              {/* Polling status */}
              <View style={styles.diagRow}>
                <View style={styles.diagLabelRow}>
                  {health.lastPollError ? <AlertTriangle size={16} color="#EF4444" /> : <CheckCircle2 size={16} color="#10B981" />}
                  <Text style={[styles.diagLabel, { color: themeColors.text }]}>Last Lead Poll</Text>
                </View>
                <Text style={[styles.diagValue, { color: themeColors.textSecondary }]}>
                  {formatTime(health.lastPollTime)} ({health.lastPollCount} pending)
                </Text>
              </View>

              {health.lastPollError && (
                <View style={styles.errorSubRow}>
                  <Text style={styles.errorSubText}>{health.lastPollError}</Text>
                </View>
              )}

              {/* Effective Alarm Status */}
              <View style={[styles.diagRow, { borderBottomWidth: 0 }]}>
                <View style={styles.diagLabelRow}>
                  <Bell size={16} color={themeColors.primary} />
                  <Text style={[styles.diagLabel, { color: themeColors.text }]}>Alarm Schedule State</Text>
                </View>
                <Text style={[styles.diagValue, { color: health.effectiveAlarmStatus?.enabled_now !== false ? '#10B981' : '#F59E0B' }]}>
                  {health.effectiveAlarmStatus?.enabled_now !== false ? 'Active (Alerts Enabled)' : 'Silent Window (Schedule)'}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsBox}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: themeColors.primary }]} onPress={handleTestAlarm}>
                <PlayCircle size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Test Alarm Now (5s Verification)</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                  onPress={handleRefreshPushToken}
                  disabled={refreshing}
                >
                  {refreshing ? <ActivityIndicator size="small" color={themeColors.text} /> : <RefreshCw size={14} color={themeColors.text} />}
                  <Text style={[styles.secondaryBtnText, { color: themeColors.text }]}>Re-register Push</Text>
                </TouchableOpacity>

                {Platform.OS !== 'web' && (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                    onPress={handleOpenSettings}
                  >
                    <Settings size={14} color={themeColors.text} />
                    <Text style={[styles.secondaryBtnText, { color: themeColors.text }]}>App Settings</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 16,
  },
  sectionBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(156, 163, 175, 0.15)',
  },
  diagLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  diagLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  diagValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  errorSubRow: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 4,
    marginBottom: 6,
  },
  errorSubText: {
    color: '#EF4444',
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionsBox: {
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});
