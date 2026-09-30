import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { registerForPushNotificationsAsync, testForegroundNotification } from '@/services/notifications/notificationService';

export default function TokenDebugger() {
  const handleGetTokens = async () => {
    try {
      console.log('🔍 Manual token retrieval triggered...');
      const token = await registerForPushNotificationsAsync();
      if (token) {
        Alert.alert('Success', `Token: ${token.substring(0, 20)}...`);
      } else {
        Alert.alert('Error', 'Failed to get token');
      }
    } catch (error) {
      console.error('❌ Error getting tokens:', error);
      Alert.alert('Error', 'Failed to get tokens');
    }
  };

  const handleTestNotification = async () => {
    try {
      await testForegroundNotification();
      Alert.alert('Success', 'Test notification sent!');
    } catch (error) {
      console.error('❌ Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  const handleGetExpoTokenOnly = async () => {
    try {
      console.log('🔍 Getting Expo token only...');
      const token = await registerForPushNotificationsAsync();
      if (token) {
        Alert.alert('Success', `Expo Token: ${token.substring(0, 20)}...`);
      } else {
        Alert.alert('Error', 'Failed to get Expo token');
      }
    } catch (error) {
      console.error('❌ Error getting Expo token:', error);
      Alert.alert('Error', 'Failed to get Expo token');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Token Debugger (Vendor App Style)</Text>
      <TouchableOpacity style={styles.button} onPress={handleGetTokens}>
        <Text style={styles.buttonText}>Get Token</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleTestNotification}>
        <Text style={styles.buttonText}>Test Notification</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleGetExpoTokenOnly}>
        <Text style={styles.buttonText}>Get Expo Token</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    margin: 10,
    borderRadius: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
