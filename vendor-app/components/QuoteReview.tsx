import React, { useState, useEffect, useMemo } from 'react';
import { formatCarType } from '../utils/format';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Dimensions,
  TextInput,
  FlatList, // Add this import
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
  Mountain,
  ChevronDown,
  Truck,
  Route,
  Timer,
  Pencil,
  Check as CheckIcon,
  AlertCircle,
} from 'lucide-react-native';
import api from '@/app/api/api';

const { width } = Dimensions.get('window');

// const cities = [
//   "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Tiruppur", 
//   "Vellore", "Erode", "Thoothukudi", "Dindigul", "Thanjavur", "Hosur", "Nagercoil", "Avadi", 
//   "Kancheepuram", "Kumbakonam", "Cuddalore", "Karaikudi", "Sivakasi", "Ariyalur", "Jayankondam", 
//   "Varadarajanpettai", "Udayarpalayam", "Chengalpattu", "Madurantakam", "Mamallapuram", 
//   "Tirukalukundram", "Acharapakkam", "Mettupalayam", "Pollachi", "Valparai", "Annur", "Karamadai", 
//   "Sulur", "Kinathukadavu", "Chidambaram", "Virudhachalam", "Panruti", "Nellikuppam", 
//   "Parangipettai", "Bhuvanagiri", "Dharmapuri", "Harur", "Palacode", "Pennagaram", "Karimangalam", 
//   "Palani", "Kodaikanal", "Oddanchatram", "Nilakottai", "Vedasandur", "Batlagundu", 
//   "Gobichettipalayam", "Sathyamangalam", "Bhavani", "Perundurai", "Anthiyur", "Kallakurichi", 
//   "Sankarapuram", "Chinnasalem", "Thiagadurgam", "Sriperumbudur", "Uthiramerur", "Walajabad", 
//   "Colachel", "Kuzhithurai", "Padmanabhapuram", "Anjugramam", "Tiruvannamalai", 
//   "Tiruvannamalai District", "Katpadi", "Jolarpettai", "Nagapattinam", "Kanchipuram", 
//   "Rameswaram", "Villupuram", "Gingee", "Ooty", "Udhagamandalam", "Yercaud", "Kanyakumari", 
//   "Rajapalayam", "Sivaganga", "Pudukkottai", "Ambur", "Ranipet", "Vaniyambadi", "Tiruchengode", 
//   "Namakkal", "Paramakudi", "Ramanathapuram", "Tenkasi", "Sankarankovil", "Kovilpatti", "Mettur", 
//   "Mylapore", "Tambaram", "Ambattur", "Pallavaram", "Poonamallee", "Tiruvallur", "Pattukkottai", 
//   "Arcot", "Krishnagiri", "Udumalaipettai", "Dharapuram", "Pernampattu", "Tindivanam", 
//   "Vikravandi", "Ulundurpettai", "Arakkonam", "Sholingur", "Tirupattur", "Vedaranyam", 
//   "Manamadurai", "Devakottai", "Sirkazhi", "Mayiladuthurai", "Thuraiyur", "Manapparai", 
//   "Puliyankudi", "Sengottai", "Vadipatti", "Usilampatti", "Nilakkottai", "Rasipuram", 
//   "Sendamangalam", "Kumarapalayam", "Mohanur", "Kattumannarkoil", "Vadalur", "Neyveli", 
//   "Kurinjipadi", "Veppur", "Kunnam", "Lalgudi", "Manachanallur", "Thuvakudi", "Thiruthuraipoondi", 
//   "Mannargudi", "Needamangalam", "Kottur", "Tiruvadanai", "Mudukulathur", "Kamuthi", 
//   "Mallankinaru", "Kariapatti", "Natham", "Melur", "Tirumangalam", "Kallupatti", "Thirumangalam", 
//   "Sedapatti", "Chellampatti", "Kallikudi", "Nagalapuram", "Papanasam", "Thiruvidaimarudur", 
//   "Swamimalai", "Thiruppanandal", "Thiruvaiyaru", "Orathanadu", "Peravurani", "Gandarvakkottai", 
//   "Arantangi", "Avudayarkoil", "Vallam"
// ];

interface QuoteReviewProps {
  visible: boolean;
  onClose: () => void;
  quoteData: any;
  onConfirmOrder: (sendTo: string, nearCity?: string[]) => Promise<void>; // Change to string[]
  isLoading: boolean;
  // Fires when the vendor edits the calculated distance/time in this screen.
  // Booking-only override - never touches the route distance cache. Parent
  // stores it and includes it (override_km/override_trip_time) in the
  // confirm request.
  onDistanceOverride?: (km: number, tripTime: string) => void;
}

export default function QuoteReview({
  visible,
  onClose,
  quoteData,
  onConfirmOrder,
  isLoading,
  onDistanceOverride,
}: QuoteReviewProps) {
  const [showSendToPicker, setShowSendToPicker] = useState(false);
  const [showNearCityPicker, setShowNearCityPicker] = useState(false);
  const [isEditingDistance, setIsEditingDistance] = useState(false);
  const [kmInput, setKmInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [overrideKm, setOverrideKm] = useState<number | null>(null);
  const [overrideTime, setOverrideTime] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState<'ALL' | 'NEAR_CITY'>('ALL');
  const [selectedCities, setSelectedCities] = useState<string[]>([]); 
  const [nearCity, setNearCity] = useState('');

    // Add these states for search functionality and API cities
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<string[]>([]); // Dynamic cities from API
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

    // Add these states for search functionality
  // const [searchQuery, setSearchQuery] = useState('');
  // const [filteredCities, setFilteredCities] = useState(cities);
  
  // console.log('Quote Data:', quoteData);
    // Add search filter effect
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCities(cities);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = cities.filter(city => 
        city.toLowerCase().includes(query)
      );
      setFilteredCities(filtered);
    }
  }, [searchQuery]);

  const handleConfirmOrder = async () => {
    if (sendTo === 'NEAR_CITY' && selectedCities.length === 0) {
      Alert.alert('Error', 'Please select at least one city when sending to NEAR_CITY');
      return;
    }

    try {
      await onConfirmOrder(sendTo, selectedCities); // Pass array instead of string
    } catch (error) {
      Alert.alert('Error', 'Failed to create booking. Please try again.');
    }
  };

    // Fetch cities from API when component mounts
  useEffect(() => {
    fetchCities();
  }, []);

  // Update filtered cities when cities data changes
  useEffect(() => {
    setFilteredCities(cities);
  }, [cities]);

  // Add search filter effect
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCities(cities);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = cities.filter(city => 
        city.toLowerCase().includes(query)
      );
      setFilteredCities(filtered);
    }
  }, [searchQuery, cities]);

  // Function to fetch cities from API
  const fetchCities = async () => {
    try {
      setIsLoadingCities(true);
      const response = await api.get('/cities/vendor');
      // Assuming the API returns an array of city strings directly
      setCities(response.data);
      setFilteredCities(response.data);
    } catch (error) {
      console.error('Failed to fetch cities:', error);
      Alert.alert('Error', 'Failed to load cities. Please try again.');
      // Optionally set some default cities or empty array
      setCities([]);
    } finally {
      setIsLoadingCities(false);
    }
  };

  const formatDateTime = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return {
      date: date.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  // Reset any distance override whenever a fresh quote comes in.
  useEffect(() => {
    setOverrideKm(null);
    setOverrideTime(null);
    setIsEditingDistance(false);
  }, [quoteData]);

  // Live preview of the fare with the vendor's edited km/time - mirrors the
  // backend's apply_distance_override so the numbers shown here match what
  // gets billed on confirm. Only the km-driven fields change; permit/hill/
  // toll/night charges and driver allowance are untouched.
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
      remark_trip_min_km: 0,
    };
  }, [quoteData, overrideKm, overrideTime]);

  if (!quoteData) return null;

  const isHourlyRental = quoteData.echo?.trip_type === 'Hourly Rental';

  const getLocationEntries = () => {
    return Object.entries(quoteData.echo.pickup_drop_location)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
  };
  
  console.log('Data For Hourly Rental:', quoteData);
  console.log('Trip Type:', isHourlyRental);
  
  const getLocationLabel = (index: string, isLast: boolean, tripType: string) => {
    const position = parseInt(index);
    if (tripType === 'Hourly Rental') return 'Pickup Location';
    if (position === 0) return 'Pickup Location';
    if (tripType === 'Round Trip' && isLast) return 'Return to Pickup';
    if (isLast) return 'Final Destination';
    return `Stop ${position}`;
  };

  const locations = getLocationEntries();
  const tripType = quoteData.echo.trip_type;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <View style={styles.container}>
        {/* Enhanced Header with Trip Type Colors */}
        <LinearGradient
          colors={
            tripType === 'Hourly Rental'
              ? ['#8B5A3C', '#A0522D', '#CD853F']
              : tripType === 'Round Trip' 
              ? ['#cc80d1ff', '#b123caff', '#C084FC']
              : tripType === 'Multy City'
              ? ['#1d83b3ff', '#4d749dff', '#4075d8ff'] 
              : ['#1E40AF', '#3B82F6', '#60A5FA']
          }
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitle, tripType === 'Hourly Rental' && { color: '#e9e1dcff' }]}>
                Quote Review
              </Text>
              <Text style={[styles.headerSubtitle, tripType === 'Hourly Rental' && { color: '#e9e1dcff' }]}>
                {tripType} Journey
              </Text>
            </View>
            <View style={styles.placeholder} />
          </View>
        </LinearGradient>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Customer Details Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <User size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Customer Details</Text>
            </View>
            
            <View style={styles.card}>
              <View style={styles.detailRow}>
                <User size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.detailIcon} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Customer Name</Text>
                  <Text style={styles.detailValue}>{quoteData.echo.customer_name}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Phone size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.detailIcon} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Phone Number</Text>
                  <Text style={styles.detailValue}>{quoteData.echo.customer_number}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Trip Details Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Car size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Trip Details</Text>
            </View>
            
            <View style={styles.card}>
              <View style={styles.detailRow}>
                <Car size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.detailIcon} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Car Type</Text>
                  <Text style={styles.detailValue}>{formatCarType(quoteData.echo.car_type)}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Calendar size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.detailIcon} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Journey Date</Text>
                  <Text style={styles.detailValue}>{formatDateTime(quoteData.echo.start_date_time).date}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Clock size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.detailIcon} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Departure Time</Text>
                  <Text style={styles.detailValue}>{formatDateTime(quoteData.echo.start_date_time).time}</Text>
                </View>
              </View>

              {isHourlyRental && (
                <View style={styles.detailRow}>
                  <Timer size={20} color="#8B5A3C" style={styles.detailIcon} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Package Hours</Text>
                    <Text style={styles.detailValue}>{quoteData.echo.package_hours?.hours || 0} hours ({quoteData.echo.package_hours?.km_range || 0} km)</Text>
                  </View>
                </View>
              )}

              {(tripType === 'Round Trip' || tripType === 'Multy City') && quoteData.echo.end_date_time && (
                <View style={styles.detailRow}>
                  <Calendar size={20} color="#1E40AF" style={styles.detailIcon} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>
                      {tripType === 'Round Trip' ? 'Return Date & Time' : 'Drop Date & Time'}
                    </Text>
                    <Text style={styles.detailValue}>
                      {formatDateTime(quoteData.echo.end_date_time).date} · {formatDateTime(quoteData.echo.end_date_time).time}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Enhanced Route Details Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Route size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Route Details</Text>
              <View style={styles.routeBadge}>
                <Text style={styles.routeBadgeText}>{locations.length} stop{locations.length > 1 ? 's' : ''}</Text>
              </View>
            </View>
            
            <View style={styles.card}>
              {locations.map(([index, location], position) => (
                <View key={index} style={[styles.routeItem, position === locations.length - 1 && styles.lastRouteItem]}>
                  <View style={styles.routeIndicator}>
                    <View style={[
                      styles.routeDot,
                      position === 0 ? styles.routeDotStart : 
                      position === locations.length - 1 ? styles.routeDotEnd : styles.routeDotMiddle
                    ]} />
                    {position < locations.length - 1 && <View style={styles.routeLine} />}
                  </View>
                  <View style={styles.routeContent}>
                    <Text style={styles.routeLabel}>
                      {getLocationLabel(index, position === locations.length - 1, tripType)}
                    </Text>
                    <Text style={styles.routeLocation}>{String(location)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Trip Summary Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {isHourlyRental ? (
                <Timer size={24} color="#8B5A3C" />
              ) : (
                <Truck size={24} color="#1E40AF" />
              )}
              <Text style={styles.sectionTitle}>Trip Summary</Text>
            </View>
            
            <View style={styles.summaryCard}>
              {isHourlyRental ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Package Hours</Text>
                    <Text style={styles.summaryValue}>{quoteData.echo.package_hours?.hours || 0} hours ({quoteData.echo.package_hours?.km_range || 0} km)</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Max Time(Report Details)</Text>
                    <Text style={styles.summaryValue}>{quoteData.echo.max_time_to_assign_order} Min</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Driver(Update Toll)</Text>
                    <Text style={styles.summaryValue}>{quoteData.echo.toll_charge_update ? "YES" : "NO"}</Text>
                  </View>
                </>
              ) : (
                <>
                  {quoteData.fare.remark_trip_min_km > 0 && overrideKm == null && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Actual Distance</Text>
                      <Text style={styles.summaryValue}>{quoteData.fare.remark_trip_min_km} km</Text>
                    </View>
                  )}

                  {isEditingDistance ? (
                    <View style={styles.editDistanceBox}>
                      <View style={styles.editDistanceRow}>
                        <Text style={styles.editDistanceLabel}>Distance (km)</Text>
                        <TextInput
                          style={styles.editDistanceInput}
                          value={kmInput}
                          onChangeText={setKmInput}
                          keyboardType="numeric"
                          placeholder="e.g. 145"
                          placeholderTextColor="#9CA3AF"
                        />
                      </View>
                      <View style={styles.editDistanceRow}>
                        <Text style={styles.editDistanceLabel}>Time</Text>
                        <TextInput
                          style={styles.editDistanceInput}
                          value={timeInput}
                          onChangeText={setTimeInput}
                          placeholder="e.g. 3 hours 10 min"
                          placeholderTextColor="#9CA3AF"
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          style={styles.editDistanceCancelBtn}
                          onPress={() => setIsEditingDistance(false)}
                        >
                          <Text style={styles.editDistanceCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.editDistanceSaveBtn}
                          onPress={() => {
                            const km = parseFloat(kmInput);
                            if (isNaN(km) || km <= 0) {
                              Alert.alert('Invalid', 'Enter a positive number of kilometers');
                              return;
                            }
                            setOverrideKm(km);
                            setOverrideTime(timeInput.trim() || null);
                            setIsEditingDistance(false);
                            onDistanceOverride?.(km, timeInput.trim());
                          }}
                        >
                          <CheckIcon size={14} color="#FFFFFF" />
                          <Text style={styles.editDistanceSaveText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>
                          {quoteData.fare.remark_trip_min_km > 0 && overrideKm == null ? 'Billed Distance' : 'Total Distance'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.summaryValue}>{effectiveFare.total_km} km</Text>
                          <TouchableOpacity
                            onPress={() => {
                              setKmInput(String(effectiveFare.total_km));
                              setTimeInput(effectiveFare.trip_time || '');
                              setIsEditingDistance(true);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Pencil size={14} color="#6B7280" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Estimated Time</Text>
                        <Text style={styles.summaryValue}>{effectiveFare.trip_time || 'Calculating...'}</Text>
                      </View>
                    </>
                  )}

                  {overrideKm != null && (
                    <View style={styles.editedNotice}>
                      <Text style={styles.editedNoticeText}>
                        Distance edited: {effectiveFare.calculated_km} km calculated → {effectiveFare.total_km} km billed.
                        This only affects this booking, not the shared route cache.
                      </Text>
                    </View>
                  )}

                  {(tripType === 'Round Trip' || tripType === 'Multy City') && Number(quoteData.fare.days || 1) > 1 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Trip Duration</Text>
                      <Text style={styles.summaryValue}>{quoteData.fare.days} days</Text>
                    </View>
                  )}

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Max Time(Report Details)</Text>
                    <Text style={styles.summaryValue}>{quoteData.echo.max_time_to_assign_order} Min</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Driver(Update Toll)</Text>
                    <Text style={styles.summaryValue}>{quoteData.echo.toll_charge_update ? "YES" : "NO"}</Text>
                  </View>

                {quoteData.fare.remark_trip_min_km > 0 && overrideKm == null && (
                    <View style={styles.warningMessage}>
                      <Text style={styles.warningText}>
                        Actual distance is {quoteData.fare.remark_trip_min_km} km, below the minimum billable
                        distance for this trip type - billed as {quoteData.fare.total_km} km instead.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

          {/* Pricing Breakdown Section Customer */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IndianRupee size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Vendor Pricing</Text>
            </View>
            
            <View style={styles.priceCard}>
              {isHourlyRental ? (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Vendor Amount (₹{(quoteData.echo.cost_per_hour + quoteData.echo.extra_cost_per_hour)} X {quoteData.echo.package_hours.hours})</Text>
                    <Text style={styles.priceValue}>₹{quoteData.fare.vendor_amount}</Text>
                  </View>

                  {quoteData.echo.extra_cost_per_hour > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Maximum Km</Text>
                      <Text style={styles.priceValue}>{quoteData.echo.package_hours.km_range} KM</Text>
                    </View>
                  )}

                  {quoteData.echo.extra_cost_per_hour > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Extra Price (Addon KM)</Text>
                      <Text style={styles.priceValue}>₹{(quoteData.echo.cost_for_addon_km + quoteData.echo.extra_cost_for_addon_km)}</Text>
                    </View>
                  )}

                  <View style={[styles.priceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Estimate Price</Text>
                    <Text style={styles.totalValue}>₹{quoteData.fare.vendor_amount}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Vendor Amount ({effectiveFare.total_km} km × ₹{quoteData.echo.cost_per_km + quoteData.echo.extra_cost_per_km})</Text>
                    <Text style={styles.priceValue}>₹{effectiveFare.base_km_amount + Math.round(effectiveFare.total_km * quoteData.echo.extra_cost_per_km)}</Text>
                  </View>

                  {/* Always show every charge line (even ₹0) so the vendor
                      sees the complete fare picture before posting */}
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>
                      Driver Allowance{Number(quoteData.fare.days || 1) > 1 ? ` (× ${quoteData.fare.days} days)` : ''}
                    </Text>
                    <Text style={styles.priceValue}>₹{(quoteData.fare.driver_allowance || 0) + (quoteData.fare.extra_driver_allowance || 0)}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Permit Charges</Text>
                    <Text style={styles.priceValue}>₹{(quoteData.echo.permit_charges || 0) + (quoteData.echo.extra_permit_charges || 0)}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Hill Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.hill_charges || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Toll Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.toll_charges || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Night Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.night_charges || 0}</Text>
                  </View>
                  <View style={[styles.priceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total Amount</Text>
                    <Text style={styles.totalValue}>₹{effectiveFare.customer_amount}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Pricing Breakdown Section Driver */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IndianRupee size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Driver Pricing</Text>
            </View>
            
            <View style={styles.priceCard}>
              {isHourlyRental ? (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Driver Amount (₹{quoteData.echo.cost_per_hour} X {quoteData.echo.package_hours.hours})</Text>
                    <Text style={styles.priceValue}>₹{quoteData.fare.estimate_price}</Text>
                  </View>

                  {quoteData.echo.extra_cost_per_hour > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Maximum Km</Text>
                      <Text style={styles.priceValue}>{quoteData.echo.package_hours.km_range} KM</Text>
                    </View>
                  )}

                  {quoteData.echo.cost_for_addon_km > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Cost for Addon KM</Text>
                      <Text style={styles.priceValue}>₹{quoteData.echo.cost_for_addon_km}</Text>
                    </View>
                  )}

                  <View style={[styles.priceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Estimate Price</Text>
                    <Text style={styles.totalValue}>₹{quoteData.fare.estimate_price}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Driver Amount ({effectiveFare.total_km} km × ₹{quoteData.echo.cost_per_km})</Text>
                    <Text style={styles.priceValue}>₹{effectiveFare.base_km_amount}</Text>
                  </View>
                  
                  {/* Always show every charge line (even ₹0) - complete picture */}
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>
                      Driver Allowance{Number(quoteData.fare.days || 1) > 1 ? ` (× ${quoteData.fare.days} days)` : ''}
                    </Text>
                    <Text style={styles.priceValue}>₹{quoteData.fare.driver_allowance || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Permit Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.permit_charges || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Hill Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.hill_charges || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Toll Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.toll_charges || 0}</Text>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Night Charges</Text>
                    <Text style={styles.priceValue}>₹{quoteData.echo.night_charges || 0}</Text>
                  </View>

                  {/* <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Vendor Basic Commission</Text>
                    <Text style={[styles.priceValue, { color: 'red' }]}>
                      ₹{Math.round((quoteData.fare.base_km_amount) * quoteData.fare.Commission_percent / 100)}
                    </Text>
                  </View> */}
                  
                  <View style={[styles.priceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Driver Net Amount</Text>
                    <Text style={styles.totalValue}>₹ {effectiveFare.driver_amount}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Your Earnings - equals EXACTLY the amount the platform holds from
              the fleet owner at accept: (vendor extras) + 10% commission on the
              driver base fare. Example: 130 (extra ₹1/km × 130) + 100 (extra
              allowance) + 182 (10% of ₹1820 driver base) = ₹412. */}
          {!isHourlyRental && (() => {
            const COMMISSION_PCT = 10; // must match backend charges_to_deduct (×10/100)
            const totalKm = Number(effectiveFare?.total_km || 0);
            const driverBaseKm = Number(effectiveFare?.base_km_amount || 0); // cost_per_km × km
            const vendorTotal = Number(effectiveFare?.customer_amount || 0);
            const driverTotal = Number(effectiveFare?.driver_amount || 0);
            const extraKmRate = Number(quoteData.echo?.extra_cost_per_km || 0);
            const extraKmAmount = Math.round(extraKmRate * totalKm);
            const extraAllowance = Number(quoteData.fare?.extra_driver_allowance || 0);
            const allExtras = Math.max(0, vendorTotal - driverTotal);
            const otherExtras = Math.max(0, allExtras - extraKmAmount - extraAllowance);
            const commission = Math.round(driverBaseKm * COMMISSION_PCT / 100);
            const totalEarning = allExtras + commission;
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <IndianRupee size={24} color="#10B981" />
                  <Text style={styles.sectionTitle}>Your Earnings</Text>
                </View>
                <View style={styles.priceCard}>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Commission ({COMMISSION_PCT}% of Driver Base ₹{driverBaseKm})</Text>
                    <Text style={styles.priceValue}>₹{commission}</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Extra Fare (₹{extraKmRate}/km × {totalKm} km)</Text>
                    <Text style={styles.priceValue}>₹{extraKmAmount}</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Extra Driver Allowance</Text>
                    <Text style={styles.priceValue}>₹{extraAllowance}</Text>
                  </View>
                  {otherExtras > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Other Extras (permit / hills / toll)</Text>
                      <Text style={styles.priceValue}>₹{otherExtras}</Text>
                    </View>
                  )}
                  <View style={[styles.priceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Your Total Earning</Text>
                    <Text style={[styles.totalValue, { color: '#10B981' }]}>₹{totalEarning}</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Driver Assignment */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Send size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
              <Text style={styles.sectionTitle}>Driver Assignment</Text>
            </View>
            
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowSendToPicker(true)}
            >
              <Send size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.pickerIcon} />
              <Text style={styles.pickerText}>
                {sendTo === 'NEAR_CITY' ? `NEAR CITY - ${nearCity || 'Select City'}` : 'ALL DRIVERS'}
              </Text>
              <ChevronDown size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
            </TouchableOpacity>

{sendTo === 'NEAR_CITY' && (
  <TouchableOpacity
    style={[styles.pickerButton, { marginTop: 12 }]}
    onPress={() => setShowNearCityPicker(true)}
  >
    <MapPin size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} style={styles.pickerIcon} />
    <View style={styles.selectedCitiesContainer}>
      <Text style={[styles.pickerText, selectedCities.length === 0 && styles.pickerPlaceholder]}>
        {selectedCities.length === 0 
          ? 'Select Cities' 
          : `${selectedCities.length} city${selectedCities.length > 1 ? 's' : ''} selected`
        }
      </Text>
      {selectedCities.length > 0 && (
        <Text style={styles.selectedCitiesPreviewText}>
          {selectedCities.slice(0, 3).join(', ')}
          {selectedCities.length > 3 && ` +${selectedCities.length - 3} more`}
        </Text>
      )}
    </View>
    <ChevronDown size={20} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
  </TouchableOpacity>
)}
          </View>

          {quoteData.echo.pickup_notes && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FileText size={24} color={tripType === 'Hourly Rental' ? "#8B5A3C" : "#1E40AF"} />
                <Text style={styles.sectionTitle}>Additional Notes</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.notesText}>{quoteData.echo.pickup_notes}</Text>
              </View>
            </View>
          )}

          {(quoteData.echo.car_make_year_requirement || quoteData.echo.carrier_required || quoteData.echo.non_cng || quoteData.echo.pet_friendly) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <AlertCircle size={24} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>Special Requirements & Driver Extras</Text>
              </View>
              <View style={[styles.card, { borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', gap: 6 }]}>
                {!!quoteData.echo.car_make_year_requirement && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Calendar size={16} color="#EF4444" />
                      <Text style={{ color: '#B91C1C', fontWeight: '600' }}>
                        Car Make Year: {quoteData.echo.car_make_year_requirement} or newer
                      </Text>
                    </View>
                    {!!quoteData.echo.car_year_charge && (
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>
                        +₹{quoteData.echo.car_year_charge} (Driver)
                      </Text>
                    )}
                  </View>
                )}
                {!!quoteData.echo.carrier_required && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Truck size={16} color="#EF4444" />
                      <Text style={{ color: '#B91C1C', fontWeight: '600' }}>Carrier Required</Text>
                    </View>
                    {!!quoteData.echo.carrier_charge && (
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>
                        +₹{quoteData.echo.carrier_charge} (Driver)
                      </Text>
                    )}
                  </View>
                )}
                {!!quoteData.echo.non_cng && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Car size={16} color="#EF4444" />
                      <Text style={{ color: '#B91C1C', fontWeight: '600' }}>Non CNG Vehicle</Text>
                    </View>
                    {!!quoteData.echo.non_cng_charge && (
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>
                        +₹{quoteData.echo.non_cng_charge} (Driver)
                      </Text>
                    )}
                  </View>
                )}
                {!!quoteData.echo.pet_friendly && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <User size={16} color="#EF4444" />
                      <Text style={{ color: '#B91C1C', fontWeight: '600' }}>Pet Friendly</Text>
                    </View>
                    {!!quoteData.echo.pet_friendly_charge && (
                      <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>
                        +₹{quoteData.echo.pet_friendly_charge} (Driver)
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Confirm Button */}
          <TouchableOpacity 
            style={[styles.confirmButton, isLoading && styles.disabledButton]} 
            onPress={handleConfirmOrder}
            disabled={isLoading}
          >
            <LinearGradient
              colors={
                tripType === 'Hourly Rental'
                  ? ['#8B5A3C', '#A0522D']
                  : tripType === 'Round Trip' 
                  ? ['#7C3AED', '#A855F7']
                  : tripType === 'Multy City'
                  ? ['#5196dfff', '#4357cdff'] 
                  : ['#059669', '#10B981']
              }
              style={styles.gradientButton}
            >
              <Send size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>
                {isLoading ? 'Creating Booking...' : 'Confirm & Create Booking'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>

        {/* Send To Picker Modal */}
        <Modal
          visible={showSendToPicker}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Driver Assignment</Text>
              <TouchableOpacity
                onPress={() => setShowSendToPicker(false)}
                style={styles.modalCloseButton}
              >
                <X size={24} color="#5F6368" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={[styles.modalOption, sendTo === 'ALL' && styles.modalOptionActive]}
                onPress={() => {
                  setSendTo('ALL');
                  setNearCity('');
                  setShowSendToPicker(false);
                }}
              >
                <Send size={20} color={sendTo === 'ALL' ? "#1E40AF" : "#6B7280"} />
                <View style={styles.modalOptionContent}>
                  <Text style={[styles.modalOptionText, sendTo === 'ALL' && styles.modalOptionTextActive]}>
                    ALL DRIVERS
                  </Text>
                  <Text style={styles.modalOptionSubtext}>
                    Send to all available drivers
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalOption, sendTo === 'NEAR_CITY' && styles.modalOptionActive]}
                onPress={() => {
                  setSendTo('NEAR_CITY');
                  setShowSendToPicker(false);
                }}
              >
                <MapPin size={20} color={sendTo === 'NEAR_CITY' ? "#1E40AF" : "#6B7280"} />
                <View style={styles.modalOptionContent}>
                  <Text style={[styles.modalOptionText, sendTo === 'NEAR_CITY' && styles.modalOptionTextActive]}>
                    NEAR CITY
                  </Text>
                  <Text style={styles.modalOptionSubtext}>
                    Send to drivers near specific city
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Near City Picker Modal */}
{/* Multi-Select Near City Picker Modal */}
{/* <Modal
  visible={showNearCityPicker}
  animationType="slide"
  presentationStyle="pageSheet"
>
  <View style={styles.modalContainer}>
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>Select Cities ({selectedCities.length} selected)</Text>
      <View style={styles.modalHeaderActions}>
        <TouchableOpacity
          onPress={() => {
            setSelectedCities([]);
          }}
          style={styles.clearButton}
        >
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowNearCityPicker(false)}
          style={styles.modalCloseButton}
        >
          <X size={24} color="#5F6368" />
        </TouchableOpacity>
      </View>
    </View>
    
    <View style={styles.selectedCitiesPreview}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {selectedCities.map((city) => (
          <View key={city} style={styles.selectedCityChip}>
            <Text style={styles.selectedCityChipText}>{city}</Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedCities(prev => prev.filter(c => c !== city));
              }}
              style={styles.removeCityButton}
            >
              <X size={14} color="#1E40AF" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>

    <ScrollView style={styles.modalContent}>
      {cities.map((city) => {
        const isSelected = selectedCities.includes(city);
        return (
          <TouchableOpacity
            key={city}
            style={[
              styles.modalOption,
              isSelected && styles.modalOptionActive
            ]}
            onPress={() => {
              if (isSelected) {
                setSelectedCities(prev => prev.filter(c => c !== city));
              } else {
                setSelectedCities(prev => [...prev, city]);
              }
            }}
          >
            <View style={[
              styles.checkbox,
              isSelected && styles.checkboxSelected
            ]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <MapPin size={20} color={isSelected ? "#1E40AF" : "#6B7280"} />
            <Text style={[
              styles.modalOptionText,
              isSelected && styles.modalOptionTextActive
            ]}>
              {city}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    
    <View style={styles.modalFooter}>
      <TouchableOpacity
        style={[
          styles.doneButton,
          selectedCities.length === 0 && styles.doneButtonDisabled
        ]}
        onPress={() => setShowNearCityPicker(false)}
        disabled={selectedCities.length === 0}
      >
        <Text style={styles.doneButtonText}>
          Done ({selectedCities.length} selected)
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal> */}


{/* Near City Picker Modal with Search */}
<Modal
  visible={showNearCityPicker}
  animationType="slide"
  presentationStyle="pageSheet"
>
  <View style={styles.modalContainer}>
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>
        Select Cities ({selectedCities.length} selected)
        {searchQuery && ` - ${filteredCities.length} results`}
      </Text>
      <View style={styles.modalHeaderActions}>
        <TouchableOpacity
          onPress={() => {
            setSelectedCities([]);
          }}
          style={styles.clearButton}
        >
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setShowNearCityPicker(false);
            setSearchQuery(''); // Reset search when closing
          }}
          style={styles.modalCloseButton}
        >
          <X size={24} color="#5F6368" />
        </TouchableOpacity>
      </View>
    </View>
    
    {/* Search Bar */}
    <View style={styles.searchContainer}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search cities..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholderTextColor="#9CA3AF"
        clearButtonMode="while-editing"
      />
    </View>

    {/* Selected Cities Preview */}
    {selectedCities.length > 0 && (
      <View style={styles.selectedCitiesPreview}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {selectedCities.map((city) => (
            <View key={city} style={styles.selectedCityChip}>
              <Text style={styles.selectedCityChipText}>{city}</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedCities(prev => prev.filter(c => c !== city));
                }}
                style={styles.removeCityButton}
              >
                <X size={14} color="#1E40AF" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    )}

    {/* Cities List with FlatList for performance */}
{/* Cities List with FlatList for performance */}
        {/* Cities List with FlatList for performance */}
    {isLoadingCities ? (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading cities...</Text>
      </View>
    ) : (
      <FlatList
        data={filteredCities}
        keyExtractor={(item: string) => item}
        initialNumToRender={30}
        maxToRenderPerBatch={50}
        windowSize={21}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchQuery 
                ? `No cities found for "${searchQuery}"`
                : 'No cities available'
              }
            </Text>
          </View>
        }
        renderItem={({ item }: { item: string }) => {
          const city: string = item;
          const isSelected = selectedCities.includes(city);
          return (
            <TouchableOpacity
              style={[
                styles.modalOption,
                isSelected && styles.modalOptionActive
              ]}
              onPress={() => {
                if (isSelected) {
                  setSelectedCities(prev => prev.filter(c => c !== city));
                } else {
                  setSelectedCities(prev => [...prev, city]);
                }
              }}
            >
              <View style={[
                styles.checkbox,
                isSelected && styles.checkboxSelected
              ]}>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <MapPin size={20} color={isSelected ? "#1E40AF" : "#6B7280"} />
              <Text style={[
                styles.modalOptionText,
                isSelected && styles.modalOptionTextActive
              ]}>
                {city}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    )}
    
    {/* Footer with Done Button */}
    <View style={styles.modalFooter}>
      <TouchableOpacity
        style={[
          styles.doneButton,
          selectedCities.length === 0 && styles.doneButtonDisabled
        ]}
        onPress={() => {
          setShowNearCityPicker(false);
          setSearchQuery(''); // Reset search when done
        }}
        disabled={selectedCities.length === 0}
      >
        <Text style={styles.doneButtonText}>
          Done ({selectedCities.length} selected)
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingTop: 45,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e9eeffff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#e9eeffff',
  },
  closeButton: {
    padding: 6,
    backgroundColor: '#e9eeffff',
    borderRadius: 16,
  },
  placeholder: {
    width: 32,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  // Empty State Styles
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  selectedCitiesPreviewText: {
  fontSize: 12,
  color: '#6B7280',
  marginTop: 2,
},
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginLeft: 8,
    flex: 1,
  },
  routeBadge: {
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  routeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E40AF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  detailIcon: {
    marginRight: 12,
    marginTop: 1,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#5F6368',
    marginBottom: 2,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '600',
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lastRouteItem: {
    marginBottom: 0,
  },
  routeIndicator: {
    alignItems: 'center',
    marginRight: 12,
    width: 20,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  routeDotStart: {
    backgroundColor: '#10B981',
  },
  routeDotMiddle: {
    backgroundColor: '#F59E0B',
  },
  routeDotEnd: {
    backgroundColor: '#DC2626',
  },
  routeLine: {
    width: 1.5,
    height: 24,
    backgroundColor: '#D1D5DB',
    position: 'absolute',
    top: 10,
  },
  routeContent: {
    flex: 1,
    paddingTop: -2,
  },
  routeLabel: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '500',
    marginBottom: 2,
  },
   selectedCitiesContainer: {
    flex: 1,
  },
  selectedCitiesText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedCitiesPreview: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectedCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  selectedCityChipText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
    marginRight: 4,
  },
  removeCityButton: {
    padding: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  doneButton: {
    backgroundColor: '#1E40AF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  routeLocation: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '600',
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#E8F4FD',
  },
  warningMessage: {
  backgroundColor: '#FEF2F2',
  borderWidth: 1,
  borderColor: '#FECACA',
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
},
warningText: {
  fontSize: 12,
  color: '#DC2626',
  fontWeight: '600',
  textAlign: 'center',
},
  editDistanceBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  editDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editDistanceLabel: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '500',
  },
  editDistanceInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1F2937',
    minWidth: 140,
    textAlign: 'right',
  },
  editDistanceCancelBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
  },
  editDistanceCancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  editDistanceSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E40AF',
  },
  editDistanceSaveText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  editedNotice: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  editedNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '500',
    lineHeight: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#5F6368',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '600',
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  totalRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#E8EAED',
    backgroundColor: '#F8FDF9',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  priceLabel: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '500',
    flex: 1,
    paddingRight: 8,
  },
  priceValue: {
    fontSize: 13,
    color: '#202124',
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 16,
    color: '#059669',
    fontWeight: 'bold',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerIcon: {
    marginRight: 10,
  },
  pickerText: {
    flex: 1,
    fontSize: 14,
    color: '#202124',
    fontWeight: '500',
  },
  pickerPlaceholder: {
    color: '#9AA0A6',
  },
  notesText: {
    fontSize: 14,
    color: '#202124',
    lineHeight: 20,
  },
  confirmButton: {
    marginVertical: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  disabledButton: {
    opacity: 0.6,
  },
  gradientButton: {
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#202124',
  },
  modalCloseButton: {
    padding: 6,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalOptionActive: {
    backgroundColor: '#F0F7FF',
    borderColor: '#1E40AF',
  },
  modalOptionContent: {
    flex: 1,
    marginLeft: 10,
  },
  modalOptionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 1,
  },
  modalOptionTextActive: {
    color: '#1E40AF',
    fontWeight: '600',
  },
  modalOptionSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});