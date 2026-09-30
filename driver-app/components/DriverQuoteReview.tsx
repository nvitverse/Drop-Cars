import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapPin,
  Calendar,
  Clock,
  Car,
  User,
  Phone,
  IndianRupee,
  Send,
  X,
  FileText,
  Truck,
  Route,
  Pencil,
  Check as CheckIcon,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { formatCarType } from '@/utils/format';

interface DriverQuoteReviewProps {
  visible: boolean;
  onClose: () => void;
  quoteData: { fare: any; echo: any } | null;
  onConfirm: (overrideKm?: number, overrideTripTime?: string) => Promise<void>;
  isLoading: boolean;
  applyCommission: boolean;
  commissionPercent: number;
  // Advance the poster says they already collected. The server holds this
  // much in their wallet (not charged) - shown here so it's no surprise.
  advanceReceived?: number;
}

// A simplified, Driver-App-scoped port of Vendor App's QuoteReview.tsx
// (components/QuoteReview.tsx) - same editable-distance/live-fare-recalc
// core, but with the vendor-only "send to ALL/NEAR_CITY" driver-assignment
// section removed entirely (a driver's own booking self-assigns
// immediately, it's never broadcast to anyone else - see the confirm
// endpoint's own comment in order_assignments.py) and a single combined
// fare + commission/earnings breakdown instead of separate "Vendor" and
// "Driver" pricing sections (there's only one party here).
export default function DriverQuoteReview({
  visible,
  onClose,
  quoteData,
  onConfirm,
  isLoading,
  applyCommission,
  commissionPercent,
  advanceReceived = 0,
}: DriverQuoteReviewProps) {
  const { colors, isDarkMode } = useTheme();
  const [isEditingDistance, setIsEditingDistance] = useState(false);
  const [kmInput, setKmInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [overrideKm, setOverrideKm] = useState<number | null>(null);
  const [overrideTime, setOverrideTime] = useState<string | null>(null);

  // Reset any distance override whenever a fresh quote comes in.
  useEffect(() => {
    setOverrideKm(null);
    setOverrideTime(null);
    setIsEditingDistance(false);
  }, [quoteData]);

  // Live preview of the fare with the edited km/time - mirrors the
  // backend's apply_distance_override (crud/new_orders.py) exactly, so
  // the numbers shown here match what actually gets billed on confirm.
  const effectiveFare = useMemo(() => {
    if (!quoteData?.fare) return quoteData?.fare;
    if (overrideKm == null) return quoteData.fare;
    const costPerKm = Number(quoteData.echo?.cost_per_km || 0);
    const extraCostPerKm = Number(quoteData.echo?.extra_cost_per_km || 0);
    const oldKm = Number(quoteData.fare.total_km || 0);
    const oldBase = Number(quoteData.fare.base_km_amount || 0);
    const oldExtraBase = Math.round(oldKm * extraCostPerKm);
    const newBase = Math.round(overrideKm * costPerKm);
    const newExtraBase = Math.round(overrideKm * extraCostPerKm);
    const kmDelta = newBase - oldBase;
    const extraKmDelta = newExtraBase - oldExtraBase;
    return {
      ...quoteData.fare,
      calculated_km: oldKm,
      total_km: overrideKm,
      trip_time: overrideTime || quoteData.fare.trip_time,
      base_km_amount: newBase,
      total_amount: Number(quoteData.fare.total_amount || 0) + kmDelta + extraKmDelta,
      customer_amount: Number(quoteData.fare.customer_amount || 0) + kmDelta + extraKmDelta,
      driver_amount: Number(quoteData.fare.driver_amount || 0) + kmDelta,
    };
  }, [quoteData, overrideKm, overrideTime]);

  if (!quoteData || !effectiveFare) return null;

  const echo = quoteData.echo;
  const tripType = echo.trip_type;

  const getLocationEntries = () =>
    Object.entries(echo.pickup_drop_location || {}).sort(([a], [b]) => parseInt(a) - parseInt(b));
  const locations = getLocationEntries();

  const getLocationLabel = (index: string, isLast: boolean) => {
    const position = parseInt(index);
    if (position === 0) return 'Pickup Location';
    if (tripType === 'Round Trip' && isLast) return 'Return to Pickup';
    if (isLast) return 'Final Destination';
    return `Stop ${position}`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  };

  // This is a self-sourced booking (the poster IS the driver) - see
  // crud/end_records.py's trip-close logic. The "vendor share" (what an
  // external vendor would normally earn for arranging the trip) is NOT
  // lost to the platform here - it's credited straight back to the same
  // poster as a bonus for having found this customer themselves, minus a
  // small platform fee Drop Cars keeps out of THAT bonus specifically
  // (not out of the driving earnings). This used to be shown as a flat
  // "platform commission" deducted from the whole fare, which was wrong
  // on two counts: the vendor share was never actually lost, and the
  // platform fee is a small cut of the bonus, not 10% of the base fare.
  const vendorSharePercent = Number(quoteData.fare?.vendor_commission_percent) || commissionPercent;
  const postingBonus = Math.ceil(Number(effectiveFare.base_km_amount || 0) * vendorSharePercent / 100);
  const platformFeePercent = 10; // matches backend's SELF_SOURCED_PLATFORM_FEE_PERCENT
  const platformFee = applyCommission ? Math.ceil(postingBonus * platformFeePercent / 100) : 0;
  const bonusAfterFee = postingBonus - platformFee;
  const drivingEarnings = Number(effectiveFare.driver_amount || 0) - postingBonus;
  const netEarnings = drivingEarnings + bonusAfterFee;

  const handleConfirm = () => {
    Alert.alert(
      'Create This Booking?',
      `Total fare ₹${effectiveFare.customer_amount} for ${effectiveFare.total_km} km. This will be broadcast to other drivers to accept - you'll earn the posting bonus. You can't accept your own booking, and you can cancel it any time before the trip starts from My Trips.` +
        (advanceReceived > 0
          ? `\n\nYou marked ₹${advanceReceived} as advance received, so ₹${advanceReceived} will be HELD in your wallet. It is not charged - it is returned when the trip completes or if you cancel the booking.`
          : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => onConfirm(overrideKm ?? undefined, overrideTime ?? undefined),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.compactHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Review Booking</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{tripType} Journey</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.background }]}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Customer Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <User size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Details</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.detailRow}>
                <User size={18} color="#1E40AF" style={styles.detailIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Customer Name</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{echo.customer_name}</Text>
                </View>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Phone size={18} color="#1E40AF" style={styles.detailIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{echo.customer_number}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Trip Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Car size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trip Details</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.detailRow}>
                <Car size={18} color="#1E40AF" style={styles.detailIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Vehicle Type</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formatCarType(echo.car_type)}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Calendar size={18} color="#1E40AF" style={styles.detailIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Pickup Date</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formatDateTime(echo.start_date_time).date}</Text>
                </View>
              </View>
              <View style={[styles.detailRow, !echo.end_date_time && { borderBottomWidth: 0 }]}>
                <Clock size={18} color="#1E40AF" style={styles.detailIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Pickup Time</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formatDateTime(echo.start_date_time).time}</Text>
                </View>
              </View>
              {!!echo.end_date_time && (
                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Calendar size={18} color="#1E40AF" style={styles.detailIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {tripType === 'Round Trip' ? 'Return Date & Time' : 'Drop Date & Time'}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDateTime(echo.end_date_time).date} · {formatDateTime(echo.end_date_time).time}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Route */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Route size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Route</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {locations.map(([index, location], position) => (
                <View key={index} style={[styles.routeItem, position === locations.length - 1 && { marginBottom: 0 }]}>
                  <View style={styles.routeIndicator}>
                    <View style={[
                      styles.routeDot,
                      position === 0 ? { backgroundColor: '#10B981' } : position === locations.length - 1 ? { backgroundColor: '#DC2626' } : { backgroundColor: '#F59E0B' },
                    ]} />
                    {position < locations.length - 1 && <View style={[styles.routeLine, { backgroundColor: colors.border }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {getLocationLabel(index, position === locations.length - 1)}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{String(location)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Distance & Fare - the editable part */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Truck size={20} color="#1E40AF" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Distance & Fare</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {isEditingDistance ? (
                <View>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Distance (km)</Text>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={kmInput}
                    onChangeText={setKmInput}
                    keyboardType="numeric"
                    placeholder="e.g. 185"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={[styles.detailLabel, { color: colors.textSecondary, marginTop: 10, marginBottom: 4 }]}>Estimated Time (optional)</Text>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={timeInput}
                    onChangeText={setTimeInput}
                    placeholder="e.g. 3 hours 10 min"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setIsEditingDistance(false)}>
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 13 }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={() => {
                        const km = parseFloat(kmInput);
                        if (isNaN(km) || km <= 0) {
                          Alert.alert('Invalid', 'Enter a positive number of kilometers');
                          return;
                        }
                        setOverrideKm(km);
                        setOverrideTime(timeInput.trim() || null);
                        setIsEditingDistance(false);
                      }}
                    >
                      <CheckIcon size={14} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13, marginLeft: 4 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Distance</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.priceValue, { color: colors.text }]}>{effectiveFare.total_km} km</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setKmInput(String(effectiveFare.total_km));
                          setTimeInput(effectiveFare.trip_time || '');
                          setIsEditingDistance(true);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Pencil size={15} color="#1E40AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Estimated Time</Text>
                    <Text style={[styles.priceValue, { color: colors.text }]}>{effectiveFare.trip_time || 'Calculating...'}</Text>
                  </View>
                  {overrideKm != null && (
                    <View style={styles.editedNotice}>
                      <Text style={styles.editedNoticeText}>
                        Distance edited: {effectiveFare.calculated_km} km calculated → {effectiveFare.total_km} km billed.
                      </Text>
                    </View>
                  )}
                </>
              )}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
                  Base Fare ({effectiveFare.total_km} km × ₹{echo.cost_per_km})
                </Text>
                <Text style={[styles.priceValue, { color: colors.text }]}>₹{effectiveFare.base_km_amount}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Driver Allowance</Text>
                <Text style={[styles.priceValue, { color: colors.text }]}>₹{effectiveFare.driver_allowance || 0}</Text>
              </View>
              {!!echo.permit_charges && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Permit Charges</Text>
                  <Text style={[styles.priceValue, { color: colors.text }]}>₹{echo.permit_charges}</Text>
                </View>
              )}
              {!!echo.hill_charges && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Hill Charges</Text>
                  <Text style={[styles.priceValue, { color: colors.text }]}>₹{echo.hill_charges}</Text>
                </View>
              )}
              {echo.toll_charge_update ? (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Toll Charges</Text>
                  <Text style={[styles.priceValue, { color: colors.textSecondary, fontStyle: 'italic' }]}>Added at trip end</Text>
                </View>
              ) : !!echo.toll_charges && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Toll Charges</Text>
                  <Text style={[styles.priceValue, { color: colors.text }]}>₹{echo.toll_charges}</Text>
                </View>
              )}
              {!!echo.night_charges && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Night Charges</Text>
                  <Text style={[styles.priceValue, { color: colors.text }]}>₹{echo.night_charges}</Text>
                </View>
              )}
              <View style={[styles.priceRow, styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Total Fare (from customer)</Text>
                <Text style={styles.totalValue}>₹{effectiveFare.customer_amount}</Text>
              </View>
            </View>
          </View>

          {/* Commission & Earnings - this booking broadcasts to the open
              driver pool (see backend's driver_create_booking_confirm), so
              the poster isn't guaranteed to be the one driving it. Only the
              posting bonus is shown as a firm number here; driving earnings
              are called out separately as conditional on actually accepting
              the trip themselves. */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ShieldCheck size={20} color="#10B981" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Earning</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
                  Posting Earning (for sourcing this trip)
                </Text>
                <Text style={[styles.priceValue, { color: '#10B981' }]}>+₹{postingBonus}</Text>
              </View>
              {applyCommission ? (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
                    Platform Fee
                  </Text>
                  <Text style={[styles.priceValue, { color: '#DC2626' }]}>-₹{platformFee}</Text>
                </View>
              ) : (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Platform Fee</Text>
                  <Text style={[styles.priceValue, { color: '#10B981' }]}>₹0 (waived)</Text>
                </View>
              )}
              <View style={[styles.priceRow, styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Net Earning From Posting</Text>
                <Text style={[styles.totalValue, { color: '#10B981' }]}>₹{bonusAfterFee}</Text>
              </View>
              <Text style={styles.footnote}>
                This trip broadcasts to nearby drivers - whoever accepts earns the ₹{drivingEarnings} driving portion. You keep the posting earning above either way, and can accept it yourself from the New Bookings feed to earn both.
              </Text>
            </View>
          </View>

          {/* Special Requirements */}
          {(echo.car_make_year_requirement || echo.carrier_required) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <AlertCircle size={20} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>Special Requirements</Text>
              </View>
              <View style={[styles.card, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' }]}>
                {!!echo.car_make_year_requirement && (
                  <Text style={{ color: '#B91C1C', fontFamily: 'Inter-SemiBold', fontSize: 13, marginBottom: 4 }}>
                    Car Make Year: {echo.car_make_year_requirement} or newer
                  </Text>
                )}
                {!!echo.carrier_required && (
                  <Text style={{ color: '#B91C1C', fontFamily: 'Inter-SemiBold', fontSize: 13 }}>Carrier Required</Text>
                )}
              </View>
            </View>
          )}

          {/* Pickup Notes */}
          {!!echo.pickup_notes && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FileText size={20} color="#1E40AF" />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Pickup Notes</Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontStyle: 'italic' }}>{echo.pickup_notes}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmButton, isLoading && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={isLoading}
          >
            <LinearGradient colors={['#059669', '#10B981']} style={styles.gradientButton}>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Send size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmButtonText}>Confirm & Create Booking</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-Bold' },
  headerSubtitle: { fontSize: 12, fontFamily: 'Inter-Medium', marginTop: 1 },
  closeButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 16 },
  section: { marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 14.5, fontFamily: 'Inter-Bold' },
  card: { borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
  detailIcon: { marginRight: 10, marginTop: 1 },
  detailLabel: { fontSize: 11.5, fontFamily: 'Inter-Medium' },
  detailValue: { fontSize: 13.5, fontFamily: 'Inter-Bold', marginTop: 1 },
  routeItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  routeIndicator: { alignItems: 'center', marginRight: 10, width: 16 },
  routeDot: { width: 9, height: 9, borderRadius: 4.5, marginBottom: 4 },
  routeLine: { width: 1.5, height: 22, position: 'absolute', top: 9 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 12.5, fontFamily: 'Inter-Medium', flex: 1, marginRight: 8 },
  priceValue: { fontSize: 13, fontFamily: 'Inter-Bold' },
  totalRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, marginBottom: 0 },
  totalLabel: { fontSize: 13.5, fontFamily: 'Inter-Bold' },
  totalValue: { fontSize: 16, fontFamily: 'Inter-Bold', color: '#1E40AF' },
  footnote: { fontSize: 10.5, fontFamily: 'Inter-Medium', color: '#94A3B8', marginTop: 10, lineHeight: 14 },
  divider: { height: 1, marginVertical: 10 },
  editInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  saveBtn: { flex: 1, backgroundColor: '#1E40AF', borderRadius: 6, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  editedNotice: { backgroundColor: '#FEF3C7', borderRadius: 6, padding: 8, marginTop: 4, marginBottom: 8 },
  editedNoticeText: { fontSize: 11, color: '#92400E', fontFamily: 'Inter-Medium' },
  confirmButton: { borderRadius: 6, overflow: 'hidden', marginTop: 20 },
  gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  confirmButtonText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 15 },
});
