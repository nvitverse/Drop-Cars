import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, IndianRupee, ShieldAlert, ArrowRight, Info, CheckCircle2, Clock } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { colors } from '@/theme/tokens';

export interface WithdrawModalProps {
  visible: boolean;
  walletBalance: number;
  minRetainedBalance?: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (amount: number, paymentMethod: string, details: string) => Promise<void>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  visible,
  walletBalance,
  minRetainedBalance = 500,
  loading = false,
  onClose,
  onSubmit,
}) => {
  const insets = useSafeAreaInsets();
  const maxRedeemable = Math.max(walletBalance - minRetainedBalance, 0);
  const [amountStr, setAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [upiId, setUpiId] = useState('');
  const [bankDetails, setBankDetails] = useState('');

  const handleQuickAmount = (amt: number) => {
    const validAmt = Math.min(amt, maxRedeemable);
    setAmountStr(String(validAmt));
  };

  const handleFormSubmit = async () => {
    const numAmt = parseFloat(amountStr);
    if (isNaN(numAmt) || numAmt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payout amount.');
      return;
    }

    if (numAmt > maxRedeemable) {
      Alert.alert(
        'Insufficient Redeemable Balance',
        `Maximum withdrawal allowed is ₹${maxRedeemable}. A minimum balance of ₹${minRetainedBalance} must stay in your wallet.`
      );
      return;
    }

    const details = paymentMethod === 'UPI' ? upiId : bankDetails;
    await onSubmit(numAmt, paymentMethod, details);
    setAmountStr('');
    setUpiId('');
    setBankDetails('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View>
              <AppText variant="subtitle" weight="bold">
                Request Payout (பணம் பெறுக)
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                Withdraw wallet balance directly to Bank / UPI
              </AppText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Balance Rule Banner */}
          <View style={styles.balanceRuleCard}>
            <View style={styles.ruleHeader}>
              <AppText variant="caption" weight="bold" color={colors.primary.main}>
                Available Wallet Balance: ₹{Math.round(walletBalance)}
              </AppText>
              <AppText variant="caption" weight="bold" color={colors.success.main}>
                Max Redeemable: ₹{Math.round(maxRedeemable)}
              </AppText>
            </View>
            <View style={styles.infoRow}>
              <Info size={13} color={colors.text.muted} />
              <AppText variant="caption" color={colors.text.secondary} style={{ flex: 1 }}>
                வால்லெட்டில் குறைந்தபட்சம் ₹{minRetainedBalance} இருப்பு வைக்கப்பட வேண்டும்.
              </AppText>
            </View>
          </View>

          {/* Quick Amount Selector */}
          {maxRedeemable > 0 && (
            <View style={styles.quickPillsRow}>
              {[500, 1000, 2000, maxRedeemable].map((preset, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.pill}
                  onPress={() => handleQuickAmount(preset)}
                >
                  <AppText variant="caption" weight="semibold" color={colors.primary.main}>
                    {preset === maxRedeemable ? 'Max' : `₹${preset}`}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Amount Input */}
          <View style={styles.inputGroup}>
            <AppText variant="label" weight="semibold">
              Payout Amount (தொகை)
            </AppText>
            <View style={styles.currencyInputRow}>
              <IndianRupee size={18} color={colors.text.primary} />
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="Enter amount (e.g. 1000)"
                placeholderTextColor={colors.text.muted}
                value={amountStr}
                onChangeText={setAmountStr}
              />
            </View>
          </View>

          {/* Method Selector */}
          <View style={styles.inputGroup}>
            <AppText variant="label" weight="semibold">
              Payout Method (செலுத்தும் முறை)
            </AppText>
            <View style={styles.methodSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.methodTab,
                  paymentMethod === 'UPI' && styles.methodTabActive,
                ]}
                onPress={() => setPaymentMethod('UPI')}
              >
                <AppText
                  variant="caption"
                  weight={paymentMethod === 'UPI' ? 'bold' : 'medium'}
                  color={paymentMethod === 'UPI' ? '#FFFFFF' : colors.text.secondary}
                >
                  UPI (GPay/PhonePe)
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodTab,
                  paymentMethod === 'BANK' && styles.methodTabActive,
                ]}
                onPress={() => setPaymentMethod('BANK')}
              >
                <AppText
                  variant="caption"
                  weight={paymentMethod === 'BANK' ? 'bold' : 'medium'}
                  color={paymentMethod === 'BANK' ? '#FFFFFF' : colors.text.secondary}
                >
                  Bank Transfer
                </AppText>
              </TouchableOpacity>
            </View>

            {paymentMethod === 'UPI' ? (
              <TextInput
                style={[styles.textInputFull, { marginTop: 8 }]}
                placeholder="Enter UPI ID (e.g. driver@upi / 9876543210@ybl)"
                placeholderTextColor={colors.text.muted}
                value={upiId}
                onChangeText={setUpiId}
              />
            ) : (
              <TextInput
                style={[styles.textInputFull, { marginTop: 8 }]}
                placeholder="Bank Name, A/C No, IFSC Code"
                placeholderTextColor={colors.text.muted}
                value={bankDetails}
                onChangeText={setBankDetails}
              />
            )}
          </View>

          {/* Process Explanation */}
          <View style={styles.fallbackNoticeBox}>
            <Clock size={14} color={colors.warning.main} />
            <AppText variant="caption" color={colors.warning.main} style={{ flex: 1 }}>
              உங்கள் கோரிக்கை பெறப்பட்டவுடன் நிர்வாகி (Admin) நேரடியாக சரிபார்த்து உங்கள் வங்கி கணக்கிற்கு அனுப்புவார்.
            </AppText>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (loading || maxRedeemable <= 0) && styles.submitButtonDisabled,
            ]}
            onPress={handleFormSubmit}
            disabled={loading || maxRedeemable <= 0}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <AppText variant="body" weight="bold" color="#FFFFFF">
                  Submit Payout Request
                </AppText>
                <ArrowRight size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  balanceRuleCard: {
    backgroundColor: colors.primary.subtle,
    borderRadius: 6,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  inputGroup: {
    gap: 6,
  },
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text.primary,
  },
  textInputFull: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
    backgroundColor: '#F8FAFC',
  },
  methodSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 2,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  methodTabActive: {
    backgroundColor: colors.primary.main,
  },
  fallbackNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: colors.warning.subtle,
    borderWidth: 1,
    borderColor: colors.warning.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary.main,
    paddingVertical: 14,
    borderRadius: 6,
    marginTop: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
});

export default WithdrawModal;
