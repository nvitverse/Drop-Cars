import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useCarDriver } from '@/contexts/CarDriverContext';

/**
 * Every screen that calls a driver-authenticated endpoint (axiosDriver /
 * driverAuthToken) - Create Booking, My Bookings, Drop Connect - can be
 * reached directly from the owner tab bar without the owner ever having
 * gone through Duty first, which is what actually establishes that
 * session. Without this, axiosDriver's interceptor silently rejects with
 * "No driver authentication token found", which the response interceptor
 * then flattens into a misleading "check your internet connection" - not
 * the real reason.
 *
 * Call this at the top of such a screen. Returns `ready` (false while
 * checking/establishing the session - render a loading state, not the
 * screen's real content, until it's true) and `sessionError` (set only if
 * establishing a session outright failed for a reason other than "not
 * registered yet", which is instead handled by redirecting to
 * /add-driver?mode=own automatically).
 */
export function useEnsureDriverSession() {
  const router = useRouter();
  const { isAuthenticated, isLoading: contextLoading, signinAsOwner } = useCarDriver();
  const [establishing, setEstablishing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for CarDriverContext's own startup check (loadStoredDriverData)
    // to finish before deciding a session is missing - otherwise this races
    // it and calls signinAsOwner() even when a real stored session exists.
    if (contextLoading || isAuthenticated || establishing || sessionError) return;
    let cancelled = false;
    setEstablishing(true);
    (async () => {
      try {
        // Goes through CarDriverContext (not the bare service call) so
        // isAuthenticated/driver actually get set - the same session shape
        // a real password duty-driver signin produces, not a separate path.
        await signinAsOwner();
      } catch (error: any) {
        if (cancelled) return;
        const message: string = error?.message || '';
        if (message.toLowerCase().includes('not registered as a duty driver')) {
          Alert.alert(
            'Set Up Your Duty Driver Profile First',
            'Add yourself as a duty driver (using your own Aadhaar/licence) first.',
            [{ text: 'Set Up Now', onPress: () => router.replace('/add-driver?mode=own' as any) }],
          );
        } else {
          setSessionError(message || 'Could not start your driver session.');
        }
      } finally {
        if (!cancelled) setEstablishing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextLoading, isAuthenticated]);

  return { ready: isAuthenticated, sessionError };
}
