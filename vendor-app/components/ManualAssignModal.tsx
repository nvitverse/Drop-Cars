import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { UserCheck, X, Clipboard as ClipboardIcon, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react-native';
import api from '../app/api/api';

interface ManualAssignModalProps {
  visible: boolean;
  onClose: () => void;
  orderId: number | string | null;
  onSuccess?: () => void;
}

export default function ManualAssignModal({
  visible,
  onClose,
  orderId,
  onSuccess,
}: ManualAssignModalProps) {
  const [targetId, setTargetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [insufficientData, setInsufficientData] = useState<{
    wallet_balance: number;
    required_amount: number;
    message: string;
  } | null>(null);

  if (!visible || !orderId) return null;

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        setTargetId(text.trim());
      }
    } catch {
      // ignore
    }
  };

  const handleAssign = async (forceCredit: boolean = false) => {
    if (!targetId.trim()) {
      Alert.alert('Error', 'Please enter or paste a Fleet Owner or Driver ID');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/orders/${orderId}/manual-assign`, {
        target_id: targetId.trim(),
        force_credit: forceCredit,
      });

      const data = response.data;
      if (data.status === 'INSUFFICIENT_BALANCE') {
        setInsufficientData({
          wallet_balance: data.wallet_balance || 0,
          required_amount: data.required_amount || 0,
          message: data.message || 'Driver wallet balance is low.',
        });
        setShowCreditWarning(true);
      } else if (data.status === 'SUCCESS') {
        setShowCreditWarning(false);
        setInsufficientData(null);
        Alert.alert('Booking Assigned!', data.message || `Booking ID #${orderId} assigned successfully.`);
        onClose();
        if (onSuccess) onSuccess();
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || error.message || 'Failed to assign booking';
      Alert.alert('Assignment Failed', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowCreditWarning(false);
    setInsufficientData(null);
    setTargetId('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.container}>
          <View style={styles.dragHandle} />
          
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <UserCheck size={22} color="#1D4ED8" />
              <Text style={styles.title}>Manual Driver Assignment</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Assign Booking #{orderId} directly to a specific driver or fleet owner by ID.
          </Text>

          {/* If credit warning triggered */}
          {showCreditWarning && insufficientData ? (
            <View style={styles.warningCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ShieldAlert size={22} color="#DC2626" />
                <Text style={styles.warningTitle}>Wallet Balance is Low</Text>
              </View>
              <Text style={styles.warningText}>
                {insufficientData.message}
              </Text>

              <View style={styles.balanceInfoBox}>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Current Wallet Balance:</Text>
                  <Text style={styles.balanceValueRed}>₹{insufficientData.wallet_balance}</Text>
                </View>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Required Commission Hold:</Text>
                  <Text style={styles.balanceValue}>₹{insufficientData.required_amount}</Text>
                </View>
              </View>

              <Text style={styles.creditPromptText}>
                Would you like to continue with credit? The amount will be deducted into their wallet balance (recorded as a negative/minus balance).
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowCreditWarning(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.creditBtn}
                  onPress={() => handleAssign(true)}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.creditBtnText}>Continue with Credit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Normal ID Input State */
            <View style={{ marginTop: 12 }}>
              <Text style={styles.inputLabel}>Enter / Paste Driver ID or Fleet Owner ID *</Text>
              
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. VO-10023 or Phone"
                  value={targetId}
                  onChangeText={setTargetId}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
                  <ClipboardIcon size={16} color="#1D4ED8" />
                  <Text style={styles.pasteBtnText}>Paste ID</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.assignSubmitBtn, loading && { opacity: 0.7 }]}
                onPress={() => handleAssign(false)}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <UserCheck size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.assignSubmitText}>Directly Assign Booking</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#0F172A',
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
  },
  pasteBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#1D4ED8',
  },
  assignSubmitBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  assignSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 16,
    marginTop: 10,
  },
  warningTitle: {
    fontSize: 15.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#991B1B',
  },
  warningText: {
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
    marginBottom: 10,
  },
  balanceInfoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12.5,
    color: '#475569',
  },
  balanceValueRed: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#DC2626',
  },
  balanceValue: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  creditPromptText: {
    fontSize: 12.5,
    color: '#7F1D1D',
    lineHeight: 17,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#475569',
  },
  creditBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
