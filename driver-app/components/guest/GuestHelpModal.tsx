import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Platform,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Send,
  Headphones,
  Check,
  CheckCheck,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  GuestMessage,
  fetchGuestThread,
  sendGuestMessage,
  getSavedGuestHelpSession,
} from '@/services/support/guestHelpService';

interface GuestHelpModalProps {
  visible: boolean;
  onClose: () => void;
  onMessageSentOrRead?: () => void;
}

const formatMsgTime = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function GuestHelpModal({
  visible,
  onClose,
  onMessageSentOrRead,
}: GuestHelpModalProps) {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [primaryNumber, setPrimaryNumber] = useState('');

  const flatListRef = useRef<FlatList>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const msgs = await fetchGuestThread();
      setMessages(msgs);
      if (onMessageSentOrRead) {
        onMessageSentOrRead();
      }
    } catch (e) {
      console.warn('[GuestHelpModal] load error:', e);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [onMessageSentOrRead]);

  // Read session info and start polling when visible
  useEffect(() => {
    if (!visible) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let isMounted = true;
    (async () => {
      const session = await getSavedGuestHelpSession();
      if (session && isMounted) {
        setPrimaryNumber(session.primary_number || '');
      }
      await loadMessages(true);
    })();

    // Poll every 10s while modal is open and app is active
    pollTimerRef.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        loadMessages(false);
      }
    }, 10000);

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && visible) {
        loadMessages(false);
      }
    });

    return () => {
      isMounted = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      sub.remove();
    };
  }, [visible, loadMessages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');

    // Optimistic message append
    const tempId = Date.now();
    const optimisticMsg: GuestMessage = {
      id: tempId,
      mine: true,
      sender_name: 'You',
      text,
      created_at: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);

    const res = await sendGuestMessage(text);
    setSending(false);

    if (res.success) {
      loadMessages(false);
      if (onMessageSentOrRead) {
        onMessageSentOrRead();
      }
    } else if (res.error) {
      // Refresh to sync if error occurred
      loadMessages(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' },
        ]}
      >
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.headerLeft}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Headphones size={20} color="#FFFFFF" />
              </View>
              <View>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {t('guestHelp.headerTitle') || 'Drop Cars Help'}
                  </Text>
                  <View style={styles.badgeSecure}>
                    <ShieldCheck size={11} color="#10B981" />
                    <Text style={styles.badgeSecureText}>
                      {t('guestHelp.supportDesk') || 'Support Desk'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                  {primaryNumber
                    ? `+91 ${primaryNumber} • ${t('guestHelp.teamRepliesHere') || 'Our team replies here'}`
                    : t('guestHelp.supportReplies') || 'Drop Cars Support team replies here'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9' },
              ]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Messages Stream */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }}
              onLayout={() => {
                flatListRef.current?.scrollToEnd({ animated: false });
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View
                    style={[
                      styles.emptyIconCircle,
                      { backgroundColor: isDarkMode ? 'rgba(99,102,241,0.15)' : '#EEF2FF' },
                    ]}
                  >
                    <MessageCircle size={32} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {t('guestHelp.howCanWeHelp') || 'How can we help?'}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                    {t('guestHelp.emptyHint') ||
                      'Tell us your problem. Our team replies here.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isMe = item.mine;
                return (
                  <View
                    style={[
                      styles.messageRow,
                      isMe ? styles.messageRowMe : styles.messageRowOther,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isMe
                          ? [styles.bubbleMe, { backgroundColor: colors.primary }]
                          : [
                              styles.bubbleOther,
                              {
                                backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                                borderColor: colors.border,
                              },
                            ],
                      ]}
                    >
                      {!isMe && (
                        <Text style={[styles.senderName, { color: colors.primary }]}>
                          {item.sender_name || 'Drop Cars Support'}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.messageText,
                          { color: isMe ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {item.text}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text
                          style={[
                            styles.msgTime,
                            {
                              color: isMe
                                ? 'rgba(255,255,255,0.75)'
                                : isDarkMode
                                ? '#64748B'
                                : '#94A3B8',
                            },
                          ]}
                        >
                          {formatMsgTime(item.created_at)}
                        </Text>
                        {isMe && (
                          <View style={{ marginLeft: 4 }}>
                            {item.read ? (
                              <CheckCheck size={13} color="#93C5FD" />
                            ) : (
                              <Check size={13} color="rgba(255,255,255,0.7)" />
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Input Bar */}
          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 10),
              },
            ]}
          >
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDarkMode ? '#0F172A' : '#F1F5F9',
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder={t('guestHelp.inputPlaceholder') || 'Type your message...'}
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: colors.primary },
                (!inputText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  badgeSecure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  badgeSecureText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bubbleMe: {
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  msgTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
