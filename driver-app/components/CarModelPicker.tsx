import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Car, ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { CAR_MODELS, fetchCarModelsFromServer, CarModel } from '@/constants/carModels';
import { useLanguage } from '@/contexts/LanguageContext';

interface CarModelPickerProps {
  /** Current car name text - still freely editable, this isn't a closed list. */
  value: string;
  onChangeText: (name: string) => void;
  /** Called when the fleet owner picks a known model, so the caller can
   *  auto-fill Car Type. The category stays changeable afterward via the
   *  existing Car Type dropdown - this is just a helpful default. */
  onCategorySelect: (carType: string) => void;
  hasError?: boolean;
}

/**
 * Car name field with a searchable dropdown of common Indian car models.
 * Typing filters the list; picking a suggestion fills the name AND asks the
 * caller to auto-select the matching category. Typing something not in the
 * list is still accepted as free text - this never blocks unusual/rare
 * models, it's just a fast path for the common ones.
 */
export default function CarModelPicker({ value, onChangeText, onCategorySelect, hasError }: CarModelPickerProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [models, setModels] = useState<CarModel[]>(CAR_MODELS);

  useEffect(() => {
    let cancelled = false;
    fetchCarModelsFromServer().then((serverModels) => {
      if (!cancelled && serverModels) setModels(serverModels);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [value, models]);

  const handleSelect = (name: string, type: string) => {
    onChangeText(name);
    onCategorySelect(type);
    setShowSuggestions(false);
  };

  return (
    <View>
      <View
        style={[
          styles.inputGroup,
          { backgroundColor: colors.surface, borderColor: hasError ? colors.error : colors.border },
        ]}
      >
        <Car color={colors.textSecondary} size={20} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={(txt) => {
            onChangeText(txt);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder={t('carModelPicker.placeholder')}
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity onPress={() => setShowSuggestions((s) => !s)} hitSlop={8}>
          <ChevronDown color={colors.textSecondary} size={20} />
        </TouchableOpacity>
      </View>

      {showSuggestions && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.length === 0 && (
              <View style={styles.dropdownItem}>
                <Text style={[styles.dropdownItemText, { color: colors.textSecondary }]}>
                  {t('carModelPicker.noMatch')}
                </Text>
              </View>
            )}
            {filtered.map((model) => (
              <TouchableOpacity
                key={model.name}
                style={styles.dropdownItem}
                onPress={() => handleSelect(model.name, model.type)}
              >
                <Text style={[styles.dropdownItemText, { color: colors.text }]}>{model.name}</Text>
              </TouchableOpacity>
            ))}
            {/* The field already accepts free typing for models not in the
                list - this row just makes that discoverable instead of
                looking like a closed list. Tapping it simply closes the
                dropdown so the driver can keep typing their own model name. */}
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => setShowSuggestions(false)}
            >
              <Text style={[styles.dropdownItemText, styles.othersText, { color: colors.primary }]}>
                {t('carModelPicker.others')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    minWidth: 0,
  },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  dropdownItemText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  othersText: {
    fontFamily: 'Inter-SemiBold',
  },
});
