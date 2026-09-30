import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Car, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { DutyDriverSuggestion } from '@/hooks/useDutyDriverSuggestion';

interface DutyDriverSuggestionBannerProps {
  suggestion: DutyDriverSuggestion | null;
  onDismiss: () => void;
}

// Non-blocking banner shown right after a car+driver assignment succeeds.
// Suggests logging in (or switching to) the duty-driver session for the
// driver that was just assigned, so the owner can manage the trip from the
// driver side without hunting for the login screen.
export default function DutyDriverSuggestionBanner({ suggestion, onDismiss }: DutyDriverSuggestionBannerProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();

  if (!suggestion) return null;

  const handleAction = () => {
    onDismiss();
    if (suggestion.isSameDriver) {
      // The owner driving themselves: their trips live in the Duty tab of this same app (no separate login screen).
      router.push('/(tabs)/duty' as any);
    } else {
      // Prefill the phone number, same pattern as the "Start Driving" switch -
      // the driver still enters their own password (fleet owner generally
      // doesn't know it unless it's their own "own cum driver" account).
      router.push({ pathname: '/quick-login', params: { prefillNumber: suggestion.driverPhone } });
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: colors.primary }]}>
      <Car color="#FFFFFF" size={18} />
      <Text style={styles.text} numberOfLines={2}>
        {suggestion.isSameDriver
          ? t('dutyDriver.switchSuggestion', { name: suggestion.driverName })
          : t('dutyDriver.loginSuggestion', { name: suggestion.driverName })}
      </Text>
      <TouchableOpacity onPress={handleAction} style={styles.actionButton} accessibilityRole="button">
        <Text style={styles.actionText}>
          {suggestion.isSameDriver ? t('dutyDriver.switchAction') : t('dutyDriver.loginAction')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={styles.dismissButton} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X color="#FFFFFF" size={16} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginTop: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  actionButton: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  dismissButton: {
    padding: 4,
  },
});
