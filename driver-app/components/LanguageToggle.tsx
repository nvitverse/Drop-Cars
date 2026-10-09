import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { Languages, X, Check } from 'lucide-react-native';
import { useLanguage, LANGUAGE_OPTIONS, LanguageCode } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

interface LanguageToggleProps {
  inline?: boolean;
  style?: ViewStyle;
}

export default function LanguageToggle({ inline = true, style }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const [showModal, setShowModal] = useState(false);

  const currentOption = LANGUAGE_OPTIONS.find((opt) => opt.code === language);
  const shortCode = (currentOption?.code || 'en').toUpperCase();

  return (
    <>
      <TouchableOpacity
        style={[
          styles.pill,
          {
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(79, 70, 229, 0.08)',
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(79, 70, 229, 0.2)',
          },
          style,
        ]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.75}
      >
        <Languages size={12} color={colors.primary} />
        <Text style={[styles.pillText, { color: colors.primary }]}>{shortCode}</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Languages size={20} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Select Language / மொழி</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={{ padding: 4 }}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            {LANGUAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.code}
                onPress={() => {
                  setLanguage(opt.code as LanguageCode);
                  setShowModal(false);
                }}
                style={[
                  styles.row,
                  {
                    borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    backgroundColor: language === opt.code ? (isDarkMode ? 'rgba(79, 70, 229, 0.15)' : 'rgba(79, 70, 229, 0.06)') : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: language === opt.code ? 'Inter-Bold' : 'Inter-Medium',
                    color: language === opt.code ? colors.primary : colors.text,
                  }}
                >
                  {opt.label}
                </Text>
                {language === opt.code && <Check color={colors.primary} size={20} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
});
