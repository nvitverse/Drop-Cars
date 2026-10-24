// Staff must be reachable: notification permission, "display over other apps" (the floating bubble) and "always allow in background"
// (battery). Asked when the staff member goes ON DUTY (and once every few hours while on duty if still missing); while on duty the app
// keeps an on-duty foreground service and shows a small bubble when it is in the background, so an enquiry / unaccepted booking alert
// is never lost because the app was closed, silenced or put to sleep.
// The native part exists only on an Admin build made after plugins/withStaffAlertOverlay.js; on an older build only the checks that
// work without it are done and the sheet says the app needs an update.
// Mount once inside <StaffDutyProvider> (app/_layout.tsx).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { useStaffDuty } from '@/context/StaffDutyContext';
import {
  AlertReadiness,
  askBatteryWhitelist,
  askNotificationPermission,
  askOverlayPermission,
  getAlertReadiness,
  hideAlertBubble,
  showAlertBubble,
  startOnDutyService,
  stopOnDutyService,
} from '@/services/staffAlertOverlay';
import { registerForPushNotificationsAsync } from '@/services/notificationService';

const LAST_PROMPT_KEY = 'dropcars_alert_readiness_prompt_at_v1';
const REPEAT_EVERY_MS = 4 * 60 * 60 * 1000;     // while on duty and still missing something: at most every 4 hours

export default function StaffAlertReadinessHost() {
  const { themeColors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { isOnDuty } = useStaffDuty();
  const [ready, setReady] = useState<AlertReadiness | null>(null);
  const [visible, setVisible] = useState(false);
  const dutyRef = useRef(isOnDuty);
  const readyRef = useRef<AlertReadiness | null>(null);
  dutyRef.current = isOnDuty;
  readyRef.current = ready;

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android') return null;
    const r = await getAlertReadiness();
    setReady(r);
    return r;
  }, []);

  const maybePrompt = useCallback(async (force: boolean) => {
    const r = await refresh();
    if (!r || r.ready) return;
    try {
      const last = Number((await AsyncStorage.getItem(LAST_PROMPT_KEY)) || 0);
      if (!force && Date.now() - last < REPEAT_EVERY_MS) return;
      await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    } catch {}
    setVisible(true);
  }, [refresh]);

  // going on duty: check at once and ask (the sheet is skipped when everything is already allowed)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (isOnDuty) {
      maybePrompt(true);
    } else {
      stopOnDutyService();
      hideAlertBubble();
    }
  }, [isOnDuty, maybePrompt]);

  // on duty and allowed: keep the service alive and make sure the push token is registered with the server
  useEffect(() => {
    if (Platform.OS !== 'android' || !isOnDuty || !ready) return;
    if (ready.notifications) registerForPushNotificationsAsync().catch(() => {});
    if (ready.overlay) startOnDutyService().catch(() => {});
  }, [isOnDuty, ready]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        hideAlertBubble();                              // looking at the app: a bubble over it would only be clutter
        const r = await refresh();                      // the permissions are granted in system screens: re-check when the app comes back
        if (dutyRef.current && r && !r.ready) maybePrompt(false);
      } else if (dutyRef.current && readyRef.current?.overlay) {
        showAlertBubble('Drop Cars · alerts ON');       // leaving the app while on duty: stay visible so the alert is never missed
      }
    });
    return () => sub.remove();
  }, [refresh, maybePrompt]);

  if (Platform.OS !== 'android') return null;

  const row = (ok: boolean | null, title: string, why: string, action: () => Promise<void> | void, actionLabel: string, unavailable?: string) => (
    <View style={[s.row, { borderColor: c.border }]}>
      {ok ? <CheckCircle2 size={22} color="#059669" /> : <XCircle size={22} color={ok === null ? '#94A3B8' : '#DC2626'} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5, lineHeight: 18 }}>{unavailable || why}</Text>
      </View>
      {!ok && (
        <TouchableOpacity onPress={async () => { await action(); }} style={[s.btn, { backgroundColor: '#1D4ED8' }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: 20 + insets.bottom }]}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }}>Keep your alerts on</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 6 }}>
            While you are on duty, every new enquiry and unaccepted booking must reach you - even if the app is in the background, the screen is
            locked or the phone is saving battery. Please allow all of these.
          </Text>
          {ready && row(ready.notifications, 'Notifications', 'So the alarm and the alert sound reach you.', async () => { await askNotificationPermission(); setTimeout(refresh, 800); }, 'Allow')}
          {ready && row(ready.overlay, 'Display over other apps', 'Shows a small bubble over other apps while you are on duty.',
            async () => { await askOverlayPermission(); }, 'Allow',
            ready.nativeAvailable ? undefined : 'Needs the latest Drop Cars Admin app. Update the app, then allow this.')}
          {ready && row(ready.battery, 'Always allow in background', 'Stops the phone from putting the app to sleep.', async () => { await askBatteryWhitelist(); },
            'Allow', ready.nativeAvailable ? undefined : 'Open the phone settings > Battery and set Drop Cars Admin to "Unrestricted". (The latest app does this in one tap.)')}
          <TouchableOpacity onPress={async () => { const r = await refresh(); if (r?.ready) setVisible(false); }} style={[s.primary, { backgroundColor: '#059669' }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>I have allowed - check again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setVisible(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  primary: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
});
