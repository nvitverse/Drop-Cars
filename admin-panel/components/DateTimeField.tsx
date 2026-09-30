import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { CustomDatePickerModal, CustomTimePickerModal } from './DateTimePickerModals';

// Tap-to-pick date + time row, backed by the same calendar-grid / wheel-
// scroll pickers the Driver App uses - replaces raw "YYYY-MM-DD" / "HH:MM"
// text fields the admin previously had to type by hand.

const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const parseDateTime = (date: string, time: string): Date => {
  const d = date ? new Date(`${date}T00:00:00`) : new Date();
  if (time) {
    const [h, m] = time.split(':').map(Number);
    if (!isNaN(h)) d.setHours(h, isNaN(m) ? 0 : m, 0, 0);
  }
  return d;
};
const displayDate = (date: string) => {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const displayTime = (time: string) => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${period}`;
};

interface DateTimeFieldProps {
  dateLabel: string;
  timeLabel: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  datePlaceholder?: string;
  timePlaceholder?: string;
  minimumDate?: Date;
}

export default function DateTimeField({
  dateLabel, timeLabel, dateValue, timeValue, onDateChange, onTimeChange,
  datePlaceholder = 'Select date', timePlaceholder = 'Select time', minimumDate,
}: DateTimeFieldProps) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const current = parseDateTime(dateValue, timeValue);

  return (
    <View style={localStyles.row}>
      <View style={localStyles.col}>
        <Text style={localStyles.subLabel}>{dateLabel}</Text>
        <TouchableOpacity style={localStyles.box} onPress={() => setShowDate(true)}>
          <Calendar size={16} color={colors.textMuted} />
          <Text style={[localStyles.boxText, !dateValue && localStyles.placeholderText]}>
            {displayDate(dateValue) || datePlaceholder}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={localStyles.col}>
        <Text style={localStyles.subLabel}>{timeLabel}</Text>
        <TouchableOpacity style={localStyles.box} onPress={() => setShowTime(true)}>
          <Clock size={16} color={colors.textMuted} />
          <Text style={[localStyles.boxText, !timeValue && localStyles.placeholderText]}>
            {displayTime(timeValue) || timePlaceholder}
          </Text>
        </TouchableOpacity>
      </View>

      <CustomDatePickerModal
        visible={showDate}
        title={dateLabel}
        initialDate={current}
        minimumDate={minimumDate}
        onConfirm={(d) => { onDateChange(fmtDate(d)); setShowDate(false); }}
        onClose={() => setShowDate(false)}
      />
      <CustomTimePickerModal
        visible={showTime}
        title={timeLabel}
        initialDate={current}
        onConfirm={(d) => { onTimeChange(fmtTime(d)); setShowTime(false); }}
        onClose={() => setShowTime(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  subLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10,
  },
  boxText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  placeholderText: { color: colors.textMuted, fontWeight: '400' },
});
