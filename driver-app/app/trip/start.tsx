import React, { useState } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Upload, ArrowLeft, CheckCircle, KeyRound, Gauge } from 'lucide-react-native';
import { startTrip } from '@/services/driver/carDriverService';
import { startTripLocationSharing } from '@/services/locationService';
import * as ImagePicker from 'expo-image-picker';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DesignTokens } from '@/constants/designTokens';

export default function StartTripScreen() {
  const { colors, isDarkMode } = useTheme();
  const [startKm, setStartKm] = useState('');
  const [tripOtp, setTripOtp] = useState('');
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [odometerShown, setOdometerShown] = useState(false);
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    order_id?: string; 
    farePerKm?: string; 
    assignment_id?: string;
    toll_charge_update?: string;
    charge_items?: string;
    trip_type?: string;
    is_multicity?: string;
    otp_required?: string;
  }>();
  // Self-sourced (Create Booking) trips never get a real OTP - see
  // DriverOrderListResponse.otp_required. Defaults to required (fail-safe)
  // if the param is ever missing.
  const otpRequired = params.otp_required !== 'false';

  const takeOdometerPhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true, // freeform crop before upload - no fixed aspect ratio
        quality: 0.5, // compress - full-size photos made uploads painfully slow
      });
      if (!result.canceled) {
        setOdometerPhoto(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(t('tripStart.photoErrorTitle'), t('tripStart.photoErrorBody'));
    }
  };

  const handleStartTrip = async () => {
    if (!startKm || !odometerPhoto) {
      Alert.alert(t('tripStart.photoErrorTitle'), t('tripStart.missingFields'));
      return;
    }
    if (otpRequired && !tripOtp.trim()) {
      Alert.alert('Trip Start Code Required', 'Ask the customer for the trip start code from their confirmation email.');
      return;
    }
    if (submitting) return;
    try {
      setSubmitting(true);
      // Prefer assignment_id if provided (recommended)
      const assignment_id = String(params.assignment_id || '');
      let tripStartResponse = null;
      
      if (!assignment_id) {
        // If no assignment id, continue UI flow without API to prevent blocking
        console.warn('No assignment_id provided to start trip; navigating without API call');
      } else {
        tripStartResponse = await startTrip(parseInt(params.order_id || ''), parseInt(startKm, 10), odometerPhoto, tripOtp);
        
        // Update driver status to DRIVING after successful trip start
        // This will be handled by the backend, but we can also update locally
        console.log('🚗 Trip started successfully, driver status should be updated to DRIVING');

        // Start sharing this driver's live location for exactly this trip -
        // stopped in trip/end.tsx once it's completed. Best-effort: a denied
        // permission or a failed ping never blocks the trip itself.
        startTripLocationSharing(parseInt(params.order_id || ''));

        // Log the API response
        if (tripStartResponse) {
          console.log('📊 Trip Start API Response:', {
            message: tripStartResponse.message,
            end_record_id: tripStartResponse.end_record_id,
            start_km: tripStartResponse.start_km,
            speedometer_img_url: tripStartResponse.speedometer_img_url
          });
        }
      }

      console.log('🚗 Navigating to end trip with params:', {
        order_id: String(params.order_id || ''),
        assignment_id,
        startKm: String(startKm),
        farePerKm: String(params.farePerKm || '0'),
        toll_charge_update: params.toll_charge_update || 'false',
        trip_type: params.trip_type || '',
        is_multicity: params.is_multicity || 'false',
      });

      router.replace({
        pathname: '/trip/end',
        params: {
          order_id: String(params.order_id || ''),
          assignment_id,
          startKm: String(startKm),
          farePerKm: String(params.farePerKm || '0'),
          toll_charge_update: params.toll_charge_update || 'false',
          charge_items: params.charge_items || '[]',
          trip_type: params.trip_type || '',
          is_multicity: params.is_multicity || 'false',
        }
      });
    } catch (error: any) {
      Alert.alert(t('tripStart.photoErrorTitle'), error.message || t('tripStart.startFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadingOverlay
        visible={submitting}
        message={t('tripStart.startingTrip')}
      />

      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => safeBack(router)}>
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('tripStart.headerTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text }]}>{t('tripStart.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('tripStart.subtitle')}</Text>
        </View>

        {/* 1. Odometer Photo Viewfinder Card */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Gauge size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripStart.odometerPhoto')}</Text>
          </View>
          {odometerPhoto ? (
            <View style={[styles.photoContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image source={{ uri: odometerPhoto }} style={styles.photo} resizeMode="cover" />
              <TouchableOpacity
                style={[styles.retakeButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  takeOdometerPhoto();
                }}
              >
                <Camera size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retakeButtonText}>{t('tripStart.retakePhoto')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.photoButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDarkMode ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.4)',
                },
              ]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                takeOdometerPhoto();
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.cameraIconBg, { backgroundColor: colors.primary + '18' }]}>
                <Camera color={colors.primary} size={28} />
              </View>
              <Text style={[styles.photoButtonText, { color: colors.text }]}>{t('tripStart.takeOdometerPhoto')}</Text>
              <Text style={[styles.photoHelper, { color: colors.textSecondary }]}>Align odometer reading inside camera viewfinder</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Starting Kilometer Input */}
        <View style={styles.cardSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripStart.startingKilometer')}</Text>
          <View style={[styles.kmInputContainer, { backgroundColor: colors.surface, borderColor: startKm ? colors.primary : colors.border }]}>
            <TextInput
              style={[styles.kmInput, { color: colors.text }]}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={startKm}
              onChangeText={setStartKm}
              keyboardType="numeric"
            />
            <View style={[styles.unitBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.unitBadgeText, { color: colors.primary }]}>KM</Text>
            </View>
          </View>
        </View>

        {/* 3. Trip Start Code */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <KeyRound size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Trip Start Code{otpRequired ? '' : ' (Optional)'}</Text>
          </View>
          <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginBottom: 10, lineHeight: 17 }}>
            {otpRequired
              ? 'Ask the customer for the 4-digit code shown on their booking confirmation.'
              : 'Optional for self-sourced bookings — you can start the trip directly.'}
          </Text>
          <View style={[styles.otpInputContainer, { backgroundColor: colors.surface, borderColor: tripOtp.length === 4 ? colors.success : colors.border }]}>
            <TextInput
              style={[styles.otpInput, { color: colors.text }]}
              placeholder="• • • •"
              placeholderTextColor={colors.textSecondary}
              value={tripOtp}
              onChangeText={(v) => {
                setTripOtp(v);
                if (v.length === 4) {
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }
              }}
              keyboardType="number-pad"
              maxLength={4}
            />
            {tripOtp.length === 4 && (
              <View style={[styles.otpVerifiedBadge, { backgroundColor: colors.success + '20' }]}>
                <CheckCircle size={16} color={colors.success} />
              </View>
            )}
          </View>
        </View>

        {/* 4. Customer Odometer Verification Checklist */}
        <TouchableOpacity
          style={[
            styles.checklistCard,
            {
              backgroundColor: colors.surface,
              borderColor: odometerShown ? colors.success : colors.border,
            },
          ]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setOdometerShown((v) => !v);
          }}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: odometerShown ? colors.success : colors.border,
                backgroundColor: odometerShown ? colors.success : 'transparent',
              },
            ]}
          >
            {odometerShown && <CheckCircle color="#FFFFFF" size={16} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter-SemiBold', color: colors.text }}>
              {t('tripStart.shownOdometerToCustomer')}
            </Text>
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }}>
              Passenger has visually confirmed the starting meter reading
            </Text>
          </View>
        </TouchableOpacity>

        {/* 5. Start Trip Action Button */}
        <TouchableOpacity
          style={[
            styles.startButton,
            { backgroundColor: colors.success },
            (!startKm || !odometerPhoto || (otpRequired && !tripOtp.trim()) || submitting) && [
              styles.disabledButton,
              { backgroundColor: isDarkMode ? '#334155' : '#CBD5E1' },
            ],
          ]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            handleStartTrip();
          }}
          disabled={!startKm || !odometerPhoto || (otpRequired && !tripOtp.trim()) || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.startButtonText}>{t('tripStart.startingTripButton')}</Text>
            </View>
          ) : (
            <Text style={styles.startButtonText}>🚀 {t('tripStart.startTripButton')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  cardSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
  },
  photoButton: {
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  cameraIconBg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  photoButtonText: {
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  photoHelper: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  photoContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 200,
  },
  retakeButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  retakeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  kmInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  kmInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
    paddingVertical: 10,
  },
  unitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  otpInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  otpInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 8,
    paddingVertical: 10,
  },
  otpVerifiedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    borderRadius: 16,
    minHeight: 52,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledButton: {
    shadowOpacity: 0,
    elevation: 0,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});