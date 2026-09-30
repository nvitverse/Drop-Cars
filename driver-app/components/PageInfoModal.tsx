import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Info, X, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface PageInfoModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  description: string;
  workflowSteps?: string[];
  tips?: string[];
  pipelineText?: string;
  onClose: () => void;
}

export default function PageInfoModal({
  visible,
  title,
  subtitle,
  description,
  workflowSteps = [],
  tips = [],
  pipelineText,
  onClose,
}: PageInfoModalProps) {
  const { colors, isDarkMode } = useTheme();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primary + '1F' }]}>
                <Info size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
                {subtitle ? <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.background }]}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Main Overview */}
            <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>📌 Overview & Purpose</Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{description}</Text>
            </View>

            {/* How it Works / Workflow Steps */}
            {workflowSteps.length > 0 && (
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 12 }]}>
                <Text style={[styles.sectionHeading, { color: colors.text }]}>⚡ How It Works & Booking Pipeline</Text>

                {/* Pipeline visual strip */}
                <View style={{
                  backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                  borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
                  borderWidth: 1,
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 12,
                }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: isDarkMode ? '#34D399' : '#047857' }}>
                    {pipelineText || '🔄 Pipeline: 1. Bid ➔ 2. Customer Accepts ➔ 3. Auto-Converted to Booking'}
                  </Text>
                </View>

                {workflowSteps.map((step, idx) => (
                  <View key={idx} style={styles.stepRow}>
                    <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.stepNumber}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Key Tips / Important Notes */}
            {tips.length > 0 && (
              <View style={[styles.sectionBox, { backgroundColor: colors.primary + '0D', borderColor: colors.primary + '33', marginTop: 12 }]}>
                <Text style={[styles.sectionHeading, { color: colors.primary }]}>💡 Pro Tips & Key Info</Text>
                {tips.map((tip, idx) => (
                  <View key={idx} style={styles.tipRow}>
                    <CheckCircle2 size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    <Text style={[styles.tipText, { color: colors.text }]}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer Action Button */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.doneButton, { backgroundColor: colors.primary }]} onPress={onClose}>
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
    borderRadius: 20,
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
