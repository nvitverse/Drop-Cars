import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Car,
  MapPin,
  Calendar,
  Clock,
  Users,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  Zap,
  Send,
  CheckCircle2,
  ChevronRight,
  Phone,
  IndianRupee,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface CarpoolPost {
  id: string;
  fromCity: string;
  toCity: string;
  intermediateStops: string[];
  departureTime: string;
  availableSeats: number;
  pricePerSeat: number;
  vehicleNumber: string;
  vehicleType: string;
  isAutoAccept: boolean;
  status: 'ACTIVE' | 'FULL' | 'COMPLETED' | 'CANCELLED';
  requests: Array<{
    id: string;
    passengerName: string;
    passengerPhone: string;
    seatsRequested: number;
    pickupStop: string;
    dropStop: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
  }>;
}

export default function GoingEmptyScreen() {
  const router = useRouter();
  const { colors, isDarkMode: isDark } = useTheme();
  const { dashboardData } = useDashboard();
  const { t } = useLanguage();

  // Form State for Publishing
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [stopInput, setStopInput] = useState('');
  const [stopsList, setStopsList] = useState<string[]>([]);
  const [departureTime, setDepartureTime] = useState('Today, 06:30 PM');
  const [availableSeats, setAvailableSeats] = useState('3');
  const [pricePerSeat, setPricePerSeat] = useState('350');
  const [isAutoAccept, setIsAutoAccept] = useState(true);

  // Active Going Empty Offers List
  const [offers, setOffers] = useState<CarpoolPost[]>([
    {
      id: 'ge_101',
      fromCity: 'Chennai',
      toCity: 'Madurai',
      intermediateStops: ['Villupuram', 'Trichy'],
      departureTime: 'Today, 06:30 PM',
      availableSeats: 2,
      pricePerSeat: 350,
      vehicleNumber: 'TN 09 AB 1001',
      vehicleType: 'Innova Crysta (Commercial Cab)',
      isAutoAccept: true,
      status: 'ACTIVE',
      requests: [
        {
          id: 'req_1',
          passengerName: 'Karthik N',
          passengerPhone: '9840098400',
          seatsRequested: 1,
          pickupStop: 'Chennai',
          dropStop: 'Trichy',
          status: 'APPROVED',
        },
      ],
    },
  ]);

  const handleAddStop = () => {
    const trimmed = stopInput.trim();
    if (!trimmed) return;
    setStopsList((prev) => [...prev, trimmed]);
    setStopInput('');
  };

  const handleRemoveStop = (index: number) => {
    setStopsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublishEmptyTrip = () => {
    if (!fromCity.trim() || !toCity.trim()) {
      Alert.alert(t('goingEmpty.requiredAlertTitle'), t('goingEmpty.requiredAlertBody'));
      return;
    }

    const seats = parseInt(availableSeats, 10) || 1;
    const price = parseFloat(pricePerSeat) || 200;

    const newPost: CarpoolPost = {
      id: `ge_${Date.now().toString().slice(-4)}`,
      fromCity: fromCity.trim(),
      toCity: toCity.trim(),
      intermediateStops: stopsList,
      departureTime,
      availableSeats: seats,
      pricePerSeat: price,
      vehicleNumber: 'TN 09 AB 1001',
      vehicleType: 'Commercial Cab (Insured)',
      isAutoAccept,
      status: 'ACTIVE',
      requests: [],
    };

    setOffers((prev) => [newPost, ...prev]);
    setShowPublishForm(false);
    setFromCity('');
    setToCity('');
    setStopsList([]);

    Alert.alert(
      t('goingEmpty.publishedAlertTitle'),
      t('goingEmpty.publishedAlertBody', { from: fromCity, to: toCity })
    );
  };

  const handleApproveRequest = (offerId: string, requestId: string) => {
    setOffers((prev) =>
      prev.map((off) => {
        if (off.id !== offerId) return off;
        return {
          ...off,
          requests: off.requests.map((r) => (r.id === requestId ? { ...r, status: 'APPROVED' } : r)),
        };
      })
    );
    Alert.alert(t('goingEmpty.approvedAlertTitle'), t('goingEmpty.approvedAlertBody'));
  };

  const handleCallPassenger = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Stats calculation
  const totalActiveOffers = offers.filter((o) => o.status === 'ACTIVE').length;
  const totalSeats = offers.reduce((acc, o) => acc + o.availableSeats, 0);
  const estEarnings = offers.reduce((acc, o) => acc + o.availableSeats * o.pricePerSeat, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t('goingEmpty.headerTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('goingEmpty.headerSubtitle')}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.publishBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowPublishForm(!showPublishForm)}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.publishBtnText}>{showPublishForm ? t('goingEmpty.closeBtn') : t('goingEmpty.postSeatsBtn')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Quick Performance Metrics Bar */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: colors.primary }]}>{totalActiveOffers}</Text>
            <Text style={[styles.metricSub, { color: colors.textSecondary }]}>{t('goingEmpty.activeOffers')}</Text>
          </View>
          <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: '#10B981' }]}>{totalSeats}</Text>
            <Text style={[styles.metricSub, { color: colors.textSecondary }]}>{t('goingEmpty.openSeats')}</Text>
          </View>
          <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metricVal, { color: '#F59E0B' }]}>₹{estEarnings.toLocaleString()}</Text>
            <Text style={[styles.metricSub, { color: colors.textSecondary }]}>{t('goingEmpty.estEarnings')}</Text>
          </View>
        </View>

        {/* Commercial Cab Badge Banner */}
        <View style={[styles.bannerCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF', borderColor: colors.primary }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.badgeIconBox, { backgroundColor: colors.primary }]}>
              <ShieldCheck size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>
                🚖 Verified Commercial Fleet Listing
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 }}>
                Your empty trips carry <Text style={{ fontFamily: 'Inter-Bold', color: colors.primary }}>"🛡️ Insured Cab & 📍 Live Tracking"</Text> badges in the Customer App. 15% platform commission + GST applies.
              </Text>
            </View>
          </View>
        </View>

        {/* Publish Form Collapsible Section */}
        {showPublishForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>{t('goingEmpty.formTitle')}</Text>

            {/* From & To Cities */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('goingEmpty.fromCityLabel')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  placeholder={t('goingEmpty.fromCityPlaceholder')}
                  value={fromCity}
                  onChangeText={setFromCity}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('goingEmpty.toDestinationLabel')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  placeholder={t('goingEmpty.toDestinationPlaceholder')}
                  value={toCity}
                  onChangeText={setToCity}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Intermediate Route Stops */}
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('goingEmpty.addStopsLabel')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                placeholder={t('goingEmpty.addStopPlaceholder')}
                value={stopInput}
                onChangeText={setStopInput}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity style={[styles.addStopBtn, { backgroundColor: colors.primary }]} onPress={handleAddStop}>
                <Plus size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12 }}>{t('goingEmpty.addStopBtn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Added Stops List */}
            {stopsList.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {stopsList.map((stop, idx) => (
                  <View key={idx} style={[styles.stopChip, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                    <Text style={[styles.stopChipText, { color: colors.primary }]}>📍 {stop}</Text>
                    <TouchableOpacity onPress={() => handleRemoveStop(idx)}>
                      <Trash2 size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Seats & Price */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('goingEmpty.availableSeatsLabel')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  keyboardType="numeric"
                  value={availableSeats}
                  onChangeText={setAvailableSeats}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('goingEmpty.pricePerSeatLabel')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  keyboardType="numeric"
                  value={pricePerSeat}
                  onChangeText={setPricePerSeat}
                />
              </View>
            </View>

            {/* Instant Booking vs Request Toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>
                  {t('goingEmpty.instantAcceptTitle')}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                  {isAutoAccept ? t('goingEmpty.instantAcceptOn') : t('goingEmpty.instantAcceptOff')}
                </Text>
              </View>
              <Switch
                value={isAutoAccept}
                onValueChange={setIsAutoAccept}
                trackColor={{ false: colors.border, true: '#10B981' }}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity style={[styles.submitPostBtn, { backgroundColor: colors.primary }]} onPress={handlePublishEmptyTrip}>
              <Send size={16} color="#FFFFFF" />
              <Text style={styles.submitPostBtnText}>{t('goingEmpty.publishBtn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active Offers Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('goingEmpty.activeOffersSection')}</Text>

        {offers.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Car size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('goingEmpty.noOffersTitle')}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('goingEmpty.noOffersBody')}
            </Text>
          </View>
        ) : (
          offers.map((offer) => (
            <View
              key={offer.id}
              style={[styles.offerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Top Row: Route & Status */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routeText, { color: colors.text }]}>
                    {offer.fromCity} ➔ {offer.toCity}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>
                    {t('goingEmpty.departureLabel')} <Text style={{ fontFamily: 'Inter-Bold', color: colors.primary }}>{offer.departureTime}</Text>
                  </Text>
                </View>

                <View style={[styles.commercialTagPill, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B' }]}>
                  <Text style={[styles.commercialTagText, { color: '#D97706' }]}>{t('goingEmpty.commercialCabTag')}</Text>
                </View>
              </View>

              {/* Intermediate Stops */}
              {offer.intermediateStops.length > 0 && (
                <View style={[styles.stopsBanner, { backgroundColor: colors.background }]}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                    {t('goingEmpty.stopsLabel')} <Text style={{ color: colors.text }}>{offer.intermediateStops.join(' ➔ ')}</Text>
                  </Text>
                </View>
              )}

              {/* Seat & Pricing Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statTile}>
                  <Users size={16} color={colors.primary} />
                  <Text style={[styles.statTileText, { color: colors.primary }]}>{t('goingEmpty.seatsLeft', { count: offer.availableSeats })}</Text>
                </View>

                <View style={styles.statTile}>
                  <Text style={[styles.statTilePrice, { color: '#10B981' }]}>₹{offer.pricePerSeat} {t('goingEmpty.perSeat')}</Text>
                </View>

                <View style={styles.statTile}>
                  {offer.isAutoAccept ? (
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#D97706' }}>{t('goingEmpty.autoAcceptOn')}</Text>
                  ) : (
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.textSecondary }}>{t('goingEmpty.manualRequest')}</Text>
                  )}
                </View>
              </View>

              {/* Passenger Booking Requests */}
              {offer.requests.length > 0 && (
                <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 8 }}>
                    {t('goingEmpty.passengerRequestsLabel')}
                  </Text>

                  {offer.requests.map((req) => (
                    <View key={req.id} style={[styles.requestRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                          {req.passengerName}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>
                          {t('goingEmpty.routeLine', { pickup: req.pickupStop, drop: req.dropStop, seats: req.seatsRequested })}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.callBtn, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}
                          onPress={() => handleCallPassenger(req.passengerPhone)}
                        >
                          <Phone size={13} color="#10B981" />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#10B981' }}>{t('callButton.call')}</Text>
                        </TouchableOpacity>

                        {req.status === 'APPROVED' ? (
                          <View style={styles.approvedBadge}>
                            <CheckCircle2 size={13} color="#10B981" />
                            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#10B981' }}>{t('goingEmpty.confirmed')}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.approveBtn, { backgroundColor: colors.primary }]}
                            onPress={() => handleApproveRequest(offer.id, req.id)}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontFamily: 'Inter-Bold' }}>{t('goingEmpty.approve')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  title: { fontSize: 18, fontFamily: 'Inter-Bold' },
  subtitle: { fontSize: 11.5, marginTop: 2 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  publishBtnText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold' },
  metricTile: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  metricVal: { fontSize: 16, fontFamily: 'Inter-Bold' },
  metricSub: { fontSize: 10.5, fontFamily: 'Inter-Medium', marginTop: 2 },
  bannerCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  badgeIconBox: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  formCard: { padding: 16, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  formTitle: { fontSize: 15, fontFamily: 'Inter-Bold', marginBottom: 12 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter-SemiBold', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  addStopBtn: { paddingHorizontal: 12, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 4 },
  stopChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopChipText: { fontSize: 11.5, fontFamily: 'Inter-Bold' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  toggleTitle: { fontSize: 13, fontFamily: 'Inter-Bold' },
  submitPostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 6, marginTop: 8 },
  submitPostBtnText: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'Inter-Bold' },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter-Bold', marginBottom: 12 },
  offerCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  routeText: { fontSize: 16, fontFamily: 'Inter-Bold' },
  commercialTagPill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  commercialTagText: { fontSize: 10.5, fontFamily: 'Inter-Bold' },
  stopsBanner: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginVertical: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statTile: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statTileText: { fontSize: 12, fontFamily: 'Inter-Bold' },
  statTilePrice: { fontSize: 14, fontFamily: 'Inter-Bold' },
  requestRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 6, borderWidth: 1, marginTop: 6 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  approveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  emptyContainer: { padding: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter-Bold', marginTop: 12 },
  emptySubtitle: { fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});

