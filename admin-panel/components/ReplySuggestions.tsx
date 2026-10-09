import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';

export interface ReplyTemplate {
  label: string;
  text: string;
  /** words (any language, lower-case) in the customer's / driver's last message that make this reply a good answer */
  keywords?: string[];
  group?: string;
}

interface Props {
  templates: ReplyTemplate[];
  /** the last message the other side sent - used to put the most fitting replies first */
  lastIncoming?: string | null;
  onPick: (text: string) => void;
  colors: { surface: string; background: string; border: string; text: string; textMuted: string; primary: string };
}

/**
 * Suggested replies for the chat box. Two layouts that can never overlap the message list or the typing box:
 *  - folded: ONE row (fixed height) with the replies that best fit the last message, plus a "More" button
 *  - open:   a short list of cards - name, group and the full text - so the person sees exactly what will be put in the box
 * A reply is only put in the box (never sent), so it can be edited first.
 */
export default function ReplySuggestions({ templates, lastIncoming, onPick, colors }: Props) {
  const [open, setOpen] = useState(false);

  const ranked = useMemo(() => {
    const msg = (lastIncoming || '').toLowerCase();
    const scored = templates.map((t, i) => {
      const hits = msg ? (t.keywords || []).filter((k) => msg.includes(k.toLowerCase())).length : 0;
      return { t, hits, i };
    });
    scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
    return scored;
  }, [templates, lastIncoming]);

  const fitting = ranked.filter((r) => r.hits > 0).map((r) => r.t);
  const chips = (fitting.length > 0 ? fitting : templates).slice(0, 8);

  const pick = (t: ReplyTemplate) => {
    onPick(t.text);
    setOpen(false);
  };

  return (
    <View style={[s.wrap, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <View style={s.headRow}>
        <Sparkles size={13} color={colors.primary} />
        <Text style={[s.head, { color: colors.textMuted }]} numberOfLines={1}>
          {fitting.length > 0 ? 'Suggested for this message' : 'Quick replies'}
        </Text>
        <TouchableOpacity onPress={() => setOpen((v) => !v)} style={s.moreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{open ? 'Less' : `All ${templates.length}`}</Text>
          {open ? <ChevronDown size={14} color={colors.primary} /> : <ChevronUp size={14} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {!open ? (
        <View style={s.chipRowBox}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chipRow}>
            {chips.map((t) => (
              <TouchableOpacity
                key={t.label}
                onPress={() => pick(t)}
                activeOpacity={0.7}
                style={[s.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={s.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {ranked.map(({ t, hits }) => (
            <TouchableOpacity
              key={t.label}
              onPress={() => pick(t)}
              activeOpacity={0.7}
              style={[s.card, { borderColor: hits > 0 ? colors.primary : colors.border, backgroundColor: colors.background }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.primary }}>{t.label}</Text>
                {!!t.group && <Text style={{ fontSize: 10.5, color: colors.textMuted }}>· {t.group}</Text>}
                {hits > 0 && <Text style={{ fontSize: 10.5, color: colors.primary, fontWeight: '700' }}>· fits this message</Text>}
              </View>
              <Text style={{ fontSize: 12, color: colors.text, marginTop: 2, lineHeight: 17 }} numberOfLines={3}>{t.text}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 22 },
  head: { flex: 1, fontSize: 11.5, fontWeight: '700' },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // a FIXED height: a horizontal scroll view with no height collapses to nothing in a column and the rows below draw over it
  chipRowBox: { height: 42, flexShrink: 0 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, maxWidth: 190 },
  list: { maxHeight: 230, flexGrow: 0, paddingHorizontal: 12 },
  card: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
});
