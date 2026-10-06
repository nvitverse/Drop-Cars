import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';

// Read the admin-configured sentence out loud on-device. Only works while the
// app is open/foreground or right after the user taps the notification -
// phones cannot run app code while fully closed, so background notifications
// only get the chime sound (set server-side per event).
function speakIfConfigured(data: any) {
  const text = data?.speak_text;
  if (typeof text === 'string' && text.trim()) {
    Speech.speak(text, { language: 'en-IN' });
  }
}

export function setupNotificationListeners() {
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    speakIfConfigured(notification.request.content.data);
  });
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    speakIfConfigured(response.notification.request.content.data);
  });
  return { receivedListener, responseListener };
}
