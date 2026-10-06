import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Car, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, LANGUAGE_OPTIONS, LanguageCode } from '@/contexts/LanguageContext';

// Persisted flag so this picker is only ever shown once, on the vendor's
// very first launch. Exported so app/index.tsx can check it before
// deciding whether to show this screen.
export const HAS_SEEN_LANGUAGE_SELECT_KEY = 'hasSeenVendorLanguageSelect';

interface LanguageSelectScreenProps {
  onDone: () => void;
}

export default function LanguageSelectScreen({ onDone }: LanguageSelectScreenProps) {
  const { language, setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState<LanguageCode>(language);

  const finish = () => {
    AsyncStorage.setItem(HAS_SEEN_LANGUAGE_SELECT_KEY, 'true').catch(() => {});
    onDone();
  };

  const handleContinue = () => {
    setLanguage(selected);
    finish();
  };

  // Skipping keeps the default (English) - the choice can always be made
  // later from Settings, same as the "change anytime" hint above.
  const handleSkip = () => {
    finish();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.gradient}>
        <View style={styles.content}>
          <View style={styles.logoCircle}>
            <Car size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{t('languageSelect.title')}</Text>
          <Text style={styles.subtitle}>{t('languageSelect.subtitle')}</Text>

          <View style={styles.optionsCard}>
            {LANGUAGE_OPTIONS.map((opt, index) => {
              const isSelected = selected === opt.code;
              const isLast = index === LANGUAGE_OPTIONS.length - 1;
              return (
                <TouchableOpacity
                  key={opt.code}
                  style={[
                    styles.optionRow,
                    !isLast && styles.optionRowBorder,
                    isSelected && styles.optionRowSelected,
                  ]}
                  onPress={() => setSelected(opt.code)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check size={20} color="#1D4ED8" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={styles.continueButtonText}>{t('languageSelect.continue')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
            <Text style={styles.skipButtonText}>{t('languageSelect.skip')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#E0E7FF',
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  optionsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  optionLabelSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  continueButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  skipButton: {
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
});
