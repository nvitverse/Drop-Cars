import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { classifyTopic, TopicDef } from '@/utils/chatTopics';

export interface ChatRowLike {
  key: string;
  unread: number;
  last_text?: string | null;
  title?: string;
  help?: boolean;
  stage?: string;
}

export interface MainCategory<R extends ChatRowLike> {
  id: string;
  label: string;
  icon: any;
  color: string;
  hint?: string;
  topics: TopicDef[];
  match: (r: R) => boolean;
}

interface Props<R extends ChatRowLike> {
  categories: MainCategory<R>[];
  rows: R[];
  open: Set<string>;
  onToggle: (id: string) => void;
  renderRow: (r: R) => React.ReactNode;
  colors: { surface: string; surfaceAlt: string; border: string; text: string; textMuted: string; primary: string };
  noun?: string;               // "chat" / "trip chat"
}

/**
 * Chats sorted as  who (main category) > what it is about (topic) > the conversations.
 * Every main category shows a stacked bar of its topics, every topic its own bar and the unread count, so a glance tells
 * "5 drivers cannot log in, 3 have document problems, 2 are asking about money". Tapping opens the list.
 */
export default function ChatCategories<R extends ChatRowLike>({ categories, rows, open, onToggle, renderRow, colors, noun = 'chat' }: Props<R>) {
  const model = useMemo(() => {
    return categories.map((c) => {
      const list = rows.filter(c.match);
      const bucket: Record<string, R[]> = {};
      c.topics.forEach((t) => { bucket[t.id] = []; });
      list.forEach((r) => {
        const id = classifyTopic(r, c.topics);
        (bucket[id] || bucket[c.topics[c.topics.length - 1].id]).push(r);
      });
      const subs = c.topics
        .map((t) => ({ topic: t, items: bucket[t.id] || [] }))
        .filter((s) => s.items.length > 0)
        .sort((a, b) => b.items.length - a.items.length);
      const unread = list.reduce((n, r) => n + (r.unread || 0), 0);
      return { c, list, subs, unread };
    });
  }, [categories, rows]);

  return (
    <View style={{ gap: 8 }}>
      {model.map(({ c, list, subs, unread }) => {
        const Icon = c.icon;
        const mainKey = `main:${c.id}`;
        const isOpen = open.has(mainKey);
        const max = Math.max(1, ...subs.map((s) => s.items.length));
        return (
          <View key={c.id}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onToggle(mainKey)}
              style={[s.main, { backgroundColor: colors.surface, borderColor: unread > 0 ? c.color + '66' : colors.border }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[s.iconWrap, { backgroundColor: c.color + '18' }]}>
                  <Icon size={16} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13.5 }}>{c.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {list.length} {list.length === 1 ? noun : `${noun}s`}{subs.length > 0 ? ` · ${subs.length} ${subs.length === 1 ? 'topic' : 'topics'}` : ''}
                  </Text>
                </View>
                {unread > 0 && (
                  <View style={[s.badge, { backgroundColor: c.color }]}>
                    <Text style={s.badgeText}>{unread}</Text>
                  </View>
                )}
                {isOpen ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
              </View>

              {/* stacked chart: how this category's chats split by topic */}
              {list.length > 0 && (
                <View style={[s.stack, { backgroundColor: colors.surfaceAlt }]}>
                  {subs.map((sub) => (
                    <View key={sub.topic.id} style={{ flex: sub.items.length, backgroundColor: sub.topic.color }} />
                  ))}
                </View>
              )}
              {list.length > 0 && !isOpen && (
                <View style={s.legend}>
                  {subs.slice(0, 4).map((sub) => (
                    <View key={sub.topic.id} style={s.legendItem}>
                      <View style={[s.dot, { backgroundColor: sub.topic.color }]} />
                      <Text style={{ fontSize: 10.5, color: colors.textMuted }} numberOfLines={1}>{sub.topic.label} {sub.items.length}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>

            {isOpen && (
              <View style={{ marginTop: 6, paddingLeft: 6, gap: 6 }}>
                {subs.length === 0 ? (
                  <View style={[s.empty, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.hint || 'No conversations in this category'}</Text>
                  </View>
                ) : (
                  subs.map((sub) => {
                    const subKey = `sub:${c.id}:${sub.topic.id}`;
                    const subOpen = open.has(subKey);
                    const subUnread = sub.items.reduce((n, r) => n + (r.unread || 0), 0);
                    return (
                      <View key={sub.topic.id}>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => onToggle(subKey)}
                          style={[s.sub, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                          <View style={[s.dot, { backgroundColor: sub.topic.color, width: 10, height: 10, borderRadius: 5 }]} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12.5, flex: 1 }} numberOfLines={1}>{sub.topic.label}</Text>
                              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginLeft: 6 }}>{sub.items.length}</Text>
                            </View>
                            <View style={[s.bar, { backgroundColor: colors.surfaceAlt }]}>
                              <View style={{ width: `${Math.round((sub.items.length / max) * 100)}%`, height: '100%', backgroundColor: sub.topic.color, borderRadius: 3 }} />
                            </View>
                          </View>
                          {subUnread > 0 && (
                            <View style={[s.badge, { backgroundColor: sub.topic.color, marginLeft: 6 }]}>
                              <Text style={s.badgeText}>{subUnread}</Text>
                            </View>
                          )}
                          {subOpen ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronRight size={14} color={colors.textMuted} />}
                        </TouchableOpacity>
                        {subOpen && (
                          <View style={{ gap: 6, marginTop: 6, paddingLeft: 4 }}>
                            {sub.items.map((r) => (
                              <View key={r.key}>{renderRow(r)}</View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  main: { borderWidth: 1, borderRadius: 10, padding: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  stack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8, gap: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  bar: { height: 5, borderRadius: 3, marginTop: 5, overflow: 'hidden' },
  empty: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
