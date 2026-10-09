import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { KeyboardAvoidingView, useNavInsetWhenClosed } from '@/components/KeyboardSafe';
import {
  Mic,
  Send,
  X,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Check,
  AlertCircle,
  Radio,
  FileText,
  Download,
  Share2,
  Printer,
  Edit,
} from 'lucide-react-native';
import { useCommandCenter, CommandMessage } from '@/context/CommandCenterContext';
import { useTheme } from '@/context/ThemeContext';
import { colors } from '@/constants/theme';
import InvoiceCustomizerModal from '@/components/InvoiceCustomizerModal';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';

export default function CommandCenterModal() {
  const navInset = useNavInsetWhenClosed();
  const { isDark, themeColors } = useTheme();
  const {
    isOpen,
    closeCommandCenter,
    messages,
    isProcessing,
    sendMessage,
    executeCardAction,
    clearChat,
    showInvoiceModal,
    setShowInvoiceModal,
    invoiceModalData,
  } = useCommandCenter();

  const [inputVal, setInputVal] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [isOpen, messages]);

  const handleSend = () => {
    if (!inputVal.trim() || isProcessing) return;
    const text = inputVal.trim();
    setInputVal('');
    sendMessage(text);
  };

  const handleStartVoice = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        alert('Please allow microphone permissions to use voice commands.');
        return;
      }
      setIsRecording(true);
      await recorder.record();
    } catch (e) {
      setIsRecording(false);
      console.error('Error starting voice recording:', e);
    }
  };

  const handleStopVoice = async () => {
    try {
      setIsRecording(false);
      await recorder.stop();
      // On stop, simulate quick speech recognition command or prefill text
      // For immediate typing, user can also type or use speech keyboard dictation
      setInputVal('Tiruvannamalai to Chennai, Sedan, 14, 1, 300, 100, Toll extra');
    } catch (e) {
      console.error('Error stopping voice recording:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={closeCommandCenter} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        style={styles.modalOverlay}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: themeColors.surface, borderColor: themeColors.border, paddingBottom: navInset },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.botIconCircle, { backgroundColor: '#6366F1' }]}>
                <Bot size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>
                  Drop Cars Assistant
                </Text>
                <Text style={[styles.headerSub, { color: themeColors.textSecondary }]}>
                  Instant Voice & Text Actions • Zero-Cost Engine
                </Text>
              </View>
            </View>
            <View style={styles.headerRightActions}>
              <TouchableOpacity onPress={clearChat} style={styles.iconBtn}>
                <RotateCcw size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={closeCommandCenter} style={styles.iconBtn}>
                <X size={18} color={themeColors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages Stream */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageBubbleWrapper,
                  msg.sender === 'user' ? styles.userMsgWrapper : styles.asstMsgWrapper,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    msg.sender === 'user'
                      ? [styles.userBubble, { backgroundColor: '#6366F1' }]
                      : [
                          styles.asstBubble,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                            borderColor: themeColors.border,
                          },
                        ],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: msg.sender === 'user' ? '#FFFFFF' : themeColors.text },
                    ]}
                  >
                    {msg.text}
                  </Text>

                  {/* Action Cards (Preview / Confirm / Action) */}
                  {msg.actionCard && (
                    <View
                      style={[
                        styles.actionCardBox,
                        {
                          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      {msg.actionCard.type === 'create_booking_preview' && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                          onPress={() =>
                            executeCardAction(
                              msg.id,
                              'create_booking_preview',
                              msg.actionCard?.data
                            )
                          }
                          disabled={msg.actionCard.status === 'completed'}
                        >
                          <CheckCircle2 size={16} color="#FFFFFF" />
                          <Text style={styles.primaryActionBtnText}>
                            {msg.actionCard.status === 'completed'
                              ? 'Booking Opened'
                              : 'Open & Post in Booking Form'}
                          </Text>
                          <ArrowRight size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}

                      {msg.actionCard.type === 'approve_booking' && (
                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            style={[styles.primaryActionBtn, { backgroundColor: '#10B981', flex: 1 }]}
                            onPress={() =>
                              executeCardAction(msg.id, 'approve_booking', msg.actionCard?.data)
                            }
                            disabled={msg.actionCard.status === 'completed'}
                          >
                            <Check size={16} color="#FFFFFF" />
                            <Text style={styles.primaryActionBtnText}>
                              {msg.actionCard.status === 'completed'
                                ? 'Approved'
                                : 'Approve & Broadcast'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {msg.actionCard.type === 'cancel_booking' && (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#EF4444' }]}
                          onPress={() =>
                            executeCardAction(msg.id, 'cancel_booking', msg.actionCard?.data)
                          }
                          disabled={msg.actionCard.status === 'completed'}
                        >
                          <X size={16} color="#FFFFFF" />
                          <Text style={styles.primaryActionBtnText}>
                            {msg.actionCard.status === 'completed' ? 'Cancelled' : 'Confirm Cancel'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {msg.actionCard.type === 'generate_invoice' && (
                        <View style={{ gap: 8, marginTop: 6 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[styles.primaryActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                              onPress={() => executeCardAction(msg.id, 'print_invoice', msg.actionCard?.data)}
                            >
                              <Printer size={15} color="#FFFFFF" />
                              <Text style={styles.primaryActionBtnText}>Print / View</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.primaryActionBtn, { backgroundColor: '#0284C7', flex: 1 }]}
                              onPress={() => executeCardAction(msg.id, 'download_invoice_pdf', msg.actionCard?.data)}
                            >
                              <Download size={15} color="#FFFFFF" />
                              <Text style={styles.primaryActionBtnText}>PDF Download</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[styles.primaryActionBtn, { backgroundColor: '#25D366', flex: 1 }]}
                              onPress={() => executeCardAction(msg.id, 'share_invoice_whatsapp', msg.actionCard?.data)}
                            >
                              <Share2 size={15} color="#FFFFFF" />
                              <Text style={styles.primaryActionBtnText}>WhatsApp</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.primaryActionBtn, { backgroundColor: '#4F46E5', flex: 1 }]}
                              onPress={() => executeCardAction(msg.id, 'customize_invoice', msg.actionCard?.data)}
                            >
                              <Edit size={15} color="#FFFFFF" />
                              <Text style={styles.primaryActionBtnText}>Edit Charges</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ))}

            {isProcessing && (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={[styles.processingText, { color: themeColors.textSecondary }]}>
                  Processing command...
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Quick Command Suggestion Chips */}
          <View style={[styles.quickChipsRow, { borderTopColor: themeColors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
              {/* live questions: answered from the real bookings / approvals / chats */}
              {[
                ['🔔 Needs attention', 'What needs attention'],
                ['🌐 Pending approvals', 'Pending approvals'],
                ['🚨 Unassigned', 'Unassigned bookings'],
                ['📅 Today', 'Today pickups'],
                ['⏸ Hold all', 'Hold all'],
                ['💬 Support', 'Support chats'],
              ].map(([label, command]) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.chipPill, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF', borderColor: themeColors.border }]}
                  onPress={() => sendMessage(command)}
                >
                  <Text style={[styles.chipText, { color: themeColors.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chipPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => sendMessage('Tiruvannamalai to Chennai, Sedan, 14, 1, 300, 100, Toll extra')}
              >
                <Sparkles size={12} color="#6366F1" />
                <Text style={[styles.chipText, { color: themeColors.text }]}>Tiruvannamalai ➔ Chennai Sedan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => sendMessage('System Health')}
              >
                <Text style={[styles.chipText, { color: themeColors.text }]}>📊 System Health</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => setInputVal('Invoice ')}
              >
                <FileText size={12} color="#059669" />
                <Text style={[styles.chipText, { color: themeColors.text }]}>📄 Invoice</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => sendMessage('Duty ON')}
              >
                <Text style={[styles.chipText, { color: themeColors.text }]}>🟢 Duty ON</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Input & Voice Controls */}
          <View style={[styles.inputRow, { borderTopColor: themeColors.border, backgroundColor: themeColors.surface }]}>
            <TouchableOpacity
              style={[
                styles.voiceMicBtn,
                { backgroundColor: isRecording ? '#EF4444' : isDark ? '#334155' : '#EEF2FF' },
              ]}
              onPressIn={handleStartVoice}
              onPressOut={handleStopVoice}
              activeOpacity={0.7}
            >
              <Mic size={20} color={isRecording ? '#FFFFFF' : '#6366F1'} />
            </TouchableOpacity>

            <TextInput
              value={inputVal}
              onChangeText={setInputVal}
              onSubmitEditing={handleSend}
              placeholder="பேசுங்கள் அல்லது டைப் செய்யவும்..."
              placeholderTextColor={themeColors.textSecondary}
              style={[
                styles.textInput,
                {
                  color: themeColors.text,
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: themeColors.border,
                },
              ]}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: inputVal.trim() ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1') },
              ]}
              onPress={handleSend}
              disabled={!inputVal.trim() || isProcessing}
            >
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Invoice Customizer Modal for Editing Charges / Registering GST */}
      <InvoiceCustomizerModal
        visible={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        initialData={invoiceModalData}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
  },
  messagesList: {
    padding: 16,
    gap: 12,
  },
  messageBubbleWrapper: {
    flexDirection: 'row',
    width: '100%',
  },
  userMsgWrapper: {
    justifyContent: 'flex-end',
  },
  asstMsgWrapper: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    padding: 12,
    borderRadius: 14,
  },
  userBubble: {
    borderBottomRightRadius: 2,
  },
  asstBubble: {
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  actionCardBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  processingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  quickChipsRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  voiceMicBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13.5,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
