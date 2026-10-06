import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

// Preset reasons shown to whoever cancels (and then to the driver who had accepted the booking).
// Same list is used by the Vendor App so the wording is identical everywhere.
export const CANCEL_REASON_PRESETS = [
  'Change of plan / trip postponed',
  'Customer cancelled the trip',
  'Booked by mistake / duplicate booking',
  'Trip details or fare were wrong',
  'Found another vehicle / driver',
];
const OTHER = '__other__';

interface Props {
  visible: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function CancelReasonModal({ visible, title = 'Cancel this booking?', message, confirmLabel = 'Confirm Cancel', submitting, onClose, onConfirm }: Props) {
  const { themeColors } = useTheme();
  const colors: any = { ...themeColors, textSecondary: themeColors.textSecondary ?? themeColors.textMuted };
  const [selected, setSelected] = useState<string>('');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!visible) {
      setSelected('');
      setCustom('');
    }
  }, [visible]);

  const reason = selected === OTHER ? custom.trim() : selected;
  const canConfirm = !!reason && !submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={submitting}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!!message && <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>}
            <Text style={[styles.label, { color: colors.text }]}>Select a reason (the driver will see it)</Text>
            {[...CANCEL_REASON_PRESETS, OTHER].map((r) => {
              const active = selected === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setSelected(r)}
                  style={[
                    styles.option,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '18' : colors.background },
                  ]}
                >
                  <Text style={{ fontSize: 13, fontFamily: active ? 'Inter-Bold' : 'Inter-SemiBold', color: active ? colors.primary : colors.text }}>
                    {r === OTHER ? 'Other (type your own reason)' : r}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {selected === OTHER && (
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder="Type the reason..."
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={200}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            )}
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }]} onPress={onClose} disabled={submitting}>
                <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13 }}>Keep it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { flex: 1.5, backgroundColor: canConfirm ? '#DC2626' : '#DC262655' }]}
                onPress={() => canConfirm && onConfirm(reason)}
                disabled={!canConfirm}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>{confirmLabel}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '88%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { flex: 1, fontSize: 17, lineHeight: 23, fontFamily: 'Inter-Bold', paddingRight: 12 },
  message: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Medium', marginBottom: 12 },
  label: { fontSize: 12.5, fontFamily: 'Inter-Bold', marginBottom: 8 },
  option: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 6, padding: 10, fontSize: 13, minHeight: 64, textAlignVertical: 'top', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { paddingVertical: 13, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
