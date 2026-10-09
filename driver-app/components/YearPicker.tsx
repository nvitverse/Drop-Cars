import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Pressable } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { Calendar, ChevronDown, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface YearPickerProps {
  /** Selected year as a string, e.g. "2023", or '' if none picked yet. */
  value: string;
  onSelect: (year: string) => void;
  hasError?: boolean;
  /** Defaults to 2008, per how far back this platform supports. */
  minYear?: number;
  placeholder?: string;
}

/**
 * Manufacturing-year picker (newest first, from `minYear`). Opens as a
 * bottom sheet instead of an absolutely-positioned dropdown: the old inline
 * dropdown got clipped by the page's ScrollView near the bottom of the screen
 * and its own nested list would not scroll on Android.
 */
export default function YearPicker({ value, onSelect, hasError, minYear = 2008, placeholder }: YearPickerProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const resolvedPlaceholder = placeholder ?? t('yearPicker.selectYear');
  const [open, setOpen] = useState(false);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const list: string[] = [];
    for (let y = currentYear; y >= minYear; y--) list.push(String(y));
    return list;
  }, [minYear]);

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.surface, borderColor: hasError ? colors.error : colors.border }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Calendar color={colors.textSecondary} size={20} />
        <Text style={[styles.text, { color: value ? colors.text : colors.textSecondary }]}>
          {value || resolvedPlaceholder}
        </Text>
        <ChevronDown color={colors.textSecondary} size={20} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            <Text style={[styles.title, { color: colors.text }]}>{resolvedPlaceholder}</Text>
            <FlatList
              data={years}
              keyExtractor={(y) => y}
              style={styles.list}
              showsVerticalScrollIndicator
              initialNumToRender={20}
              renderItem={({ item: y }) => {
                const selected = y === value;
                return (
                  <TouchableOpacity
                    style={[styles.item, selected && styles.itemSelected]}
                    onPress={() => {
                      onSelect(y);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.itemText, { color: selected ? '#1D4ED8' : colors.text }, selected && { fontFamily: 'Inter-SemiBold' }]}>
                      {y}
                    </Text>
                    {selected && <Check color="#1D4ED8" size={18} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  text: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: '65%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  itemSelected: {
    backgroundColor: 'rgba(29,78,216,0.08)',
  },
  itemText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
