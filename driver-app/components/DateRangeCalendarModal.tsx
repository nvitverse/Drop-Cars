import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Calendar, ChevronLeft, ChevronRight, X, Check } from 'lucide-react-native';

export interface DateRange {
  fromDate: string | null; // Format YYYY-MM-DD
  toDate: string | null;   // Format YYYY-MM-DD
}

export interface DateRangeCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectRange?: (range: DateRange) => void;
  initialRange?: DateRange;
  singleDateMode?: boolean;
  onSelectSingleDate?: (date: string) => void;
  noModalWrapper?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DateRangeCalendarModal({
  visible,
  onClose,
  onSelectRange,
  initialRange = { fromDate: null, toDate: null },
  singleDateMode = false,
  onSelectSingleDate,
  noModalWrapper = false,
}: DateRangeCalendarModalProps) {
  const { colors, isDarkMode } = useTheme();

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth()); // 0-indexed

  const [fromDate, setFromDate] = useState<string | null>(initialRange.fromDate);
  const [toDate, setToDate] = useState<string | null>(initialRange.toDate);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOffset = (year: number, month: number) => {
    return new Date(year, month, 1).getDay(); // 0 = Sun
  };

  const formatDateStr = (year: number, month: number, day: number) => {
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  };

  const handleDayPress = (dateStr: string) => {
    if (singleDateMode) {
      setFromDate(dateStr);
      setToDate(dateStr);
      return;
    }
    if (!fromDate || (fromDate && toDate)) {
      setFromDate(dateStr);
      setToDate(null);
    } else if (fromDate && !toDate) {
      if (dateStr < fromDate) {
        setFromDate(dateStr);
      } else {
        setToDate(dateStr);
      }
    }
  };

  const handleApply = () => {
    if (singleDateMode) {
      if (fromDate && onSelectSingleDate) {
        onSelectSingleDate(fromDate);
      }
      onClose();
      return;
    }
    if (onSelectRange) {
      onSelectRange({ fromDate, toDate: toDate || fromDate });
    }
    onClose();
  };

  const handleClear = () => {
    setFromDate(null);
    setToDate(null);
    if (!singleDateMode && onSelectRange) {
      onSelectRange({ fromDate: null, toDate: null });
    }
    onClose();
  };

  const handlePreset = (preset: 'today' | 'tomorrow' | 'day_after' | 'week' | 'month') => {
    const today = new Date();
    const tStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

    if (preset === 'today') {
      setFromDate(tStr);
      setToDate(tStr);
    } else if (preset === 'tomorrow') {
      const tom = new Date(today);
      tom.setDate(tom.getDate() + 1);
      const tomStr = formatDateStr(tom.getFullYear(), tom.getMonth(), tom.getDate());
      setFromDate(tomStr);
      setToDate(tomStr);
    } else if (preset === 'day_after') {
      const da = new Date(today);
      da.setDate(da.getDate() + 2);
      const daStr = formatDateStr(da.getFullYear(), da.getMonth(), da.getDate());
      setFromDate(daStr);
      setToDate(daStr);
    } else if (preset === 'week') {
      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      setFromDate(tStr);
      setToDate(formatDateStr(end.getFullYear(), end.getMonth(), end.getDate()));
    } else if (preset === 'month') {
      const first = formatDateStr(today.getFullYear(), today.getMonth(), 1);
      const last = formatDateStr(today.getFullYear(), today.getMonth(), getDaysInMonth(today.getFullYear(), today.getMonth()));
      setFromDate(first);
      setToDate(last);
    }
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOffset = getFirstDayOffset(currentYear, currentMonth);

  if (!visible) return null;

  const content = (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar color={colors.primary} size={20} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {singleDateMode ? 'Select Date' : 'Select Date Range'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetsRow}>
            {singleDateMode ? (
              [
                { label: 'Today', key: 'today' },
                { label: 'Tomorrow', key: 'tomorrow' },
                { label: 'Day After', key: 'day_after' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.presetChip, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => handlePreset(p.key as any)}
                >
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.primary }}>{p.label}</Text>
                </TouchableOpacity>
              ))
            ) : (
              [
                { label: 'Today', key: 'today' },
                { label: 'Next 7 Days', key: 'week' },
                { label: 'This Month', key: 'month' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.presetChip, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => handlePreset(p.key as any)}
                >
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.primary }}>{p.label}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Month & Year Navigation */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
              <ChevronLeft color={colors.text} size={22} />
            </TouchableOpacity>

            <Text style={[styles.monthYearTitle, { color: colors.text }]}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </Text>

            <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
              <ChevronRight color={colors.text} size={22} />
            </TouchableOpacity>
          </View>

          {/* Day Headers (Sun-Sat) */}
          <View style={styles.dayHeaderRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <Text key={d} style={[styles.dayHeaderText, { color: colors.textSecondary }]}>
                {d}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {/* Empty slots for offset */}
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <View key={`empty_${i}`} style={styles.daySlot} />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = formatDateStr(currentYear, currentMonth, dayNum);

              const isFrom = dateStr === fromDate;
              const isTo = dateStr === toDate;
              const isInRange = !singleDateMode && fromDate && toDate && dateStr > fromDate && dateStr < toDate;
              const isSelected = singleDateMode ? isFrom : (isFrom || isTo);

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.daySlot,
                    isSelected && { backgroundColor: colors.primary, borderRadius: 10 },
                    isInRange && { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)' },
                  ]}
                  onPress={() => handleDayPress(dateStr)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: isSelected ? '#FFFFFF' : colors.text },
                      isInRange && { color: colors.primary, fontFamily: 'Inter-Bold' },
                    ]}
                  >
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selection Summary */}
          <View style={[styles.summaryBox, { backgroundColor: colors.background }]}>
            {singleDateMode ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                Selected Date: <Text style={{ fontFamily: 'Inter-Bold', color: colors.primary }}>{fromDate || 'Not selected'}</Text>
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  From: <Text style={{ fontFamily: 'Inter-Bold', color: colors.text }}>{fromDate || 'Not selected'}</Text>
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  To: <Text style={{ fontFamily: 'Inter-Bold', color: colors.text }}>{toDate || fromDate || 'Not selected'}</Text>
                </Text>
              </>
            )}
          </View>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={handleClear}>
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApply}>
              <Check color="#FFFFFF" size={16} />
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>
                {singleDateMode ? 'Confirm' : 'Apply Date Range'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
  );

  if (noModalWrapper) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 99999, elevation: 99999 }]}>
        {content}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 10,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navBtn: {
    padding: 6,
  },
  monthYearTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  daySlot: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clearBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  applyBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 6,
    gap: 6,
  },
});
