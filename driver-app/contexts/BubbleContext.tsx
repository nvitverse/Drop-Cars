import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import {
  getBubblePreference,
  setBubblePreference,
  hasOverlayPermission,
  requestOverlayPermission as requestOverlayPermissionNative,
  startPersistentService,
  stopPersistentService,
  showBubble,
  hideBubble,
} from '@/services/bubble/bubbleOverlay';

interface BubbleContextType {
  bubbleEnabled: boolean;
  overlayPermissionGranted: boolean;
  setBubbleEnabled: (value: boolean) => Promise<void>;
  requestOverlayPermission: () => Promise<void>;
}

const BubbleContext = createContext<BubbleContextType | undefined>(undefined);

export function BubbleProvider({ children }: { children: ReactNode }) {
  const [bubbleEnabled, setBubbleEnabledState] = useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState(false);
  // Mirrors of the two state variables above, read inside the AppState
  // listener below - that listener is registered once (empty deps) so its
  // closure would otherwise always see the stale values from first render.
  const bubbleEnabledRef = useRef(bubbleEnabled);
  const permissionRef = useRef(overlayPermissionGranted);
  bubbleEnabledRef.current = bubbleEnabled;
  permissionRef.current = overlayPermissionGranted;

  const refreshPermission = async () => {
    if (Platform.OS !== 'android') return;
    const granted = await hasOverlayPermission();
    setOverlayPermissionGranted(granted);
    return granted;
  };

  useEffect(() => {
    getBubblePreference().then(setBubbleEnabledState);
    refreshPermission();

    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        // The overlay permission is granted from a system Settings screen,
        // not an in-app dialog - the only reliable moment to re-check it is
        // when the app comes back to the foreground after the user (maybe)
        // flipped it. If they had already enabled the toggle before
        // granting permission, startPersistentService() no-op'd back then -
        // retry now that it's (maybe) actually grantable.
        const granted = await refreshPermission();
        if (granted) {
          const enabled = await getBubblePreference();
          if (enabled) startPersistentService();
        }
        // Driver is looking at the app again - an icon floating on top of
        // its own screen would just be visual clutter over the real UI.
        hideBubble();
      } else if (bubbleEnabledRef.current && permissionRef.current) {
        // Leaving the app - this is the whole point of the feature: stay
        // visible over Maps/other apps so a booking is never missed, not
        // just flash on and disappear per notification. showBubble('','','')
        // renders the plain car icon with no unread badge (see
        // BubbleOverlayService's bookingId.isNotBlank() check) - a real
        // new-booking push still updates it with the red badge on top.
        showBubble('', '', '');
      }
    });
    return () => sub.remove();
  }, []);

  const setBubbleEnabled = async (value: boolean) => {
    setBubbleEnabledState(value);
    await setBubblePreference(value);
    if (value) {
      startPersistentService();
    } else {
      stopPersistentService();
      hideBubble();
    }
  };

  return (
    <BubbleContext.Provider
      value={{
        bubbleEnabled,
        overlayPermissionGranted,
        setBubbleEnabled,
        requestOverlayPermission: requestOverlayPermissionNative,
      }}
    >
      {children}
    </BubbleContext.Provider>
  );
}

export function useBubble() {
  const context = useContext(BubbleContext);
  if (context === undefined) {
    throw new Error('useBubble must be used within a BubbleProvider');
  }
  return context;
}
