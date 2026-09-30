import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { getCitySuggestions, scheduleAutoOnlineLookup, PlacePrediction, saveLocationToCache } from '@/services/citySuggestions';

interface LocationSuggestInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: any;
}

export default function LocationSuggestInput({ value, onChangeText, placeholder, style }: LocationSuggestInputProps) {
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
      if (results.length === 0 && q.length >= 3) {
        setSearchingOnline(true);
        cancelRef.current = scheduleAutoOnlineLookup(
          q,
          (onlineResults) => {
            if (cancelled) return;
            setSearchingOnline(false);
            setSuggestions(onlineResults);
          },
          () => { if (!cancelled) setSearchingOnline(false); },
          350
        );
      } else {
        setSearchingOnline(false);
      }
    });
    return () => { cancelled = true; };
  }, [value, showSuggestions]);

  const pick = (s: PlacePrediction) => {
    saveLocationToCache(s.description);
    onChangeText(s.description);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <View style={{ position: 'relative', zIndex: showSuggestions ? 20 : 1 }}>
      <TextInput
        style={style}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(t) => { onChangeText(t); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
      />
      {showSuggestions && value.trim().length >= 1 && (suggestions.length > 0 || searchingOnline) && (
        <View style={localStyles.dropdown}>
          {suggestions.map((s, idx) => (
            <TouchableOpacity
              key={s.place_id}
              style={[localStyles.suggestionRow, idx > 0 && localStyles.suggestionRowBorder]}
              onPress={() => pick(s)}
            >
              <Text style={localStyles.suggestionMain} numberOfLines={1}>{s.structured_formatting.main_text}</Text>
              <Text style={localStyles.suggestionSub} numberOfLines={1}>{s.structured_formatting.secondary_text}</Text>
            </TouchableOpacity>
          ))}
          {searchingOnline && (
            <View style={[localStyles.suggestionRow, suggestions.length > 0 && localStyles.suggestionRowBorder, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={localStyles.suggestionSub}>Searching online places...</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    maxHeight: 220, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 10 },
  suggestionRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  suggestionMain: { fontSize: 14, fontWeight: '600', color: colors.text },
  suggestionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
