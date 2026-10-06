import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Linking, Alert } from 'react-native';
import { Clock, CircleCheck as CheckCircle, Phone, Mail, ArrowLeft, Shield, FileText, RefreshCw, MessageCircle } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

interface AccountStatusProps {
  status: 'INACTIVE' | 'PENDING';
  message?: string;
}

export default function AccountStatusScreen() {
  const { status = 'INACTIVE', message } = useLocalSearchParams();
  const handleGoBack = () => {
    router.back();
  };

const handleContactSupport = (value : string) => {
  // Check if it's an email
  const isEmail = value.includes("@");

  if (isEmail) {
    // Open email app
    Linking.openURL(`mailto:${value}`);
  } else {
    // Open phone dialer
    Linking.openURL(`tel:${value}`);
  }
};


  const handleRefresh = () => {
    // Implement refresh functionality
    console.log('Refresh status');
  };

  const isInactive = status === 'INACTIVE';
  const isPending = status === 'PENDING';
  console.log('Account status:', isInactive);
  console.log('Account status:', isPending);


  // Dynamic colors based on status
  const getStatusColors = () => {
    if (isInactive) {
      return {
        primary: ['#3b2a23ff', '#e91c1ce0'] as const, // Deep red gradient for danger
        secondary: '#82645eff',
        accent: 'rgba(220, 38, 38, 0.1)'
      };
    } else {
      return {
        primary: ['#2d3f7fff', '#0c171eff'] as const, // Amber gradient for pending/waiting
        secondary: '#78b636ff',
        accent: 'rgba(85, 72, 50, 0.1)'
      };
    }
  };

  const colors = getStatusColors();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Status</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            {/* <RefreshCw size={20} color="#FFFFFF" /> */}
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Icon Container */}
          <View style={styles.iconContainer}>
            <View style={styles.iconWrapper}>
              {isPending ? (
                <Clock size={64} color="#FFFFFF" />
              ) : (
                <Shield size={64} color="#FFFFFF" />
              )}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.secondary }]}>
              <Text style={styles.statusBadgeText}>
                {!isInactive ? 'PENDING' : 'BLOCKED'}
              </Text>
            </View>
          </View>

          {/* Status Title */}
          <Text style={styles.statusTitle}>
            {!isInactive ? 'Verification Pending' : 'Account BLOCKED'}
          </Text>

          {/* Status Message */}
          <Text style={styles.statusMessage}>
            {message || (
              isPending 
                ? 'We\'re reviewing your account details. Activation typically completes within 24 hours.'
                : 'Your account is currently inactive and requires immediate attention. Please contact support for reactivation.'
            )}
          </Text>

          {/* Progress Indicator for Pending */}
          {isPending && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { backgroundColor: colors.secondary }]} />
              </View>
              <Text style={styles.progressText}>Processing your verification...</Text>
            </View>
          )}

          {/* Status Details Card */}
          {/* <View style={styles.statusCard}>
            <Text style={styles.cardTitle}>
              {isPending ? 'What happens next?' : 'Account Details'}
            </Text>
            
            {isPending ? (
              <>
                <View style={styles.detailRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Document Review</Text>
                    <Text style={styles.stepDescription}>
                      Our team is verifying your submitted documents
                    </Text>
                  </View>
                  <CheckCircle size={20} color="#10B981" />
                </View>
                
                <View style={styles.detailRow}>
                  <View style={[styles.stepNumber, styles.stepNumberActive]}>
                    <Text style={[styles.stepNumberText, { color: '#D97706' }]}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Identity Verification</Text>
                    <Text style={styles.stepDescription}>
                      Confirming your identity - typically takes 24 hours
                    </Text>
                  </View>
                  <Clock size={20} color={colors.secondary} />
                </View>
                
                <View style={styles.detailRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Account Activation</Text>
                    <Text style={styles.stepDescription}>
                      Automatic activation within 24 hours
                    </Text>
                  </View>
                  <Clock size={20} color="#9CA3AF" />
                </View>
              </>
            ) : (
              <>
                <View style={styles.detailRow}>
                  <Shield size={20} color={colors.secondary} />
                  <View style={styles.stepContent}>
                    <Text style={styles.detailText}>
                      Account Under Review
                    </Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <FileText size={20} color={colors.secondary} />
                  <View style={styles.stepContent}>
                    <Text style={styles.detailText}>
                      Aadhar is Under Review
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View> */}

          {/* Contact Support Card */}
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Need Assistance?</Text>

            <View style={styles.contactMethods}>
              <TouchableOpacity style={styles.contactMethod}onPress={() => handleContactSupport("+919876543210")}>
                <View style={styles.contactIcon}>
                  <Phone size={20} color={colors.secondary} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Phone Support</Text>
                  <Text style={styles.contactValue}>+91 98765 43210</Text>
                  <Text style={styles.contactNote}>Available 24/7</Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.contactMethod} onPress={() => handleContactSupport("dropcars.in@gmail.com")}>
                <View style={styles.contactIcon}>
                  <Mail size={20} color={colors.secondary} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Email Support</Text>
                  <Text style={styles.contactValue}>dropcars.in@gmail.com</Text>
                  <Text style={styles.contactNote}>Response within 2 hours</Text>
                </View>
              </TouchableOpacity>

              {/* <TouchableOpacity style={styles.contactMethod} onPress={handleContactSupport}>
                <View style={styles.contactIcon}>
                  <MessageCircle size={20} color={colors.secondary} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Live Chat</Text>
                  <Text style={styles.contactValue}>Start Conversation</Text>
                  <Text style={styles.contactNote}>Instant response</Text>
                </View>
              </TouchableOpacity> */}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {/* <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleContactSupport}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']}
                style={styles.buttonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {isPending ? 'Contact Support' : 'Get Help'}
                </Text>
              </LinearGradient>
            </TouchableOpacity> */}
            
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={handleGoBack}
            >
              <Text style={styles.secondaryButtonText}>Return to App</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
  },
  refreshButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    backdropFilter: 'blur(10px)',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusMessage: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    opacity: 0.9,
    paddingHorizontal: 20,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  progressBar: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    width: '60%',
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.8,
  },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    backdropFilter: 'blur(10px)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepNumberActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
    marginRight: 12,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    lineHeight: 20,
  },
  detailText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  contactCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 30,
    backdropFilter: 'blur(10px)',
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  contactSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.8,
  },
  contactMethods: {
    gap: 16,
  },
  contactMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  contactNote: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  actionButtons: {
    gap: 16,
    marginTop: 10,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
  },
});