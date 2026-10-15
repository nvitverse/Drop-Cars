// A stopwatch for "the customer made me wait": the driver taps Start when the waiting begins and Stop when it ends; the total
// minutes are saved on the phone per booking and pre-filled on the End Trip screen (waiting is billed at the platform rate
// from the admin settings). Nothing is sent to the server from here, so it works without signal.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Timer } from 'lucide-react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { useTheme } from '@/contexts/ThemeContext';
import * as SecureStore from '@/utils/secureStore';

export type WaitState = { accMs: number; startedAt: number | null };
export const waitKey = (orderId: number | string) => `waiting_${orderId}`;

export async function readWaiting(orderId: number | string): Promise<WaitState> {
  try {
    const raw = await SecureStore.getItemAsync(waitKey(orderId));
    if (raw) {
      const j = JSON.parse(raw);
      return { accMs: Number(j.accMs) || 0, startedAt: j.startedAt ? Number(j.startedAt) : null };
    }
  } catch {}
  return { accMs: 0, startedAt: null };
}

export const waitingMinutes = (w: WaitState) => Math.floor((w.accMs + (w.startedAt ? Date.now() - w.startedAt : 0)) / 60000);

export default function WaitingTimer({ orderId }: { orderId: number | string }) {
  const { colors } = useTheme();
  const [w, setW] = useState<WaitState>({ accMs: 0, startedAt: null });
  const [, tick] = useState(0);

  useEffect(() => { readWaiting(orderId).then(setW); }, [orderId]);
  useEffect(() => {
    if (!w.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, [w.startedAt]);

  const save = useCallback(async (next: WaitState) => {
    setW(next);
    try { await SecureStore.setItemAsync(waitKey(orderId), JSON.stringify(next)); } catch {}
  }, [orderId]);

  const toggle = () => {
    if (w.startedAt) save({ accMs: w.accMs + (Date.now() - w.startedAt), startedAt: null });
    else save({ accMs: w.accMs, startedAt: Date.now() });
  };

  const mins = waitingMinutes(w);
  const running = !!w.startedAt;
  const label = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: running ? '#F59E0B' : colors.border, backgroundColor: running ? '#FFFBEB' : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Timer size={18} color={running ? '#D97706' : colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>Customer waiting time</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>{running ? `Counting... ${label}` : mins > 0 ? `Total ${label} (added to your bill)` : 'Tap Start if the customer makes you wait'}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={toggle} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: running ? '#D97706' : colors.primary }}>
        <Text style={{ color: '#fff', fontFamily: 'Inter-Bold', fontSize: 13 }}>{running ? 'Stop' : mins > 0 ? 'Resume' : 'Start'}</Text>
      </TouchableOpacity>
    </View>
  );
}
