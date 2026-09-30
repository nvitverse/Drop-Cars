import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, Linking, Alert, ViewStyle, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import InAppCallModal from './InAppCallModal';

interface CallButtonProps {
  /** Phone number to dial. If empty/"Hidden", the button is not rendered. */
  phoneNumber?: string | null;
  /** Optional label shown before the number, e.g. "Call Customer" or "Call Vendor". */
  label?: string;
  recipientName?: string;
  /** "full" = big green pill button (drivers); "inline" = compact tappable number (owner). */
  variant?: 'full' | 'inline';
  style?: ViewStyle;
}

/** Normalise a stored number into something the dialer accepts. */
function toDialable(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  // Add +91 for bare 10-digit Indian numbers so the dialer is unambiguous.
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  return cleaned;
}

export default function CallButton({ phoneNumber, label, recipientName = 'Customer', variant = 'full', style }: CallButtonProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [showInAppCallModal, setShowInAppCallModal] = useState(false);

  const raw = (phoneNumber || '').trim();
  // Never render for missing or intentionally hidden numbers.
  if (!raw || raw.toLowerCase() === 'hidden' || raw.replace(/[^\d]/g, '').length < 10) {
    return null;
  }

  const handlePress = () => {
    setShowInAppCallModal(true);
  };

  return (
    <>
      {variant === 'inline' ? (
        <TouchableOpacity onPress={handlePress} style={[styles.inline, style]} accessibilityRole="button">
          <Phone size={16} color={colors.success} />
          <Text style={[styles.inlineText, { color: colors.success }]}>
            {label ? `${label}: ` : ''}{raw}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handlePress}
          style={[styles.full, { backgroundColor: colors.success }, style]}
          accessibilityRole="button"
        >
          <Phone size={20} color="#FFFFFF" />
          <Text style={styles.fullText}>{label || t('callButton.call')}</Text>
        </TouchableOpacity>
      )}

      <InAppCallModal
        visible={showInAppCallModal}
        onClose={() => setShowInAppCallModal(false)}
        recipientName={recipientName}
        phoneNumber={raw}
      />
    </>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  inlineText: {
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  full: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  fullText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
