import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  PhoneCall,
  MessageCircle,
  ArrowRight,
} from 'lucide-react-native';
import Modal from '@/components/KeyboardSafe';
import { useTheme } from '@/hooks/useTheme';
import { HelpEntry, HelpContext } from '@/help/types';

interface HelpSheetProps {
  visible: boolean;
  onClose: () => void;
  entry?: HelpEntry | null;
  context?: HelpContext;
  supportPhone?: string;
  supportWhatsApp?: string;
}

export const HelpSheet: React.FC<HelpSheetProps> = ({
  visible,
  onClose,
  entry,
  context,
  supportPhone = '+917200217986',
  supportWhatsApp = '+917200217986',
}) => {
  const { colors } = useTheme();
  const router = useRouter();

  if (!entry) return null;

  const severity = entry.severity || 'info';

  const handleCall = () => {
    const cleanPhone = supportPhone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    const cleanPhone = supportWhatsApp.replace(/[^0-9]/g, '');
    const screen = context?.screen || 'Customer Screen';
    const code = entry.code || context?.code || 'HELP';
    const booking = context?.bookingId ? ` Booking: #${context.bookingId}` : '';
    const text = encodeURIComponent(
      `Hello Drop Cars Support,\n\nI need help with:\n- Screen: ${screen}\n- Reference: ${code}${booking}\n\nPlease guide me.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${text}`).catch(() => {});
  };

  const handleAction = () => {
    onClose();
    if (entry.action?.onPress) {
      entry.action.onPress();
    } else if (entry.action?.route) {
      router.push(entry.action.route as any);
    }
  };

  const getSeverityBadge = () => {
    switch (severity) {
      case 'blocking':
        return {
          bg: '#FEE2E2',
          border: '#F87171',
          text: '#DC2626',
          icon: <AlertCircle size={22} color="#DC2626" />,
          label: 'Notice',
        };
      case 'warning':
        return {
          bg: '#FEF3C7',
          border: '#FBBF24',
          text: '#D97706',
          icon: <AlertTriangle size={22} color="#D97706" />,
          label: 'Update',
        };
      case 'info':
      default:
        return {
          bg: '#E0F2FE',
          border: '#38BDF8',
          text: '#0284C7',
          icon: <Info size={22} color="#0284C7" />,
          label: 'Help & Information',
        };
    }
  };

  const badge = getSeverityBadge();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.badgeContainer, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                {badge.icon}
                <Text style={[styles.badgeText, { color: badge.text }]}>
                  {badge.label}
                </Text>
              </View>
              {entry.code ? (
                <Text style={[styles.codeText, { color: colors.textSecondary }]}>
                  {entry.code}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.background }]}
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Title */}
            <Text style={[styles.title, { color: colors.text }]}>
              {entry.title}
            </Text>

            {/* What Happened */}
            <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                DETAILS
              </Text>
              <Text style={[styles.sectionBody, { color: colors.text }]}>
                {entry.what}
              </Text>
            </View>

            {/* Why */}
            {entry.why ? (
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                  WHAT IT MEANS
                </Text>
                <Text style={[styles.sectionBody, { color: colors.text }]}>
                  {entry.why}
                </Text>
              </View>
            ) : null}

            {/* Next Steps */}
            {entry.steps && entry.steps.length > 0 ? (
              <View style={styles.stepsWrapper}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary, marginBottom: 8 }]}>
                  NEXT STEPS
                </Text>
                {entry.steps.slice(0, 4).map((step, index) => {
                  const desc = typeof step === 'string' ? step : step.description;
                  const stepTitle = typeof step === 'object' && step.title ? step.title : null;
                  return (
                    <View key={index} style={styles.stepRow}>
                      <View style={[styles.stepNumberBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.stepNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.stepTextContainer}>
                        {stepTitle ? (
                          <Text style={[styles.stepTitleText, { color: colors.text }]}>
                            {stepTitle}
                          </Text>
                        ) : null}
                        <Text style={[styles.stepDescText, { color: colors.text }]}>
                          {desc}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Main Action Button */}
            {entry.action ? (
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                onPress={handleAction}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryActionText}>{entry.action.label}</Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}

            {/* Support */}
            {entry.contact !== false ? (
              <View style={styles.supportSection}>
                <Text style={[styles.supportTitle, { color: colors.textSecondary }]}>
                  Need assistance? Our support desk is 24x7:
                </Text>
                <View style={styles.supportButtonsRow}>
                  <TouchableOpacity
                    style={[styles.supportBtn, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}
                    onPress={handleCall}
                    activeOpacity={0.7}
                  >
                    <PhoneCall size={17} color="#10B981" />
                    <Text style={[styles.supportBtnText, { color: '#059669' }]}>
                      Call Support
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.supportBtn, { backgroundColor: '#25D36615', borderColor: '#25D36640' }]}
                    onPress={handleWhatsApp}
                    activeOpacity={0.7}
                  >
                    <MessageCircle size={17} color="#25D366" />
                    <Text style={[styles.supportBtnText, { color: '#16A34A' }]}>
                      WhatsApp
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'android' ? 24 : 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  codeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    lineHeight: 24,
    marginBottom: 14,
  },
  sectionBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  stepsWrapper: {
    marginTop: 4,
    marginBottom: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  stepNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitleText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  stepDescText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  supportSection: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F030',
  },
  supportTitle: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  supportButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  supportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  supportBtnText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
  },
});

export default HelpSheet;
