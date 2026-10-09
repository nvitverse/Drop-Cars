import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X, Send, Phone, User, ShieldCheck, MapPin, Clock } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { colors } from '@/theme/tokens';

export interface ChatMessage {
  id: string;
  sender: 'DRIVER' | 'CUSTOMER';
  text: string;
  timestamp: string;
}

export interface InAppChatModalProps {
  visible: boolean;
  orderId: number | string;
  customerName?: string;
  customerPhone?: string;
  messages?: ChatMessage[];
  onClose: () => void;
  onSendMessage: (text: string) => void;
}

export const InAppChatModal: React.FC<InAppChatModalProps> = ({
  visible,
  orderId,
  customerName = 'Customer',
  customerPhone = '',
  messages = [],
  onClose,
  onSendMessage,
}) => {
  const [inputMessage, setInputMessage] = useState('');

  const PRESET_MESSAGES = [
    '📍 பிக்கப் லொகேஷனுக்கு வந்துவிட்டேன்',
    '⏳ 5 நிமிடங்கள் காத்திருக்கவும்',
    '🛣️ ட்ராஃபிக்கில் சிக்கியுள்ளேன்',
    '📞 உங்களை அழைக்க முயற்சி செய்தேன்',
  ];

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;
    onSendMessage(text);
    setInputMessage('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.chatCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.userHeaderInfo}>
              <View style={styles.avatar}>
                <User size={18} color="#FFFFFF" />
              </View>
              <View>
                <AppText variant="label" weight="bold">
                  {customerName}
                </AppText>
                <View style={styles.privacyRow}>
                  <ShieldCheck size={12} color={colors.success.main} />
                  <AppText variant="caption" color={colors.success.main}>
                    Number Masked & Protected
                  </AppText>
                </View>
              </View>
            </View>

            <View style={styles.headerRightActions}>
              {customerPhone && (
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => Alert.alert('Masked Call', `Calling ${customerName} via Drop Cars Masked Proxy...`)}
                >
                  <Phone size={16} color={colors.primary.main} />
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Preset Message Chips */}
          <View style={styles.presetsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsContent}>
              {PRESET_MESSAGES.map((msg, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.presetChip}
                  onPress={() => handleSend(msg)}
                >
                  <AppText variant="caption" weight="medium" color={colors.primary.main}>
                    {msg}
                  </AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Message List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.messagesList}>
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <AppText variant="caption" color={colors.text.muted} align="center">
                  Drop Cars In-App Chat. எண்களைப் பகிராமல் பாதுகாப்பாக பேசுங்கள்.
                </AppText>
              </View>
            ) : (
              messages.map((msg) => {
                const isDriver = msg.sender === 'DRIVER';
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.msgBubbleContainer,
                      isDriver ? styles.driverMsgContainer : styles.customerMsgContainer,
                    ]}
                  >
                    <View
                      style={[
                        styles.msgBubble,
                        isDriver ? styles.driverBubble : styles.customerBubble,
                      ]}
                    >
                      <AppText
                        variant="body"
                        color={isDriver ? '#FFFFFF' : colors.text.primary}
                      >
                        {msg.text}
                      </AppText>
                      <AppText
                        variant="caption"
                        style={styles.msgTime}
                        color={isDriver ? 'rgba(255,255,255,0.7)' : colors.text.muted}
                      >
                        {msg.timestamp}
                      </AppText>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder="Type message in Tamil or English..."
              placeholderTextColor={colors.text.muted}
              value={inputMessage}
              onChangeText={setInputMessage}
            />

            <TouchableOpacity
              style={[styles.sendButton, !inputMessage.trim() && styles.sendButtonDisabled]}
              onPress={() => handleSend()}
              disabled={!inputMessage.trim()}
            >
              <Send size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  chatCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  userHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.primary.subtle,
  },
  closeButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  presetsBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  presetsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary.subtle,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  messagesList: {
    padding: 16,
    gap: 10,
  },
  emptyChat: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  msgBubbleContainer: {
    flexDirection: 'row',
  },
  driverMsgContainer: {
    justifyContent: 'flex-end',
  },
  customerMsgContainer: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  driverBubble: {
    backgroundColor: colors.primary.main,
    borderBottomRightRadius: 2,
  },
  customerBubble: {
    backgroundColor: '#F1F5F9',
    borderBottomLeftRadius: 2,
  },
  msgTime: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
});

export default InAppChatModal;
