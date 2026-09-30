// Platform-safe drop-in replacement for expo-secure-store.
//
// expo-secure-store has NO web implementation - on the web build every
// getItemAsync/setItemAsync call throws ("getValueWithKeyAsync is not a
// function"), which silently broke login in the browser. This wrapper uses
// the real SecureStore on phones and localStorage on web (web is only used
// for development/testing, so plain storage there is acceptable).
import { Platform } from 'react-native';
import * as Native from 'expo-secure-store';

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return Native.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {}
    return;
  }
  return Native.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {}
    return;
  }
  return Native.deleteItemAsync(key);
}

export async function markEmailAddedLocally(email: string): Promise<void> {
  const cleanEmail = email.trim();
  try {
    // 1. Update loginResponse in SecureStore
    const loginDataStr = await getItemAsync('loginResponse');
    if (loginDataStr) {
      const loginData = JSON.parse(loginDataStr);
      loginData.email_missing = false;
      loginData.email = cleanEmail;
      if (loginData.user) {
        loginData.user.email = cleanEmail;
      }
      await setItemAsync('loginResponse', JSON.stringify(loginData));
    }

    // 2. Update vo_user_data in SecureStore
    const voUserDataStr = await getItemAsync('vo_user_data');
    if (voUserDataStr) {
      const voData = JSON.parse(voUserDataStr);
      voData.email = cleanEmail;
      await setItemAsync('vo_user_data', JSON.stringify(voData));
    }

    // 3. Update userData in SecureStore
    const userDataStr = await getItemAsync('userData');
    if (userDataStr) {
      const uData = JSON.parse(userDataStr);
      uData.email = cleanEmail;
      await setItemAsync('userData', JSON.stringify(uData));
    }

    // 4. Update vo_user in AsyncStorage
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const voUserStr = await AsyncStorage.getItem('vo_user');
    if (voUserStr) {
      const voUser = JSON.parse(voUserStr);
      voUser.email = cleanEmail;
      await AsyncStorage.setItem('vo_user', JSON.stringify(voUser));
    }
  } catch (error) {
    console.error('Error updating local email state:', error);
  }
}
