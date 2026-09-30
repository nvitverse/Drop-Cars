import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { CustomDatePickerModal } from './DateTimePickerModals';

// Single tap-to-pick date field ("YYYY-MM-DD" in, "YYYY-MM-DD" out) for places that used to be a raw
// text box where the admin typed the date by hand (document expiry, coupon expiry, ...).

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const show = (v: string) => {
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface Props {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  title?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  placeholderColor?: string;
  // expiry dates are often already in the past (an expired licence) - allow picking any date by default
  minimumDate?: Date;
}

export default function DatePickButton({ value, onChange, placeholder = 'Select date', title = 'Select date', style, textStyle, placeholderColor = '#9CA3AF', minimumDate = new Date(2000, 0, 1) }: Props) {
  const [open, setOpen] = useState(false);
  const initial = value && !isNaN(new Date(`${value}T00:00:00`).getTime()) ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <>
      <TouchableOpacity style={[{ justifyContent: 'center' }, style]} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[textStyle, !value && { color: placeholderColor }]} numberOfLines={1}>
          {value ? show(value) : placeholder}
        </Text>
      </TouchableOpacity>
      <CustomDatePickerModal
        visible={open}
        title={title}
        initialDate={initial}
        minimumDate={minimumDate}
        onConfirm={(d) => { onChange(fmt(d)); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
