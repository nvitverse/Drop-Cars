import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Sparkles, Clock, ShieldCheck, Zap, X, Wallet, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface TrustedPartnerPriorityModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  onSeeDetails: () => void;
  countdownText: string;
  amountNeeded?: number;
  onAddMoney?: () => void;
}

export default function TrustedPartnerPriorityModal({
  visible,
  onClose,
  onUpgrade,
  onSeeDetails,
  countdownText,
  amountNeeded = 0,
  onAddMoney,
}: TrustedPartnerPriorityModalProps) {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF' }]}>
                <Sparkles size={18} color="#6366F1" />
              </View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {t('This booking is for Trusted Partners first')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Live countdown timer pill */}
            <View style={[styles.timerPill, { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#F5F3FF', borderColor: isDarkMode ? '#6366F1' : '#C4B5FD' }]}>
              <Clock size={16} color="#6366F1" />
              <Text style={[styles.timerText, { color: isDarkMode ? '#C7D2FE' : '#4F46E5' }]}>
                {t('Opens for everyone in {0}', { 0: countdownText })}
              </Text>
            </View>

            {/* 3 benefit bullets */}
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={[styles.bulletDot, { backgroundColor: '#10B981' }]} />
                <Text style={[styles.bulletText, { color: colors.text }]}>
                  {t('Trusted Partners get first chance at new bookings')}
                </Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={[styles.bulletDot, { backgroundColor: '#6366F1' }]} />
                <Text style={[styles.bulletText, { color: colors.text }]}>
                  {t('Standard partners can accept this booking after the timer ends')}
                </Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={[styles.bulletDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.bulletText, { color: colors.text }]}>
                  {t('Upgrade once to get early access on all priority rides')}
                </Text>
              </View>
            </View>

            {/* Wallet balance nudge line (shown ONLY when wallet shortfall > 0) */}
            {amountNeeded > 0 && (
              <View style={[styles.walletNudgeBox, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB', borderColor: isDarkMode ? '#D97706' : '#FCD34D' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Wallet size={16} color="#D97706" />
                  <Text style={[styles.walletNudgeText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>
                    {t('Wallet needs ₹{0} to accept this booking', { 0: amountNeeded })}
                  </Text>
                </View>
                {onAddMoney && (
                  <TouchableOpacity
                    style={[styles.addMoneyBtn, { backgroundColor: '#D97706' }]}
                    onPress={onAddMoney}
                  >
                    <Text style={styles.addMoneyBtnText}>
                      {t('Add ₹{0} to wallet', { 0: amountNeeded })}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Two Action Buttons */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onUpgrade}
                activeOpacity={0.85}
              >
                <Sparkles size={16} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>
                  {t('Become a Trusted Partner')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                  {t('Wait')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* See booking details link */}
            <TouchableOpacity
              style={styles.detailsLink}
              onPress={() => {
                onClose();
                onSeeDetails();
              }}
            >
              <Text style={[styles.detailsLinkText, { color: colors.primary }]}>
                {t('See booking details')}
              </Text>
              <ChevronRight size={14} color={colors.primary} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    marginTop: 14,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  timerText: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  bulletList: {
    gap: 12,
    marginBottom: 16,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bulletText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    flex: 1,
    lineHeight: 18,
  },
  walletNudgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  walletNudgeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  addMoneyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addMoneyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  buttonGroup: {
    gap: 10,
    marginBottom: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  detailsLinkText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
  },
});
