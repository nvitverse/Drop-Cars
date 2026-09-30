import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { X, CheckCircle, Car as CarIcon, Plus, ArrowLeft, Users, AlertTriangle, MessageCircle, Clock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';
import { fetchAvailableDrivers, AvailableDriver, AvailableCar } from '@/services/orders/assignmentService';
import { getCarSeats } from '@/utils/carTypeCompat';
import { vehicleRequestService } from '@/services/vehicle/vehicleRequestService';

interface VehicleMismatchModalProps {
  visible: boolean;
  onClose: () => void;
  orderId: number;
  requiredCarType: string;
  reason?: 'NO_CAR' | 'UNVERIFIED' | string;
}

const formatCarType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function VehicleMismatchModal({ visible, onClose, orderId, requiredCarType, reason }: VehicleMismatchModalProps) {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();

  const [step, setStep] = useState<'intro' | 'pickDriver' | 'pickCar' | 'submitting' | 'sent'>('intro');
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [cars, setCars] = useState<AvailableCar[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<AvailableDriver | null>(null);
  const [submittedCar, setSubmittedCar] = useState<{ carType: string; carName: string } | null>(null);

  const requiredSeats = getCarSeats(requiredCarType);

  const reset = () => {
    setStep('intro');
    setSelectedDriver(null);
    setDrivers([]);
    setCars([]);
    setSubmittedCar(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const startRequestFlow = async () => {
    setLoading(true);
    try {
      let driversResponse: AvailableDriver[] = [];
      try {
        driversResponse = await fetchAvailableDrivers();
      } catch {
        driversResponse = [];
      }

      let carsResponse: AvailableCar[] = [];
      try {
        const carsApi = await axiosInstance.get('/api/assignments/available-cars', { noCache: true } as any);
        if (Array.isArray(carsApi?.data)) carsResponse = carsApi.data as AvailableCar[];
      } catch {
        carsResponse = [];
      }

      // If no drivers exist, create fallback Self driver
      if (!driversResponse || driversResponse.length === 0) {
        driversResponse = [{
          id: 1,
          full_name: 'Self (Driver)',
          primary_number: 'Registered Mobile',
          verification_status: 'VERIFIED',
        } as any];
      }

      setDrivers(driversResponse);
      setCars(carsResponse || []);

      // If only 1 driver, auto-select and proceed to car selection
      if (driversResponse.length === 1) {
        setSelectedDriver(driversResponse[0]);
        setStep('pickCar');
      } else {
        setStep('pickDriver');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load drivers and vehicles.');
    } finally {
      setLoading(false);
    }
  };

  const pickDriver = (driver: AvailableDriver) => {
    setSelectedDriver(driver);
    setStep('pickCar');
  };

  const doSendRequest = async (carType: string, carName: string, carId?: number | string) => {
    setStep('submitting');
    try {
      await vehicleRequestService.submitRequest({
        orderId,
        carType: carType || 'SUV',
        carName: carName || carType,
        carId,
        driverId: selectedDriver?.id,
        driverName: selectedDriver?.full_name || 'Assigned Driver',
      });

      // Also attempt backend substitution request gracefully
      try {
        await axiosInstance.post('/api/assignments/car-substitution-request', {
          order_id: orderId,
          car_id: carId || 1,
          driver_id: selectedDriver?.id || 1,
        });
      } catch {}

      setSubmittedCar({ carType, carName });
      setStep('sent');
    } catch (e: any) {
      Alert.alert('Error', 'Failed to send request. Please try again.');
      setStep('pickCar');
    }
  };

  const submitRequest = async (car: AvailableCar) => {
    const carSeats = getCarSeats(car.car_type);
    if (carSeats < requiredSeats) {
      Alert.alert(
        'Seating Capacity Notice',
        `This booking requires at least ${requiredSeats} passenger seats for ${formatCarType(requiredCarType)}. ${car.car_name} has ${carSeats} seats.\n\nWould you like to send this exception request to the vendor for approval?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Request to Vendor',
            onPress: () => doSendRequest(car.car_type, car.car_name, car.id),
          },
        ]
      );
      return;
    }

    doSendRequest(car.car_type, car.car_name, car.id);
  };

  const addCarNow = () => {
    close();
    router.push('/my-cars' as any);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            {step !== 'intro' && step !== 'sent' && step !== 'submitting' ? (
              <TouchableOpacity
                onPress={() => setStep(step === 'pickCar' && drivers.length > 1 ? 'pickDriver' : 'intro')}
                style={{ marginRight: 10, padding: 4 }}
              >
                <ArrowLeft size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.title, { color: colors.text }]}>
              {step === 'sent'
                ? 'Request Sent to Vendor'
                : reason === 'UNVERIFIED'
                  ? 'Verify Your Car First'
                  : `Needs a ${formatCarType(requiredCarType)} (${requiredSeats} Seats)`}
            </Text>
            <TouchableOpacity onPress={close}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {step === 'intro' && reason === 'UNVERIFIED' && (
            <View style={{ gap: 14 }}>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                You have a car that fits this {formatCarType(requiredCarType)} booking, but its documents aren't fully verified yet. Once it's verified you can accept this booking.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={addCarNow}>
                <CarIcon size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Open My Fleet</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'intro' && reason !== 'UNVERIFIED' && (
            <View style={{ gap: 14 }}>
              <View style={{ backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#FDE68A' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <AlertTriangle size={16} color="#D97706" />
                  <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Inter-Bold', color: '#B45309' }}>
                    Vehicle Required: {formatCarType(requiredCarType)} ({requiredSeats} Seater)
                  </Text>
                </View>
                <Text style={[styles.body, { color: colors.textSecondary, fontSize: 12.5 }]}>
                  This booking requires a verified {formatCarType(requiredCarType)} with at least {requiredSeats} passenger seats.
                </Text>
              </View>

              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.primary, backgroundColor: isDarkMode ? '#1E1B4B' : '#EEF2FF' }]} onPress={startRequestFlow} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.primary} /> : (
                  <>
                    <CarIcon size={18} color={colors.primary} />
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Request with My Car / Category</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={addCarNow}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Add {formatCarType(requiredCarType)} to My Fleet</Text>
              </TouchableOpacity>

              <Text style={[styles.footnote, { color: colors.textSecondary }]}>
                Offer a vehicle from your fleet. Once requested, you can chat directly with the vendor and get instant approval.
              </Text>
            </View>
          )}

          {step === 'pickDriver' && (
            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={[styles.body, { color: colors.textSecondary, marginBottom: 10 }]}>Select the driver to assign:</Text>
              {drivers.length === 0 ? (
                <Text style={[styles.body, { color: colors.textSecondary }]}>No drivers available.</Text>
              ) : drivers.map((d) => (
                <TouchableOpacity key={d.id} style={[styles.rowItem, { borderColor: colors.border }]} onPress={() => pickDriver(d)}>
                  <Text style={[styles.rowItemTitle, { color: colors.text }]}>{d.full_name}</Text>
                  <Text style={[styles.rowItemSub, { color: colors.textSecondary }]}>{d.primary_number}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {step === 'pickCar' && (
            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={[styles.body, { color: colors.textSecondary, marginBottom: 6 }]}>
                Select the vehicle to offer (Driver: {selectedDriver?.full_name || 'Self'}):
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: '#EFF6FF', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' }}>
                <Users size={14} color="#2563EB" />
                <Text style={{ fontSize: 11.5, color: '#1E40AF', fontFamily: 'Inter-Medium' }}>
                  Booking requires at least <Text style={{ fontFamily: 'Inter-Bold' }}>{requiredSeats} passenger seats</Text>.
                </Text>
              </View>

              {cars.length > 0 ? (
                cars.map((c) => {
                  const carSeats = getCarSeats(c.car_type);
                  const isSufficient = carSeats >= requiredSeats;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.rowItem,
                        { borderColor: isSufficient ? colors.border : '#F59E0B', backgroundColor: isSufficient ? colors.surface : (isDarkMode ? '#1E293B' : '#FFFBEB') },
                      ]}
                      onPress={() => submitRequest(c)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.rowItemTitle, { color: colors.text }]}>{c.car_name} ({formatCarType(c.car_type)})</Text>
                          <View style={{ backgroundColor: isSufficient ? '#D1FAE5' : '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', color: isSufficient ? '#059669' : '#B45309' }}>
                              {carSeats} Seater
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.rowItemSub, { color: colors.textSecondary }]}>
                          {c.car_number}
                          {!isSufficient && ` • Exception request for ${carSeats} seats`}
                        </Text>
                      </View>
                      <CheckCircle size={20} color={isSufficient ? '#10B981' : '#F59E0B'} />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={[styles.body, { color: colors.textSecondary, fontSize: 12.5, marginBottom: 4 }]}>
                    Choose vehicle category to request with vendor:
                  </Text>
                  {[
                    { type: 'SUV', name: 'Mahindra XUV700 / Scorpio (SUV)', seats: 6 },
                    { type: 'INNOVA', name: 'Toyota Innova / Crysta', seats: 7 },
                    { type: 'SEDAN', name: 'Maruti Suzuki Dzire / Etios (Sedan)', seats: 4 },
                  ].map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.rowItem, { borderColor: colors.border }]}
                      onPress={() => doSendRequest(item.type, item.name)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowItemTitle, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.rowItemSub, { color: colors.textSecondary }]}>{item.seats} Seater Category</Text>
                      </View>
                      <CarIcon size={20} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {step === 'submitting' && (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 12, fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                Submitting request to vendor...
              </Text>
            </View>
          )}

          {step === 'sent' && (
            <View style={{ gap: 14, alignItems: 'center', paddingVertical: 10 }}>
              <CheckCircle size={44} color="#10B981" />
              <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                Request Sent to Vendor!
              </Text>
              
              <View style={{ backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#FDE68A', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <Clock size={16} color="#D97706" />
                  <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Inter-Bold', color: '#B45309' }}>
                    Requested for {submittedCar?.carName || submittedCar?.carType || 'SUV'}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                  Status: Pending Vendor Approval • Please wait
                </Text>
              </View>

              <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 18 }]}>
                Your request has been registered. You can chat directly with the vendor right now to get this booking approved!
              </Text>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}
                onPress={() => {
                  const carT = submittedCar?.carType || 'SUV';
                  const carN = submittedCar?.carName || carT;
                  close();
                  router.push({
                    pathname: `/chat/${orderId}` as any,
                    params: {
                      orderId: String(orderId),
                      type: 'vehicle_request',
                      carType: carT,
                      carName: carN,
                    },
                  });
                }}
              >
                <MessageCircle size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Chat with Vendor Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, alignSelf: 'stretch' }]}
                onPress={close}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { flex: 1, fontSize: 17, lineHeight: 23, fontFamily: 'Inter-Bold', paddingRight: 12 },
  body: { fontSize: 14, fontFamily: 'Inter-Medium', lineHeight: 20 },
  footnote: { fontSize: 11.5, fontFamily: 'Inter-Regular', lineHeight: 15 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 6 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 6, borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 14, fontFamily: 'Inter-Bold' },
  rowItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14, borderRadius: 6, borderWidth: 1, marginBottom: 10 },
  rowItemTitle: { fontSize: 14, fontFamily: 'Inter-Bold', flexShrink: 1 },
  rowItemSub: { fontSize: 12, fontFamily: 'Inter-Medium', marginTop: 2 },
});
