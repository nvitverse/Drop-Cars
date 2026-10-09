import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

interface InfoButtonProps {
  onPress: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const InfoButton: React.FC<InfoButtonProps> = ({
  onPress,
  size = 18,
  color,
  style,
  accessibilityLabel = 'More information',
}) => {
  const { colors } = useTheme();
  const iconColor = color || colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, style]}
    >
      <Info size={size} color={iconColor} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 16,
  },
});

export default InfoButton;
