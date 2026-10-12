import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { AlertCircle, AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { HelpSheet } from './HelpSheet';
import { getVendorHelpEntry } from '@/help/catalog';
import { HelpEntry, HelpContext } from '@/help/types';

interface ErrorNoticeProps {
  message?: string | null;
  code?: string;
  helpEntry?: HelpEntry;
  context?: HelpContext;
  severity?: 'warning' | 'blocking';
  style?: StyleProp<ViewStyle>;
}

export const ErrorNotice: React.FC<ErrorNoticeProps> = ({
  message,
  code,
  helpEntry,
  context,
  severity = 'warning',
  style,
}) => {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const entry = helpEntry || (code ? getVendorHelpEntry(code) : message ? getVendorHelpEntry(message) : null);
  if (!message && !entry) return null;

  const displayMessage =
    message || (entry ? entry.what : 'An issue occurred. Please check details.');
  const shortMessage =
    displayMessage.length > 85 ? displayMessage.slice(0, 82) + '...' : displayMessage;

  const isBlocking = severity === 'blocking' || entry?.severity === 'blocking';
  const bgColor = isBlocking ? '#FEE2E2' : '#FEF3C7';
  const borderColor = isBlocking ? '#FCA5A5' : '#FCD34D';
  const textColor = isBlocking ? '#B91C1C' : '#92400E';
  const icon = isBlocking ? (
    <AlertCircle size={16} color="#DC2626" />
  ) : (
    <AlertTriangle size={16} color="#D97706" />
  );

  return (
    <>
      <TouchableOpacity
        style={[
          styles.container,
          { backgroundColor: bgColor, borderColor: borderColor },
          style,
        ]}
        activeOpacity={0.8}
        onPress={() => setSheetOpen(true)}
      >
        <View style={styles.iconBox}>{icon}</View>
        <Text style={[styles.messageText, { color: textColor }]} numberOfLines={1}>
          {shortMessage}
        </Text>
        <View style={styles.readMorePill}>
          <Text style={[styles.readMoreText, { color: textColor }]}>Details</Text>
          <ChevronRight size={13} color={textColor} />
        </View>
      </TouchableOpacity>

      {entry ? (
        <HelpSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          entry={entry}
          context={context}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 6,
    gap: 8,
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    letterSpacing: -0.1,
  },
  readMorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  readMoreText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
});

export default ErrorNotice;
