import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { getCitySuggestions, scheduleAutoOnlineLookup, PlacePrediction } from '@/services/citySuggestionsDriver';

// Same platform city list (free local fuzzy match, typo-tolerant, then a
// one-shot online lookup that persists the resolved city for everyone) the
// Vendor App's LocationPicker already uses - replaces this field's earlier
// per-keystroke Nominatim passthrough (GET /api/geocode/search) so every
// app's location field is backed by the exact same data source.

interface LocationAutocompleteFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect?: (suggestion: PlacePrediction) => void;
  placeholder: string;
  icon?: React.ReactNode;
  style?: any;
  inputStyle?: any;
}

export default function LocationAutocompleteField({
  value,
  onChangeText,
  onSelect,
  placeholder,
  icon,
  style,
  inputStyle,
}: LocationAutocompleteFieldProps) {
  const { colors } = useTheme();
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    const q = value.trim();
    if (!showSuggestions || q.length < 1) {
      setSuggestions([]);
      setSearchingOnline(false);
      cancelRef.current();
      return;
    }
    let cancelled = false;
    getCitySuggestions(q).then((results) => {
      if (cancelled) return;
      setSuggestions(results);
      if (results.length === 0) {
        setSearchingOnline(true);
        cancelRef.current = scheduleAutoOnlineLookup(
          q,
          (city) => {
            if (cancelled) return;
            setSearchingOnline(false);
            setSuggestions([{
              place_id: `online_${city}`,
              description: city,
              structured_formatting: { main_text: city, secondary_text: 'Found online' },
            }]);
          },
          () => { if (!cancelled) setSearchingOnline(false); },
        );
      } else {
        setSearchingOnline(false);
      }
    });
    return () => { cancelled = true; };
  }, [value, showSuggestions]);

  const pick = (s: PlacePrediction) => {
    onChangeText(s.description);
    setShowSuggestions(false);
    setSuggestions([]);
    onSelect?.(s);
  };

  const isSelectingRef = useRef(false);

  return (
    <View style={{ position: 'relative', zIndex: showSuggestions ? 9999 : 1, elevation: showSuggestions ? 25 : 1 }}>
      <View style={style}>
        {icon}
        <TextInput
          style={inputStyle}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={(t) => {
            onChangeText(t);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay closing so suggestion touch event completes if user tapped a row
            setTimeout(() => {
              if (!isSelectingRef.current) {
                setShowSuggestions(false);
              }
            }, 300);
          }}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
        />
        {searchingOnline && <ActivityIndicator size="small" color={colors.textSecondary} />}
      </View>

      {showSuggestions && value.trim().length >= 1 && (suggestions.length > 0 || searchingOnline) && (
        <View style={[localStyles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {suggestions.map((s, idx) => (
            <TouchableOpacity
              key={s.place_id}
              style={[localStyles.suggestionRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
              onPressIn={() => {
                isSelectingRef.current = true;
                pick(s);
              }}
              onPress={() => {
                isSelectingRef.current = false;
              }}
            >
              <Text style={[localStyles.suggestionMain, { color: colors.text }]} numberOfLines={1}>
                {s.structured_formatting.main_text}
              </Text>
              <Text style={[localStyles.suggestionSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {s.structured_formatting.secondary_text}
              </Text>
            </TouchableOpacity>
          ))}
          {searchingOnline && (
            <View style={[localStyles.suggestionRow, suggestions.length > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[localStyles.suggestionSub, { color: colors.textSecondary }]}>Searching online...</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 260,
    zIndex: 99999,
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionMain: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  suggestionSub: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginTop: 1,
  },
});
