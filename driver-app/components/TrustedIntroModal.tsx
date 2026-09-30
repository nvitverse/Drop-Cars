import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Crown, Sparkles, CheckCircle2, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface TrustedIntroModalProps {
  visible: boolean;
  onClose: () => void;
  onSeePlans: () => void;
}

export default function TrustedIntroModal({
  visible,
  onClose,
  onSeePlans,
}: TrustedIntroModalProps) {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Top Icon Banner */}
          <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7' }]}>
            <Crown size={28} color="#F59E0B" />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {t('Get bookings first — become a Trusted Partner')}
          </Text>

          {/* 3 tiny benefit lines */}
          <View style={styles.benefitList}>
            <View style={styles.benefitRow}>
              <CheckCircle2 size={16} color="#10B981" style={{ marginTop: 1 }} />
              <Text style={[styles.benefitText, { color: colors.text }]}>
                {t('First chance at new bookings before standard release')}
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <CheckCircle2 size={16} color="#10B981" style={{ marginTop: 1 }} />
              <Text style={[styles.benefitText, { color: colors.text }]}>
                {t('Higher earnings with priority dispatch across your fleet')}
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <CheckCircle2 size={16} color="#10B981" style={{ marginTop: 1 }} />
              <Text style={[styles.benefitText, { color: colors.text }]}>
                {t('Verified Trusted Partner badge on your profile')}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonCol}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={onSeePlans}
              activeOpacity={0.85}
            >
              <Sparkles size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                {t('See plans')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.ghostBtnText, { color: colors.textSecondary }]}>
                {t('Maybe later')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 2,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  benefitList: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  benefitText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    flex: 1,
    lineHeight: 18,
  },
  buttonCol: {
    width: '100%',
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  ghostBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    width: '100%',
  },
  ghostBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
