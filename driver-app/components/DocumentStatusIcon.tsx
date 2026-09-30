import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface DocumentStatusIconProps {
  status: 'VERIFIED' | 'INVALID' | 'PENDING' | string;
  onPress?: () => void;
  size?: number;
}

export default function DocumentStatusIcon({ status, size = 22 }: DocumentStatusIconProps): React.ReactElement {
  const { colors } = useTheme();
  const { t } = useLanguage();

  let text = t('documentStatusIcon.unknown');
  let color = colors.textSecondary;
  switch (String(status).toUpperCase()) {
    case 'VERIFIED':
      text = t('documentStatusIcon.verified');
      color = '#10B981'; // Green
      break;
    case 'INVALID':
      text = t('documentStatusIcon.invalid');
      color = '#EF4444'; // Red
      break;
    case 'PENDING':
    case 'PROCESSING':
      text = t('documentStatusIcon.processing'); // Unification for clarity!
      color = '#F59E0B'; // Orange
      break;
    case 'NEEDS_REVIEW':
      // A re-upload that STILL didn't auto-verify - distinct from a fresh
      // PENDING (which just means "not checked yet"). This one is now with
      // Drop Cars support staff for manual review, not stuck on the driver.
      text = 'IN REVIEW';
      color = '#8B5CF6'; // Purple - distinct from pending-orange/invalid-red
      break;
    default:
      text = t('documentStatusIcon.unknown');
      color = colors.textSecondary;
  }

  return (
    <Text style={{
      fontSize: size + 6,
      color,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {text}
    </Text>
  );
}
