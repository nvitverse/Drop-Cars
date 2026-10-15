// Shown in place of the Call button while the customer's number is still locked:
//   "Number in 04:20"  - ticks down every second, so the driver knows exactly
// when it opens. `seconds` is the time left AT THE MOMENT THE LIST WAS FETCHED
// (the server says so; the phone's own clock is not trusted). When it reaches
// zero, onUnlock() runs once so the screen reloads and the real number appears.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

const fmt = (total: number) => {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export default function CustomerNumberCountdown({
  seconds,
  onUnlock,
  label = 'Customer number in',
}: {
  seconds: number;
  onUnlock?: () => void;
  label?: string;
}) {
  const { colors } = useTheme();
  const target = useRef(Date.now() + Math.max(0, seconds) * 1000);
  const fired = useRef(false);
  const [left, setLeft] = useState(Math.max(0, seconds));

  // A refreshed list brings a new "seconds left": restart from it.
  useEffect(() => {
    target.current = Date.now() + Math.max(0, seconds) * 1000;
    fired.current = false;
    setLeft(Math.max(0, seconds));
  }, [seconds]);

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((target.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0 && !fired.current) {
        fired.current = true;
        onUnlock?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [onUnlock]);

  // The clock time the number opens (worked out from the server's "seconds left", so a wrong phone clock cannot mislead).
  const opensAt = new Date(target.current);
  const sameDay = opensAt.toDateString() === new Date().toDateString();
  const opensText = `${sameDay ? '' : opensAt.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', '}${opensAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <View
      accessibilityLabel={`${label} ${fmt(left)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${colors.primary}14`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
    >
      <Lock color={colors.primary} size={13} />
      <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Customer number opens at</Text>
      <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.primary, fontVariant: ['tabular-nums'] }}>{opensText}</Text>
      {left > 0 && left < 3600 && (
        <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>({fmt(left)})</Text>
      )}
    </View>
  );
}
