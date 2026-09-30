import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { RefreshCw } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  onRefresh?: () => void;
  actionText?: string;
}

export default function EmptyState({ icon: Icon, title, description, onRefresh, actionText }: EmptyStateProps) {
  const { colors, isDarkMode } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: isDarkMode ? colors.primary + '18' : '#EFF6FF',
            borderColor: isDarkMode ? colors.primary + '40' : '#DBEAFE',
          },
        ]}
      >
        <Icon size={32} color={colors.primary} strokeWidth={1.8} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

      {!!description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      )}

      {onRefresh && (
        <TouchableOpacity
          onPress={onRefresh}
          style={[
            styles.actionBtn,
            { backgroundColor: colors.primary, shadowColor: colors.primary },
          ]}
          activeOpacity={0.85}
        >
          <RefreshCw size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.actionBtnText}>{actionText || 'Refresh Feed'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  iconBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    fontSize: 16.5,
    fontFamily: 'Inter-Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 13,
  },
});
