import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Camera, Check, X, ShieldCheck } from 'lucide-react-native';
import Modal from '@/components/KeyboardSafe';
import { useTheme } from '@/hooks/useTheme';

interface DocumentCoachModalProps {
  visible: boolean;
  onProceed: () => void;
  onClose: () => void;
  documentTitle?: string;
}

export const DocumentCoachModal: React.FC<DocumentCoachModalProps> = ({
  visible,
  onProceed,
  onClose,
  documentTitle = 'Document',
}) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconBox}>
              <Camera size={20} color="#3B82F6" />
            </View>
            <View style={styles.headerTextBox}>
              <Text style={[styles.title, { color: colors.text }]}>
                How to take a good {documentTitle} photo
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Clear photos are approved within 30 minutes
              </Text>
            </View>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Dos and Don'ts */}
            <View style={styles.cardsRow}>
              {/* DO */}
              <View style={[styles.guideCard, { backgroundColor: '#10B98110', borderColor: '#10B98140' }]}>
                <View style={styles.guideBadgeSuccess}>
                  <Check size={14} color="#FFFFFF" />
                  <Text style={styles.guideBadgeTextSuccess}>DO THIS</Text>
                </View>
                <Text style={styles.guidePointText}>• Place original flat on table</Text>
                <Text style={styles.guidePointText}>• All 4 corners clearly visible</Text>
                <Text style={styles.guidePointText}>• Bright room lighting</Text>
                <Text style={styles.guidePointText}>• Numbers & dates easy to read</Text>
              </View>

              {/* DON'T */}
              <View style={[styles.guideCard, { backgroundColor: '#EF444410', borderColor: '#EF444440' }]}>
                <View style={styles.guideBadgeDanger}>
                  <X size={14} color="#FFFFFF" />
                  <Text style={styles.guideBadgeTextDanger}>AVOID THIS</Text>
                </View>
                <Text style={styles.guidePointText}>• No flash glare reflecting</Text>
                <Text style={styles.guidePointText}>• Do not cut off text or edges</Text>
                <Text style={styles.guidePointText}>• Avoid shaky/blurry camera</Text>
                <Text style={styles.guidePointText}>• Do not upload screen photos</Text>
              </View>
            </View>

            {/* Note */}
            <View style={[styles.noteBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <ShieldCheck size={16} color="#10B981" />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                Your documents are securely encrypted per Drop Cars privacy standards.
              </Text>
            </View>

            {/* Proceed Action */}
            <TouchableOpacity
              style={[styles.proceedBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                onClose();
                onProceed();
              }}
              activeOpacity={0.8}
            >
              <Camera size={18} color="#FFFFFF" />
              <Text style={styles.proceedBtnText}>Take Photo / Choose File</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
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
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F620',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBox: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  content: {
    flexGrow: 1,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  guideCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  guideBadgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  guideBadgeTextSuccess: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  guideBadgeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  guideBadgeTextDanger: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  guidePointText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
    lineHeight: 16,
    color: '#E2E8F0',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  noteText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  proceedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 8,
  },
  proceedBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});

export default DocumentCoachModal;
