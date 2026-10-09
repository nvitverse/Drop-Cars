import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '@/constants/theme';

/**
 * The visual "From -> To" calendar range picker, extracted from the
 * Dashboard (app/(tabs)/index.tsx) so every screen that needs a custom
 * date range - not just a fixed Today/7 Days/30 Days chip set - can reuse
 * the exact same picker instead of rebuilding one. Presets + tap-to-pick
 * calendar, same as the Dashboard's "Select Date Range" modal.
 */
export interface DateRangePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
  /** Optional: called when the user taps "Reset" instead of applying a range. */
  onReset?: () => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDateISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function DateRangePickerModal({ visible, onClose, onApply, onReset }: DateRangePickerModalProps) {
  const [rangeFromInput, setRangeFromInput] = useState('');
  const [rangeToInput, setRangeToInput] = useState('');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((prev) => prev - 1);
    } else {
      setCalMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((prev) => prev + 1);
    } else {
      setCalMonth((prev) => prev + 1);
    }
  };

  const handleDateClick = (dateStr: string) => {
    if (!rangeFromInput || (rangeFromInput && rangeToInput)) {
      setRangeFromInput(dateStr);
      setRangeToInput('');
    } else if (rangeFromInput && !rangeToInput) {
      if (dateStr < rangeFromInput) {
        setRangeToInput(rangeFromInput);
        setRangeFromInput(dateStr);
      } else {
        setRangeToInput(dateStr);
      }
    }
  };

  const selectPreset = (type: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month') => {
    const now = new Date();
    if (type === 'today') {
      const iso = formatDateISO(now);
      setRangeFromInput(iso);
      setRangeToInput(iso);
    } else if (type === 'yesterday') {
      const yest = new Date();
      yest.setDate(now.getDate() - 1);
      const iso = formatDateISO(yest);
      setRangeFromInput(iso);
      setRangeToInput(iso);
    } else if (type === 'this_week') {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d.setDate(diff));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setRangeFromInput(formatDateISO(mon));
      setRangeToInput(formatDateISO(sun));
    } else if (type === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setRangeFromInput(formatDateISO(first));
      setRangeToInput(formatDateISO(last));
    } else if (type === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setRangeFromInput(formatDateISO(first));
      setRangeToInput(formatDateISO(last));
    }
  };

  const getCalendarGridDays = () => {
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const days: Array<{ dayNum: number; dateStr: string; isCurrentMonth: boolean }> = [];

    const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(calYear, calMonth - 1, prevMonthDays - i);
      days.push({ dayNum: prevMonthDays - i, dateStr: formatDateISO(d), isCurrentMonth: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      const curr = new Date(calYear, calMonth, d);
      days.push({ dayNum: d, dateStr: formatDateISO(curr), isCurrentMonth: true });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const next = new Date(calYear, calMonth + 1, i);
      days.push({ dayNum: i, dateStr: formatDateISO(next), isCurrentMonth: false });
    }

    return days;
  };

  const handleApply = () => {
    if (!rangeFromInput.trim()) {
      Alert.alert('Missing date', 'Enter at least a "From" date.');
      return;
    }
    const from = rangeFromInput.trim();
    const to = rangeToInput.trim() || from;
    onApply(from, to);
  };

  const handleReset = () => {
    setRangeFromInput('');
    setRangeToInput('');
    if (onReset) onReset();
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rangePickerStyles.overlay}>
        <View style={rangePickerStyles.card}>
          <View style={rangePickerStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={rangePickerStyles.title}>Select Date Range</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                {rangeFromInput ? (rangeToInput && rangeToInput !== rangeFromInput ? `${rangeFromInput} → ${rangeToInput}` : rangeFromInput) : 'Tap dates or choose a preset'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" style={{ padding: 4 }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 34 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={rangePickerStyles.presetChip} onPress={() => selectPreset('today')}>
                <Text style={rangePickerStyles.presetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rangePickerStyles.presetChip} onPress={() => selectPreset('yesterday')}>
                <Text style={rangePickerStyles.presetChipText}>Yesterday</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rangePickerStyles.presetChip} onPress={() => selectPreset('this_week')}>
                <Text style={rangePickerStyles.presetChipText}>This Week</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rangePickerStyles.presetChip} onPress={() => selectPreset('this_month')}>
                <Text style={rangePickerStyles.presetChipText}>This Month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rangePickerStyles.presetChip} onPress={() => selectPreset('last_month')}>
                <Text style={rangePickerStyles.presetChipText}>Last Month</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={rangePickerStyles.monthNavRow}>
            <TouchableOpacity onPress={handlePrevMonth} style={rangePickerStyles.monthNavBtn}>
              <ChevronLeft size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={rangePickerStyles.monthNavTitle}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={rangePickerStyles.monthNavBtn}>
              <ChevronRight size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={rangePickerStyles.weekdayRow}>
            {WEEKDAYS.map((wd, i) => (
              <Text key={i} style={rangePickerStyles.weekdayText}>{wd}</Text>
            ))}
          </View>

          <View style={rangePickerStyles.daysGrid}>
            {getCalendarGridDays().map((item, idx) => {
              const isSelectedFrom = item.dateStr === rangeFromInput;
              const isSelectedTo = item.dateStr === rangeToInput;
              const isInRange = !!rangeFromInput && !!rangeToInput && item.dateStr >= rangeFromInput && item.dateStr <= rangeToInput;
              const isSelectedEdge = isSelectedFrom || isSelectedTo;

              return (
                <TouchableOpacity
                  key={`${item.dateStr}-${idx}`}
                  style={[
                    rangePickerStyles.dayCell,
                    isInRange && rangePickerStyles.dayCellInRange,
                    isSelectedEdge && rangePickerStyles.dayCellSelected,
                    !item.isCurrentMonth && { opacity: 0.3 },
                  ]}
                  onPress={() => handleDateClick(item.dateStr)}
                >
                  <Text style={[
                    rangePickerStyles.dayText,
                    isInRange && rangePickerStyles.dayTextInRange,
                    isSelectedEdge && rangePickerStyles.dayTextSelected,
                  ]}>
                    {item.dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={rangePickerStyles.secondaryBtn} onPress={handleReset}>
              <Text style={rangePickerStyles.secondaryBtnText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rangePickerStyles.primaryBtn} onPress={handleApply}>
              <Text style={rangePickerStyles.primaryBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rangePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  presetChip: {
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
    borderColor: 'rgba(14, 165, 233, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetChipText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
  },
  monthNavTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  weekdayText: {
    width: 40,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: 4,
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  dayCellInRange: {
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderRadius: 4,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  dayText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  dayTextInRange: {
    color: colors.primary,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13.5,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13.5,
  },
});
