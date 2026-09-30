import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import { IndianRupee, AlertTriangle, CheckCircle, XCircle } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

interface AutoDeductionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deductionData: {
    amount: number;
    description: string;
    type: 'trip_payment' | 'commission' | 'payout' | 'other';
    metadata?: Record<string, any>;
  };
}

export default function AutoDeductionModal({ 
  visible, 
  onClose, 
  onSuccess, 
  deductionData 
}: AutoDeductionModalProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { balance, deductMoney } = useWallet();
  const [processing, setProcessing] = useState(false);

  const handleDeduction = async () => {
    if (balance < deductionData.amount) {
      Alert.alert(
        t('autoDeductionModal.insufficientBalanceTitle'),
        t('autoDeductionModal.insufficientBalanceBody', { balance, amount: deductionData.amount }),
        [
          { text: t('autoDeductionModal.addMoney'), onPress: () => onClose() },
          { text: t('autoDeductionModal.cancel'), style: 'cancel' }
        ]
      );
      return;
    }

    try {
      setProcessing(true);
      
      console.log('💸 Processing auto-deduction:', deductionData);
      
      await deductMoney(
        deductionData.amount,
        deductionData.description,
        deductionData.metadata
      );

      Alert.alert(
        t('autoDeductionModal.deductionSuccessfulTitle'),
        t('autoDeductionModal.deductionSuccessfulBody', { amount: deductionData.amount, newBalance: balance - deductionData.amount }),
        [
          {
            text: t('autoDeductionModal.ok'),
            onPress: () => {
              onSuccess();
              onClose();
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('❌ Auto-deduction failed:', error);

      Alert.alert(
        t('autoDeductionModal.deductionFailedTitle'),
        error.message || t('autoDeductionModal.deductionFailedGeneric'),
        [{ text: t('autoDeductionModal.ok') }]
      );
    } finally {
      setProcessing(false);
    }
  };

  const getDeductionIcon = () => {
    switch (deductionData.type) {
      case 'trip_payment':
        return <IndianRupee color={colors.primary} size={24} />;
      case 'commission':
        return <AlertTriangle color={colors.warning} size={24} />;
      case 'payout':
        return <CheckCircle color={colors.success} size={24} />;
      default:
        return <XCircle color={colors.error} size={24} />;
    }
  };

  const getDeductionColor = () => {
    switch (deductionData.type) {
      case 'trip_payment':
        return colors.primary;
      case 'commission':
        return colors.warning;
      case 'payout':
        return colors.success;
      default:
        return colors.error;
    }
  };

  const dynamicStyles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      margin: 20,
      maxWidth: 400,
      width: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    header: {
      alignItems: 'center',
      marginBottom: 24,
    },
    iconContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: `${getDeductionColor()}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    detailsContainer: {
      backgroundColor: colors.background,
      borderRadius: 6,
      padding: 16,
      marginBottom: 24,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    detailLabel: {
      fontSize: 14,
      flexShrink: 0,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: 14,
      flex: 1,
      textAlign: 'right',
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    amountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    amountLabel: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    amountValue: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: getDeductionColor(),
    },
    balanceInfo: {
      backgroundColor: `${colors.primary}10`,
      borderRadius: 6,
      padding: 12,
      marginBottom: 24,
    },
    balanceText: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.primary,
      textAlign: 'center',
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 8,
      minHeight: 48,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
    },
    confirmButton: {
      flex: 1,
      backgroundColor: getDeductionColor(),
      borderRadius: 8,
      minHeight: 48,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButtonText: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: '#FFFFFF',
    },
    loadingButton: {
      opacity: 0.7,
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={dynamicStyles.modalOverlay}>
        <View style={dynamicStyles.modalContent}>
          <View style={dynamicStyles.header}>
            <View style={dynamicStyles.iconContainer}>
              {getDeductionIcon()}
            </View>
            <Text style={dynamicStyles.title}>{t('autoDeductionModal.title')}</Text>
            <Text style={dynamicStyles.subtitle}>
              {t('autoDeductionModal.subtitle')}
            </Text>
          </View>

          <View style={dynamicStyles.detailsContainer}>
            <View style={dynamicStyles.detailRow}>
              <Text style={dynamicStyles.detailLabel}>{t('autoDeductionModal.type')}</Text>
              <Text style={dynamicStyles.detailValue}>
                {deductionData.type.replace('_', ' ').toUpperCase()}
              </Text>
            </View>

            <View style={dynamicStyles.detailRow}>
              <Text style={dynamicStyles.detailLabel}>{t('autoDeductionModal.description')}</Text>
              <Text style={dynamicStyles.detailValue}>
                {deductionData.description}
              </Text>
            </View>

            {deductionData.metadata && Object.keys(deductionData.metadata).length > 0 && (
              <View style={dynamicStyles.detailRow}>
                <Text style={dynamicStyles.detailLabel}>{t('autoDeductionModal.details')}</Text>
                <Text style={dynamicStyles.detailValue}>
                  {Object.entries(deductionData.metadata)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')}
                </Text>
              </View>
            )}

            <View style={dynamicStyles.amountRow}>
              <Text style={dynamicStyles.amountLabel}>{t('autoDeductionModal.amount')}</Text>
              <Text style={dynamicStyles.amountValue}>₹{deductionData.amount}</Text>
            </View>
          </View>

          <View style={dynamicStyles.balanceInfo}>
            <Text style={dynamicStyles.balanceText}>
              {t('autoDeductionModal.balanceInfo', { balance, after: balance - deductionData.amount })}
            </Text>
          </View>

          <View style={dynamicStyles.buttonContainer}>
            <TouchableOpacity
              style={dynamicStyles.cancelButton}
              onPress={onClose}
              disabled={processing}
            >
              <Text style={dynamicStyles.cancelButtonText}>{t('autoDeductionModal.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                dynamicStyles.confirmButton,
                processing && dynamicStyles.loadingButton
              ]}
              onPress={handleDeduction}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={dynamicStyles.confirmButtonText}>{t('autoDeductionModal.confirm')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
