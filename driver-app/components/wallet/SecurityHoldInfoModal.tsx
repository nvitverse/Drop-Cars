import React from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { X, ShieldCheck, CheckCircle2, Clock, AlertTriangle, IndianRupee } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';

export interface SecurityHoldInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SecurityHoldInfoModal: React.FC<SecurityHoldInfoModalProps> = ({ visible, onClose }) => {
  const { colors, isDarkMode } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
          {/* HEADER */}
          <View style={[styles.header, { borderBottomColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.iconCircle}>
                <ShieldCheck size={20} color="#0EA5E9" />
              </View>
              <View>
                <AppText style={[styles.title, { color: colors.text }]}>Security Hold & Rules</AppText>
                <AppText style={styles.subtitle}>வாலட் பாதுகாப்பு வைப்புத்தொகை & விதிகள்</AppText>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* BODY CONTENT */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Rule 1: Why ₹500 hold */}
            <View style={[styles.ruleCard, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.ruleHeader}>
                <IndianRupee size={16} color="#0EA5E9" />
                <AppText style={[styles.ruleTitle, { color: colors.text }]}>₹500 Security Hold (பாதுகாப்பு வைப்பு)</AppText>
              </View>
              <AppText style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                ஒவ்வொரு சவாரியையும் நீங்கள் ஏற்கும் போது, சவாரி நம்பகத்தன்மையை உறுதி செய்ய ₹500 மட்டும் உங்கள் வாலட்டில் தற்காலிகமாக ஹோல்டு செய்யப்படும்.
              </AppText>
            </View>

            {/* Rule 2: Instant Release */}
            <View style={[styles.ruleCard, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.ruleHeader}>
                <CheckCircle2 size={16} color="#10B981" />
                <AppText style={[styles.ruleTitle, { color: colors.text }]}>Instant Release (உடனடி விடுவிப்பு)</AppText>
              </View>
              <AppText style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                சவாரி முடிவில் வாடிக்கையாளரிடம் End OTP பெற்று சரிபார்த்த அடுத்த வினாடியே, ஹோல்டு செய்யப்பட்ட ₹500 உங்கள் Available Balance-க்கு உடனடியாக திரும்பிவிடும்.
              </AppText>
            </View>

            {/* Rule 3: 10-Second Free Decline */}
            <View style={[styles.ruleCard, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.ruleHeader}>
                <Clock size={16} color="#3B82F6" />
                <AppText style={[styles.ruleTitle, { color: colors.text }]}>10-Second HUD Decline (₹0 இலவசம்)</AppText>
              </View>
              <AppText style={[styles.ruleDesc, { color: colors.textSecondary }]}>
                புதிய சவாரி வரும் போது திரையில் தோன்றும் 10 வினாடி கவுண்டவுனில் நீங்கள் Decline செய்தால் எந்த அபராதமும் கிடையாது (100% Free).
              </AppText>
            </View>

            {/* Rule 4: Post-assignment Cancellation */}
            <View style={[styles.ruleCard, { backgroundColor: isDarkMode ? '#451A1A' : '#FEF2F2', borderColor: isDarkMode ? '#7F1D1D' : '#FCA5A5' }]}>
              <View style={styles.ruleHeader}>
                <AlertTriangle size={16} color="#EF4444" />
                <AppText style={[styles.ruleTitle, { color: '#EF4444' }]}>Assignment-க்கு பின் ரத்து (₹500 Penalty)</AppText>
              </View>
              <AppText style={[styles.ruleDesc, { color: isDarkMode ? '#FCA5A5' : '#B91C1C' }]}>
                சவாரியை உறுதிசெய்து கார் மற்றும் டிரைவர் Assign ஆன பிறகு நீங்கள் ரத்து செய்தால், மாற்று வாகனம் ஏற்பாடு செய்ய ₹500 கட்டணம் பிடித்தம் செய்யப்படும்.
              </AppText>
            </View>
          </ScrollView>

          {/* FOOTER DISMISS */}
          <View style={[styles.footer, { borderTopColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.85}>
              <AppText style={styles.dismissBtnText}>புரிந்தது / Got It</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Inter-Medium',
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    padding: 16,
  },
  ruleCard: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  ruleTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  ruleDesc: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
  },
  dismissBtn: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
});

export default SecurityHoldInfoModal;
