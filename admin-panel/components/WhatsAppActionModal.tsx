import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  Platform,
} from 'react-native';
import {
  X,
  Send,
  Copy,
  CheckCircle2,
  Car,
  Calculator,
  Receipt,
  Star,
  Check,
} from 'lucide-react-native';
import {
  WhatsAppTemplateData,
  TemplateType,
  TEMPLATE_METADATA,
  buildWhatsAppMessage,
  sendWhatsAppMessage,
} from '@/utils/whatsappTemplates';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface WhatsAppActionModalProps {
  visible: boolean;
  onClose: () => void;
  data: WhatsAppTemplateData;
  initialType?: TemplateType;
}

export default function WhatsAppActionModal({
  visible,
  onClose,
  data,
  initialType = 'booking_confirmed',
}: WhatsAppActionModalProps) {
  const { themeColors, isDark } = useTheme();
  const [selectedType, setSelectedType] = useState<TemplateType>(initialType);
  const [copied, setCopied] = useState(false);

  const previewText = buildWhatsAppMessage(selectedType, data);

  const handleSend = async () => {
    const success = await sendWhatsAppMessage(selectedType, data);
    if (success) {
      onClose();
    }
  };

  const handleCopy = async () => {
    try {
      await Share.share({
        message: previewText,
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      Alert.alert('Copy failed', e?.message || 'Could not copy message');
    }
  };

  const renderIcon = (type: TemplateType, color: string) => {
    const size = 18;
    switch (type) {
      case 'booking_confirmed':
        return <CheckCircle2 size={size} color={color} />;
      case 'driver_assigned':
        return <Car size={size} color={color} />;
      case 'fare_estimation':
        return <Calculator size={size} color={color} />;
      case 'trip_completed':
        return <Receipt size={size} color={color} />;
      case 'feedback_request':
        return <Star size={size} color={color} />;
    }
  };

  const types: TemplateType[] = [
    'booking_confirmed',
    'driver_assigned',
    'fare_estimation',
    'trip_completed',
    'feedback_request',
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View>
              <Text style={[styles.title, { color: themeColors.text }]}>Share via WhatsApp</Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                To: {data.customerName || 'Customer'} ({data.customerPhone || 'No phone'})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Template Selector Carousel / Chips */}
          <View style={styles.chipsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {types.map((type) => {
                const isSelected = selectedType === type;
                const meta = TEMPLATE_METADATA[type];
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setSelectedType(type)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? meta.defaultColor
                          : isDark
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)',
                        borderColor: isSelected ? meta.defaultColor : themeColors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    {renderIcon(type, isSelected ? '#FFFFFF' : meta.defaultColor)}
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? '#FFFFFF' : themeColors.text },
                      ]}
                    >
                      {meta.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Message Preview Box */}
          <View style={styles.previewWrap}>
            <Text style={[styles.previewHeading, { color: themeColors.textSecondary }]}>
              {TEMPLATE_METADATA[selectedType].subtitle}
            </Text>
            <ScrollView
              style={[
                styles.previewBox,
                {
                  backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : '#F8FAFC',
                  borderColor: themeColors.border,
                },
              ]}
              contentContainerStyle={styles.previewContent}
            >
              <Text style={[styles.previewBody, { color: themeColors.text }]}>
                {previewText}
              </Text>
            </ScrollView>
          </View>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={[
                styles.copyBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                  borderColor: themeColors.border,
                },
              ]}
              onPress={handleCopy}
              activeOpacity={0.7}
            >
              {copied ? <Check size={18} color="#10B981" /> : <Copy size={18} color={themeColors.text} />}
              <Text style={[styles.copyBtnText, { color: copied ? '#10B981' : themeColors.text }]}>
                {copied ? 'Shared' : 'Copy / Share'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.8}>
              <Send size={18} color="#FFFFFF" />
              <Text style={styles.sendBtnText}>Open in WhatsApp</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  chipsWrap: {
    paddingVertical: 12,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewWrap: {
    paddingHorizontal: 16,
    flex: 1,
  },
  previewHeading: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 6,
    maxHeight: 280,
  },
  previewContent: {
    padding: 14,
  },
  previewBody: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 13,
    borderRadius: 6,
    shadowColor: '#25D366',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
