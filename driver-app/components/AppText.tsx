import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { colors, typography } from '@/theme/tokens';

export interface AppTextProps extends RNTextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption' | 'label';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  color?: string;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  weight,
  color,
  align,
  style,
  children,
  ...props
}) => {
  const getVariantStyle = (): TextStyle => {
    switch (variant) {
      case 'title':
        return {
          fontSize: typography.fontSizes.xl,
          fontWeight: weight ? typography.fontWeights[weight] : typography.fontWeights.bold,
          color: color || colors.text.primary,
        };
      case 'subtitle':
        return {
          fontSize: typography.fontSizes.lg,
          fontWeight: weight ? typography.fontWeights[weight] : typography.fontWeights.semibold,
          color: color || colors.text.primary,
        };
      case 'caption':
        return {
          fontSize: typography.fontSizes.xs,
          fontWeight: weight ? typography.fontWeights[weight] : typography.fontWeights.regular,
          color: color || colors.text.secondary,
        };
      case 'label':
        return {
          fontSize: typography.fontSizes.sm,
          fontWeight: weight ? typography.fontWeights[weight] : typography.fontWeights.medium,
          color: color || colors.text.secondary,
        };
      case 'body':
      default:
        return {
          fontSize: typography.fontSizes.md,
          fontWeight: weight ? typography.fontWeights[weight] : typography.fontWeights.regular,
          color: color || colors.text.primary,
        };
    }
  };

  return (
    <RNText
      style={[
        getVariantStyle(),
        align ? { textAlign: align } : null,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

export default AppText;
