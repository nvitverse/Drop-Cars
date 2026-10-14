import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, FileText } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gradients } from '../../constants/theme';
import { getCurrentApiBaseUrl } from '../../config/environment';
import { useLanguage } from '../../contexts/LanguageContext';
import { TERMS_ACCEPTED_KEY } from '../../utils/vendorSession';

const API_BASE_URL = `${getCurrentApiBaseUrl()}/api`;

interface TermsContent { version: number; title: string; body: string }

// "1. WHAT DROP CARS IS" style lines become headings; everything else is body text.
const isHeading = (line: string) => /^\d{1,2}\.\s+\S/.test(line) && line.length < 70 && !line.trim().endsWith('.');

interface NotificationResponse {
  id: string;
  title: string;
  message: string;
  created_at: string;
  // Add other notification properties as per your API response
}

export default function TermsAndConditionsScreen() {
  const [accepted, setAccepted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermsContent | null>(null);
  const [termsError, setTermsError] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();

  // The text is edited by the office (Admin App > App content > Vendor terms), in the vendor's own language when it exists.
  const loadTerms = React.useCallback(async () => {
    setTermsError(false);
    try {
      const res = await fetch(`${API_BASE_URL}/public/app-content/vendor_terms?lang=${language}`);
      if (!res.ok) throw new Error('bad status');
      const d = await res.json();
      setTerms({ version: Number(d.version) || 1, title: String(d.title || 'Terms & Conditions'), body: String(d.body || '') });
    } catch {
      setTerms(null);
      setTermsError(true);
    }
  }, [language]);

  useEffect(() => { loadTerms(); }, [loadTerms]);

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  const registerForPushNotifications = async (): Promise<void> => {
    if (Platform.OS === 'web') {
      console.log('Push notifications not supported on web');
      setExpoPushToken('web-demo-token');
      return;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        setExpoPushToken('demo-token-fallback');
        return;
      }
      
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      setExpoPushToken(token);
      console.log('Expo Push Token:', token);
    } catch (error) {
      console.log('Error getting push token:', error);
      setExpoPushToken('demo-token-fallback');
    }
  };

  const checkNotificationStatus = async (): Promise<void> => {
    if (!expoPushToken) {
      Alert.alert('Error', 'Push token not available. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      
      if (!accessToken) {
        Alert.alert('Error', 'Authentication token not found. Please sign in again.');
        router.replace('/sign-in');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/notifications/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      console.log('Notification API Response Status:', response.status);

      if (response.ok) {
        const data: NotificationResponse[] = await response.json();
        console.log('Notifications found:', data.length);
        // If API returns success (notification found), proceed to main app
        router.replace('/(tabs)');
      } else if (response.status === 403) {
        const errorData = await response.json();
        console.log('403 Forbidden - Error details:', errorData);
        Alert.alert('Access Denied', 'You do not have permission to access notifications.');
      } else if (response.status === 404) {
        // Notification not found, proceed to permission screen
        console.log('No notifications found, redirecting to permissions screen');
        router.replace({
          pathname: '/notification-permissions',
          params: { expoPushToken: expoPushToken }
        });
      } else {
        const errorText = await response.text();
        console.log('API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error: any) {
      console.error('Error checking notification:', error);
      
      // Check if it's a network error or server error
      if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
        Alert.alert('Network Error', 'Please check your internet connection and try again.');
      } else {
        Alert.alert('Error', 'Failed to check notification status. Please try again.');
      }
      
      // Debug: Log the stored token
      const storedToken = await AsyncStorage.getItem('accessToken');
      console.log('Stored access token:', storedToken ? 'Exists' : 'Missing');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async (): Promise<void> => {
    if (!accepted) {
      Alert.alert('Required', 'Please accept the terms and conditions to continue.');
      return;
    }
    if (!terms) {
      Alert.alert('Terms not loaded', 'We could not load the terms. Please check your internet and tap Try again.');
      return;
    }
    // Remember which version was accepted: terms come back only when the office publishes a new version, not at every sign-in.
    await AsyncStorage.setItem(TERMS_ACCEPTED_KEY, String(terms.version)).catch(() => {});

    await checkNotificationStatus();
  };

  return (
    <View style={styles.container}>
      {/* Enhanced Header */}
      <LinearGradient
        colors={gradients.primary}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerIconContainer}>
            <FileText size={28} color="#FFFFFF" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Terms & Conditions</Text>
            <Text style={styles.headerSubtitle}>
              Please read and accept to continue
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Shield size={16} color="#FFFFFF" />
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {terms ? (
          <>
            <Text style={styles.sectionTitle}>{terms.title}</Text>
            <View style={styles.termsSection}>
              {terms.body.split('\n').map((line, i) => {
                const text = line.trim();
                if (!text) return null;
                // first line is the document title, already shown above
                if (i === 0 && text === terms.title.toUpperCase()) return null;
                return isHeading(text)
                  ? <Text key={i} style={styles.termsTitle}>{text}</Text>
                  : <Text key={i} style={styles.termsText}>{text}</Text>;
              })}
            </View>
          </>
        ) : termsError ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={styles.termsText}>We could not load the terms. Please check your internet connection.</Text>
            <TouchableOpacity style={[styles.continueButton, { marginTop: 16, paddingHorizontal: 28 }]} onPress={loadTerms}>
              <Text style={styles.continueButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        )}

        <View style={styles.acceptanceContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAccepted(!accepted)}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and agree to the Terms & Conditions
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, (!accepted || loading) && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!accepted || loading || !terms}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // Enhanced Header Styles
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 30,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 24,
    textAlign: 'center',
  },
  termsSection: {
    marginBottom: 32,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  termsText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  acceptanceContainer: {
    marginBottom: 44,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  footer: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  continueButton: {
    backgroundColor: '#1E40AF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E40AF',
  },
  continueButtonDisabled: {
    backgroundColor: '#9CA3AF',
    borderColor: '#9CA3AF',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});