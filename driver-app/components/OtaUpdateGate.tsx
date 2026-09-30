import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_EVERY_MS = 20 * 60 * 1000;

/**
 * Over-the-air updates (self-hosted, see backend app_updates.py + scripts/publish-ota.js).
 * Checks when the app opens and whenever it comes back to the front (at most every 20 minutes). A downloaded update is
 * applied automatically the next time the app starts; the driver is also offered "Restart now" so a fix reaches them
 * straight away. Nothing happens in development builds or when updates are disabled.
 * Renders nothing.
 */
export default function OtaUpdateGate() {
  const lastCheck = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const check = async () => {
      if (busy.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;
        Alert.alert(
          'Update ready',
          'A new version of Drop Cars has been downloaded with fixes and improvements. Restart now to use it?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart now', onPress: () => { Updates.reloadAsync().catch(() => {}); } },
          ]
        );
      } catch {
        // no internet / server busy - try again next time
      } finally {
        busy.current = false;
      }
    };

    check();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => sub.remove();
  }, []);

  return null;
}
