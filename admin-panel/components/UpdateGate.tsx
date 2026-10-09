import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import * as Updates from 'expo-updates';

const CHECK_EVERY_MS = 3 * 60 * 1000;

type Phase = 'idle' | 'downloading' | 'failed' | 'rolledBack';

/**
 * Makes sure staff always run the newest live update - and SEES it happening:
 *   - at launch and every time the app comes back to the front it asks the update server (at most every 3 minutes)
 *   - when there is one, a full-screen "Updating..." box downloads it and restarts the app into it by itself
 *   - if the download fails the box says why and has a Try again button (nothing is silent any more)
 *   - if the phone had to throw away a broken update at start-up it says so, with the reason
 * Does nothing in development builds, on the web, or when the build has updates switched off.
 */
export default function UpdateGate() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const lastCheck = useRef(0);
  const busy = useRef(false);
  const rollbackShown = useRef(false);

  const enabled = !__DEV__ && Platform.OS !== 'web' && Updates.isEnabled;

  const run = useCallback(async (force = false) => {
    if (!enabled || busy.current) return;
    if (!force && Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    busy.current = true;
    lastCheck.current = Date.now();
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        if (phase === 'failed') setPhase('idle');
        return;
      }
      setMessage('A new version is available. Downloading it now - the app restarts by itself.');
      setPhase('downloading');
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        await Updates.reloadAsync();
        return;
      }
      setPhase('idle');
    } catch (e: any) {
      const text = String(e?.message || e || 'unknown error');
      // no internet / server busy: stay quiet unless the person asked for the check themselves
      if (force || /signature|runtime|channel|manifest|disabled|unsupported/i.test(text)) {
        setMessage(`Could not download the update: ${text}`);
        setPhase('failed');
      } else {
        setPhase('idle');
      }
    } finally {
      busy.current = false;
    }
  }, [enabled, phase]);

  useEffect(() => {
    if (!enabled) return;
    // the phone threw away an update that crashed while starting - tell staff (once) instead of silently running old screens
    try {
      if ((Updates as any).isEmergencyLaunch && !rollbackShown.current) {
        rollbackShown.current = true;
        setMessage(`The newest update could not start on this phone and was skipped.\nReason: ${(Updates as any).emergencyLaunchReason || 'unknown'}\nSend this message to Drop Cars support.`);
        setPhase('rolledBack');
      }
    } catch {}
    run(true);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(false); });
    return () => sub.remove();
  }, [enabled]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled || phase === 'idle') return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (phase !== 'downloading') setPhase('idle'); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.88)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20, width: '100%', maxWidth: 380 }}>
          {phase === 'downloading' && <ActivityIndicator size="large" color="#0D47A1" style={{ marginBottom: 12 }} />}
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>
            {phase === 'downloading' ? 'Updating Drop Cars Admin' : phase === 'rolledBack' ? 'An update was skipped' : 'Update did not finish'}
          </Text>
          <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20 }}>{message}</Text>
          {phase !== 'downloading' && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setPhase('idle')} style={{ flex: 1, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: '#0F172A', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPhase('idle'); run(true); }} style={{ flex: 1.3, backgroundColor: '#0D47A1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
