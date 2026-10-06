import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GoogleSignInButtonProps {
  onSuccess: (authData: any) => void;
  onError?: (errorMessage: string) => void;
  apiBaseUrl?: string;
  buttonText?: string;
  disabled?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  apiBaseUrl = 'http://localhost:8000',
  buttonText = 'Continue with Google',
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading || disabled) return;
    setLoading(true);

    try {
      // In native React Native / Expo, you pass the idToken from @react-native-google-signin or expo-auth-session
      // For web/hybrid preview:
      const idToken = 'SAMPLE_ID_TOKEN'; // Replace with native token trigger

      const response = await fetch(`${apiBaseUrl}/api/v1/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_token: idToken,
          role: 'CUSTOMER',
        }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      onSuccess(data);
    } catch (err: any) {
      setLoading(false);
      if (onError) onError(err.message || 'Google sign-in encountered an error');
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabledButton]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color="#4285F4" style={styles.icon} />
        ) : (
          <Ionicons name="logo-google" size={20} color="#EA4335" style={styles.icon} />
        )}
        <Text style={styles.text}>{loading ? 'Signing in...' : buttonText}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    marginVertical: 10,
    width: '100%',
  },
  disabledButton: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
  },
});
