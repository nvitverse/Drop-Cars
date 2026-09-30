// Menu on an incoming message (tap the message or its ⌄): replies that answer
// THIS message - sent by the backend per message, filled from the booking's
// own data - plus Reply (quote it), Forward/Share and Call.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Share, Linking, Pressable } from 'react-native';
import { CornerUpLeft, Share2, Phone, X, MessageSquareReply } from 'lucide-react-native';

export interface ReplyOption {
  key: string;
  label: string;
  text?: string;
}

export interface MenuMessage {
  id: number | string;
  text: string;
  kind?: string;
  sender_name?: string;
  reply_options?: ReplyOption[];
}

interface Props {
  visible: boolean;
  message: MenuMessage | null;
  colors: any;
  otherPhone?: string | null;
  otherLabel?: string;
  onClose: () => void;
  onPickReply: (opt: ReplyOption, msg: MenuMessage) => void;
  onReply: (msg: MenuMessage) => void;
}

export default function MessageMenuSheet({ visible, message, colors, otherPhone, otherLabel, onClose, onPickReply, onReply }: Props) {
  if (!message) return null;
  const options = message.reply_options || [];
  const isVoice = message.kind === 'VOICE';

  const act = (fn: () => void) => () => {
    onClose();
    setTimeout(fn, 150);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={styles.handle} />
        <View style={[styles.quote, { borderLeftColor: colors.primary, backgroundColor: colors.background }]}>
          <View style={{ flex: 1 }}>
            {!!message.sender_name && (
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter-Bold' }}>{message.sender_name}</Text>
            )}
            <Text numberOfLines={3} style={{ color: colors.text, fontSize: 13.5, lineHeight: 19 }}>
              {isVoice ? '🎤 Voice message' : message.text}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" style={{ padding: 4 }}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <Action icon={<CornerUpLeft size={20} color={colors.primary} />} label="Reply" colors={colors} onPress={act(() => onReply(message))} />
          {!isVoice && (
            <Action
              icon={<Share2 size={20} color={colors.primary} />}
              label="Forward"
              colors={colors}
              onPress={act(() => Share.share({ message: message.text }).catch(() => {}))}
            />
          )}
          {!!otherPhone && (
            <Action
              icon={<Phone size={20} color={colors.primary} />}
              label={`Call ${otherLabel || ''}`.trim()}
              colors={colors}
              onPress={act(() => Linking.openURL(`tel:${otherPhone}`).catch(() => {}))}
            />
          )}
        </View>

        {options.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <MessageSquareReply size={14} color={colors.textSecondary} />
              <Text style={[styles.section, { color: colors.textSecondary }]}>Answer this message</Text>
            </View>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  onPress={act(() => onPickReply(o, message))}
                  style={[styles.option, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Inter-SemiBold' }}>{o.label}</Text>
                  {!!o.text && o.text !== o.label && (
                    <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{o.text}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

function Action({ icon, label, colors, onPress }: { icon: React.ReactNode; label: string; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.action, { borderColor: colors.border }]} accessibilityLabel={label}>
      {icon}
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'Inter-Medium', marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 14, paddingBottom: 24, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.6)', marginBottom: 10 },
  quote: { flexDirection: 'row', borderLeftWidth: 4, borderRadius: 8, padding: 10, gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 },
  section: { fontSize: 12, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  option: { paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
});
