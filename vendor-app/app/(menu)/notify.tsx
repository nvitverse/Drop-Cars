import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { View, Text, Button, Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  const [expoPushToken, setExpoPushToken] = useState('');

  useEffect(() => {
    console.log('[DEBUG] useEffect called - registering for notifications');
    registerForPushNotificationsAsync()
      .then(token => {
        if (token) {
          console.log('[DEBUG] Push token received:', token);
          setExpoPushToken(token);
        } else {
          console.log('[DEBUG] Push token not received');
        }
      })
      .catch(error => console.error('[ERROR] Failed to register for notifications:', error));
  }, []);

  async function registerForPushNotificationsAsync() {
    console.log('[DEBUG] registerForPushNotificationsAsync called');

    if (Platform.OS === 'web') return null;

    if (!Device.isDevice) {
      alert('Must use a physical device');
      console.log('[WARN] Not a physical device');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[DEBUG] Existing permission status:', existingStatus);

    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[DEBUG] Requested permission status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      alert('Failed to get push token!');
      console.log('[ERROR] Permission not granted');
      return null;
    }

    // Get Expo push token
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      console.log('[DEBUG] Expo Push Token:', token);
      return token;
    } catch (error) {
      console.error('[ERROR] Failed to get Expo push token:', error);
      return null;
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Button
        title="Get Token"
        onPress={() => {
          console.log('[DEBUG] Get Token button pressed');
          registerForPushNotificationsAsync()
            .then(token => {
              if (token) setExpoPushToken(token);
            })
            .catch(error => console.error('[ERROR] Button press failed:', error));
        }}
      />
      <Text style={{ marginTop: 10 }}>{expoPushToken}</Text>
    </View>
  );
}