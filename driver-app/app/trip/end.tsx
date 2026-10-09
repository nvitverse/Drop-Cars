import React, { useState } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, ArrowLeft, Check, IndianRupee, KeyRound, Gauge, CheckCircle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { endTrip } from '@/services/driver/carDriverService';
import * as SecureStore from '@/utils/secureStore';
import { stopTripLocationSharing } from '@/services/locationService';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DesignTokens } from '@/constants/designTokens';

export default function EndTripScreen() {
  const { colors, isDarkMode } = useTheme();
  const [endKm, setEndKm] = useState('');
  const [tripOtp, setTripOtp] = useState('');
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [tollCharge, setTollCharge] = useState('');
  const [tollChargeUpdate, setTollChargeUpdate] = useState(false);
  const [endingKmShown, setEndingKmShown] = useState(false);
  const [waitingTime, setWaitingTime] = useState('');
  const handleWaitingTimeChange = (value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setWaitingTime(sanitized);
  };
  // Cash collected from the customer at trip end (optional - only relevant
  // when part of the fare was already paid as an advance). The gap between
  // what's owed and what's collected settles to/from the wallet server-side.
  const [cashCollection, setCashCollection] = useState('');
  // Server asked why the driven km differs from the real route distance (never blocks the trip - just needs a reason)
  const [distanceInfo, setDistanceInfo] = useState<null | { message: string; km_driven: number; route_km: number }>(null);
  const [distanceChoice, setDistanceChoice] = useState<string>('');
  const [distanceNote, setDistanceNote] = useState('');

  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    order_id?: string;
    assignment_id?: string; 
    startKm?: string; 
    farePerKm?: string;
    toll_charge_update?: string;
    charge_items?: string;
    trip_type?: string;
    is_multicity?: string;
    otp_required?: string;
  }>();

  const startKm = parseInt(String(params.startKm || '0')) || 0;
  const farePerKm = parseFloat(String(params.farePerKm || '0')) || 0;
  const tollChargeUpdateEnabled = params.toll_charge_update === 'true';
  // Self-sourced (Create Booking) trips never get a real OTP - see
  // DriverOrderListResponse.otp_required. Defaults to required (fail-safe)
  // if the param is ever missing.
  const otpRequired = params.otp_required !== 'false';

  // Charge items NOT bundled into the total (included: false, e.g. State
  // Tax) - the driver collects these separately from the customer and keeps
  // them (same treatment as toll). One amount input per such item, entered
  // here for the record - see EndRecord.extra_charges_collected.
  const extraChargeItems = React.useMemo(() => {
    try {
      const items: { label: string; included: boolean }[] = JSON.parse(String(params.charge_items || '[]'));
      // Toll already has its own dedicated flow above (tollChargeUpdate) -
      // don't ask for it a second time here.
      // strictly `false`: an item with no `included` flag is not something to collect (it used to be treated as excluded)
      return items.filter((item) => (item as any).included === false && !(item as any).info && item.label !== 'Toll');
    } catch {
      return [];
    }
  }, [params.charge_items]);
  const [extraChargeAmounts, setExtraChargeAmounts] = useState<Record<string, string>>({});
  React.useEffect(() => {
    setExtraChargeAmounts((prev) => {
      const next = { ...prev };
      extraChargeItems.forEach((item) => { if (next[item.label] === undefined) next[item.label] = '0'; });
      return next;
    });
  }, [extraChargeItems]);

  // What the booking already INCLUDES - shown read-only so the driver knows it is covered by the fare and does not
  // ask the customer for it again. Only the excluded items above are entered when closing the bill.
  const includedChargeItems = React.useMemo(() => {
    try {
      const items: { label: string; included: boolean; amount?: number }[] = JSON.parse(String(params.charge_items || '[]'));
      // included with an amount of 0 is nothing: not shown, not asked
      return items.filter((item) => item && item.included !== false && !(item.amount !== undefined && item.amount !== null && Number(item.amount) <= 0));
    } catch {
      return [];
    }
  }, [params.charge_items]);
  
  // Check if it's a multicity order (handles variations like "Multy City")
  const tripTypeLower = String(params.trip_type || '').toLowerCase();
  const isMulticity = params.is_multicity === 'true' ||
                      tripTypeLower.includes('multy city') ||
                      tripTypeLower.includes('multicity') ||
                      tripTypeLower.includes('multy') ||
                      tripTypeLower.includes('multi') ||
                      tripTypeLower.includes('city');

  // Debug logging
  React.useEffect(() => {
    console.log('🏁 End trip screen received params:', {
      startKm: params.startKm,
      parsedStartKm: startKm,
      farePerKm: params.farePerKm,
      parsedFarePerKm: farePerKm,
      toll_charge_update: params.toll_charge_update,
      tollChargeUpdateEnabled,
      trip_type: params.trip_type,
      computedIsMulticity: isMulticity,
    });
  }, [params]);

  // Initialize toll charge update state
  React.useEffect(() => {
    setTollChargeUpdate(tollChargeUpdateEnabled);
    if (tollChargeUpdateEnabled) setTollCharge((v) => (v === '' ? '0' : v));
  }, [tollChargeUpdateEnabled]);

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
      Alert.alert(t('tripEnd.errorTitle'), t('tripEnd.photoErrorBody'));
    }
  };

  const calculateFare = () => {
    if (!endKm) return 0;
    const totalKm = parseInt(endKm) - startKm;
    return totalKm * farePerKm;
  };

  const handleEndTrip = async (distanceReason?: string) => {
    // Check required fields (removed contact number requirement)
    if (!endKm || !odometerPhoto || !endingKmShown) {
      Alert.alert(t('tripEnd.errorTitle'), t('tripEnd.missingFieldsBody'));
      return;
    }

    if (otpRequired && !tripOtp.trim()) {
      Alert.alert('Trip End Code Required', 'Ask the customer for the trip end code from their confirmation email.');
      return;
    }

    // Toll must be entered ONLY if tollChargeUpdate is true
    if (tollChargeUpdate === true && (!tollCharge || parseFloat(tollCharge) < 0)) {
      Alert.alert(t('tripEnd.errorTitle'), t('tripEnd.invalidTollBody'));
      return;
    }

    // Waiting time must be entered for multicity orders
    if (isMulticity && (!waitingTime || parseInt(waitingTime) < 0)) {
      Alert.alert(t('tripEnd.errorTitle'), t('tripEnd.invalidWaitingTimeBody'));
      return;
    }

    if (submitting) return;

    const totalKm = parseInt(endKm) - startKm;
    const totalFare = calculateFare();

    try {
      setSubmitting(true);
      const assignment_id = String(params.assignment_id || '');
      let tripEndResponse = null;
      
      if (assignment_id) {
        // Create a dummy contact number since it's no longer required from user
        const dummyContact = '0000000000';
        tripEndResponse = await endTrip(
          parseInt(params.order_id || ''),
          parseInt(endKm, 10),
          dummyContact,
          odometerPhoto,
          tollChargeUpdate === true ? parseFloat(tollCharge) : undefined,
          tollChargeUpdate,
          isMulticity ? parseInt(waitingTime, 10) : undefined,
          undefined, // cash collected is confirmed on the Completion page, after the bill is shown
          tripOtp,
          extraChargeItems.map((item) => ({ label: item.label, amount: parseInt(extraChargeAmounts[item.label] || '0', 10) || 0 })),
          distanceReason
        );
      } else {
        console.warn('No assignment_id provided to end trip; finishing without API call');
      }

      // Trip is over - stop sharing this driver's live location for it.
      stopTripLocationSharing();

      // Remember that this trip still needs its Completion step (rating + cash), so it is offered again if the app
      // is closed before it is done.
      try { await SecureStore.setItemAsync('pendingTripCompletion', String(params.order_id || '')); } catch {}

      // Navigate to trip report screen (the customer bill)
      router.replace({
        pathname: '/trip/report',
        params: { order_id: String(params.order_id || '0') }
      });
    } catch (error: any) {
      console.error('❌ Error details:', error);
      
      // Distance differs from the real route: not a failure - ask for a reason, then resubmit
      const _detail = error.response?.data?.detail;
      if (error.response?.status === 400 && _detail && typeof _detail === 'object' && _detail.code === 'DISTANCE_REASON_REQUIRED') {
        setDistanceInfo({ message: String(_detail.message || ''), km_driven: Number(_detail.km_driven), route_km: Number(_detail.route_km) });
        setSubmitting(false);
        return;
      }

      // Handle specific error cases with user-friendly messages
      if (error.response?.status === 400) {
        const errorDetail = typeof error.response?.data?.detail === 'string' ? error.response.data.detail : '';
        
        if (errorDetail.includes('End KM cannot be less than start KM')) {
          Alert.alert(
            t('tripEnd.invalidKmTitle'),
            t('tripEnd.invalidKmLessThanStart'),
            [{ text: 'OK' }]
          );
        } else if (errorDetail.includes('End KM')) {
          Alert.alert(
            t('tripEnd.invalidKmTitle'),
            t('tripEnd.invalidKmGeneric'),
            [{ text: 'OK' }]
          );
        } else if (errorDetail.includes('toll')) {
          Alert.alert(
            t('tripEnd.invalidTollTitle'),
            t('tripEnd.invalidTollBody'),
            [{ text: 'OK' }]
          );
        } else if (errorDetail.includes('Insufficient balance') || errorDetail.includes('Wallet debit failed')) {
          Alert.alert(
            t('tripEnd.insufficientBalanceTitle'),
            t('tripEnd.insufficientBalanceBody'),
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            t('tripEnd.validationErrorTitle'),
            errorDetail || t('tripEnd.validationErrorGeneric'),
            [{ text: 'OK' }]
          );
        }
      } else if (error.response?.status === 401) {
        Alert.alert(
          t('tripEnd.authErrorTitle'),
          t('tripEnd.authErrorBody'),
          [{ text: 'OK' }]
        );
      } else if (error.response?.status === 404) {
        Alert.alert(
          t('tripEnd.tripNotFoundTitle'),
          t('tripEnd.tripNotFoundBody'),
          [{ text: 'OK' }]
        );
      } else if (error.response?.status >= 500) {
        Alert.alert(
          t('tripEnd.serverErrorTitle'),
          t('tripEnd.serverErrorBody'),
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          t('tripEnd.errorTitle'),
          error.message || t('tripEnd.endFailedBody'),
          [{ text: 'OK' }]
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <LoadingOverlay
        visible={submitting}
        message={t('tripEnd.completingTrip')}
      />

      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => safeBack(router)}>
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('tripEnd.headerTitle')}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text }]}>{t('tripEnd.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('tripEnd.subtitle')}</Text>
        </View>

        {/* 1. Odometer Photo Viewfinder Card */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Gauge size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripEnd.endOdometerPhoto')}</Text>
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
                <Text style={styles.retakeButtonText}>{t('tripEnd.retakePhoto')}</Text>
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
              <Text style={[styles.photoButtonText, { color: colors.text }]}>{t('tripEnd.takeOdometerPhoto')}</Text>
              <Text style={[styles.photoHelper, { color: colors.textSecondary }]}>Align final odometer reading inside camera viewfinder</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Ending Kilometer Input */}
        <View style={styles.cardSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripEnd.endingKilometer')}</Text>
          <View style={[styles.inputRowContainer, { backgroundColor: colors.surface, borderColor: endKm ? colors.primary : colors.border }]}>
            <TextInput
              style={[styles.numericInput, { color: colors.text }]}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={endKm}
              onChangeText={setEndKm}
              keyboardType="numeric"
            />
            <View style={[styles.unitBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.unitBadgeText, { color: colors.primary }]}>KM</Text>
            </View>
          </View>
        </View>

        {/* 3. Toll Charge Input - Only show if toll_charge_update is true */}
        {tollChargeUpdate === true && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripEnd.tollCharges')}</Text>
            <View style={[styles.inputRowContainer, { backgroundColor: colors.surface, borderColor: tollCharge ? colors.primary : colors.border }]}>
              <View style={[styles.unitBadge, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.unitBadgeText, { color: colors.primary }]}>₹</Text>
              </View>
              <TextInput
                style={[styles.numericInput, { color: colors.text }]}
                placeholder={t('tripEnd.tollPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={tollCharge}
                onChangeText={setTollCharge}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {t('tripEnd.tollHelper')}
            </Text>
          </View>
        )}

        {/* 4. Waiting Time Input - Only show for multicity orders */}
        {isMulticity && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('tripEnd.waitingTimeMinutes')}</Text>
            <View style={[styles.inputRowContainer, { backgroundColor: colors.surface, borderColor: waitingTime ? colors.primary : colors.border }]}>
              <TextInput
                style={[styles.numericInput, { color: colors.text }]}
                placeholder={t('tripEnd.waitingTimePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={waitingTime}
                onChangeText={handleWaitingTimeChange}
                keyboardType="numeric"
              />
              <View style={[styles.unitBadge, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.unitBadgeText, { color: colors.primary }]}>MINS</Text>
              </View>
            </View>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {t('tripEnd.waitingTimeHelper')}
            </Text>
          </View>
        )}

        {/* 5. Trip End Code */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <KeyRound size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Trip End Code{otpRequired ? '' : ' (Optional)'}</Text>
          </View>
          <Text style={[styles.helperText, { color: colors.textSecondary, marginBottom: 8 }]}>
            {otpRequired
              ? 'Ask the customer for the 4-digit completion code from their SMS or booking page.'
              : 'Not needed for self-sourced bookings — you can complete the trip directly.'}
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

        {includedChargeItems.length > 0 && (
          <View style={[styles.cardSection, { backgroundColor: colors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>Included in the trip fare</Text>
            <Text style={[styles.helperText, { color: colors.textSecondary, marginBottom: 10 }]}>
              These are already paid through the fare. Do not ask the customer for them again.
            </Text>
            {includedChargeItems.map((item, idx) => (
              <View key={`incl-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: isDarkMode ? 'rgba(16,185,129,0.12)' : '#ECFDF5', marginBottom: 6 }}>
                <Text style={{ flex: 1, marginRight: 8, fontSize: 13.5, fontFamily: 'Inter-Medium', color: colors.text }}>{item.label}</Text>
                <View style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter-Bold' }}>Included</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Extra charges NOT bundled */}
        {extraChargeItems.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Not in the fare - enter what you collected</Text>
            <Text style={[styles.helperText, { color: colors.textSecondary, marginBottom: 8 }]}>
              These are charged on actuals, on top of the trip fare. Enter the amount you collected from the customer for each one. Keep 0 if nothing was collected.
            </Text>
            {extraChargeItems.map((item) => (
              <View key={item.label} style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 4 }}>{item.label}</Text>
                <View style={[styles.inputRowContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.unitBadge, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.unitBadgeText, { color: colors.primary }]}>₹</Text>
                  </View>
                  <TextInput
                    style={[styles.numericInput, { color: colors.text }]}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    value={extraChargeAmounts[item.label] || ''}
                    onChangeText={(v) => setExtraChargeAmounts((prev) => ({ ...prev, [item.label]: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 7. ENDING KM SHOWN CHECKBOX - always visible */}
        <TouchableOpacity
          style={[
            styles.checklistCard,
            {
              backgroundColor: colors.surface,
              borderColor: endingKmShown ? colors.success : colors.border,
            },
          ]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setEndingKmShown((v) => !v);
          }}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: endingKmShown ? colors.success : colors.border,
                backgroundColor: endingKmShown ? colors.success : 'transparent',
              },
            ]}
          >
            {endingKmShown && <Check color="#FFFFFF" size={16} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter-SemiBold', color: colors.text }}>
              {t('tripEnd.shownEndingKm')}
            </Text>
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 2 }}>
              Passenger has visually confirmed the final closing meter reading
            </Text>
          </View>
        </TouchableOpacity>

        {/* 8. End Trip Button */}
        <TouchableOpacity
          style={[
            styles.endButton,
            { backgroundColor: colors.error },
            (!endKm || !odometerPhoto || !endingKmShown || (otpRequired && !tripOtp.trim()) || (tollChargeUpdate === true && !tollCharge) || (isMulticity && !waitingTime) || submitting) && [
              styles.disabledButton,
              { backgroundColor: isDarkMode ? '#334155' : '#CBD5E1' },
            ],
          ]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            handleEndTrip();
          }}
          disabled={!endKm || !odometerPhoto || !endingKmShown || (otpRequired && !tripOtp.trim()) || (tollChargeUpdate === true && !tollCharge) || (isMulticity && !waitingTime) || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.endButtonText}>{t('tripEnd.completingTripButton')}</Text>
            </View>
          ) : (
            <Text style={styles.endButtonText}>{t('tripEnd.completeTripButton')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={!!distanceInfo} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setDistanceInfo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 6 }}>Distance is different</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 14 }}>
              {distanceInfo ? `You drove ${distanceInfo.km_driven} km, but this route is about ${distanceInfo.route_km} km. Please tell us why. The trip is not stopped - the booking owner and Drop Cars will see your reason.` : ''}
            </Text>
            {['Customer changed the route', 'Extra stops / local trips', 'Road diversion or traffic', 'Odometer reading corrected', 'Other'].map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setDistanceChoice(r)}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1.5, borderColor: distanceChoice === r ? colors.primary : colors.border, backgroundColor: distanceChoice === r ? colors.primary + '14' : 'transparent', marginBottom: 8 }}
                activeOpacity={0.8}
              >
                <Text style={{ color: colors.text, fontFamily: distanceChoice === r ? 'Inter-Bold' : 'Inter-Medium', fontSize: 14 }}>{r}</Text>
              </TouchableOpacity>
            ))}
            {distanceChoice === 'Other' && (
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 8, minHeight: 48 }}
                placeholder="Write the reason"
                placeholderTextColor={colors.textSecondary}
                value={distanceNote}
                onChangeText={setDistanceNote}
                multiline
              />
            )}
            <TouchableOpacity
              onPress={() => { setDistanceInfo(null); router.push({ pathname: '/chat/[orderId]', params: { orderId: String(params.order_id || '') } } as any); }}
              style={{ alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 6 }}
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>💬 Chat with the booking owner instead</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setDistanceInfo(null)} style={{ flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
                <Text style={{ fontFamily: 'Inter-SemiBold', color: '#374151' }}>Check reading</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!distanceChoice || (distanceChoice === 'Other' && !distanceNote.trim())}
                onPress={() => {
                  const reason = distanceChoice === 'Other' ? distanceNote.trim() : distanceChoice;
                  setDistanceInfo(null);
                  handleEndTrip(reason);
                }}
                style={{ flex: 1.4, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: !distanceChoice || (distanceChoice === 'Other' && !distanceNote.trim()) ? '#CBD5E1' : colors.primary }}
              >
                <Text style={{ fontFamily: 'Inter-SemiBold', color: '#FFFFFF' }}>Send reason & complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
    letterSpacing: -0.3,
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
    marginBottom: 8,
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
  inputRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  numericInput: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
    paddingVertical: 10,
  },
  unitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  unitBadgeText: {
    fontSize: 13,
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
  helperText: {
    fontSize: 12,
    marginTop: 6,
    fontFamily: 'Inter-Regular',
  },
  endButton: {
    borderRadius: 16,
    minHeight: 52,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledButton: {
    shadowOpacity: 0,
    elevation: 0,
  },
  endButtonText: {
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