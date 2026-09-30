import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Info, X, CheckCircle2, HelpCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

interface PageInfoModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  description: string;
  workflowSteps?: string[];
  tips?: string[];
  onClose: () => void;
}

export default function PageInfoModal({
  visible,
  title,
  subtitle,
  description,
  workflowSteps = [],
  tips = [],
  onClose,
}: PageInfoModalProps) {
  const { themeColors } = useTheme();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.iconCircle, { backgroundColor: themeColors.primary + '1F' }]}>
                <Info size={22} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>{title}</Text>

              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: themeColors.background }]}>
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Main Overview */}
            <View style={[styles.sectionBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>📌 Overview & Purpose</Text>
              <Text style={[styles.descriptionText, { color: themeColors.textSecondary }]}>{description}</Text>
            </View>

            {/* How it Works / Workflow Steps */}
            {workflowSteps.length > 0 && (
              <View style={[styles.sectionBox, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginTop: 12 }]}>
                <Text style={[styles.sectionHeading, { color: themeColors.text }]}>⚡ How It Works</Text>
                {workflowSteps.map((step, idx) => (
                  <View key={idx} style={styles.stepRow}>
                    <View style={[styles.stepBadge, { backgroundColor: themeColors.primary }]}>
                      <Text style={styles.stepNumber}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: themeColors.text }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Key Tips / Important Notes */}
            {tips.length > 0 && (
              <View style={[styles.sectionBox, { backgroundColor: themeColors.primary + '0D', borderColor: themeColors.primary + '33', marginTop: 12 }]}>
                <Text style={[styles.sectionHeading, { color: themeColors.primary }]}>💡 Pro Tips & Key Info</Text>
                {tips.map((tip, idx) => (
                  <View key={idx} style={styles.tipRow}>
                    <CheckCircle2 size={16} color={themeColors.primary} style={{ marginTop: 2 }} />
                    <Text style={[styles.tipText, { color: themeColors.text }]}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer Action Button */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity style={[styles.doneButton, { backgroundColor: themeColors.primary }]} onPress={onClose}>
              <Text style={styles.doneButtonText}>Got It</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 18,
  },
  sectionBox: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumber: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  stepText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    flex: 1,
    lineHeight: 18,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  tipText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  doneButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
});
