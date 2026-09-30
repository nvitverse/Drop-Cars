import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Landing screen for the floating "New Booking" overlay bubble's tap-through
// deep link (exp+dropcars3://bubble-tap?bookingId=...), fired from the
// native BubbleOverlayService when the driver taps the bubble. It has no UI
// of its own - it immediately forwards to the dashboard tab and hands off
// the booking id so that screen can highlight/scroll to the matching
// pending order (the "accept view" for a not-yet-accepted booking).
export default function BubbleTapRedirect() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)',
      params: bookingId ? { focusBookingId: String(bookingId) } : {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  return <View />;
}
