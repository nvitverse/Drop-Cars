import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { 
  CheckCircle, 
  Phone, 
  Lock,
  ArrowRight,
  Copy,
  User
} from 'lucide-react-native';
import { useVendorAuth } from '../../hooks/useVendorAuth';

const { width, height } = Dimensions.get('window');

interface SignupSuccessData {
  vendor_id: string;
  full_name: string;
  primary_number: string;
  password: string;
  account_status: string;
}

export default function SignupSuccessScreen() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [slideAnim] = useState(new Animated.Value(50));
  const [checkAnim] = useState(new Animated.Value(0));
  const { getStoredVendorData } = useVendorAuth();

  const [successData, setSuccessData] = useState<SignupSuccessData | null>(null);

  useEffect(() => {
    loadVendorData();
    animateScreen();
  }, []);

  const loadVendorData = async () => {
    try {
      const storedData = await getStoredVendorData();
      if (storedData) {
        // For demo purposes, we'll use a default password
        // In real app, this would come from the signup response
        setSuccessData({
          vendor_id: storedData.id,
          full_name: storedData.full_name,
          primary_number: storedData.primary_number,
          password: 'Your Password is Encrypted', // This should come from signup response
          account_status: storedData.account_status,
        });
      }
    } catch (error) {
      console.error('Error loading vendor data:', error);
    }
  };

  const animateScreen = () => {
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    // Scale animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // Slide animation
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Check mark animation
    setTimeout(() => {
      Animated.spring(checkAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }, 500);
  };

  const handleCopyField = (field: string, value: string) => {
    // Here you would implement actual clipboard functionality
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGoToLogin = () => {
    router.replace('/(auth)/sign-in');
  };

  if (!successData) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Header */}
        <Animated.View 
          style={[
            styles.successHeader,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <Animated.View 
            style={[
              styles.checkContainer,
              {
                transform: [{ scale: checkAnim }]
              }
            ]}
          >
            <CheckCircle size={60} color="#10B981" />
          </Animated.View>
          
          <Text style={styles.successTitle}>Account Created Successfully! 🎉</Text>
          <Text style={styles.successSubtitle}>
            Welcome to Drop Cars! Please save your login credentials below.
          </Text>
        </Animated.View>

        {/* Credentials Card */}
        <Animated.View 
          style={[
            styles.credentialsCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <View style={styles.cardHeader}>
            <User size={24} color="#3B82F6" />
            <Text style={styles.cardTitle}>Your Login Credentials</Text>
          </View>

          <View style={styles.credentialField}>
            <View style={styles.fieldLabel}>
              <Phone size={20} color="#6B7280" />
              <Text style={styles.fieldLabelText}>Phone Number</Text>
            </View>
            <View style={styles.fieldValueContainer}>
              <Text style={styles.fieldValue}>{successData.primary_number}</Text>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => handleCopyField('phone', successData.primary_number)}
              >
                {/* <Copy size={16} color={copiedField === 'phone' ? '#10B981' : '#6B7280'} /> */}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.credentialField}>
            <View style={styles.fieldLabel}>
              <Lock size={20} color="#6B7280" />
              <Text style={styles.fieldLabelText}>Account Status</Text>
            </View>
            <View style={styles.fieldValueContainer}>
              <Text style={styles.fieldValue}>{successData.account_status}</Text>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => handleCopyField('password', successData.account_status)}
              >
                {/* <Copy size={16} color={copiedField === 'password' ? '#10B981' : '#6B7280'} /> */}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.importantNote}>
            <Text style={styles.noteText}>
              ⚠️ Please save these credentials safely. You'll need them to login to your account.
            </Text>
          </View>
        </Animated.View>

        {/* Action Button */}
        <Animated.View 
          style={[
            styles.actionContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={handleGoToLogin}
          >
            <Text style={styles.loginButtonText}>Go to Login</Text>
            <ArrowRight size={20} color="#FFFFFF" />
          </TouchableOpacity>
          
          <Text style={styles.helpText}>
            Need help? Contact support at dropcars.in@gmail.com
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  checkContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: width * 0.8,
  },
  credentialsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  credentialField: {
    marginBottom: 20,
  },
  fieldLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  fieldValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  importantNote: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  noteText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  actionContainer: {
    alignItems: 'center',
  },
  loginButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  helpText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
