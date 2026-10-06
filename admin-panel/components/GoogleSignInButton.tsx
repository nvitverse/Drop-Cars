import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GoogleSignInButtonProps {
  onSuccess: (data: any) => void;
  onError?: (error: string) => void;
  role?: 'ADMIN' | 'CUSTOMER' | 'DRIVER' | 'VENDOR';
  apiBaseUrl?: string;
  buttonText?: string;
  disabled?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  role = 'ADMIN',
  apiBaseUrl = 'http://localhost:8000', // Update to production API URL in production
  buttonText = 'Sign in with Google',
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleWebSignIn = async () => {
    if (loading || disabled) return;
    setLoading(true);

    try {
      if (Platform.OS === 'web') {
        // Handle Web Platform via Google Identity Services
        const clientId =
          process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
          '';

        if (!clientId) {
          throw new Error('Google Client ID is not configured in environment.');
        }

        // Initialize Google One Tap / Credential prompt if GIS script loaded
        if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              await verifyTokenWithBackend(response.credential);
            },
          });
          (window as any).google.accounts.id.prompt();
        } else {
          // Fallback popup prompt
          throw new Error('Google Identity Services script not loaded. Add https://accounts.google.com/gsi/client to index.html');
        }
      } else {
        // Handle Native Mobile via Google Sign-In SDK
        throw new Error('Native mobile Google Sign-In SDK integration triggered.');
      }
    } catch (err: any) {
      setLoading(false);
      if (onError) onError(err.message || 'Google sign-in failed');
    }
  };

  const verifyTokenWithBackend = async (idToken: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_token: idToken,
          role: role,
        }),
      });

      const result = await response.json();
      setLoading(false);

      if (!response.ok) {
        throw new Error(result.detail || 'Google authentication failed');
      }

      onSuccess(result);
    } catch (error: any) {
      setLoading(false);
      if (onError) onError(error.message || 'Failed to authenticate with backend');
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={handleGoogleWebSignIn}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <View style={styles.contentRow}>
        {loading ? (
          <ActivityIndicator size="small" color="#1A73E8" style={styles.loader} />
        ) : (
          <Ionicons name="logo-google" size={20} color="#EA4335" style={styles.icon} />
        )}
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : buttonText}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginVertical: 8,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
    backgroundColor: '#F1F3F4',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 12,
  },
  loader: {
    marginRight: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3C4043',
    letterSpacing: 0.2,
  },
});
