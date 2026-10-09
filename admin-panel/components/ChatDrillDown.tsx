import React, { useEffect, useMemo } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { classifyTopic } from '@/utils/chatTopics';
import type { ChatRowLike, MainCategory } from '@/components/ChatCategories';

export interface DrillCat<R> { id: string; label: string; color: string; rows: R[] }
export interface DrillSection<R> {
  id: string;
  label: string;
  icon: any;
  color: string;
  hint?: string;
  rows: R[];                 // every chat in the section
  cats: DrillCat<R>[] | null; // null = the section opens straight to its chats
}

/** The categories of a section (a topic each), most chats first; empty topics are left out. */
export function buildTopicCats<R extends ChatRowLike>(main: MainCategory<R>, rows: R[]): DrillCat<R>[] {
  const list = rows.filter(main.match);
  const bucket: Record<string, R[]> = {};
  main.topics.forEach((t) => { bucket[t.id] = []; });
  list.forEach((r) => {
    const id = classifyTopic(r, main.topics);
    (bucket[id] || bucket[main.topics[main.topics.length - 1].id]).push(r);
  });
  return main.topics.map((t) => ({ id: t.id, label: t.label, color: t.color, rows: bucket[t.id] || [] })).filter((c) => c.rows.length > 0).sort((a, b) => b.rows.length - a.rows.length);
}

interface Props<R extends ChatRowLike> {
  sections: DrillSection<R>[];
  path: string[];                         // [] = the section tiles, [section] = its categories, [section, category] = the chats
  onPath: (p: string[]) => void;
  renderRow: (r: R) => React.ReactNode;
  colors: { surface: string; surfaceAlt: string; border: string; text: string; textMuted: string; primary: string };
  noun?: string;
}

const unreadOf = (rows: ChatRowLike[]) => rows.reduce((n, r) => n + (r.unread || 0), 0);

/**
 * Chats as pages instead of folding sections: tiles (who / what kind) > categories (what it is about) > the conversations.
 * Each step is its own page with a back arrow, so the screen never carries a long stack of dropdowns.
 */
export default function ChatDrillDown<R extends ChatRowLike>({ sections, path, onPath, renderRow, colors, noun = 'chat' }: Props<R>) {
  const section = path[0] ? sections.find((s) => s.id === path[0]) : undefined;
  const cat = section && section.cats && path[1] && path[1] !== '__all' ? section.cats.find((c) => c.id === path[1]) : undefined;
  const depth = !section ? 0 : (section.cats && !path[1]) ? 1 : 2;

  useEffect(() => {
    if (path.length === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onPath(path.slice(0, -1)); return true; });
    return () => sub.remove();
  }, [path, onPath]);

  const total = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);

  const Tile = ({ icon: Icon, label, count, unread, color, onPress, wide }: { icon?: any; label: string; count: number; unread: number; color: string; onPress: () => void; wide?: boolean }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[s.tile, wide ? s.tileWide : null, { backgroundColor: colors.surface, borderColor: unread > 0 ? color + '88' : colors.border }]}
    >
      <View style={s.tileTop}>
        {Icon ? <View style={[s.iconWrap, { backgroundColor: color + '1F' }]}><Icon size={15} color={color} /></View> : <View style={[s.dot, { backgroundColor: color }]} />}
        {unread > 0 && <View style={[s.badge, { backgroundColor: color }]}><Text style={s.badgeText}>{unread}</Text></View>}
      </View>
      <Text style={[s.tileLabel, { color: colors.text }]} numberOfLines={2}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{count} {count === 1 ? noun : `${noun}s`}</Text>
    </TouchableOpacity>
  );

  const Header = ({ title, sub, color }: { title: string; sub: string; color: string }) => (
    <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={() => onPath(path.slice(0, -1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[s.backBtn, { backgroundColor: colors.surfaceAlt }]}>
        <ArrowLeft size={16} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={[s.dot, { backgroundColor: color, width: 10, height: 10, borderRadius: 5 }]} />
    </View>
  );

  const Empty = ({ text }: { text: string }) => (
    <View style={[s.empty, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{text}</Text>
    </View>
  );

  // page 1: the tiles
  if (depth === 0) {
    return (
      <View style={s.grid}>
        {sections.map((sec) => (
          <Tile key={sec.id} icon={sec.icon} label={sec.label} count={sec.rows.length} unread={unreadOf(sec.rows)} color={sec.color} onPress={() => onPath([sec.id])} />
        ))}
        {total === 0 && <Empty text="No chats yet" />}
      </View>
    );
  }

  if (!section) return null;

  // page 2: the categories of one section
  if (depth === 1 && section.cats) {
    return (
      <View style={{ gap: 8 }}>
        <Header title={section.label} sub={`${section.rows.length} ${section.rows.length === 1 ? noun : `${noun}s`}`} color={section.color} />
        {section.cats.length === 0 ? <Empty text={section.hint || 'No conversations here'} /> : (
          <View style={{ gap: 6 }}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => onPath([section.id, '__all'])} style={[s.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[s.dot, { backgroundColor: colors.primary }]} />
              <Text style={[s.rowLabel, { color: colors.text }]}>Everything</Text>
              {unreadOf(section.rows) > 0 && <View style={[s.badge, { backgroundColor: colors.primary }]}><Text style={s.badgeText}>{unreadOf(section.rows)}</Text></View>}
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{section.rows.length}</Text>
              <ChevronRight size={15} color={colors.textMuted} />
            </TouchableOpacity>
            {section.cats.map((c) => (
              <TouchableOpacity key={c.id} activeOpacity={0.75} onPress={() => onPath([section.id, c.id])} style={[s.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.dot, { backgroundColor: c.color }]} />
                <Text style={[s.rowLabel, { color: colors.text }]} numberOfLines={1}>{c.label}</Text>
                {unreadOf(c.rows) > 0 && <View style={[s.badge, { backgroundColor: c.color }]}><Text style={s.badgeText}>{unreadOf(c.rows)}</Text></View>}
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.rows.length}</Text>
                <ChevronRight size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  // page 3: the chats
  const list = cat ? cat.rows : section.rows;
  const title = cat ? `${section.label} › ${cat.label}` : section.label;
  return (
    <View style={{ gap: 8 }}>
      <Header title={title} sub={`${list.length} ${list.length === 1 ? noun : `${noun}s`}`} color={cat ? cat.color : section.color} />
      {list.length === 0 ? <Empty text={section.hint || 'No conversations here'} /> : (
        <View style={{ gap: 6 }}>{list.map((r) => <View key={r.key}>{renderRow(r)}</View>)}</View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 10, gap: 3, minHeight: 86 },
  tileWide: { width: '100%' },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  tileLabel: { fontWeight: '800', fontSize: 13 },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 8 },
  backBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  rowLabel: { flex: 1, fontWeight: '700', fontSize: 13 },
  empty: { borderWidth: 1, borderRadius: 10, padding: 12, width: '100%' },
});
