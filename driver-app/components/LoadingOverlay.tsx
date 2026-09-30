import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  transparent?: boolean;
}

const { width, height } = Dimensions.get('window');

export default function LoadingOverlay({
  visible,
  message,
  transparent = false
}: LoadingOverlayProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const resolvedMessage = message ?? t('carDriverDashboard.loading');

  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      statusBarTranslucent={true}
    >
      <View style={[styles.overlay, { backgroundColor: transparent ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.7)' }]}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <ActivityIndicator 
            size="large" 
            color={colors.primary} 
            style={styles.spinner}
          />
          <Text style={[styles.message, { color: colors.text }]}>
            {resolvedMessage}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: width,
    height: height,
  },
  container: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  spinner: {
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});
