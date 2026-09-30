import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface CarNumberInputProps {
  /** Combined plate string, e.g. "TN25CC8246". */
  value: string;
  /** Called with the combined uppercase plate whenever any part changes. */
  onChangeText: (combined: string) => void;
}

/** Split a combined plate into its 4 parts: State, RTO, Series, Number. */
function splitPlate(v: string) {
  const s = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,3})(\d{0,4})$/);
  return m
    ? { state: m[1], rto: m[2], series: m[3], number: m[4] }
    : { state: '', rto: '', series: '', number: '' };
}

/**
 * Structured registration-number entry with 4 boxes:
 *   State (2 letters) · RTO (2 digits) · Series (letters) · Number (4 digits)
 * e.g. TN · 25 · CC · 8246  ->  "TN25CC8246"
 * Emits the combined string so callers keep storing a single car_number.
 */
export default function CarNumberInput({ value, onChangeText }: CarNumberInputProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const initial = splitPlate(value);
  const [state, setState] = useState(initial.state);
  const [rto, setRto] = useState(initial.rto);
  const [series, setSeries] = useState(initial.series);
  const [number, setNumber] = useState(initial.number);

  const rtoRef = useRef<TextInput>(null);
  const seriesRef = useRef<TextInput>(null);
  const numberRef = useRef<TextInput>(null);

  const emit = (st: string, rt: string, se: string, nu: string) =>
    onChangeText(`${st}${rt}${se}${nu}`);

  const letters = (t: string) => t.toUpperCase().replace(/[^A-Z]/g, '');
  const digits = (t: string) => t.replace(/[^0-9]/g, '');

  const box = (extra?: object) => [
    styles.box,
    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
    extra,
  ];

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={box({ flex: 2 })}
          value={state}
          onChangeText={(t) => {
            const v = letters(t).slice(0, 2);
            setState(v);
            emit(v, rto, series, number);
            if (v.length === 2) rtoRef.current?.focus();
          }}
          placeholder="TN"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          maxLength={2}
        />
        <TextInput
          ref={rtoRef}
          style={box({ flex: 2 })}
          value={rto}
          onChangeText={(t) => {
            const v = digits(t).slice(0, 2);
            setRto(v);
            emit(state, v, series, number);
            if (v.length === 2) seriesRef.current?.focus();
          }}
          placeholder="25"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextInput
          ref={seriesRef}
          style={box({ flex: 2 })}
          value={series}
          onChangeText={(t) => {
            const v = letters(t).slice(0, 3);
            setSeries(v);
            emit(state, rto, v, number);
            if (v.length >= 2) numberRef.current?.focus();
          }}
          placeholder="CC"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          maxLength={3}
        />
        <TextInput
          ref={numberRef}
          style={box({ flex: 3 })}
          value={number}
          onChangeText={(t) => {
            const v = digits(t).slice(0, 4);
            setNumber(v);
            emit(state, rto, series, v);
          }}
          placeholder="8246"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
      <Text style={[styles.preview, { color: colors.textSecondary }]}>
        {state || rto || series || number
          ? t('carNumberInput.numberPreview', { plate: `${state}${rto}${series}${number}` })
          : t('carNumberInput.placeholderHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  box: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    // Web only: a raw <input> has a browser-default width (~20 characters)
    // that flexbox won't shrink below unless min-width is explicitly
    // cleared, so these 4 boxes were overflowing off narrow screens instead
    // of sharing the row per their flex ratios. No effect on native.
    minWidth: 0,
  },
  preview: {
    marginTop: 6,
    fontSize: 13,
  },
});
