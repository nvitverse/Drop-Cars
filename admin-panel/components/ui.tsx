// Prompt 11 — High-End Signature UI Kit for Drop Cars Admin (Staff & Owner) App.
// Linear / Stripe / Razorpay X design language: dense, confident, high-contrast, compact curves (<=10px), tabular numbers.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useTheme, ACCENTS, ACCENT_KEYS, AccentKey } from '@/context/ThemeContext';
import { radii, typography, spacing, shadows } from '@/constants/theme';
import { ChevronRight, X, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react-native';

/** 1. ScreenHero: Replaces the flat header with a subtle gradient wash, Title greeting, duty pill, and avatar */
export function ScreenHero({
  greeting,
  name,
  subtitle,
  onDuty,
  onToggleDuty,
  avatarText,
  onAvatarPress,
  rightAction,
  rich = true,
}: {
  greeting: string;
  name: string;
  subtitle?: string;
  onDuty?: boolean | null;
  onToggleDuty?: () => void;
  avatarText?: string;
  onAvatarPress?: () => void;
  rightAction?: React.ReactNode;
  rich?: boolean;
}) {
  const { themeColors, isDark } = useTheme();

  const gradientColors = rich
    ? (isDark ? ['#0B0F19', '#1E1B4B'] as const : ['#1E1B4B', '#312E81'] as const)
    : (isDark ? [themeColors.surfaceAlt, themeColors.surface] as const : [themeColors.primaryTint, themeColors.surface] as const);

  const isRichTheme = rich;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        heroStyles.heroContainer,
        {
          borderBottomColor: isRichTheme ? 'rgba(255,255,255,0.1)' : themeColors.border,
        },
      ]}
    >
      <View style={heroStyles.heroTop}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            style={[
              heroStyles.greetingText,
              { color: isRichTheme ? '#A5B4FC' : themeColors.textSecondary },
            ]}
          >
            {greeting}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <Text
              style={[
                heroStyles.nameText,
                { color: isRichTheme ? '#FFFFFF' : themeColors.text },
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {onToggleDuty !== undefined && onDuty !== undefined && (
              <TouchableOpacity
                onPress={onToggleDuty}
                activeOpacity={0.7}
                style={[
                  heroStyles.dutyPill,
                  {
                    backgroundColor: onDuty
                      ? (isRichTheme ? 'rgba(16, 185, 129, 0.25)' : themeColors.successLight)
                      : (isRichTheme ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2'),
                    borderColor: onDuty
                      ? '#10B981'
                      : (isRichTheme ? '#EF4444' : '#FCA5A5'),
                  },
                ]}
              >
                <View
                  style={[
                    heroStyles.dutyDot,
                    { backgroundColor: onDuty ? '#10B981' : '#EF4444' },
                  ]}
                />
                <Text
                  style={[
                    heroStyles.dutyText,
                    { color: onDuty ? '#34D399' : (isRichTheme ? '#FCA5A5' : '#DC2626'), fontWeight: '800' },
                  ]}
                >
                  {onDuty ? 'On Duty' : 'Off Duty'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {subtitle && (
            <Text
              style={[
                heroStyles.subText,
                { color: isRichTheme ? '#C7D2FE' : themeColors.textMuted },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View style={heroStyles.rightArea}>
          {rightAction}
          {avatarText && (
            <TouchableOpacity
              onPress={onAvatarPress}
              activeOpacity={0.7}
              style={[
                heroStyles.avatar,
                {
                  backgroundColor: isRichTheme ? '#4F46E5' : themeColors.primary,
                  borderColor: isRichTheme ? 'rgba(255, 255, 255, 0.25)' : themeColors.border,
                },
              ]}
            >
              <Text style={heroStyles.avatarText}>{avatarText.slice(0, 2).toUpperCase()}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const heroStyles = StyleSheet.create({
  heroContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  nameText: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subText: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  rightArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  dutyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dutyText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

/** 2. KpiStrip + KpiTile: Dense 3-tile card with hairline dividers, Display numbers, delta chips & sparkline */
export interface KpiItem {
  label: string;
  value: string | number;
  delta?: string;
  isPositive?: boolean;
  tone?: string;
  sparklineData?: number[];
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  const { themeColors, isDark } = useTheme();

  return (
    <View style={kpiStyles.container}>
      <View
        style={[
          kpiStyles.stripCard,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
          },
        ]}
      >
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const toneColor = item.tone || (item.isPositive ? '#10B981' : '#EF4444');

          return (
            <View
              key={item.label + idx}
              style={[
                kpiStyles.stripSegment,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : (toneColor ? toneColor + '08' : '#F8FAFC'),
                },
                !isLast && {
                  marginRight: 4,
                },
              ]}
            >
              <Text
                style={[kpiStyles.segmentLabel, { color: themeColors.textSecondary }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>

              <Text
                style={[
                  kpiStyles.segmentValue,
                  { color: item.tone || themeColors.text },
                ]}
                numberOfLines={1}
              >
                {item.value}
              </Text>

              {item.delta ? (
                <View
                  style={[
                    kpiStyles.deltaChip,
                    {
                      backgroundColor: toneColor + (isDark ? '25' : '18'),
                      borderColor: toneColor + (isDark ? '45' : '35'),
                    },
                  ]}
                >
                  <Text
                    style={[
                      kpiStyles.deltaText,
                      { color: toneColor },
                    ]}
                    numberOfLines={1}
                  >
                    {item.delta}
                  </Text>
                </View>
              ) : (
                <View style={kpiStyles.deltaPlaceholder} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  stripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  stripSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  segmentLabel: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 3,
  },
  segmentValue: {
    fontSize: 19,
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 3,
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    minHeight: 16,
  },
  deltaPlaceholder: {
    height: 16,
  },
  deltaText: {
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: -0.1,
  },
});

/** 3. PriorityTile + PriorityGrid: 2-column grid for "Needs your attention" with count badges, icon chip, title & 1-line caption */
export interface PriorityItem {
  key: string;
  icon: any;
  title: string;
  count?: number;
  subtitle: string;
  isUrgent?: boolean;
  alwaysVisible?: boolean;
  onPress: () => void;
}

export function PriorityGrid({ items }: { items: PriorityItem[] }) {
  const { themeColors } = useTheme();
  const activeItems = items.filter((i) => (i.count ?? 0) > 0 || i.alwaysVisible);
  const clearItems = items.filter((i) => (i.count ?? 0) === 0 && !i.alwaysVisible);

  return (
    <View style={priorityStyles.container}>
      {/* 2-column Grid of Active Tasks */}
      <View style={priorityStyles.grid}>
        {activeItems.map((item) => {
          const countVal = item.count ?? 0;
          const isUrgent = item.isUrgent || (countVal > 0 && (item.key.includes('urgent') || item.key.includes('missed')));
          const iconBg = isUrgent ? themeColors.errorLight : themeColors.primaryLight;
          const iconFg = isUrgent ? themeColors.error : themeColors.primary;
          const badgeBg = isUrgent ? themeColors.error : themeColors.surfaceAlt;
          const badgeFg = isUrgent ? '#FFFFFF' : themeColors.textSecondary;

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.75}
              onPress={item.onPress}
              style={[
                priorityStyles.tile,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: isUrgent ? themeColors.error + '40' : themeColors.border,
                },
              ]}
            >
              <View style={priorityStyles.tileHeader}>
                <View style={[priorityStyles.iconBox, { backgroundColor: iconBg }]}>
                  <item.icon size={16} color={iconFg} />
                </View>
                <View style={[priorityStyles.countBadge, { backgroundColor: badgeBg }]}>
                  <Text style={[priorityStyles.countText, { color: badgeFg }]}>
                    {countVal > 99 ? '99+' : countVal}
                  </Text>
                </View>
              </View>

              <Text style={[priorityStyles.tileTitle, { color: themeColors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[priorityStyles.tileSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Collapsed Slim "All Clear" summary for 0-count items */}
      {clearItems.length > 0 && (
        <View style={[priorityStyles.allClearBanner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <CheckCircle2 size={13} color={themeColors.success} />
          <Text style={[priorityStyles.allClearText, { color: themeColors.textMuted }]} numberOfLines={1}>
            All clear: {clearItems.map((c) => c.title).join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}

const priorityStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '48.8%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'space-between',
    minHeight: 88,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 11,
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  tileTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    marginBottom: 1,
  },
  tileSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  allClearBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
  },
  allClearText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
});

/** 4. ActionDock: Horizontally scrollable row of compact action cards + "More" FAB sheet */
export interface ActionItem {
  id: string;
  label: string;
  icon: any;
  onPress: () => void;
  isPrimary?: boolean;
}

// A wrapping grid, not a horizontal scroller - a sideways-scrolling row hid
// the last actions off-screen ("GST invoic..." cut at the edge) and most
// people never discovered them (owner feedback 2026-09-30). Four per row
// on phone width, all visible at once.
export function ActionDock({ items, onMorePress }: { items: ActionItem[]; onMorePress?: () => void }) {
  const { themeColors } = useTheme();
  const { width } = useWindowDimensions();
  const perRow = width >= 600 ? 6 : 4;
  const gap = 8;
  const cardWidth = Math.floor((Math.min(width, 900) - 32 - gap * (perRow - 1)) / perRow);

  return (
    <View style={actionDockStyles.grid}>
      {items.map((action, idx) => {
        const isPrimary = action.isPrimary || idx === 0;
        return (
          <TouchableOpacity
            key={action.id}
            activeOpacity={0.8}
            onPress={action.onPress}
            style={[
              actionDockStyles.actionCard,
              {
                width: cardWidth,
                backgroundColor: isPrimary ? themeColors.primary : themeColors.surface,
                borderColor: isPrimary ? themeColors.primary : themeColors.border,
              },
            ]}
          >
            <View
              style={[
                actionDockStyles.actionIconBox,
                { backgroundColor: isPrimary ? 'rgba(255,255,255,0.2)' : themeColors.primaryLight },
              ]}
            >
              <action.icon size={18} color={isPrimary ? '#FFFFFF' : themeColors.primary} />
            </View>
            <Text
              style={[
                actionDockStyles.actionLabel,
                { color: isPrimary ? '#FFFFFF' : themeColors.text },
              ]}
              numberOfLines={2}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const actionDockStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  actionCard: {
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 10,
    lineHeight: 12.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    textAlign: 'center',
  },
});

/** 5. ListCard: 2 lines + right column status pill + relative time */
export function ListCard({
  icon: Icon,
  avatarUrl,
  title,
  subtitle,
  rightTop,
  rightBottom,
  status,
  statusVariant,
  onPress,
  style,
}: {
  icon?: any;
  avatarUrl?: string;
  title: string;
  subtitle: string;
  rightTop?: React.ReactNode;
  rightBottom?: React.ReactNode;
  status?: string;
  statusVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { themeColors } = useTheme();

  return (
    <Card onPress={onPress} style={[listCardStyles.card, style]}>
      <View style={listCardStyles.row}>
        {Icon ? (
          <View style={[listCardStyles.avatar, { backgroundColor: themeColors.primaryLight }]}>
            <Icon size={18} color={themeColors.primary} />
          </View>
        ) : null}

        <View style={listCardStyles.mid}>
          <Text style={[listCardStyles.title, { color: themeColors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[listCardStyles.sub, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={listCardStyles.rightCol}>
          {status ? (
            <StatusPill status={status} variant={statusVariant} size="sm" />
          ) : (
            rightTop
          )}
          {rightBottom}
        </View>
      </View>
    </Card>
  );
}

const listCardStyles = StyleSheet.create({
  card: {
    padding: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    marginBottom: 2,
  },
  sub: {
    fontSize: 12,
    fontWeight: '500',
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
});

/** 6. Section & Row (Shared layout primitives) */
export function Section({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { themeColors } = useTheme();
  return (
    <View style={[{ marginTop: 14 }, style]}>
      {(title || right) && (
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color: themeColors.textSecondary }]}>{title}</Text>
          {right}
        </View>
      )}
      <View
        style={{
          backgroundColor: themeColors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: themeColors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function Row({
  icon: Icon,
  color,
  title,
  subtitle,
  count,
  onPress,
  chevron,
  last,
  right,
}: {
  icon?: any;
  color?: string;
  title: string;
  subtitle?: string;
  count?: number | null;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  right?: React.ReactNode;
}) {
  const { themeColors } = useTheme();
  const tone = color || themeColors.primary;
  const isUrgent = count != null && count > 0;

  const body = (
    <View
      style={[
        s.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.border },
      ]}
    >
      {Icon ? (
        <View style={[s.rowIcon, { backgroundColor: tone + '18' }]}>
          <Icon size={18} color={tone} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: themeColors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[s.rowSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {count != null && count > 0 ? (
        <View style={[s.countBadge, { backgroundColor: isUrgent ? themeColors.error : themeColors.surfaceAlt }]}>
          <Text style={[s.countText, { color: isUrgent ? '#FFFFFF' : themeColors.textSecondary }]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
      {chevron ? <ChevronRight size={16} color={themeColors.textMuted} /> : null}
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.6} onPress={onPress}>{body}</TouchableOpacity> : body;
}

/** 7. Segmented / Tabs */
export type SegmentOption = { key?: string; value?: string; label: string; count?: number };

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { themeColors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: themeColors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: themeColors.border,
      }}
    >
      {options.map((o) => {
        const itemKey = (o.value ?? o.key) || o.label;
        const on = itemKey === value;
        return (
          <TouchableOpacity
            key={itemKey}
            style={[s.seg, on && { borderBottomColor: themeColors.primary }]}
            onPress={() => onChange(itemKey)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                s.segText,
                { color: on ? themeColors.primary : themeColors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.count ? (
              <View
                style={[
                  s.segCount,
                  { backgroundColor: on ? themeColors.primary : themeColors.surfaceAlt },
                ]}
              >
                <Text
                  style={[
                    s.countText,
                    { color: on ? '#FFFFFF' : themeColors.textSecondary },
                  ]}
                >
                  {o.count > 99 ? '99+' : o.count}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 8. Button & Card Primitives */
export function Btn({
  label,
  icon: Icon,
  onPress,
  kind,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
}: {
  label: string;
  icon?: any;
  onPress: () => void;
  kind?: 'solid' | 'outline';
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { themeColors } = useTheme();
  const isOutline = kind === 'outline' || variant === 'outline';
  let bg = themeColors.primary;
  let fg = themeColors.onPrimary;
  let bc = 'transparent';

  if (variant === 'secondary') {
    bg = themeColors.surface;
    fg = themeColors.text;
    bc = themeColors.border;
  } else if (variant === 'danger') {
    bg = themeColors.error;
    fg = '#FFFFFF';
  } else if (isOutline) {
    bg = 'transparent';
    fg = themeColors.text;
    bc = themeColors.border;
  }

  const height = size === 'sm' ? 34 : size === 'lg' ? 48 : 40;
  const fontSize = size === 'sm' ? 12.5 : size === 'lg' ? 15 : 13.5;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.btn,
        {
          height,
          backgroundColor: bg,
          borderColor: bc,
          borderWidth: bc !== 'transparent' ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={size === 'sm' ? 14 : 17} color={fg} /> : null}
      <Text style={{ fontSize, fontFamily: 'Inter-Bold', fontWeight: '700', color: fg }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { themeColors } = useTheme();
  const content = (
    <View
      style={[
        {
          backgroundColor: themeColors.surface,
          borderRadius: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: themeColors.border,
          padding: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress || onLongPress ? (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

export function StatusPill({
  label,
  status,
  color,
  variant = 'primary',
  size = 'md',
}: {
  label?: string;
  status?: string;
  color?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}) {
  const { themeColors } = useTheme();
  const textLabel = label || status || '';
  let tone = color || themeColors.primary;

  if (variant === 'success') tone = themeColors.success;
  else if (variant === 'warning') tone = themeColors.warning;
  else if (variant === 'danger') tone = themeColors.error;
  else if (variant === 'info') tone = themeColors.info;
  else if (variant === 'neutral') tone = themeColors.textMuted;

  const isSm = size === 'sm';
  return (
    <View
      style={{
        backgroundColor: tone + '18',
        paddingHorizontal: isSm ? 6 : 8,
        paddingVertical: isSm ? 2 : 4,
        borderRadius: 5,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: tone, fontSize: isSm ? 10.5 : 12, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
        {textLabel}
      </Text>
    </View>
  );
}

export function Stat({
  label,
  value,
  tone,
  variant,
  style,
}: {
  label: string;
  value: string | number;
  tone?: string;
  variant?: 'primary' | 'success' | 'danger' | 'warning';
  style?: StyleProp<ViewStyle>;
}) {
  const { themeColors } = useTheme();
  let color = tone || themeColors.text;
  if (variant === 'primary') color = themeColors.primary;
  if (variant === 'success') color = themeColors.success;
  if (variant === 'danger') color = themeColors.error;
  if (variant === 'warning') color = themeColors.warning;

  return (
    <View style={[{ paddingVertical: 10, paddingHorizontal: 12 }, style]}>
      <Text style={{ fontSize: 20, fontFamily: 'Inter-ExtraBold', fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: themeColors.textSecondary, marginTop: 1 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function SkeletonRow({ lines = 2, height = 48 }: { lines?: number; height?: number }) {
  const { themeColors } = useTheme();
  return (
    <View
      style={{
        height,
        paddingHorizontal: 14,
        justifyContent: 'center',
        gap: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: themeColors.border,
      }}
    >
      <View style={{ width: '60%', height: 12, backgroundColor: themeColors.border, borderRadius: 4 }} />
      {lines > 1 && <View style={{ width: '40%', height: 10, backgroundColor: themeColors.border + '80', borderRadius: 4 }} />}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: any;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { themeColors } = useTheme();

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    const IconComp = icon;
    return <IconComp size={24} color={themeColors.primary} />;
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
      {icon && (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: themeColors.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {renderIcon()}
        </View>
      )}
      <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, textAlign: 'center' }}>
        {title}
      </Text>
      {message && (
        <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 17 }}>
          {message}
        </Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={{ backgroundColor: themeColors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, marginTop: 4 }}
          onPress={onAction}
        >
          <Text style={{ color: themeColors.onPrimary, fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const { themeColors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: themeColors.border,
        backgroundColor: themeColors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={{ padding: 4, borderRadius: 6 }}>
            <ChevronRight size={20} color={themeColors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    paddingVertical: 8,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segText: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  segCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
});

/** AccentPicker component for Profile & Settings */
export function AccentPicker() {
  const { accent, setAccent, themeColors, isDark } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
      {ACCENT_KEYS.map((key) => {
        const item = ACCENTS[key];
        const isSelected = accent === key;
        const colorVal = isDark ? item.dark : item.light;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => setAccent(key)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 10,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: isSelected ? colorVal : themeColors.border,
              backgroundColor: isSelected ? (isDark ? item.darkTint : item.lightTint) : themeColors.surface,
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: colorVal,
                marginBottom: 4,
              }}
            />
            <Text
              style={{
                fontSize: 10.5,
                fontFamily: 'Inter-Bold',
                fontWeight: '700',
                color: isSelected ? colorVal : themeColors.textSecondary,
              }}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

