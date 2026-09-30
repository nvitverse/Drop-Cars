import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Trash2, AlertTriangle, X, ShieldAlert } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

interface PermanentDeleteBookingModalProps {
  visible: boolean;
  orderId: number | string | null;
  customerName?: string;
  routeText?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PermanentDeleteBookingModal({
  visible,
  orderId,
  customerName,
  routeText,
  onClose,
  onSuccess,
}: PermanentDeleteBookingModalProps) {
  const { isDark, themeColors } = useTheme();
  const [confirmInput, setConfirmInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmMoney, setConfirmMoney] = useState(false);

  if (!visible || !orderId) return null;

  const targetIdStr = String(orderId).trim();
  const isMatch = confirmInput.trim() === targetIdStr;

  const handleDelete = async () => {
    if (!isMatch) {
      Alert.alert('Verification Required', `Please type "${targetIdStr}" to confirm irreversible deletion.`);
      return;
    }

    try {
      setLoading(true);
      await apiService.permanentlyDeleteBooking(orderId, confirmMoney);
      Alert.alert('Deleted', `Booking #${orderId} has been permanently deleted.`);
      setConfirmInput('');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.message?.includes('HAS_MONEY') || err?.status === 409) {
        Alert.alert(
          'Wallet Ledger Exists',
          `This booking has existing financial transactions in the ledger. Do you want to permanently delete the booking record while keeping the ledger history?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete Anyway',
              style: 'destructive',
              onPress: async () => {
                try {
                  setLoading(true);
                  await apiService.permanentlyDeleteBooking(orderId, true);
                  Alert.alert('Deleted', `Booking #${orderId} permanently deleted.`);
                  setConfirmInput('');
                  onSuccess();
                  onClose();
                } catch (e: any) {
                  Alert.alert('Delete Failed', e?.message || 'Could not delete booking');
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Delete Failed', err?.message || 'Could not delete booking');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: '#EF4444',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={20} color="#EF4444" />
              <Text style={styles.title}>Permanent Delete (Owner Only)</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <View style={styles.warningBox}>
              <AlertTriangle size={16} color="#DC2626" />
              <Text style={styles.warningText}>
                This action is IRREVERSIBLE. It will delete all assignment logs, trip messages, reviews, and booking records for Booking #{orderId}.
              </Text>
            </View>

            {customerName && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Customer:</Text>
                <Text style={[styles.infoValue, { color: themeColors.text }]}>{customerName}</Text>
              </View>
            )}

            {routeText && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Route:</Text>
                <Text style={[styles.infoValue, { color: themeColors.text }]}>{routeText}</Text>
              </View>
            )}

            <View style={{ marginTop: 8 }}>
              <Text style={[styles.confirmPrompt, { color: themeColors.text }]}>
                Type <Text style={{ fontWeight: '900', color: '#EF4444' }}>{targetIdStr}</Text> to confirm deletion:
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: themeColors.text,
                    borderColor: isMatch ? '#EF4444' : isDark ? '#334155' : '#CBD5E1',
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  },
                ]}
                placeholder={`Type ${targetIdStr}`}
                placeholderTextColor={themeColors.textSecondary}
                value={confirmInput}
                onChangeText={setConfirmInput}
                autoCapitalize="none"
              />
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  {
                    backgroundColor: isMatch ? '#EF4444' : '#94A3B8',
                    opacity: isMatch && !loading ? 1 : 0.6,
                  },
                ]}
                onPress={handleDelete}
                disabled={!isMatch || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Trash2 size={16} color="#FFFFFF" />
                    <Text style={styles.deleteBtnText}>Permanent Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.2)',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  body: {
    padding: 14,
    gap: 10,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    lineHeight: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  confirmPrompt: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deleteBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
