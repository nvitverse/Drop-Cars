import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
  Modal,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette, ThemePalette } from '@/constants/theme';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import { useCarPool } from '@/contexts/CarPoolContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTaxiFlow } from '@/contexts/TaxiFlowContext';
import {
  Users,
  MapPin,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  Car,
  Star,
  Search,
  CheckCircle2,
  PlusCircle,
  Navigation,
  DollarSign,
  User,
  ShieldCheck,
  Check,
  X,
  Repeat,
  LocateFixed,
  Filter,
  Plus,
  Compass,
  Zap,
  Sparkles,
} from 'lucide-react-native';

export default function MasterCarPoolScreen() {
  const router = useRouter();
  const { systemColorScheme, isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { setActiveMode } = useServiceMode();
  const { journeys, createListing, requestToJoin, approvePassengerRequest, declinePassengerRequest } = useCarPool();
  const { updateStandardDraft } = useTaxiFlow();
  const { user } = useAuth();

  const params = useLocalSearchParams<{ initialTab?: string }>();

  useFocusEffect(
    useCallback(() => {
      setActiveMode('CARPOOL');
    }, [setActiveMode])
  );

  // MODE STATE: 'FIND' | 'CREATE' | 'LANDING'
  const [activeTabMode, setActiveTabMode] = useState<'LANDING' | 'FIND' | 'CREATE'>('FIND');

  useEffect(() => {
    if (params.initialTab === 'CREATE') {
      setActiveTabMode('CREATE');
      setCreateStep(1);
    } else if (params.initialTab === 'FIND') {
      setActiveTabMode('FIND');
      setFindStep(1);
    }
  }, [params.initialTab]);

  // FIND CARPOOL STEPS (1: Route, 2: Date/Time + Passengers 1-8, 3: Results)
  const [findStep, setFindStep] = useState<number>(1);
  const [findPickup, setFindPickup] = useState('Chennai');
  const [findDrop, setFindDrop] = useState('Vellore');
  const [findStop, setFindStop] = useState('');
  const [showAddStop, setShowAddStop] = useState(false);
  const [findDate, setFindDate] = useState('2025-08-26');
  const [findTime, setFindTime] = useState('08:00 AM');
  const [passengerSeatCount, setPassengerSeatCount] = useState<number>(1); // Default 1 seat (Supports 1-8)

  // CREATE CARPOOL STEPS (1: Route, 2: When & Your Vehicle, 3: Review & Publish)
  const [createStep, setCreateStep] = useState<number>(1);
  const [createPickup, setCreatePickup] = useState('Chennai');
  const [createDrop, setCreateDrop] = useState('Pondicherry');
  const [createStop, setCreateStop] = useState('');
  const [showCreateStop, setShowCreateStop] = useState(false);
  const [createDate, setCreateDate] = useState('2025-08-27');
  const [createTime, setCreateTime] = useState('07:30 AM');
  const [carTypeCategory, setCarTypeCategory] = useState<'Sedan' | 'SUV' | 'Innova' | 'Other'>('SUV');
  const [carModelName, setCarModelName] = useState('Hyundai Creta');
  const [offeredSeatsCount, setOfferedSeatsCount] = useState<number>(3);
  const [contributionInput, setContributionInput] = useState<string>('300');

  // JOIN REQUEST MODAL & SUCCESS STATES
  const [selectedPoolForJoin, setSelectedPoolForJoin] = useState<any>(null);
  const [joinRequested, setJoinRequested] = useState(false);
  const [createdPoolSuccess, setCreatedPoolSuccess] = useState<any>(null);

  const handleSwapFindCities = () => {
    const temp = findPickup;
    setFindPickup(findDrop);
    setFindDrop(temp);
  };

  const handleSwapCreateCities = () => {
    const temp = createPickup;
    setCreatePickup(createDrop);
    setCreateDrop(temp);
  };

  const handleConfirmCreateCarPool = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const seatFare = parseInt(contributionInput, 10);
    if (!contributionInput || isNaN(seatFare) || seatFare <= 0) {
      Alert.alert('Invalid Contribution', 'Please enter a valid seat contribution amount');
      return;
    }
    createListing({
      hostName: user?.name || 'You (Customer Host)',
      hostPhone: user?.phone || '',
      hostRating: 5.0,
      pickupCity: createPickup,
      dropCity: createDrop,
      startDate: createDate,
      startTime: createTime,
      carName: carModelName,
      carCategory: carTypeCategory,
      driverName: user?.name || 'You',
      driverRating: 5.0,
      totalSeats: offeredSeatsCount,
      availableSeats: offeredSeatsCount,
      seatFare,
      privateFareEquivalent: seatFare * offeredSeatsCount,
      isCustomerHosted: true,
    });
    setCreatedPoolSuccess({
      id: `cpool_${Date.now()}`,
      pickupCity: createPickup,
      dropCity: createDrop,
      startDate: createDate,
      startTime: createTime,
      carName: carModelName,
      availableSeats: offeredSeatsCount,
      contributionPerPerson: seatFare,
      hostName: 'You (Customer Host)',
    });
  };

  const handleConfirmJoinRequest = () => {
    if (!selectedPoolForJoin) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoinRequested(true);
    requestToJoin(selectedPoolForJoin.id, {
      passengerId: user?.id || `guest_${Date.now()}`,
      passengerName: user?.name || 'Guest Passenger',
      passengerPhone: user?.phone || '',
      seatsRequested: passengerSeatCount,
    });
    setTimeout(() => {
      setJoinRequested(false);
      setSelectedPoolForJoin(null);
      const msg = `Request sent to ${selectedPoolForJoin.hostName}! Host will confirm your seat.`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Request Sent', msg);
    }, 1200);
  };

  // MODE SWITCH TRANSITION OVERLAY STATE (Quantum Shift back to Taxi Hub)
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const progressAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.85))[0];

  const handleSwitchToTaxiHub = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSwitchingMode(true);
    progressAnim.setValue(0);
    scaleAnim.setValue(0.85);

    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActiveMode('TAXI');
      router.push('/(customer)/' as any);
      setTimeout(() => {
        setIsSwitchingMode(false);
      }, 100);
    });
  };

  const searchResults = journeys.filter(j => j.status === 'ACTIVE');

  const themeStyles = getStyles(isDark, palette);

  return (
    <SafeAreaView style={themeStyles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* DROP CARS SIGNATURE MODE SWITCH TRANSITION OVERLAY */}
      <Modal visible={isSwitchingMode} transparent animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(7, 11, 18, 0.92)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <LinearGradient
            colors={['#0F172A', '#0EA5E9', '#070B12']}
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 24,
              padding: 24,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(14, 165, 233, 0.3)',
              gap: 12,
            }}
          >
            <Animated.View style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: 'rgba(14, 165, 233, 0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: '#0EA5E9',
              transform: [{ scale: scaleAnim }],
            }}>
              <Car color="#0EA5E9" size={34} />
            </Animated.View>

            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
              Activating Drop Cars Mobility
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, textAlign: 'center', lineHeight: 16 }}>
              Loading Instant Cab Bidding, Outstation Drivers & DropBid...
            </Text>

            <View style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 4 }}>
              <Animated.View
                style={{
                  height: '100%',
                  backgroundColor: '#0EA5E9',
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </View>

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(14, 165, 233, 0.2)', paddingHorizontal: 10, paddingVertical: 4,
              borderRadius: 12, borderWidth: 1, borderColor: '#0EA5E9', marginTop: 4,
            }}>
              <Sparkles color="#FFFFFF" size={12} />
              <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' }}>
                Taxi & Cab Bidding
              </Text>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* TOP SERVICE MODE SWAPPER (TAXI vs CAR POOL) */}
      <LinearGradient
        colors={palette.headerGradient}
        style={[themeStyles.headerGradient, { paddingTop: topPadding }]}
      >
        {/* HEADER BAR */}
        <View style={themeStyles.headerRow}>
          <TouchableOpacity
            style={themeStyles.backBtn}
            onPress={handleSwitchToTaxiHub}
          >
            <ArrowLeft color="#FFFFFF" size={18} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={themeStyles.headerTitle}>DROP CONNECT 🤝</Text>
            <Text style={themeStyles.headerSub}>Community P2P Car Pooling</Text>
          </View>

          <TouchableOpacity
            style={themeStyles.modeTogglePill}
            activeOpacity={0.85}
            onPress={handleSwitchToTaxiHub}
          >
            <Car color="#FFFFFF" size={13} />
            <Text style={themeStyles.modeTogglePillText}>Taxi Hub ➔</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* MAIN CONTAINER */}
      <ScrollView style={themeStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {createdPoolSuccess ? (
          /* CREATED CAR POOL SUCCESS CARD */
          <View style={themeStyles.confirmCard}>
            <CheckCircle2 color="#10B981" size={54} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={themeStyles.confirmTitle}>Drop Share Published!</Text>
            <Text style={themeStyles.confirmSub}>Your journey is live on Drop Connect for matching riders.</Text>

            <View style={themeStyles.divider} />
            <Text style={themeStyles.infoLine}>Host: <Text style={themeStyles.boldVal}>{createdPoolSuccess.hostName}</Text></Text>
            <Text style={themeStyles.infoLine}>Route: <Text style={themeStyles.boldVal}>{createdPoolSuccess.pickupCity} ➔ {createdPoolSuccess.dropCity}</Text></Text>
            <Text style={themeStyles.infoLine}>Schedule: <Text style={themeStyles.boldVal}>{createdPoolSuccess.startDate} at {createdPoolSuccess.startTime}</Text></Text>
            <Text style={themeStyles.infoLine}>Your Vehicle: <Text style={themeStyles.boldVal}>{createdPoolSuccess.carName}</Text></Text>
            <Text style={themeStyles.infoLine}>Seats Offered: <Text style={themeStyles.boldVal}>{createdPoolSuccess.availableSeats} Seats</Text></Text>
            <Text style={themeStyles.infoLine}>Passenger Contribution: <Text style={themeStyles.fareVal}>₹{createdPoolSuccess.contributionPerPerson} / passenger</Text></Text>

            <TouchableOpacity
              style={themeStyles.primaryNextBtn}
              onPress={() => {
                setCreatedPoolSuccess(null);
                setActiveTabMode('LANDING');
              }}
            >
              <Text style={themeStyles.primaryNextBtnText}>Back to Drop Connect</Text>
            </TouchableOpacity>
          </View>
        ) : activeTabMode === 'LANDING' ? (
          /* CAR POOL LANDING SCREEN (BLABLACAR MODEL) */
          <View style={themeStyles.landingContainer}>
            <View style={{ gap: 2 }}>
              <Text style={themeStyles.landingTitle}>Travel Together • Spend Smarter</Text>
              <Text style={themeStyles.landingSub}>Join verified customer shared trips or offer empty seats on your route</Text>
            </View>

            {/* EMBEDDED BLABLACAR SEARCH LAUNCHER CARD */}
            <View style={themeStyles.embeddedSearchCard}>
              <View style={themeStyles.searchCardHeader}>
                <View style={themeStyles.searchBadge}>
                  <Users color="#0EA5E9" size={12} />
                  <Text style={themeStyles.searchBadgeText}>DROP ME (FIND A RIDE)</Text>
                </View>
                <Text style={themeStyles.searchCardSubText}>1-Tap Route Match</Text>
              </View>

              {/* INPUT FIELDS (FROM / TO / DATE / SEATS) */}
              <View style={themeStyles.inputCard}>
                <View style={themeStyles.inputRow}>
                  <MapPin color={palette.accent} size={16} />
                  <TextInput
                    style={themeStyles.textInput}
                    value={findPickup}
                    onChangeText={setFindPickup}
                    placeholder="Leaving from (City / Place)"
                    placeholderTextColor={palette.placeholder}
                  />
                  <TouchableOpacity style={themeStyles.gpsBtn} onPress={() => setFindPickup('Chennai')}>
                    <LocateFixed color={palette.accent} size={13} />
                  </TouchableOpacity>
                </View>

                <View style={themeStyles.inputDividerContainer}>
                  <View style={themeStyles.inputDivider} />
                  <TouchableOpacity style={themeStyles.swapBtn} onPress={handleSwapFindCities}>
                    <Repeat color={palette.textMuted} size={12} />
                  </TouchableOpacity>
                </View>

                <View style={themeStyles.inputRow}>
                  <Navigation color="#10B981" size={16} />
                  <TextInput
                    style={themeStyles.textInput}
                    value={findDrop}
                    onChangeText={setFindDrop}
                    placeholder="Going to (City / Place)"
                    placeholderTextColor={palette.placeholder}
                  />
                </View>
              </View>

              {/* DATE & SEAT SELECTOR ROW */}
              <View style={themeStyles.rowTwoCols}>
                <TouchableOpacity
                  style={[themeStyles.inputRowCard, { flex: 1.2 }]}
                  onPress={() => setFindDate('2025-08-27')}
                >
                  <Calendar color={palette.accent} size={14} />
                  <Text style={{ fontSize: 11.5, color: palette.textPrimary, fontWeight: '700' }}>
                    {findDate}
                  </Text>
                </TouchableOpacity>

                <View style={[themeStyles.inputRowCard, { flex: 1, justifyContent: 'space-between' }]}>
                  <Users color="#0EA5E9" size={14} />
                  <Text style={{ fontSize: 11.5, color: palette.textPrimary, fontWeight: '800' }}>
                    {passengerSeatCount} Seat{passengerSeatCount > 1 ? 's' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity
                      onPress={() => setPassengerSeatCount(Math.max(1, passengerSeatCount - 1))}
                      style={{ padding: 2 }}
                    >
                      <Text style={{ color: palette.textMuted, fontSize: 13, fontWeight: '900' }}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPassengerSeatCount(Math.min(8, passengerSeatCount + 1))}
                      style={{ padding: 2 }}
                    >
                      <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '900' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* SEARCH BUTTON */}
              <TouchableOpacity
                activeOpacity={0.88}
                style={themeStyles.searchRidesBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setActiveTabMode('FIND');
                  setFindStep(3);
                }}
              >
                <Search color="#070B12" size={18} />
                <Text style={themeStyles.searchRidesBtnText}>Search Drop Me Rides ➔</Text>
              </TouchableOpacity>
            </View>

            {/* ACTION 2: DROP SHARE (OFFER SPARE SEATS) */}
            <TouchableOpacity
              activeOpacity={0.88}
              style={themeStyles.actionCardSec}
              onPress={() => {
                setActiveTabMode('CREATE');
                setCreateStep(1);
              }}
            >
              <View style={themeStyles.actionIconBoxSec}>
                <PlusCircle color="#0EA5E9" size={24} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={themeStyles.actionTitleSec}>DROP SHARE (OFFER SEATS)</Text>
                <Text style={themeStyles.actionSubSec}>Driving somewhere? Post spare seats and split fuel & toll costs.</Text>
                <View style={themeStyles.actionLinkRow}>
                  <Text style={themeStyles.actionLinkTextSec}>Post Drop Share Trip ➔</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* TAXI FALLBACK LINK */}
            <TouchableOpacity
              style={themeStyles.taxiSharingLinkBox}
              onPress={() => router.push('/(customer)/book/standard' as any)}
            >
              <Car color={palette.textMuted} size={15} />
              <Text style={themeStyles.taxiSharingLinkText}>Need a private commercial cab? <Text style={{ color: palette.accent, fontWeight: '800' }}>Book Taxi ➔</Text></Text>
            </TouchableOpacity>

            {/* TRUST NOTICE */}
            <View style={themeStyles.trustCard}>
              <ShieldCheck color="#10B981" size={20} />
              <View style={{ flex: 1 }}>
                <Text style={themeStyles.trustTitle}>Customer Car-Pool Community</Text>
                <Text style={themeStyles.trustSub}>Aadhaar & DL verified customer hosts, personal vehicles, and ₹3.5/km fuel cost recovery cap.</Text>
              </View>
            </View>
          </View>
        ) : activeTabMode === 'FIND' ? (
          /* FIND A CAR POOL FLOW */
          <View style={themeStyles.wizardStepBox}>
            {/* STEP 1: ROUTE */}
            {findStep === 1 && (
              <View style={{ gap: 14 }}>
                <Text style={themeStyles.screenHeadline}>Where are you going?</Text>
                <Text style={themeStyles.screenSubheadline}>Enter your pickup and destination locations</Text>

                <View style={themeStyles.inputCard}>
                  <View style={themeStyles.inputRow}>
                    <MapPin color={palette.accent} size={16} />
                    <TextInput style={themeStyles.textInput} value={findPickup} onChangeText={setFindPickup} placeholder="Pickup Location" placeholderTextColor={palette.placeholder} />
                    <TouchableOpacity style={themeStyles.gpsBtn} onPress={() => setFindPickup('Chennai')}><LocateFixed color={palette.accent} size={14} /></TouchableOpacity>
                  </View>

                  <View style={themeStyles.inputDividerContainer}>
                    <View style={themeStyles.inputDivider} />
                    <TouchableOpacity style={themeStyles.swapBtn} onPress={handleSwapFindCities}><Repeat color={palette.accent} size={12} /></TouchableOpacity>
                  </View>

                  <View style={themeStyles.inputRow}>
                    <Navigation color={palette.accent} size={16} />
                    <TextInput style={themeStyles.textInput} value={findDrop} onChangeText={setFindDrop} placeholder="Destination Location" placeholderTextColor={palette.placeholder} />
                  </View>

                  {showAddStop && (
                    <View style={[themeStyles.inputRow, { borderTopWidth: 1, borderTopColor: palette.divider }]}>
                      <Compass color={palette.accent} size={16} />
                      <TextInput style={themeStyles.textInput} value={findStop} onChangeText={setFindStop} placeholder="Intermediate Stop (Optional)" placeholderTextColor={palette.placeholder} />
                    </View>
                  )}
                </View>

                {!showAddStop && (
                  <TouchableOpacity style={themeStyles.addStopBtn} onPress={() => setShowAddStop(true)}>
                    <Plus color={palette.accent} size={14} />
                    <Text style={themeStyles.addStopBtnText}>Add Stop</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={themeStyles.primaryNextBtn} onPress={() => setFindStep(2)}>
                  <Text style={themeStyles.primaryNextBtnText}>Continue to Date & Time</Text>
                  <ArrowRight color="#070B12" size={16} />
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 2: WHEN & PASSENGERS (1 TO 8 SEATS GRID, NO VEHICLE PREFERENCE) */}
            {findStep === 2 && (
              <View style={{ gap: 14 }}>
                <Text style={themeStyles.screenHeadline}>When are you travelling?</Text>
                <Text style={themeStyles.screenSubheadline}>Select departure date, time, and passenger seats</Text>

                <View style={themeStyles.rowTwoCols}>
                  <View style={[themeStyles.inputRowCard, { flex: 1 }]}>
                    <Calendar color={palette.accent} size={14} />
                    <TextInput style={themeStyles.textInput} value={findDate} onChangeText={setFindDate} placeholder="YYYY-MM-DD" placeholderTextColor={palette.placeholder} />
                  </View>
                  <View style={[themeStyles.inputRowCard, { flex: 1 }]}>
                    <Clock color={palette.accent} size={14} />
                    <TextInput style={themeStyles.textInput} value={findTime} onChangeText={setFindTime} placeholder="HH:MM AM/PM" placeholderTextColor={palette.placeholder} />
                  </View>
                </View>

                <Text style={themeStyles.fieldLabel}>Passengers (Seats Needed: {passengerSeatCount})</Text>
                <View style={themeStyles.seatGridGroup}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[themeStyles.seatGridBox, passengerSeatCount === n && themeStyles.activeSeatGridBox]}
                      onPress={() => setPassengerSeatCount(n)}
                    >
                      <Text style={[themeStyles.seatGridNum, passengerSeatCount === n && { color: palette.accent }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={themeStyles.wizardActionBar}>
                  <TouchableOpacity style={themeStyles.secBackBtn} onPress={() => setFindStep(1)}><Text style={themeStyles.secBackBtnText}>Back</Text></TouchableOpacity>
                  <TouchableOpacity style={themeStyles.primaryNextBtn} onPress={() => setFindStep(3)}>
                    <Search color="#070B12" size={16} />
                    <Text style={themeStyles.primaryNextBtnText}>FIND CAR POOLS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 3: CAR POOLS AVAILABLE MATCHES */}
            {findStep === 3 && (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={themeStyles.screenHeadline}>CAR POOLS AVAILABLE ({searchResults.length})</Text>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setFindStep(1)}>
                    <Filter color={palette.accent} size={14} />
                    <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '800' }}>Modify Search</Text>
                  </TouchableOpacity>
                </View>

                {searchResults.length === 0 ? (
                  <View style={themeStyles.smartFallbackCard}>
                    <View style={themeStyles.smartFallbackBadge}>
                      <Zap color="#F59E0B" size={14} />
                      <Text style={themeStyles.smartFallbackBadgeText}>SMART TAXI FALLBACK</Text>
                    </View>
                    <Text style={themeStyles.smartFallbackTitle}>
                      No Drop Connect carpools available on this route right now
                    </Text>
                    <Text style={themeStyles.smartFallbackSub}>
                      Get a guaranteed Drop Solo or Drop Saver (Commercial Taxi) cab instantly with 1-click pre-filled route details!
                    </Text>

                    {/* 1-CLICK PRE-FILLED CONVERSION TO TAXI BOOKING */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={themeStyles.smartFallbackActionBtn}
                      onPress={() => {
                        updateStandardDraft({
                          pickup: findPickup,
                          drop: findDrop,
                          stops: findStop ? [findStop] : [],
                          tripType: 'ONEWAY',
                        });
                        setActiveMode('TAXI');
                        router.push('/(customer)/book/standard' as any);
                      }}
                    >
                      <Car color="#070B12" size={18} />
                      <Text style={themeStyles.smartFallbackActionBtnText}>
                        Book Instant Drop Solo / Saver Cab ➔
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={themeStyles.secNextBtn}
                      onPress={() => {
                        setActiveTabMode('CREATE');
                        setCreateStep(1);
                      }}
                    >
                      <Text style={themeStyles.secNextBtnText}>Post a Drop Share Trip Instead</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* POPULAR ROUTE ALERT BANNER (BLABLACAR MODEL) */}
                    <View style={themeStyles.popularAlertCard}>
                      <Text style={themeStyles.popularAlertIcon}>🔔</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={themeStyles.popularAlertTitle}>Popular route! You should book soon.</Text>
                        <Text style={themeStyles.popularAlertSub}>60% of rides are already booked on this route.</Text>
                      </View>
                    </View>

                    {searchResults.map(pool => (
                      <View key={pool.id} style={themeStyles.carpoolCard}>
                        {/* TIMELINE DISPLAY (BLABLACAR MODEL) */}
                        <View style={themeStyles.timelineContainer}>
                          <View style={themeStyles.timelineVisual}>
                            <View style={themeStyles.timelineDotStart} />
                            <View style={themeStyles.timelineLine} />
                            <View style={themeStyles.timelineDotEnd} />
                          </View>
                          <View style={{ flex: 1, gap: 10 }}>
                            <View style={themeStyles.timelineCityRow}>
                              <Text style={themeStyles.timelineTimeText}>{pool.startTime || '12:00'}</Text>
                              <Text style={themeStyles.timelineCityText}>{pool.pickupCity}</Text>
                            </View>
                            <Text style={themeStyles.timelineDurationText}>2h 40m</Text>
                            <View style={themeStyles.timelineCityRow}>
                              <Text style={themeStyles.timelineTimeText}>14:40</Text>
                              <Text style={themeStyles.timelineCityText}>{pool.dropCity}</Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end', justifyContent: 'flex-start' }}>
                            <Text style={themeStyles.poolFare}>₹{pool.seatFare}.00</Text>
                            <Text style={themeStyles.poolFareSub}>per seat</Text>
                          </View>
                        </View>

                        {/* HOST ROW WITH VERIFIED BADGES */}
                        <View style={themeStyles.hostRow}>
                          <View style={themeStyles.hostAvatar}>
                            <User color={palette.textPrimary} size={14} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={themeStyles.hostName}>{pool.hostName}</Text>
                              <Zap color="#F59E0B" size={12} />
                              <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '800' }}>
                                ★ {(pool.hostRating ?? pool.driverRating).toFixed(1)}
                              </Text>
                            </View>
                            <Text style={themeStyles.hostSub}>{pool.carName} • {pool.availableSeats} seats left</Text>
                          </View>

                          <TouchableOpacity
                            style={themeStyles.requestJoinBtn}
                            onPress={() => setSelectedPoolForJoin(pool)}
                          >
                            <Text style={themeStyles.requestJoinBtnText}>REQUEST TO JOIN</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                <TouchableOpacity style={themeStyles.secBackBtn} onPress={() => setFindStep(2)}>
                  <Text style={themeStyles.secBackBtnText}>Back to Date & Passengers</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          /* CREATE A CAR POOL FLOW */
          <View style={themeStyles.wizardStepBox}>
            {/* STEP 1: ROUTE */}
            {createStep === 1 && (
              <View style={{ gap: 14 }}>
                <Text style={themeStyles.screenHeadline}>Create a Car Pool</Text>
                <Text style={themeStyles.screenSubheadline}>Enter pickup, destination, and stops for your journey</Text>

                <View style={themeStyles.inputCard}>
                  <View style={themeStyles.inputRow}>
                    <MapPin color="#0EA5E9" size={16} />
                    <TextInput style={themeStyles.textInput} value={createPickup} onChangeText={setCreatePickup} placeholder="Pickup Location" placeholderTextColor={palette.placeholder} />
                  </View>
                  <View style={themeStyles.inputDividerContainer}><View style={themeStyles.inputDivider} /><TouchableOpacity style={themeStyles.swapBtn} onPress={handleSwapCreateCities}><Repeat color="#0EA5E9" size={12} /></TouchableOpacity></View>
                  <View style={themeStyles.inputRow}>
                    <Navigation color="#0EA5E9" size={16} />
                    <TextInput style={themeStyles.textInput} value={createDrop} onChangeText={setCreateDrop} placeholder="Destination Location" placeholderTextColor={palette.placeholder} />
                  </View>
                  {showCreateStop && (
                    <View style={[themeStyles.inputRow, { borderTopWidth: 1, borderTopColor: palette.divider }]}>
                      <Compass color="#0EA5E9" size={16} />
                      <TextInput style={themeStyles.textInput} value={createStop} onChangeText={setCreateStop} placeholder="Intermediate Stop (Optional)" placeholderTextColor={palette.placeholder} />
                    </View>
                  )}
                </View>

                {!showCreateStop && (
                  <TouchableOpacity style={themeStyles.addStopBtn} onPress={() => setShowCreateStop(true)}>
                    <Plus color="#0EA5E9" size={14} />
                    <Text style={[themeStyles.addStopBtnText, { color: '#0EA5E9' }]}>Add Stop</Text>
                  </TouchableOpacity>
                )}

                <View style={themeStyles.wizardActionBar}>
                  <TouchableOpacity style={themeStyles.secBackBtn} onPress={() => setActiveTabMode('LANDING')}><Text style={themeStyles.secBackBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={themeStyles.secNextBtn} onPress={() => setCreateStep(2)}>
                    <Text style={themeStyles.secNextBtnText}>Continue to Vehicle & Time</Text>
                    <ArrowRight color="#FFFFFF" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 2: WHEN & YOUR VEHICLE */}
            {createStep === 2 && (
              <View style={{ gap: 14 }}>
                <Text style={themeStyles.screenHeadline}>When & Your Vehicle</Text>
                <Text style={themeStyles.screenSubheadline}>Provide departure time, vehicle details, and seats</Text>

                <View style={themeStyles.rowTwoCols}>
                  <View style={[themeStyles.inputRowCard, { flex: 1 }]}>
                    <Calendar color="#0EA5E9" size={14} />
                    <TextInput style={themeStyles.textInput} value={createDate} onChangeText={setCreateDate} placeholder="YYYY-MM-DD" placeholderTextColor={palette.placeholder} />
                  </View>
                  <View style={[themeStyles.inputRowCard, { flex: 1 }]}>
                    <Clock color="#0EA5E9" size={14} />
                    <TextInput style={themeStyles.textInput} value={createTime} onChangeText={setCreateTime} placeholder="HH:MM AM/PM" placeholderTextColor={palette.placeholder} />
                  </View>
                </View>

                <Text style={themeStyles.fieldLabel}>Your Vehicle Model</Text>
                <View style={themeStyles.inputRowCard}>
                  <Car color="#0EA5E9" size={16} />
                  <TextInput style={themeStyles.textInput} value={carModelName} onChangeText={setCarModelName} placeholder="e.g. Hyundai Creta" placeholderTextColor={palette.placeholder} />
                </View>

                <Text style={themeStyles.fieldLabel}>Available Seats Offered</Text>
                <View style={themeStyles.chipGridGroup}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[themeStyles.vChip, offeredSeatsCount === n && themeStyles.activeVChipSec]}
                      onPress={() => setOfferedSeatsCount(n)}
                    >
                      <Text style={[themeStyles.vChipText, offeredSeatsCount === n && { color: '#0EA5E9' }]}>{n} {n === 1 ? 'Seat' : 'Seats'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={themeStyles.fieldLabel}>Expected Passenger Contribution (₹ / person)</Text>
                <View style={themeStyles.inputRowCard}>
                  <DollarSign color="#0EA5E9" size={16} />
                  <TextInput style={themeStyles.textInput} value={contributionInput} onChangeText={setContributionInput} placeholder="e.g. 300" keyboardType="number-pad" />
                </View>

                <View style={themeStyles.wizardActionBar}>
                  <TouchableOpacity style={themeStyles.secBackBtn} onPress={() => setCreateStep(1)}><Text style={themeStyles.secBackBtnText}>Back</Text></TouchableOpacity>
                  <TouchableOpacity style={themeStyles.secNextBtn} onPress={() => setCreateStep(3)}>
                    <Text style={themeStyles.secNextBtnText}>Review Car Pool</Text>
                    <ArrowRight color="#FFFFFF" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 3: REVIEW & PUBLISH */}
            {createStep === 3 && (
              <View style={{ gap: 14 }}>
                <Text style={themeStyles.screenHeadline}>Review Your Car Pool</Text>
                <Text style={themeStyles.screenSubheadline}>Verify details before publishing your customer journey</Text>

                <View style={themeStyles.reviewCard}>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Host</Text><Text style={themeStyles.reviewValBold}>You (Customer Host)</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Route</Text><Text style={themeStyles.reviewValBold}>{createPickup} ➔ {createDrop}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Schedule</Text><Text style={themeStyles.reviewVal}>{createDate} at {createTime}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Your Vehicle</Text><Text style={themeStyles.reviewVal}>{carModelName}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Seats Offered</Text><Text style={themeStyles.reviewVal}>{offeredSeatsCount} Seats Offered</Text></View>
                  <View style={themeStyles.divider} />
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewTotalLabel}>Expected Passenger Contribution</Text><Text style={themeStyles.reviewTotalVal}>₹{contributionInput} / person</Text></View>
                </View>

                <View style={themeStyles.wizardActionBar}>
                  <TouchableOpacity style={themeStyles.secBackBtn} onPress={() => setCreateStep(2)}><Text style={themeStyles.secBackBtnText}>Back</Text></TouchableOpacity>
                  <TouchableOpacity style={themeStyles.confirmFinalBtn} onPress={handleConfirmCreateCarPool}>
                    <CheckCircle2 color="#FFFFFF" size={18} />
                    <Text style={themeStyles.confirmFinalBtnText}>CREATE CAR POOL</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
        {/* HOST PASSENGER SEAT APPROVAL QUEUE */}
        {journeys.some(j => (j.passengers ?? []).length > 0) && (
          <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: palette.cardBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Users color={palette.accent} size={18} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: palette.textPrimary }}>
                  Seat Join Requests (Host Queue)
                </Text>
              </View>
              <View style={{ backgroundColor: 'rgba(14,165,233,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: palette.accent }}>EXPLICIT APPROVAL</Text>
              </View>
            </View>

            {journeys.map(j => {
              const pendingReqs = (j.passengers ?? []);
              if (pendingReqs.length === 0) return null;
              return (
                <View key={j.id} style={{ gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: palette.textMuted }}>
                    {j.pickupCity} ➔ {j.dropCity} ({j.availableSeats} seats left @ ₹{j.seatFare}/seat)
                  </Text>
                  {pendingReqs.map(p => (
                    <View key={p.passengerId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.surfaceAlt, padding: 12, borderRadius: 12 }}>
                      <View style={{ gap: 2 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: palette.textPrimary }}>
                          {p.passengerName}
                        </Text>
                        <Text style={{ fontSize: 11, color: palette.textMuted }}>
                          {p.seatsRequested} Seat(s) Requested • Total ₹{p.seatsRequested * j.seatFare}
                        </Text>
                        <View style={{ marginTop: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: p.status === 'ACCEPTED' ? '#10B981' : p.status === 'DECLINED' ? '#EF4444' : '#F59E0B' }}>
                            STATUS: {p.status === 'ACCEPTED' ? 'ACCEPTED & SEAT LOCKED 🟢' : p.status === 'DECLINED' ? 'DECLINED 🔴' : 'PENDING YOUR APPROVAL 🟡'}
                          </Text>
                        </View>
                      </View>

                      {p.status === 'REQUESTED' && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              approvePassengerRequest(j.id, p.passengerId);
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              declinePassengerRequest(j.id, p.passengerId);
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* REQUEST TO JOIN MODAL WITH SEAT PICKER & PRICE CALCULATION */}
      <Modal visible={!!selectedPoolForJoin} transparent animationType="slide">
        <View style={themeStyles.modalOverlay}>
          <View style={themeStyles.modalContent}>
            <View style={themeStyles.modalHeaderRow}>
              <Text style={themeStyles.modalTitle}>Request Seat on Shared Trip</Text>
              <TouchableOpacity onPress={() => setSelectedPoolForJoin(null)}>
                <X color={palette.textPrimary} size={20} />
              </TouchableOpacity>
            </View>

            {selectedPoolForJoin && (
              <View style={{ gap: 12 }}>
                <View style={themeStyles.reviewCard}>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Host</Text><Text style={themeStyles.reviewValBold}>{selectedPoolForJoin.hostName} (★ {selectedPoolForJoin.hostRating})</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Route</Text><Text style={themeStyles.reviewVal}>{selectedPoolForJoin.pickupCity} ➔ {selectedPoolForJoin.dropCity}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Schedule</Text><Text style={themeStyles.reviewVal}>{selectedPoolForJoin.startDate} at {selectedPoolForJoin.startTime}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Vehicle</Text><Text style={themeStyles.reviewVal}>{selectedPoolForJoin.carName}</Text></View>
                  <View style={themeStyles.reviewRow}><Text style={themeStyles.reviewLabel}>Available Seats</Text><Text style={{ color: palette.accent, fontWeight: '800' }}>{selectedPoolForJoin.availableSeats} seats left @ ₹{selectedPoolForJoin.seatFare}/seat</Text></View>
                  
                  <View style={themeStyles.divider} />
                  
                  {/* Seat count selector */}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: palette.textMuted, marginTop: 4 }}>Select Number of Seats to Reserve:</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginVertical: 6 }}>
                    {[1, 2, 3].filter(n => n <= selectedPoolForJoin.availableSeats).map(n => (
                      <TouchableOpacity
                        key={n}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          alignItems: 'center',
                          backgroundColor: passengerSeatCount === n ? palette.accent : palette.surfaceAlt,
                          borderWidth: 1,
                          borderColor: passengerSeatCount === n ? palette.accent : palette.border,
                        }}
                        onPress={() => setPassengerSeatCount(n)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: passengerSeatCount === n ? '#FFFFFF' : palette.textPrimary }}>
                          {n} Seat{n > 1 ? 's' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={themeStyles.reviewRow}>
                    <Text style={themeStyles.reviewTotalLabel}>Total Contribution ({passengerSeatCount} Seat{passengerSeatCount > 1 ? 's' : ''})</Text>
                    <Text style={themeStyles.reviewTotalVal}>₹{selectedPoolForJoin.seatFare * passengerSeatCount}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={themeStyles.primaryNextBtn}
                  onPress={handleConfirmJoinRequest}
                  disabled={joinRequested}
                >
                  <Text style={themeStyles.primaryNextBtnText}>{joinRequested ? 'Sending Request...' : 'SUBMIT SEAT REQUEST TO HOST'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(isDark: boolean, palette: ThemePalette) {
  const displayFont = Platform.OS === 'web' ? "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" : undefined;
  const bodyFont = Platform.OS === 'web' ? "'Plus Jakarta Sans', system-ui, sans-serif" : undefined;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },

    headerGradient: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 14, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    topServiceSwapBar: { flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 10, padding: 3, marginBottom: 10 },
    topServiceSwapChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, borderRadius: 8 },
    activeTopServiceSwapChip: { backgroundColor: palette.surface },
    topServiceSwapText: { fontSize: 11, fontWeight: '800', color: 'rgba(255, 255, 255, 0.75)', fontFamily: bodyFont },
    activeTopServiceSwapText: { color: palette.textPrimary },

    hubTabSegmentBar: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
      borderRadius: 14,
      padding: 3,
      marginTop: 8,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    hubTabSegmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 11,
      gap: 6,
    },
    hubTabSegmentItemActiveFind: {
      backgroundColor: '#0EA5E9',
    },
    hubTabSegmentItemActiveCreate: {
      backgroundColor: '#10B981',
    },
    hubTabSegmentText: {
      fontSize: 12,
      fontWeight: '800',
      color: 'rgba(255, 255, 255, 0.75)',
      fontFamily: bodyFont,
    },
    hubTabSegmentTextActive: {
      color: '#FFFFFF',
      fontWeight: '900',
    },
    mmtHubSegmentBar: {
      flexDirection: 'row',
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.25)',
      marginTop: 4,
    },
    mmtHubSegmentActiveConnect: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#0EA5E9',
      paddingVertical: 7,
      borderRadius: 9,
    },
    mmtHubSegmentInactive: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 7,
      borderRadius: 9,
    },
    mmtHubSegmentTextActive: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    mmtHubSegmentTextInactive: {
      color: 'rgba(255, 255, 255, 0.75)',
      fontSize: 12,
      fontWeight: '700',
      fontFamily: bodyFont,
    },

    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    backBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
    headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5, fontFamily: displayFont },
    headerSub: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 10, marginTop: 1, fontFamily: bodyFont },
    modeTogglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    modeTogglePillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', fontFamily: bodyFont },

    scrollContent: { flex: 1, padding: 12 },
    landingContainer: { gap: 14, marginBottom: 20 },
    landingTitle: { fontSize: 18, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    landingSub: { fontSize: 11, color: palette.textMuted, marginTop: -10, fontFamily: bodyFont },

    embeddedSearchCard: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1.5,
      borderColor: '#0EA5E9',
      gap: 10,
      shadowColor: '#0EA5E9',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 4,
    },
    searchCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    searchBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(14, 165, 233, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    searchBadgeText: {
      color: '#0EA5E9',
      fontSize: 9.5,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    searchCardSubText: {
      color: palette.textMuted,
      fontSize: 10.5,
      fontWeight: '700',
      fontFamily: bodyFont,
    },
    searchRidesBtn: {
      backgroundColor: '#0EA5E9',
      paddingVertical: 12,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 2,
    },
    searchRidesBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
      fontFamily: displayFont,
    },
    actionLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },

    actionCardSec: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 2,
      borderColor: '#0EA5E9',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    actionIconBoxSec: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(14, 165, 233, 0.15)', justifyContent: 'center', alignItems: 'center' },
    actionTitleSec: { fontSize: 15, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    actionSubSec: { fontSize: 11, color: palette.textMuted, lineHeight: 15, fontFamily: bodyFont },
    actionLinkTextSec: { color: '#0EA5E9', fontSize: 12, fontWeight: '800', fontFamily: bodyFont },

    taxiSharingLinkBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.surface, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border },
    taxiSharingLinkText: { fontSize: 11, color: palette.textMuted, fontFamily: bodyFont },

    emptyStateBox: { alignItems: 'center', gap: 8, backgroundColor: palette.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: palette.border },
    emptyStateTitle: { fontSize: 14, fontWeight: '800', color: palette.textPrimary, fontFamily: displayFont },
    emptyStateSub: { fontSize: 11, color: palette.textMuted, textAlign: 'center', lineHeight: 16, fontFamily: bodyFont, maxWidth: 280 },

    trustCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
    trustTitle: { fontSize: 12, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    trustSub: { fontSize: 10, color: palette.textMuted, marginTop: 1, fontFamily: bodyFont },

    wizardStepBox: { marginBottom: 20 },
    screenHeadline: { fontSize: 17, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    screenSubheadline: { fontSize: 11, color: palette.textMuted, marginTop: -8, fontFamily: bodyFont },
    fieldLabel: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, marginTop: 4, fontFamily: bodyFont },

    inputCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 2, borderWidth: 1, borderColor: palette.border },
    inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
    gpsBtn: { backgroundColor: palette.accentGlow, padding: 6, borderRadius: 6 },
    inputDividerContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center', height: 16 },
    inputDivider: { height: 1, width: '100%', backgroundColor: palette.divider },
    swapBtn: { position: 'absolute', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    textInput: { flex: 1, color: palette.textPrimary, fontSize: 12.5, fontWeight: '600', fontFamily: bodyFont, paddingVertical: Platform.OS === 'web' ? 2 : 0 },
    addStopBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    addStopBtnText: { color: palette.accent, fontSize: 11, fontWeight: '800', fontFamily: bodyFont },

    rowTwoCols: { flexDirection: 'row', gap: 6 },
    inputRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderWidth: 1, borderColor: palette.border },

    seatGridGroup: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    seatGridBox: { width: 44, height: 40, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    activeSeatGridBox: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    seatGridNum: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },

    chipGridGroup: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    vChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border },
    activeVChipSec: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14, 165, 233, 0.15)' },
    vChipText: { fontSize: 11, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },

    carpoolCard: { backgroundColor: palette.surface, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: palette.border, gap: 8 },
    carpoolBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    carpoolTagPill: { backgroundColor: 'rgba(14, 165, 233, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    carpoolTagText: { color: '#0EA5E9', fontSize: 8.5, fontWeight: '900', fontFamily: bodyFont },

    poolHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    poolRoute: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    poolTime: { fontSize: 10.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },
    poolFare: { fontSize: 17, fontWeight: '900', color: '#10B981', fontFamily: bodyFont },
    poolFareSub: { fontSize: 9, color: palette.textMuted, fontFamily: bodyFont },

    seatsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.accentGlow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    seatsBadgeText: { fontSize: 9.5, fontWeight: '800', color: palette.accent, fontFamily: bodyFont },

    hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.divider },
    hostAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    hostName: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    hostSub: { fontSize: 10, color: palette.textMuted, marginTop: 1, fontFamily: bodyFont },

    requestJoinBtn: { backgroundColor: palette.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    requestJoinBtnText: { color: '#070B12', fontSize: 10.5, fontWeight: '900', fontFamily: bodyFont },

    reviewCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: palette.border, gap: 6 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewLabel: { color: palette.textMuted, fontSize: 11, fontFamily: bodyFont },
    reviewVal: { color: palette.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: bodyFont },
    reviewValBold: { color: palette.textPrimary, fontSize: 11.5, fontWeight: '800', fontFamily: bodyFont },
    divider: { height: 1, backgroundColor: palette.divider, marginVertical: 4 },
    reviewTotalLabel: { color: palette.textPrimary, fontSize: 13, fontWeight: '800', fontFamily: bodyFont },
    reviewTotalVal: { color: '#10B981', fontSize: 17, fontWeight: '900', fontFamily: bodyFont },

    wizardActionBar: { flexDirection: 'row', gap: 10, marginTop: 10 },
    secBackBtn: { backgroundColor: palette.surface, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    secBackBtnText: { color: palette.textMuted, fontSize: 12, fontWeight: '700', fontFamily: bodyFont },
    primaryNextBtn: { flex: 1, backgroundColor: palette.accent, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    primaryNextBtnText: { color: '#070B12', fontSize: 12.5, fontWeight: '900', fontFamily: bodyFont },
    secNextBtn: { flex: 1, backgroundColor: '#0EA5E9', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    secNextBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900', fontFamily: bodyFont },
    confirmFinalBtn: { flex: 1, backgroundColor: '#10B981', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    confirmFinalBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900', fontFamily: bodyFont },

    confirmCard: { backgroundColor: palette.surface, borderRadius: 16, padding: 16, marginVertical: 10, borderWidth: 1, borderColor: palette.border, gap: 6 },
    confirmTitle: { color: palette.textPrimary, fontSize: 16, fontWeight: '900', textAlign: 'center', fontFamily: displayFont },
    confirmSub: { color: palette.textMuted, fontSize: 11, textAlign: 'center', fontFamily: bodyFont },
    infoLine: { color: palette.textSecondary, fontSize: 11, marginVertical: 2, fontFamily: bodyFont },
    boldVal: { color: palette.textPrimary, fontWeight: '700' },
    fareVal: { color: '#10B981', fontWeight: '900', fontSize: 13.5 },

    smartFallbackCard: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1.5,
      borderColor: '#F59E0B',
      gap: 10,
    },
    smartFallbackBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    smartFallbackBadgeText: {
      color: '#F59E0B',
      fontSize: 10,
      fontWeight: '800',
      fontFamily: bodyFont,
    },
    smartFallbackTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    smartFallbackSub: {
      fontSize: 11.5,
      color: palette.textMuted,
      lineHeight: 16,
      fontFamily: bodyFont,
    },
    smartFallbackActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 4,
    },
    smartFallbackActionBtnText: {
      color: '#070B12',
      fontSize: 13.5,
      fontWeight: '900',
      fontFamily: bodyFont,
    },

    popularAlertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#93C5FD',
      marginBottom: 6,
    },
    popularAlertIcon: { fontSize: 20 },
    popularAlertTitle: {
      fontSize: 12.5,
      fontWeight: '800',
      color: palette.textPrimary,
      fontFamily: bodyFont,
    },
    popularAlertSub: {
      fontSize: 10.5,
      color: palette.textMuted,
      marginTop: 1,
      fontFamily: bodyFont,
    },

    timelineContainer: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    timelineVisual: {
      alignItems: 'center',
      width: 14,
      paddingVertical: 4,
    },
    timelineDotStart: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: palette.accent,
      borderWidth: 2,
      borderColor: palette.background,
    },
    timelineLine: {
      flex: 1,
      width: 2,
      backgroundColor: palette.accent,
      marginVertical: 2,
    },
    timelineDotEnd: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#10B981',
      borderWidth: 2,
      borderColor: palette.background,
    },
    timelineCityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timelineTimeText: {
      fontSize: 14,
      fontWeight: '900',
      color: palette.textPrimary,
      width: 48,
      fontFamily: bodyFont,
    },
    timelineCityText: {
      fontSize: 14,
      fontWeight: '800',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    timelineDurationText: {
      fontSize: 10,
      color: palette.textMuted,
      paddingLeft: 58,
      fontFamily: bodyFont,
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: palette.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: palette.border },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 15, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
  });
}
