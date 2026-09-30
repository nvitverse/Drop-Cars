import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { TrendingUp, X, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

import { increaseAllInclusiveFare } from '../services/vehicle/vehicleOwnerService';

interface IncreaseFareModalProps {
  visible: boolean;
  onClose: () => void;
  orderId: number;
  currentFare: number;
  onSuccess: (newFare: number) => void;
}

export const IncreaseFareModal: React.FC<IncreaseFareModalProps> = ({
  visible,
  onClose,
  orderId,
  currentFare,
  onSuccess,
}) => {
  const { colors, isDarkMode } = useTheme();
  const [newFareInput, setNewFareInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Default to current fare + 200
      const defaultSuggested = Math.ceil((currentFare + 200) / 50) * 50;
      setNewFareInput(String(defaultSuggested));
      setErrorMsg(null);
    }
  }, [visible, currentFare]);

  const parsedNewFare = parseInt(newFareInput.replace(/[^0-9]/g, ''), 10) || 0;
  const fareDiff = parsedNewFare - currentFare;

  const handleChipPress = (increment: number) => {
    const base = parsedNewFare > currentFare ? parsedNewFare : currentFare;
    setNewFareInput(String(base + increment));
    setErrorMsg(null);
  };

  const handleConfirm = async () => {
    if (parsedNewFare <= currentFare) {
      setErrorMsg(`New fare must be greater than current fare (₹${currentFare.toLocaleString()})`);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await increaseAllInclusiveFare(orderId, parsedNewFare);
      Alert.alert(
        'Fare Price Increased! ⚡',
        res.message || `Fare for Booking #${orderId} updated to ₹${parsedNewFare.toLocaleString()} and re-broadcasted to nearby drivers!`,
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess(parsedNewFare);
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to increase fare';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.titleBadge}>
                  <View style={[styles.iconBox, { backgroundColor: '#F59E0B20' }]}>
                    <TrendingUp size={20} color="#F59E0B" />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={[styles.title, { color: colors.text }]}>Increase Booking Fare</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                      Booking #{orderId} • All-Inclusive
                    </Text>
                  </View>
                </View>

                <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.border + '40' }]}>
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Current Fare Display */}
              <View style={[styles.currentFareBox, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC' }]}>
                <Text style={[styles.currentLabel, { color: colors.textSecondary }]}>Current Total Fare</Text>
                <Text style={[styles.currentVal, { color: colors.text }]}>₹{currentFare.toLocaleString()}</Text>
              </View>

              {/* Input section */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Enter New Total Fare (₹)</Text>
                <View style={[styles.inputWrapper, { borderColor: fareDiff > 0 ? '#10B981' : colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    keyboardType="number-pad"
                    value={newFareInput}
                    onChangeText={(txt) => {
                      setNewFareInput(txt);
                      setErrorMsg(null);
                    }}
                    placeholder="e.g. 2800"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                {fareDiff > 0 ? (
                  <View style={styles.diffBox}>
                    <Sparkles size={14} color="#10B981" />
                    <Text style={styles.diffText}>
                      Increases fare by <Text style={{ fontFamily: 'Inter-Bold' }}>+₹{fareDiff.toLocaleString()}</Text>
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Preset Chips */}
              <Text style={[styles.chipsLabel, { color: colors.textSecondary }]}>Quick Additions:</Text>
              <View style={styles.chipsRow}>
                {[100, 200, 500, 1000].map((inc) => (
                  <TouchableOpacity
                    key={inc}
                    style={[styles.chip, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
                    onPress={() => handleChipPress(inc)}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>+₹{inc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Error Message */}
              {errorMsg ? (
                <View style={styles.errorContainer}>
                  <AlertCircle size={14} color="#EF4444" />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: fareDiff > 0 ? '#F59E0B' : '#94A3B8' },
                  ]}
                  onPress={handleConfirm}
                  disabled={loading || fareDiff <= 0}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.submitBtnText}>Confirm & Re-Broadcast ⚡</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
  },
  subtitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentFareBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  currentLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
  },
  currentVal: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
  },
  inputSection: {
    marginBottom: 14,
  },
  inputLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 14,
    height: 48,
  },
  currencyPrefix: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    height: '100%',
  },
  diffBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  diffText: {
    color: '#10B981',
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
  chipsLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF444415',
    padding: 10,
    borderRadius: 6,
    marginBottom: 14,
  },
  errorText: {
    color: '#EF4444',
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  submitButton: {
    flex: 2,
    height: 46,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
});
