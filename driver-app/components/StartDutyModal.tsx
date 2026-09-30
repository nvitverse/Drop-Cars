import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Camera, ShieldCheck, KeyRound, Gauge } from 'lucide-react-native';
import SwipeSlider from './SwipeSlider';

interface StartDutyModalProps {
  visible: boolean;
  onClose: () => void;
  onStartDutyConfirmed: (odometer: string, otp: string) => void;
  orderId: number | string;
  pickupLocation: string;
}

export default function StartDutyModal({
  visible,
  onClose,
  onStartDutyConfirmed,
  orderId,
  pickupLocation,
}: StartDutyModalProps) {
  const insets = useSafeAreaInsets();
  const [odometer, setOdometer] = useState('');
  const [otp, setOtp] = useState('');
  // 4 Pre-Trip Photos
  const [photos, setPhotos] = useState<{
    selfie: boolean;
    carFront: boolean;
    interior: boolean;
    backSeat: boolean;
  }>({
    selfie: false,
    carFront: false,
    interior: false,
    backSeat: false,
  });

  const togglePhoto = (key: keyof typeof photos) => {
    setPhotos((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allPhotosCaptured = photos.selfie && photos.carFront && photos.interior && photos.backSeat;

  const handleSwipeComplete = () => {
    if (!photos.selfie) {
      Alert.alert('Selfie Required', 'Please complete Driver Selfie Check before starting trip.');
      return;
    }
    if (!photos.carFront) {
      Alert.alert('Car Front Photo Required', 'Please capture Car Front photo.');
      return;
    }
    if (!photos.interior) {
      Alert.alert('Interior Photo Required', 'Please capture Interior Cleanliness photo.');
      return;
    }
    if (!photos.backSeat) {
      Alert.alert('Back Seat Photo Required', 'Please capture Back Seat photo.');
      return;
    }
    if (!odometer || odometer.trim().length === 0) {
      Alert.alert('Odometer Required', 'Please enter initial odometer reading.');
      return;
    }
    if (!otp || otp.trim().length !== 4) {
      Alert.alert('Invalid OTP', 'Please enter valid 4-digit Customer Start OTP.');
      return;
    }
    onStartDutyConfirmed(odometer, otp);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.cardContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={22} color="#10B981" />
              <Text style={styles.headerTitle}>Start Duty Verification</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subTitle}>
            Order #{orderId} • {pickupLocation}
          </Text>

          {/* Sequential Driver Duty Stage Indicator */}
          <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#3B82F6', textTransform: 'uppercase', marginBottom: 4 }}>
              📍 DRIVER PICKUP TIMELINE STEPS
            </Text>
            <Text style={{ fontSize: 11, color: '#64748B', lineHeight: 15 }}>
              1️⃣ <Text style={{ fontWeight: 'bold' }}>1 Hr Before Pickup:</Text> Take 4 Pre-Trip Photos & Start for Pickup.{'\n'}
              2️⃣ <Text style={{ fontWeight: 'bold' }}>15 Mins Before:</Text> Swipe "Reached Pickup Location" (&lt;5km).{'\n'}
              3️⃣ <Text style={{ fontWeight: 'bold' }}>Boarding:</Text> Ask OTP & Enter Start Odometer (KM).
            </Text>
          </View>

          {/* 1. Pre-Trip Inspection Photos (Required 1 Hr Before Pickup) */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>1. PRE-TRIP PHOTOS (TAKE 1 HR BEFORE PICKUP)</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {[
                {
                  key: 'selfie' as const,
                  label: '📸 Driver Selfie',
                  desc: 'Sample: Driver Face Photo',
                  sampleImg: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
                },
                {
                  key: 'carFront' as const,
                  label: '🚗 Car Front View',
                  desc: 'Sample: Front Plate Visible',
                  sampleImg: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=120',
                },
                {
                  key: 'interior' as const,
                  label: '🧹 Interior Cleanliness',
                  desc: 'Sample: Dashboard & Front Cabin',
                  sampleImg: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=120',
                },
                {
                  key: 'backSeat' as const,
                  label: '💺 Back Seat Condition',
                  desc: 'Sample: Rear Seats & Floor',
                  sampleImg: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=120',
                },
              ].map((item) => {
                const captured = photos[item.key];
                return (
                  <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Sample Model Reference Photo */}
                    <View style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F1F5F9' }}>
                      <Image source={{ uri: item.sampleImg }} style={{ width: '100%', height: '100%' }} />
                      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 8, textAlign: 'center', fontWeight: 'bold' }}>SAMPLE</Text>
                      </View>
                    </View>

                    {/* Photo Capture Action Button */}
                    <TouchableOpacity
                      style={[styles.selfieBtn, { flex: 1 }, captured && styles.selfieBtnCaptured]}
                      onPress={() => togglePhoto(item.key)}
                      activeOpacity={0.8}
                    >
                      <Camera size={16} color={captured ? '#10B981' : '#3B82F6'} />
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={[styles.selfieBtnText, captured && { color: '#047857' }]}>
                          {captured ? `✓ ${item.label} Verified` : item.label}
                        </Text>
                        <Text style={{ fontSize: 10, color: captured ? '#047857' : '#64748B' }}>
                          {captured ? 'Captured & Verified' : item.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 2. Odometer Reading */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>2. START ODOMETER READING (KM)</Text>
            <View style={styles.inputBox}>
              <Gauge size={20} color="#64748B" />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 45280"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={odometer}
                onChangeText={setOdometer}
              />
            </View>
          </View>

          {/* 3. Customer Start OTP */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>3. CUSTOMER START OTP (4 DIGITS)</Text>
            <View style={styles.inputBox}>
              <KeyRound size={20} color="#64748B" />
              <TextInput
                style={styles.textInput}
                placeholder="Ask customer for 4-digit OTP"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={4}
                value={otp}
                onChangeText={setOtp}
              />
            </View>
          </View>

          {/* Swipe Slider to Confirm */}
          <View style={{ marginTop: 12 }}>
            <SwipeSlider
              onSwipeComplete={handleSwipeComplete}
              title="SWIPE TO START DUTY"
              confirmedTitle="DUTY STARTED ✓"
              color="#10B981"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subTitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 16,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  fieldSection: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  selfieBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 6,
    paddingVertical: 12,
  },
  selfieBtnCaptured: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  selfieBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
});
