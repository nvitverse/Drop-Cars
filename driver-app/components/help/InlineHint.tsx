import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

interface InlineHintProps {
  text: string;
  icon?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  type?: 'default' | 'warning' | 'success';
}

/**
 * Clean subtle one-liner hint under inputs and cards to reduce confusion and prevent mistakes.
 */
export const InlineHint: React.FC<InlineHintProps> = ({
  text,
  icon = true,
  style,
  textStyle,
  type = 'default',
}) => {
  const { colors } = useTheme();

  const getColor = () => {
    switch (type) {
      case 'warning':
        return '#D97706';
      case 'success':
        return '#059669';
      default:
        return colors.textSecondary;
    }
  };

  const color = getColor();

  return (
    <View style={[styles.container, style]}>
      {icon ? <Info size={12} color={color} style={styles.icon} /> : null}
      <Text style={[styles.text, { color }, textStyle]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
    flex: 1,
  },
});

export default InlineHint;
