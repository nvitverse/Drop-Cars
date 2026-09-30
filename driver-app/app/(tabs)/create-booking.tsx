import React, { useState, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEnsureDriverSession } from '@/hooks/useEnsureDriverSession';
import {
  User,
  Phone,
  MapPin,
  IndianRupee,
  Car,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Truck,
  Send,
  Route,
  Timer,
  CheckCircle,
  Square,
  Percent,
  X,
  Info,
  Navigation,
  FileText,
} from 'lucide-react-native';
// Driver-authenticated (driverAuthToken), not the fleet-owner axiosInstance
// (authToken) - this screen runs under a CarDriver session, and the backend
// endpoint below is authenticated via get_current_driver.
import axiosDriver from '@/app/api/axiosDriver';
import LocationAutocompleteField from '@/components/LocationAutocompleteField';
import DriverQuoteReview from '@/components/DriverQuoteReview';
import PageInfoModal from '@/components/PageInfoModal';

const carTypes = [
  'HATCHBACK',
  'SEDAN_4_PLUS_1',
  // NEW_SEDAN_2022_MODEL removed - already covered by the "Car Make Year
  // Requirement" special-requirement field further down, no need for a
  // separate vehicle-type entry for it.
  'ETIOS_4_PLUS_1',
  'SUV',
  'SUV_6_PLUS_1',
  'SUV_7_PLUS_1',
  'INNOVA',
  'INNOVA_CRYSTA',
];

const tripTypes = [
  { value: 'Oneway', labelKey: 'tripTypeOneWay', icon: Car },
  { value: 'Round Trip', labelKey: 'tripTypeRoundTrip', icon: Route },
  { value: 'Multy City', labelKey: 'tripTypeMultiCity', icon: Truck },
  { value: 'Hourly Rental', labelKey: 'tripTypeHourlyRental', icon: Timer },
];

// @react-native-community/datetimepicker ships no web implementation at
// all (its generic fallback just renders null + a console.warn), and even
// a real native <input type="date"/"time"> overlay turned out unreliable
// to open (Chrome's native calendar popup needs a fully-trusted user
// gesture, inconsistent across environments). These fully custom, always-
// on-screen modals (ported from Vendor App's create-order.tsx, already
// proven there) work identically on web and native and don't depend on
// any OS/browser popup at all.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CustomDatePickerModal({ visible, title, initialDate, minimumDate, onConfirm, onClose }: {
  visible: boolean; title: string; initialDate: Date;
  minimumDate?: Date; onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const [sel, setSel] = React.useState(() => new Date(initialDate));
  const [viewMonth, setViewMonth] = React.useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  React.useEffect(() => {
    if (visible) { setSel(new Date(initialDate)); setViewMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)); }
  }, [visible]);

  const prevMonth = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const firstDay = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const minD = minimumDate ? new Date(minimumDate) : today; minD.setHours(0,0,0,0);

  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const isDisabled = (day: number) => {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    return d < minD;
  };
  const isSelected = (day: number) =>
    sel.getDate() === day && sel.getMonth() === viewMonth.getMonth() && sel.getFullYear() === viewMonth.getFullYear();
  const isToday = (day: number) => {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  };

  const pick = (day: number) => {
    if (isDisabled(day)) return;
    const d = new Date(sel);
    d.setFullYear(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    setSel(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#FFF', borderTopLeftRadius:24, borderTopRightRadius:24, paddingTop:8, paddingBottom: Platform.OS==='ios'?40:24}}>
          <View style={{width:40,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginBottom:4}}/>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12}}>
            <Text style={{fontSize:17,fontWeight:'700',color:'#0F172A'}}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{padding:4}}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,marginBottom:12}}>
            <TouchableOpacity onPress={prevMonth} style={{padding:8,borderRadius: 10,backgroundColor:'#F1F5F9'}}>
              <ChevronLeft size={18} color="#1D4ED8" />
            </TouchableOpacity>
            <Text style={{fontSize:16,fontWeight:'700',color:'#1E293B'}}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={{padding:8,borderRadius: 10,backgroundColor:'#F1F5F9'}}>
              <ChevronRight size={18} color="#1D4ED8" />
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',paddingHorizontal:16,marginBottom:4}}>
            {DAYS_SHORT.map(d => (
              <View key={d} style={{flex:1,alignItems:'center'}}>
                <Text style={{fontSize:12,fontWeight:'600',color:'#94A3B8'}}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={{paddingHorizontal:16}}>
            {Array.from({length: cells.length/7}, (_,row) => (
              <View key={row} style={{flexDirection:'row',marginBottom:4}}>
                {cells.slice(row*7, row*7+7).map((day, col) => {
                  if (!day) return <View key={col} style={{flex:1}}/>;
                  const disabled = isDisabled(day);
                  const selected = isSelected(day);
                  const todayCell = isToday(day);
                  return (
                    <TouchableOpacity key={col} style={{flex:1,alignItems:'center'}} onPress={() => pick(day)} activeOpacity={0.7}>
                      <View style={{
                        width:38, height:38, borderRadius:19, justifyContent:'center', alignItems:'center',
                        backgroundColor: selected ? '#1D4ED8' : todayCell ? '#EFF6FF' : 'transparent',
                        borderWidth: todayCell && !selected ? 1.5 : 0,
                        borderColor: '#1D4ED8',
                      }}>
                        <Text style={{
                          fontSize:14, fontWeight: selected||todayCell ? '700' : '400',
                          color: selected ? '#FFF' : disabled ? '#CBD5E1' : todayCell ? '#1D4ED8' : '#1E293B',
                        }}>{day}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:16,marginTop:4,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:14,color:'#475569',fontWeight:'500'}}>
              {sel.toLocaleDateString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric'})}
            </Text>
            <TouchableOpacity onPress={() => onConfirm(sel)}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius: 6}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const PICKER_ITEM_H = 48;
const PICKER_VISIBLE = 5;

function TimeWheelColumn({ items, selectedIndex, onSelect }: { items: string[]; selectedIndex: number; onSelect: (i: number) => void; }) {
  const ref = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: false });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={ref}
      style={{height: PICKER_ITEM_H * PICKER_VISIBLE, width: 72}}
      showsVerticalScrollIndicator={false}
      snapToInterval={PICKER_ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{paddingVertical: PICKER_ITEM_H * 2}}
      onMomentumScrollEnd={e => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
        onSelect(Math.max(0, Math.min(idx, items.length - 1)));
      }}
    >
      {items.map((item, i) => (
        <TouchableOpacity key={i} onPress={() => { onSelect(i); ref.current?.scrollTo({ y: i * PICKER_ITEM_H, animated: true }); }} activeOpacity={0.7}
          style={{height: PICKER_ITEM_H, justifyContent:'center', alignItems:'center'}}>
          <Text style={{
            fontSize: i === selectedIndex ? 22 : 16,
            fontWeight: i === selectedIndex ? '700' : '400',
            color: i === selectedIndex ? '#1D4ED8' : '#94A3B8',
          }}>{item}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function CustomTimePickerModal({ visible, title, initialDate, onConfirm, onClose }: {
  visible: boolean; title: string; initialDate: Date; onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const hours12 = Array.from({length:12}, (_,i) => String(i+1).padStart(2,'0'));
  const minutes = Array.from({length:60}, (_,i) => String(i).padStart(2,'0'));
  const periods = ['AM','PM'];

  const initH = initialDate.getHours();
  const [hIdx, setHIdx] = React.useState(() => initH % 12 === 0 ? 11 : (initH % 12) - 1);
  const [mIdx, setMIdx] = React.useState(() => initialDate.getMinutes());
  const [pIdx, setPIdx] = React.useState(() => initH >= 12 ? 1 : 0);

  React.useEffect(() => {
    if (visible) {
      const h = initialDate.getHours();
      setHIdx(h % 12 === 0 ? 11 : (h % 12) - 1);
      setMIdx(initialDate.getMinutes());
      setPIdx(h >= 12 ? 1 : 0);
    }
  }, [visible]);

  const confirm = () => {
    const d = new Date(initialDate);
    let h = hIdx + 1;
    if (pIdx === 1 && h !== 12) h += 12;
    if (pIdx === 0 && h === 12) h = 0;
    d.setHours(h, mIdx, 0, 0);
    onConfirm(d);
  };

  const displayTime = () => {
    const h = String(hIdx + 1).padStart(2, '0');
    const m = String(mIdx).padStart(2, '0');
    return `${h}:${m} ${periods[pIdx]}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#FFF', borderTopLeftRadius:24, borderTopRightRadius:24, paddingBottom: Platform.OS==='ios'?40:24}}>
          <View style={{width:40,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginTop:8,marginBottom:4}}/>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12}}>
            <Text style={{fontSize:17,fontWeight:'700',color:'#0F172A'}}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{padding:4}}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{alignItems:'center',paddingVertical:8}}>
            <View style={{position:'absolute',top: PICKER_ITEM_H * Math.floor(PICKER_VISIBLE / 2), left:0, right:0, height:PICKER_ITEM_H,
              backgroundColor:'#EFF6FF', borderTopWidth:1.5, borderBottomWidth:1.5, borderColor:'#BFDBFE'}}/>

            <View style={{flexDirection:'row', alignItems:'center', gap:4}}>
              <TimeWheelColumn items={hours12} selectedIndex={hIdx} onSelect={setHIdx} />
              <Text style={{fontSize:26,fontWeight:'700',color:'#1D4ED8',marginBottom:4}}>:</Text>
              <TimeWheelColumn items={minutes} selectedIndex={mIdx} onSelect={setMIdx} />
              <View style={{width:4}}/>
              <TimeWheelColumn items={periods} selectedIndex={pIdx} onSelect={setPIdx} />
            </View>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:12,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:22,fontWeight:'700',color:'#1D4ED8'}}>{displayTime()}</Text>
            <TouchableOpacity onPress={confirm}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius: 6}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DriverCreateBookingScreen() {
  const { colors, isDarkMode } = useTheme();
  const { driver } = useCarDriver();
  const router = useRouter();
  const { t } = useLanguage();

  // This screen posts to a driver-authenticated endpoint (axiosDriver /
  // driverAuthToken), but it can be reached (e.g. from My Bookings' "+")
  // without ever having gone through Duty first, which is what actually
  // establishes that session - see the hook for what that silently failed
  // as before this existed.
  const { ready: sessionReady, sessionError } = useEnsureDriverSession();
  useEffect(() => {
    if (sessionError) {
      Alert.alert(t('createBooking.couldNotStartSessionTitle'), sessionError, [{ text: t('quickDashboard.ok'), onPress: () => safeBack(router) }]);
    }
  }, [sessionError]);

  const [tripType, setTripType] = useState('Oneway');
  const [carType, setCarType] = useState('SEDAN_4_PLUS_1');
  const [customerName, setCustomerName] = useState('');
  const [customerCountryCode, setCustomerCountryCode] = useState('+91');
  const [customerNumber, setCustomerNumber] = useState('');
  // Indian numbers (+91) are always exactly 10 digits - any other country
  // code allows 8-15 (international numbers vary in length).
  const isIndianNumber = customerCountryCode.replace(/\D/g, '') === '91';
  const phoneMaxLen = isIndianNumber ? 10 : 15;
  const phoneMinLen = isIndianNumber ? 10 : 8;
  // Defaults to now + 30 minutes, not the exact current moment - so an
  // urgent booking can be posted right away without first having to open
  // the date/time pickers (kept in sync with Admin/Vendor App's same default).
  const [startDateTime, setStartDateTime] = useState(() => new Date(Date.now() + 30 * 60 * 1000));
  const [endDateTime, setEndDateTime] = useState<Date | null>(null);

  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');
  // Real backend field (schemas/new_orders.py's pickup_notes, shown to the
  // accepting driver/owner) with no field in this screen at all before.
  const [pickupNotes, setPickupNotes] = useState('');
  const [fareType, setFareType] = useState<'ITEMIZED' | 'ALL_INCLUSIVE'>('ITEMIZED');

  // Pricing Details - Standard
  const [costPerKm, setCostPerKm] = useState('15');
  const [extraCostPerKm, setExtraCostPerKm] = useState('0');
  const [driverAllowance, setDriverAllowance] = useState('300');
  const [extraDriverAllowance, setExtraDriverAllowance] = useState('0');
  const [permitCharges, setPermitCharges] = useState('0');
  const [extraPermitCharges, setExtraPermitCharges] = useState('0');
  const [hillCharges, setHillCharges] = useState('0');
  const [nightCharges, setNightCharges] = useState('0');

  // Automatic Vehicle Default Tariffs Matrix
  const getDefaultsForCarType = (selectedCar: string, currentTrip: string = tripType) => {
    const t = (selectedCar || '').toUpperCase();
    const isRound = currentTrip === 'Round Trip' || currentTrip === 'Multy City';
    
    if (t.includes('CRYSTA')) {
      return {
        cost_per_km: isRound ? '22' : '23',
        extra_cost_per_km: '0',
        driver_allowance: isRound ? '400' : '300',
        extra_driver_allowance: '0',
      };
    }
    if (t.includes('INNOVA')) {
      return {
        cost_per_km: isRound ? '20' : '21',
        extra_cost_per_km: '0',
        driver_allowance: isRound ? '400' : '300',
        extra_driver_allowance: '0',
      };
    }
    if (t.includes('SUV')) {
      return {
        cost_per_km: isRound ? '19' : '20',
        extra_cost_per_km: '0',
        driver_allowance: '300',
        extra_driver_allowance: '0',
      };
    }
    // Sedan / Etios / Hatchback default
    return {
      cost_per_km: isRound ? '14' : '15',
      extra_cost_per_km: '0',
      driver_allowance: '300',
      extra_driver_allowance: '0',
    };
  };

  useEffect(() => {
    const defs = getDefaultsForCarType(carType, tripType);
    setCostPerKm(defs.cost_per_km);
    setExtraCostPerKm(defs.extra_cost_per_km);
    setDriverAllowance(defs.driver_allowance);
    setExtraDriverAllowance(defs.extra_driver_allowance);
  }, [carType, tripType]);
  // Toll - either a known amount entered now, or deferred to trip end (same
  // toll_charge_update flag Admin/Vendor App use, and that trip/end.tsx
  // already knows how to collect via its own Toll Charges input).
  const [tollCharges, setTollCharges] = useState('0');
  const [tollChargeUpdate, setTollChargeUpdate] = useState(true);
  const [includeToll, setIncludeToll] = useState(false);
  const [includePermit, setIncludePermit] = useState(false);
  const [includeHill, setIncludeHill] = useState(false);
  const [includeNight, setIncludeNight] = useState(false);
  const [includeWaiting, setIncludeWaiting] = useState(false);
  const [waitingHours, setWaitingHours] = useState('1');

  // Pricing Details - All Inclusive
  const [totalBookingAmount, setTotalBookingAmount] = useState('');
  const [extraAmount, setExtraAmount] = useState('0');
  const [chargeItems, setChargeItems] = useState([
    { label: 'Toll', included: false },
    { label: 'State Permit', included: false },
    { label: 'Parking', included: false },
    { label: 'Waiting', included: false },
  ]);
  const [waitingHoursIncluded, setWaitingHoursIncluded] = useState('2');
  const [advanceReceived, setAdvanceReceived] = useState('');

  // Special Requirements
  const [requireMakeYear, setRequireMakeYear] = useState(false);
  const [makeYearRequirement, setMakeYearRequirement] = useState('2020');
  const [carrierRequired, setCarrierRequired] = useState(false);
  const [nonCng, setNonCng] = useState(false);
  const [petFriendly, setPetFriendly] = useState(false);

  // "10% CC" toggle (added 2026-09-04) - on by default (normal platform
  // commission applies); off means this booking keeps commission_waived
  // on the backend, so admin_profit is skipped entirely at trip close
  // (see crud/end_records.py) and the driver keeps the full base fare.
  // PLATFORM_COMMISSION_PERCENT mirrors the backend's own ADMIN_COMMESSION_ENV
  // (currently 10) - purely a display label, the real number always comes
  // from the backend at trip close regardless of what's shown here.
  const PLATFORM_COMMISSION_PERCENT = 10;
  const [applyCommission, setApplyCommission] = useState(true);
  // GST bridge (later): set to e.g. 5 once GST-inclusive posting is switched on.
  const GST_INCLUDED_PERCENT: number | undefined = undefined;

  const [submitting, setSubmitting] = useState(false);
  const [showQuoteReview, setShowQuoteReview] = useState(false);
  const [quoteResponse, setQuoteResponse] = useState<any>(null);
  // Hoisted above the `if (!sessionReady) return ...` early return below -
  // it was previously declared after that return, which violates the Rules
  // of Hooks (a conditional hook call) and crashed with "Rendered more
  // hooks than during the previous render" whenever sessionReady flips
  // from false to true after the first render.
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  // Tap-to-open picker modals for the compact "summary card" fields
  // (Trip Type / Vehicle Type) - purely presentational state, doesn't
  // touch any of the actual field values above.
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [showVehicleTypePicker, setShowVehicleTypePicker] = useState(false);
  const [showSpecialRequestsModal, setShowSpecialRequestsModal] = useState(false);
  const needsEndDate = tripType === 'Round Trip' || tripType === 'Multy City';

  // chargeItems[].label is sent verbatim to the backend (charge_items
  // payload) - never localize it there. This maps the same canonical
  // English label to a translated display string purely for rendering.
  const chargeItemLabelKeys: Record<string, string> = {
    Toll: 'chargeItemToll',
    'State Permit': 'chargeItemStatePermit',
    Parking: 'chargeItemParking',
    Waiting: 'chargeItemWaiting',
  };

  const selectedTripType = tripTypes.find((tt) => tt.value === tripType) || tripTypes[0];
  const SelectedTripIcon = selectedTripType.icon;

  const buildPayload = () => {
    const fullPhone = `${customerCountryCode}${customerNumber.trim()}`;
    return {
      trip_type: tripType,
      car_type: carType,
      customer_name: customerName.trim(),
      customer_number: fullPhone,
      // Backend requires numeric-string index keys ("0", "1", ...) - see
      // schemas/new_orders.py's OnewayQuoteRequest.validate_locations.
      // This was sending {location_1, location_2} instead, which the
      // validator always rejected with a 422 - meaning booking creation
      // from this screen has never actually worked.
      pickup_drop_location: {
        '0': pickupLocation.trim(),
        '1': dropLocation.trim(),
      },
      location_links: (pickupAddress.trim() || dropAddress.trim()) ? {
        '0': pickupAddress.trim() || undefined,
        '1': dropAddress.trim() || undefined,
      } : undefined,
      start_date_time: startDateTime.toISOString(),
      end_date_time: needsEndDate ? (endDateTime || startDateTime).toISOString() : undefined,
      fare_type: fareType,
      cost_per_km: parseFloat(costPerKm) || 14,
      extra_cost_per_km: parseFloat(extraCostPerKm) || 0,
      // Only a blank/invalid field falls back to the Rs 400 default - `|| 400`
      // also turned a genuine 0 into 400, so a zero-bata booking could never
      // be posted as typed.
      driver_allowance: Number.isFinite(parseFloat(driverAllowance)) ? parseFloat(driverAllowance) : 400,
      extra_driver_allowance: parseFloat(extraDriverAllowance) || 0,
      permit_charges: includePermit ? (parseFloat(permitCharges) || 0) : 0,
      extra_permit_charges: parseFloat(extraPermitCharges) || 0,
      hill_charges: includeHill ? (parseFloat(hillCharges) || 0) : 0,
      toll_charges: includeToll ? (parseFloat(tollCharges) || 0) : 0,
      toll_charge_update: !includeToll,
      night_charges: includeNight ? (parseFloat(nightCharges) || 0) : 0,
      total_booking_amount: fareType === 'ALL_INCLUSIVE' ? parseFloat(totalBookingAmount) : undefined,
      extra_amount: fareType === 'ALL_INCLUSIVE' ? (parseFloat(extraAmount) || 0) : undefined,
      waiting_hours_included: fareType === 'ALL_INCLUSIVE'
        ? parseFloat(waitingHoursIncluded)
        : includeWaiting
        ? (parseFloat(waitingHours) || 1)
        : undefined,
      charge_items: chargeItems,
      advance_received: advanceReceived ? parseInt(advanceReceived, 10) : undefined,
      car_make_year_requirement: requireMakeYear ? parseInt(makeYearRequirement, 10) : undefined,
      carrier_required: carrierRequired,
      non_cng: nonCng,
      pet_friendly: petFriendly,
      apply_commission: applyCommission,
      // GST bridge - not shown in the UI yet. When GST-inclusive posting is switched on, put the % here; the backend already
      // stores it and the GST part belongs to the poster (see backend utils/commission.py compute_split gst_amount).
      gst_percent: GST_INCLUDED_PERCENT,
      pickup_notes: pickupNotes.trim() || undefined,
    };
  };

  const handleConfirmBooking = async (overrideKm?: number, overrideTripTime?: string) => {
    setSubmitting(true);
    try {
      const payload: any = buildPayload();
      if (overrideKm != null) {
        payload.override_km = overrideKm;
        payload.override_trip_time = overrideTripTime || undefined;
      }
      const res = await axiosDriver.post('/api/assignments/driver/create-booking/confirm', payload);
      setShowQuoteReview(false);
      // Broadcast to the open driver pool now, not self-assigned - see
      // backend's driver_create_booking_confirm docstring. Other drivers
      // accept it (the poster can't accept their own booking); the poster
      // follows and can cancel it from My Trips.
      const held = Number(res?.data?.advance_held || 0);
      Alert.alert(
        t('createBooking.bookingCreatedTitle'),
        t('createBooking.bookingBroadcastBody') +
          (held > 0
            ? `\n\n₹${held} of your wallet is being HELD for the advance you marked as received. It is not charged - it is returned when the trip completes or if you cancel the booking. Track it in My Bookings.`
            : '\n\nTrack it, and cancel it if needed, in My Bookings.'),
        [
          {
            text: 'Open My Bookings',
            onPress: () => router.push('/(tabs)/my-bookings' as any),
          },
          { text: t('quickDashboard.ok'), style: 'cancel' },
        ]
      );
    } catch (e: any) {
      console.error('Failed to create driver booking:', e);
      const rawDetail = e?.response?.data?.detail;
      // Two structured errors from the confirm endpoint carry a next step.
      // Kept out of the string path below - a dict detail would print as
      // "[object Object]".
      if (rawDetail && typeof rawDetail === 'object') {
        if (rawDetail.error === 'INSUFFICIENT_BALANCE_FOR_ADVANCE') {
          setShowQuoteReview(false);
          Alert.alert('Add money to post this booking', rawDetail.message || 'Your wallet needs to cover the advance you marked as received (held, not charged).', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/(tabs)/wallet' as any) },
          ]);
          return;
        }
        if (rawDetail.error === 'TRUSTED_PARTNER_REQUIRED') {
          setShowQuoteReview(false);
          Alert.alert('Trusted Partners only', rawDetail.message || 'Only Trusted Partners can post bookings.', [
            { text: 'OK', style: 'cancel' },
            { text: 'Become a Trusted Partner', onPress: () => router.push('/subscription' as any) },
          ]);
          return;
        }
      }
      const detail = rawDetail || e?.message || t('createBooking.couldNotCreateBooking');
      Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : t('createBooking.couldNotCreateBooking'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      Alert.alert(t('quickDashboard.errorTitle'), t('createBooking.enterCustomerName'));
      return;
    }
    if (!customerNumber.trim()) {
      Alert.alert(t('quickDashboard.errorTitle'), t('createBooking.enterCustomerMobile'));
      return;
    }
    if (customerNumber.trim().length < phoneMinLen || customerNumber.trim().length > phoneMaxLen) {
      Alert.alert(
        t('quickDashboard.errorTitle'),
        isIndianNumber
          ? t('createBooking.indianPhoneLengthError')
          : t('createBooking.otherPhoneLengthError', { min: phoneMinLen, max: phoneMaxLen, code: customerCountryCode })
      );
      return;
    }
    if (!pickupLocation.trim() || !dropLocation.trim()) {
      Alert.alert(t('quickDashboard.errorTitle'), t('createBooking.enterPickupDrop'));
      return;
    }

    if (fareType === 'ALL_INCLUSIVE' && (!totalBookingAmount || parseFloat(totalBookingAmount) <= 0)) {
      Alert.alert(t('quickDashboard.errorTitle'), t('createBooking.enterValidAmount'));
      return;
    }
    if (tripType === 'Hourly Rental') {
      Alert.alert(t('createBooking.notAvailableYetTitle'), t('createBooking.hourlyComingSoonBody'));
      return;
    }
    if (needsEndDate && endDateTime && endDateTime <= startDateTime) {
      Alert.alert(t('quickDashboard.errorTitle'), t('createBooking.returnBeforePickupError'));
      return;
    }

    // All-Inclusive has a flat, manually-entered price - there's no km-driven
    // fare to preview or edit, so it skips the review step and posts directly
    // (unchanged behavior). Itemized fares are km-driven, so those get a
    // review screen where the auto-calculated distance can be corrected
    // before posting - the same "why should the estimate always win" gap the
    // Vendor App already closed with its own Quote Review screen.
    if (fareType === 'ALL_INCLUSIVE') {
      await handleConfirmBooking();
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const quoteEndpoint =
        tripType === 'Round Trip' ? '/api/orders/roundtrip/quote'
        : tripType === 'Multy City' ? '/api/orders/multicity/quote'
        : '/api/orders/oneway/quote';
      const res = await axiosDriver.post(quoteEndpoint, payload);
      setQuoteResponse(res.data);
      setShowQuoteReview(true);
    } catch (e: any) {
      console.error('Failed to fetch driver booking quote:', e);
      const detail = e?.response?.data?.detail || e?.message || t('createBooking.couldNotCreateBooking');
      Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : t('createBooking.couldNotCreateBooking'));
    } finally {
      setSubmitting(false);
    }
  };

  // Theme-aware soft tint for icon badges / summary circles / edit pills -
  // `colors` doesn't carry a dark-safe primary tint, so this follows the
  // rgba(primary, x) pattern already used elsewhere in this app (see
  // drop-bid.tsx, active.tsx, index.tsx) instead of hardcoding a light-only hex.
  const accentTint = isDarkMode ? 'rgba(129, 140, 248, 0.16)' : '#EEF2FF';
  const accentTintBorder = isDarkMode ? 'rgba(129, 140, 248, 0.3)' : '#E0E7FF';
  const accent = colors.primary;

  if (!sessionReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.text }}>{t('createBooking.settingUpSession')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('createBooking.pageTitle')}</Text>
        <TouchableOpacity
          onPress={() => setShowPageInfo(true)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.primary + '18',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.primary + '33',
          }}
        >
          <Info size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <PageInfoModal
        visible={showPageInfo}
        title="Post Booking & Dispatch"
        description="Directly post and dispatch new trips from your driver panel to the Drop Cars network."
        workflowSteps={[
          'Choose Trip Type (Oneway, Round Trip, Multi City, or Hourly Rental).',
          'Specify Car Category requirement and enter Customer contact details.',
          'Set Pickup and Drop Locations with optional Google Maps navigation links.',
          'Select Itemized (per-km rate) or All-Inclusive (fixed fare) pricing.',
          'Confirm booking to broadcast it to available drivers & vendors immediately.',
        ]}
        tips={[
          'Commission Waived: Toggle Apply 10% Commission off if this booking is commission-free.',
          'Fare Preview: Itemized bookings open a Fare Review screen so you can verify distance before posting.',
        ]}
        onClose={() => setShowPageInfo(false)}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 1. Trip Type - compact tap-to-open picker */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <Route size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step1TripType')}</Text>
          </View>

          <TouchableOpacity
            style={[styles.summaryCardTouchable, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setShowTripTypePicker(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={[styles.summaryIconCircle, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
                <SelectedTripIcon size={20} color={accent} />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={[styles.summaryTitle, { color: colors.text }]}>{t(`createBooking.${selectedTripType.labelKey}`)}</Text>
                <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>{t('createBooking.tripTypeSummarySubtitle')}</Text>
              </View>
            </View>
            <View style={[styles.editPillButton, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <Text style={[styles.editPillText, { color: accent }]}>{t('createBooking.changePill')}</Text>
              <ChevronRight size={14} color={accent} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 2. Vehicle Type - compact tap-to-open picker */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <Car size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step2VehicleType')}</Text>
          </View>

          <TouchableOpacity
            style={[styles.summaryCardTouchable, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setShowVehicleTypePicker(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={[styles.summaryIconCircle, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
                <Car size={20} color={accent} />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={[styles.summaryTitle, { color: colors.text }]}>
                  {carType.replace(/_/g, ' ').replace(/PLUS/g, '+')}
                </Text>
                <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>{t('createBooking.vehicleTypeSummarySubtitle')}</Text>
              </View>
            </View>
            <View style={[styles.editPillButton, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <Text style={[styles.editPillText, { color: accent }]}>{t('createBooking.changePill')}</Text>
              <ChevronRight size={14} color={accent} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. Customer Details */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <User size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step3CustomerDetails')}</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.customerNameLabel')}</Text>
          <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <User size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder={t('createBooking.customerNamePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.customerMobileLabel')}</Text>
          <View style={styles.phoneInputRow}>
            <View style={[styles.ccInputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Phone size={14} color={colors.textSecondary} />
              <TextInput
                style={[styles.ccInput, { color: colors.text }]}
                value={customerCountryCode}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, '');
                  // Safeguard: If keyboard autofill tries to dump a full 10-digit phone number into the CC input,
                  // keep CC as +91 and route the phone number to customerNumber instead.
                  if (digits.length > 4) {
                    setCustomerCountryCode('+91');
                    setCustomerNumber(digits.slice(-phoneMaxLen));
                    return;
                  }
                  setCustomerCountryCode(digits ? `+${digits}` : '');
                }}
                placeholder="+91"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                autoComplete="off"
                importantForAutofill="no"
                textContentType="none"
              />
            </View>
            <View style={[styles.inputBox, { flex: 1, borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                style={[styles.input, { color: colors.text, paddingLeft: 0 }]}
                placeholder={isIndianNumber ? t('createBooking.indianNumberPlaceholder') : t('createBooking.otherNumberPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={customerNumber}
                onChangeText={(val) => {
                  let cleaned = val.replace(/[^0-9]/g, '');
                  // If user autofilled or pasted with leading 91 (e.g. 918838480505), strip 91
                  if (isIndianNumber && cleaned.length > 10 && cleaned.startsWith('91')) {
                    cleaned = cleaned.slice(2);
                  }
                  setCustomerNumber(cleaned.slice(0, phoneMaxLen));
                }}
                keyboardType="phone-pad"
                maxLength={phoneMaxLen}
                autoComplete="tel"
                importantForAutofill="yes"
                textContentType="telephoneNumber"
              />
            </View>
          </View>
        </View>

        {/* 4. Pickup Date & Time */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <Calendar size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step4PickupDateTime')}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => setShowDatePicker(true)}>
              <Calendar size={18} color={accent} />
              <Text style={[styles.dateBtnText, { color: colors.text }]}>{startDateTime.toLocaleDateString('en-IN')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => setShowTimePicker(true)}>
              <Clock size={18} color={accent} />
              <Text style={[styles.dateBtnText, { color: colors.text }]}>
                {startDateTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </Text>
            </TouchableOpacity>
          </View>

          {needsEndDate && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 10 }]}>{t('createBooking.returnDropDateTime')}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => setShowEndDatePicker(true)}>
                  <Calendar size={18} color={accent} />
                  <Text style={[styles.dateBtnText, { color: colors.text }]}>{(endDateTime || startDateTime).toLocaleDateString('en-IN')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => setShowEndTimePicker(true)}>
                  <Clock size={18} color={accent} />
                  <Text style={[styles.dateBtnText, { color: colors.text }]}>
                    {(endDateTime || startDateTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* 5. Locations Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <MapPin size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step5Locations')}</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.pickupLocationLabel')}</Text>
          <View style={{ zIndex: 50, elevation: 50 }}>
            <LocationAutocompleteField
              value={pickupLocation}
              onChangeText={setPickupLocation}
              placeholder={t('createBooking.pickupLocationPlaceholder')}
              icon={<MapPin size={18} color={colors.success} />}
              style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}
              inputStyle={[styles.input, { color: colors.text }]}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>Pickup Address / Landmark (Optional)</Text>
          <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Navigation size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Exact Door No, Street, Landmark or Maps link"
              placeholderTextColor={colors.textSecondary}
              value={pickupAddress}
              onChangeText={setPickupAddress}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>{t('createBooking.dropLocationLabel')}</Text>
          <View style={{ zIndex: 10, elevation: 10 }}>
            <LocationAutocompleteField
              value={dropLocation}
              onChangeText={setDropLocation}
              placeholder={t('createBooking.dropLocationPlaceholder')}
              icon={<MapPin size={18} color={colors.danger} />}
              style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}
              inputStyle={[styles.input, { color: colors.text }]}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>Drop Address / Landmark (Optional)</Text>
          <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Navigation size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Exact Door No, Destination Landmark or Maps link"
              placeholderTextColor={colors.textSecondary}
              value={dropAddress}
              onChangeText={setDropAddress}
            />
          </View>
        </View>

        {/* 6. Fare Type */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <IndianRupee size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step6FareType')}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[
                styles.fareTypeBtn,
                { borderColor: colors.border },
                fareType === 'ITEMIZED' && { backgroundColor: accentTint, borderColor: accent },
              ]}
              onPress={() => setFareType('ITEMIZED')}
            >
              <Text style={[styles.fareTypeText, { color: colors.textSecondary }, fareType === 'ITEMIZED' && { color: accent, fontFamily: 'Inter-Bold' }]}>{t('createBooking.standardFare')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fareTypeBtn,
                { borderColor: colors.border },
                fareType === 'ALL_INCLUSIVE' && { backgroundColor: accentTint, borderColor: accent },
              ]}
              onPress={() => setFareType('ALL_INCLUSIVE')}
            >
              <Text style={[styles.fareTypeText, { color: colors.textSecondary }, fareType === 'ALL_INCLUSIVE' && { color: accent, fontFamily: 'Inter-Bold' }]}>
                {t('createBooking.allInclusiveFare')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 7. Pricing Details */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <IndianRupee size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step7Pricing', { type: fareType === 'ALL_INCLUSIVE' ? t('createBooking.allInclusiveFare') : t('createBooking.standardFare') })}</Text>
          </View>

          {fareType === 'ALL_INCLUSIVE' ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.totalBookingAmountLabel')}</Text>
              <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <IndianRupee size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={t('createBooking.totalBookingAmountPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={totalBookingAmount}
                  onChangeText={setTotalBookingAmount}
                  keyboardType="numeric"
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.extraAmountLabel')}</Text>
              <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <IndianRupee size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  value={extraAmount}
                  onChangeText={setExtraAmount}
                  keyboardType="numeric"
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>{t('createBooking.bundledChargeItemsLabel')}</Text>
              {chargeItems.map((item, idx) => (
                <TouchableOpacity
                  style={[styles.switchRow, { borderColor: colors.border }]}
                  key={item.label}
                  activeOpacity={0.7}
                  onPress={() => {
                    const updated = [...chargeItems];
                    updated[idx].included = !updated[idx].included;
                    setChargeItems(updated);
                  }}
                >
                  <Text style={[styles.switchText, { color: colors.text }]}>{chargeItemLabelKeys[item.label] ? t(`createBooking.${chargeItemLabelKeys[item.label]}`) : item.label}</Text>
                  {item.included ? (
                    <CheckCircle size={22} color={accent} />
                  ) : (
                    <Square size={22} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              ))}

              {/* Only asked when Waiting is actually checked above - no
                  point pre-filling a "2 hours" default for a charge that
                  isn't even bundled into this booking. */}
              {chargeItems.find((i) => i.label === 'Waiting')?.included && (
              <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.waitingHoursLabel')}</Text>
              <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Clock size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="e.g. 2"
                  placeholderTextColor={colors.textSecondary}
                  value={waitingHoursIncluded}
                  onChangeText={setWaitingHoursIncluded}
                  keyboardType="numeric"
                />
              </View>
              </>
              )}
            </>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.costPerKmLabel')}</Text>
              <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <IndianRupee size={18} color={colors.textSecondary} />
                <TextInput style={[styles.input, { color: colors.text }]} value={costPerKm} onChangeText={setCostPerKm} keyboardType="numeric" />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.driverAllowanceLabel')}</Text>
              <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <IndianRupee size={18} color={colors.textSecondary} />
                <TextInput style={[styles.input, { color: colors.text }]} value={driverAllowance} onChangeText={setDriverAllowance} keyboardType="numeric" />
              </View>

              {/* Optional Fare Inclusions Toggles & Amount Inputs (Single-Line Layout) */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14, marginBottom: 8 }]}>Fare Inclusions (Optional)</Text>

              {/* 1. Include Toll */}
              <View style={[styles.inlineInclusionRow, { borderColor: colors.border, backgroundColor: includeToll ? accentTint : colors.background }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = !includeToll;
                    setIncludeToll(next);
                    setTollChargeUpdate(!next);
                    if (!next) setTollCharges('0');
                  }}
                >
                  {includeToll ? <CheckCircle size={20} color={accent} /> : <Square size={20} color={colors.textSecondary} />}
                  <Text style={[styles.inlineInclusionText, { color: colors.text }]}>Toll Charges</Text>
                </TouchableOpacity>
                {includeToll && (
                  <View style={[styles.inlineInputBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>₹</Text>
                    <TextInput
                      style={[styles.inlineInput, { color: colors.text }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.textSecondary}
                      value={tollCharges}
                      onChangeText={setTollCharges}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* 2. Include State Permit / Tax */}
              <View style={[styles.inlineInclusionRow, { borderColor: colors.border, backgroundColor: includePermit ? accentTint : colors.background }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = !includePermit;
                    setIncludePermit(next);
                    if (!next) setPermitCharges('0');
                  }}
                >
                  {includePermit ? <CheckCircle size={20} color={accent} /> : <Square size={20} color={colors.textSecondary} />}
                  <Text style={[styles.inlineInclusionText, { color: colors.text }]}>State Permit / Tax</Text>
                </TouchableOpacity>
                {includePermit && (
                  <View style={[styles.inlineInputBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>₹</Text>
                    <TextInput
                      style={[styles.inlineInput, { color: colors.text }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.textSecondary}
                      value={permitCharges}
                      onChangeText={setPermitCharges}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* 3. Include Hill Charges */}
              <View style={[styles.inlineInclusionRow, { borderColor: colors.border, backgroundColor: includeHill ? accentTint : colors.background }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = !includeHill;
                    setIncludeHill(next);
                    if (!next) setHillCharges('0');
                  }}
                >
                  {includeHill ? <CheckCircle size={20} color={accent} /> : <Square size={20} color={colors.textSecondary} />}
                  <Text style={[styles.inlineInclusionText, { color: colors.text }]}>Hill Charges</Text>
                </TouchableOpacity>
                {includeHill && (
                  <View style={[styles.inlineInputBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>₹</Text>
                    <TextInput
                      style={[styles.inlineInput, { color: colors.text }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.textSecondary}
                      value={hillCharges}
                      onChangeText={setHillCharges}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* 4. Include Night Charges */}
              <View style={[styles.inlineInclusionRow, { borderColor: colors.border, backgroundColor: includeNight ? accentTint : colors.background }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = !includeNight;
                    setIncludeNight(next);
                    if (!next) setNightCharges('0');
                  }}
                >
                  {includeNight ? <CheckCircle size={20} color={accent} /> : <Square size={20} color={colors.textSecondary} />}
                  <Text style={[styles.inlineInclusionText, { color: colors.text }]}>Night Allowance</Text>
                </TouchableOpacity>
                {includeNight && (
                  <View style={[styles.inlineInputBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>₹</Text>
                    <TextInput
                      style={[styles.inlineInput, { color: colors.text }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.textSecondary}
                      value={nightCharges}
                      onChangeText={setNightCharges}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* 5. Include Waiting Charges (@ ₹120/hr auto-calculated) */}
              <View style={[styles.inlineInclusionRow, { borderColor: colors.border, backgroundColor: includeWaiting ? accentTint : colors.background }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = !includeWaiting;
                    setIncludeWaiting(next);
                    if (!next) setWaitingHours('1');
                  }}
                >
                  {includeWaiting ? <CheckCircle size={20} color={accent} /> : <Square size={20} color={colors.textSecondary} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inlineInclusionText, { color: colors.text }]}>Waiting Charges</Text>
                    {includeWaiting && (
                      <Text style={{ fontSize: 11, color: accent, fontFamily: 'Inter-SemiBold' }}>
                        @ ₹120/hr = ₹{(parseInt(waitingHours, 10) || 1) * 120} total
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                {includeWaiting && (
                  <View style={[styles.inlineInputBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <TextInput
                      style={[styles.inlineInput, { color: colors.text, textAlign: 'center' }]}
                      placeholder="1"
                      placeholderTextColor={colors.textSecondary}
                      value={waitingHours}
                      onChangeText={(v) => setWaitingHours(v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                    />
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>hrs</Text>
                  </View>
                )}
              </View>
            </>
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('createBooking.advanceReceivedLabel')}</Text>
          <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <IndianRupee size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder={t('createBooking.advanceReceivedPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={advanceReceived}
              onChangeText={(v) => setAdvanceReceived(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
            />
          </View>
          {!!advanceReceived && parseInt(advanceReceived, 10) > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
              Your wallet must have ₹{parseInt(advanceReceived, 10)} to post this booking. It is only HELD (not charged) - returned when the trip completes or if you cancel the booking.
            </Text>
          )}
        </View>

        {/* 8. Special Requirements - compacted into a summary card + modal,
            matching the Vendor App pattern instead of sitting inline,
            always fully expanded. No allowance/charge fields here (unlike
            Admin/Vendor's version of this section) - a driver posting
            their own trip has no reason to pay themselves an allowance for
            their own car meeting a requirement. */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <CheckCircle size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('createBooking.step8SpecialReq')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.summaryCardTouchable, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setShowSpecialRequestsModal(true)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
              <View style={[styles.optionIconBox, { backgroundColor: accentTint }]}>
                <CheckCircle size={20} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitleText, { color: colors.text }]}>
                  {(() => {
                    const reqs: string[] = [];
                    if (nonCng) reqs.push('⚡ Non CNG');
                    if (carrierRequired) reqs.push('🧳 Luggage Carrier');
                    if (petFriendly) reqs.push('🐾 Pet Friendly');
                    if (requireMakeYear) reqs.push(`📅 Year ${makeYearRequirement || '2020'}+`);
                    return reqs.length === 0 ? 'No Special Requirements' : reqs.join(', ');
                  })()}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {(nonCng ? 1 : 0) + (carrierRequired ? 1 : 0) + (petFriendly ? 1 : 0) + (requireMakeYear ? 1 : 0) === 0 ? 'Tap to select' : 'Tap to edit'}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 9. Platform Commission */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            activeOpacity={0.7}
            onPress={() => setApplyCommission(!applyCommission)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
              <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
                <Percent size={18} color={accent} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{PLATFORM_COMMISSION_PERCENT}% CC (your commission on KM fare)</Text>
            </View>
            {applyCommission ? (
              <CheckCircle size={22} color={accent} />
            ) : (
              <Square size={22} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* 10. Customer Special Notes & Instructions */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: accentTint, borderColor: accentTintBorder }]}>
              <FileText size={18} color={accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Special Notes & Instructions</Text>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Special Instructions & Customer Requests (Optional)</Text>
          <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background, height: undefined, minHeight: 48, paddingVertical: 8 }]}>
            <FileText size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <TextInput
              style={[styles.input, { color: colors.text, textAlignVertical: 'top' }]}
              placeholder="e.g. Heavy luggage, baby onboard, pet travelling, elderly passenger, AC preference..."
              placeholderTextColor={colors.textSecondary}
              value={pickupNotes}
              onChangeText={setPickupNotes}
              multiline
            />
          </View>
        </View>

        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.success }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Send size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>{t('createBooking.pageTitle')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CustomDatePickerModal
        visible={showDatePicker}
        title="Pickup Date"
        initialDate={startDateTime}
        onConfirm={(d) => { setStartDateTime(d); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
      />

      <CustomTimePickerModal
        visible={showTimePicker}
        title="Pickup Time"
        initialDate={startDateTime}
        onConfirm={(d) => { setStartDateTime(d); setShowTimePicker(false); }}
        onClose={() => setShowTimePicker(false)}
      />

      <CustomDatePickerModal
        visible={showEndDatePicker}
        title="Return/Drop Date"
        initialDate={endDateTime || startDateTime}
        minimumDate={startDateTime}
        onConfirm={(d) => { setEndDateTime(d); setShowEndDatePicker(false); }}
        onClose={() => setShowEndDatePicker(false)}
      />

      <CustomTimePickerModal
        visible={showEndTimePicker}
        title="Return/Drop Time"
        initialDate={endDateTime || startDateTime}
        onConfirm={(d) => { setEndDateTime(d); setShowEndTimePicker(false); }}
        onClose={() => setShowEndTimePicker(false)}
      />

      <DriverQuoteReview
        visible={showQuoteReview}
        onClose={() => setShowQuoteReview(false)}
        quoteData={quoteResponse}
        onConfirm={handleConfirmBooking}
        isLoading={submitting}
        applyCommission={applyCommission}
        commissionPercent={PLATFORM_COMMISSION_PERCENT}
        advanceReceived={advanceReceived ? parseInt(advanceReceived, 10) || 0 : 0}
      />

      {/* Trip Type Picker Modal */}
      <Modal
        visible={showTripTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTripTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTripTypePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>{t('createBooking.selectTripType')}</Text>
              <TouchableOpacity onPress={() => setShowTripTypePicker(false)} style={[styles.modalCloseIcon, { backgroundColor: colors.background }]}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginTop: 14 }}>
              {tripTypes.map((tt) => {
                const isActive = tripType === tt.value;
                const Icon = tt.icon;
                return (
                  <TouchableOpacity
                    key={tt.value}
                    style={[
                      styles.modalOptionCard,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      isActive && { backgroundColor: accentTint, borderColor: accent },
                    ]}
                    onPress={() => {
                      setTripType(tt.value);
                      setShowTripTypePicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.optionIconBox, { backgroundColor: accentTint }, isActive && { backgroundColor: accent }]}>
                      <Icon size={20} color={isActive ? '#FFFFFF' : accent} />
                    </View>
                    <Text style={[styles.optionTitleText, { color: colors.text }, isActive && { color: accent }]}>
                      {t(`createBooking.${tt.labelKey}`)}
                    </Text>
                    {isActive && <CheckCircle size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Vehicle Type Picker Modal */}
      <Modal
        visible={showVehicleTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVehicleTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowVehicleTypePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>{t('createBooking.selectVehicleType')}</Text>
              <TouchableOpacity onPress={() => setShowVehicleTypePicker(false)} style={[styles.modalCloseIcon, { backgroundColor: colors.background }]}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380, marginTop: 14 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10 }}>
                {carTypes.map((ct) => {
                  const isActive = carType === ct;
                  return (
                    <TouchableOpacity
                      key={ct}
                      style={[
                        styles.modalOptionCard,
                        { backgroundColor: colors.background, borderColor: colors.border },
                        isActive && { backgroundColor: accentTint, borderColor: accent },
                      ]}
                      onPress={() => {
                        setCarType(ct);
                        setShowVehicleTypePicker(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.optionIconBox, { backgroundColor: accentTint }, isActive && { backgroundColor: accent }]}>
                        <Car size={20} color={isActive ? '#FFFFFF' : accent} />
                      </View>
                      <Text style={[styles.optionTitleText, { color: colors.text }, isActive && { color: accent }]}>
                        {ct.replace(/_/g, ' ').replace(/PLUS/g, '+')}
                      </Text>
                      {isActive && <CheckCircle size={18} color={accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Special Requirements Modal */}
      <Modal
        visible={showSpecialRequestsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSpecialRequestsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSpecialRequestsModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>{t('createBooking.step8SpecialReq')}</Text>
              <TouchableOpacity onPress={() => setShowSpecialRequestsModal(false)} style={[styles.modalCloseIcon, { backgroundColor: colors.background }]}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, marginTop: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 10 }}>
                {/* 1. Non CNG */}
                <TouchableOpacity
                  style={[
                    styles.modalOptionCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    nonCng && { backgroundColor: accentTint, borderColor: accent },
                  ]}
                  onPress={() => setNonCng(!nonCng)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: accentTint }, nonCng && { backgroundColor: accent }]}>
                    <Text style={{ fontSize: 18 }}>⚡</Text>
                  </View>
                  <Text style={[styles.optionTitleText, { color: colors.text }, nonCng && { color: accent }]}>
                    Non CNG Vehicle Only
                  </Text>
                  {nonCng && <CheckCircle size={18} color={accent} />}
                </TouchableOpacity>

                {/* 2. Luggage Carrier */}
                <TouchableOpacity
                  style={[
                    styles.modalOptionCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    carrierRequired && { backgroundColor: accentTint, borderColor: accent },
                  ]}
                  onPress={() => setCarrierRequired(!carrierRequired)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: accentTint }, carrierRequired && { backgroundColor: accent }]}>
                    <Truck size={20} color={carrierRequired ? '#FFFFFF' : accent} />
                  </View>
                  <Text style={[styles.optionTitleText, { color: colors.text }, carrierRequired && { color: accent }]}>
                    {t('createBooking.luggageCarrierReq')}
                  </Text>
                  {carrierRequired && <CheckCircle size={18} color={accent} />}
                </TouchableOpacity>

                {/* 3. Pet Friendly */}
                <TouchableOpacity
                  style={[
                    styles.modalOptionCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    petFriendly && { backgroundColor: accentTint, borderColor: accent },
                  ]}
                  onPress={() => setPetFriendly(!petFriendly)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: accentTint }, petFriendly && { backgroundColor: accent }]}>
                    <Text style={{ fontSize: 18 }}>🐾</Text>
                  </View>
                  <Text style={[styles.optionTitleText, { color: colors.text }, petFriendly && { color: accent }]}>
                    Pet Friendly Vehicle
                  </Text>
                  {petFriendly && <CheckCircle size={18} color={accent} />}
                </TouchableOpacity>

                {/* 4. Car Make Year Requirement */}
                <TouchableOpacity
                  style={[
                    styles.modalOptionCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    requireMakeYear && { backgroundColor: accentTint, borderColor: accent },
                  ]}
                  onPress={() => setRequireMakeYear(!requireMakeYear)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: accentTint }, requireMakeYear && { backgroundColor: accent }]}>
                    <Calendar size={20} color={requireMakeYear ? '#FFFFFF' : accent} />
                  </View>
                  <Text style={[styles.optionTitleText, { color: colors.text }, requireMakeYear && { color: accent }]}>
                    {t('createBooking.carMakeYearReq')}
                  </Text>
                  {requireMakeYear && <CheckCircle size={18} color={accent} />}
                </TouchableOpacity>
                {requireMakeYear && (
                  <View style={{ marginTop: 2, marginBottom: 8 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Minimum Year</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 2020"
                      value={makeYearRequirement}
                      onChangeText={setMakeYearRequirement}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={{ backgroundColor: accent, borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 18 }}
              onPress={() => setShowSpecialRequestsModal(false)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>Save</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 20, fontFamily: 'Inter-Bold' },
  subtitle: { fontSize: 12, marginTop: 2 },
  scroll: { flex: 1, padding: 16 },

  // Card section (Vendor App create-order.tsx pattern)
  sectionCard: { borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconBadge: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter-Bold', flex: 1 },

  fieldLabel: { fontSize: 13, fontFamily: 'Inter-Medium', marginTop: 10, marginBottom: 4 },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, height: 44 },
  input: { flex: 1, fontSize: 14, paddingLeft: 8 },
  phoneInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ccInputBox: { flexDirection: 'row', alignItems: 'center', width: 72, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 44, gap: 4 },
  ccInput: { flex: 1, textAlign: 'center', fontSize: 14 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 6, padding: 10, justifyContent: 'center' },
  dateBtnText: { fontSize: 14, fontFamily: 'Inter-Medium' },
  fareTypeBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  fareTypeText: { fontSize: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  switchText: { fontSize: 14 },
  submitBtn: { borderRadius: 6, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 40 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-Bold' },

  // Tap-to-open "summary card" pattern (Vendor App create-order.tsx)
  summaryCardTouchable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, padding: 14, borderWidth: 1 },
  summaryCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  summaryIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1 },
  summaryTextContent: { flex: 1 },
  summaryTitle: { fontSize: 14.5, fontFamily: 'Inter-Bold', marginBottom: 2 },
  summarySubtitle: { fontSize: 12, lineHeight: 16 },
  editPillButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, gap: 2 },
  editPillText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },

  // Bottom sheet picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  bottomSheetContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 22 },
  dragHandle: { width: 38, height: 4.5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1 },
  modalHeaderTitle: { fontSize: 17, fontFamily: 'Inter-Bold' },
  modalCloseIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  modalOptionCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 8, borderWidth: 1.5, gap: 12 },
  optionIconBox: { width: 38, height: 38, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  optionTitleText: { fontSize: 14.5, fontFamily: 'Inter-SemiBold', flex: 1 },

  // Single-line aligned inclusion rows
  inlineInclusionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 8,
    minHeight: 48,
  },
  inlineInclusionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  inlineInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    width: 108,
    gap: 4,
  },
  inlineInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    paddingVertical: 0,
  },
});
