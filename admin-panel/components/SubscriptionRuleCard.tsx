import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { ShieldAlert } from 'lucide-react-native';
import { apiService } from '@/services/api';

interface Props {
  isDark: boolean;
  cardBg: string;
  borderCol: string;
  textCol: string;
  subText: string;
}

type Lifecycle = {
  settings: { enabled: boolean; standard_free_days: number; lapse_grace_days: number; start_date: string | null };
  would_suspend: { vehicle_owner_id: string; name: string; phone: string; free_until: string | null }[];
  would_suspend_count: number;
  ending_soon_count: number;
};

/**
 * The subscription rule in one card (Owner only can change it):
 *   new account = 30 days Standard -> plan -> if it lapses 30 more days -> suspended until the plan is bought.
 * Switching it on gives every existing Standard account a fresh 30 days, so nobody is cut off by surprise.
 */
export default function SubscriptionRuleCard({ isDark, cardBg, borderCol, textCol, subText }: Props) {
  const [data, setData] = useState<Lifecycle | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiService.getSubscriptionLifecycle());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (value: boolean) => {
    const msg = value
      ? 'From now an account may use the app free (Standard) for ' + (data?.settings.standard_free_days ?? 30) +
        ' days. After that it needs the monthly plan; when a plan lapses there are ' + (data?.settings.lapse_grace_days ?? 30) +
        ' more days to pay, then the account is suspended. Every account that exists today gets a fresh ' + (data?.settings.standard_free_days ?? 30) + ' days starting today.'
      : 'Nobody will be suspended for a missing subscription any more. Accounts already suspended stay suspended until they subscribe or you give them days.';
    Alert.alert(value ? 'Switch the subscription rule ON?' : 'Switch it OFF?', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: value ? 'Switch ON' : 'Switch OFF',
        onPress: async () => {
          setBusy(true);
          try {
            setData(null);
            await apiService.setSubscriptionLifecycle({ enabled: value });
            await load();
          } catch (e: any) {
            Alert.alert('Could not change it', e?.message || 'Only the Owner can change this rule.');
            await load();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const enabled = !!data?.settings.enabled;
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: enabled ? '#16A34A' : borderCol }]}>
      <View style={styles.row}>
        <ShieldAlert size={20} color={enabled ? '#16A34A' : subText} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: textCol }]}>Subscription rule</Text>
          <Text style={[styles.sub, { color: subText }]}>
            {data
              ? enabled
                ? 'ON - ' + data.settings.standard_free_days + ' days Standard, then the plan. ' + data.would_suspend_count + ' account(s) would be suspended today, ' + data.ending_soon_count + ' within 3 days.'
                : 'OFF - nobody is suspended for a missing subscription.'
              : busy ? 'Saving...' : 'Loading...'}
          </Text>
        </View>
        {busy ? <ActivityIndicator size="small" /> : <Switch value={enabled} onValueChange={toggle} disabled={!data} />}
      </View>
      {enabled && data && data.would_suspend_count > 0 ? (
        <>
          <TouchableOpacity onPress={() => setOpen((v) => !v)} activeOpacity={0.7} style={{ paddingTop: 8 }}>
            <Text style={{ color: '#2563EB', fontSize: 13, lineHeight: 20, fontWeight: '700' }}>
              {open ? 'Hide the list' : 'Who would be suspended (' + data.would_suspend_count + ')'}
            </Text>
          </TouchableOpacity>
          {open
            ? data.would_suspend.slice(0, 30).map((o) => (
                <Text key={o.vehicle_owner_id} style={{ color: textCol, fontSize: 13, lineHeight: 20 }}>
                  {o.name} - {o.phone}
                </Text>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, lineHeight: 22, fontWeight: '800' },
  sub: { fontSize: 12.5, lineHeight: 19, marginTop: 2 },
});
