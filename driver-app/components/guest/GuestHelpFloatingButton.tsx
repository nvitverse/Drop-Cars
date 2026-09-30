import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getSavedGuestHelpSession,
  fetchGuestUnreadCount,
} from '@/services/support/guestHelpService';
import GuestHelpModal from './GuestHelpModal';

interface GuestHelpFloatingButtonProps {
  bottomOffset?: number;
  rightOffset?: number;
}

export default function GuestHelpFloatingButton({
  bottomOffset = 24,
  rightOffset = 20,
}: GuestHelpFloatingButtonProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [hasSession, setHasSession] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const session = await getSavedGuestHelpSession();
      if (!session || !session.help_token) {
        setHasSession(false);
        setUnreadCount(0);
        return;
      }
      setHasSession(true);
      const count = await fetchGuestUnreadCount();
      setUnreadCount(count);
    } catch {
      setHasSession(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isFocused = true;
      let interval: ReturnType<typeof setInterval> | null = null;

      const run = async () => {
        if (!isFocused) return;
        await checkStatus();
      };

      run();

      // Poll every 20s while screen is focused and app is active
      interval = setInterval(() => {
        if (AppState.currentState === 'active' && isFocused) {
          checkStatus();
        }
      }, 20000);

      const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'active' && isFocused) {
          checkStatus();
        }
      });

      return () => {
        isFocused = false;
        if (interval) clearInterval(interval);
        appStateSub.remove();
      };
    }, [checkStatus])
  );

  if (!hasSession) return null;

  const displayBadge = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : '';

  return (
    <>
      <TouchableOpacity
        style={[
          styles.floatingBtn,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + bottomOffset,
            right: rightOffset,
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        accessibilityLabel="Open pre-login help chat"
      >
        <MessageCircle size={22} color="#FFFFFF" />

        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{displayBadge}</Text>
          </View>
        )}
      </TouchableOpacity>

      <GuestHelpModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          checkStatus();
        }}
        onMessageSentOrRead={() => {
          checkStatus();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  floatingBtn: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 9999,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
