import React, { useState, useRef, useEffect } from 'react';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Animated,
  Dimensions,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import publicApi from '../api/api';
import DateTimePicker from '@react-native-community/datetimepicker';

import { LinearGradient } from 'expo-linear-gradient';
import type { ColorValue } from 'react-native';
import { 
  User, 
  Phone, 
  MapPin, 
  IndianRupee,
  Car,
  Mountain,
  FileText,
  Calendar,
  Clock,
  X,
  ChevronDown,
  Calculator,
  Send,
  Route,
  Truck,
  GripVertical,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Timer,
  ToggleLeft,
  ToggleRight,
  Check,
  Edit3,
  Sliders,
  ChevronRight,
  ChevronLeft,
  Info,
  CheckCircle2,
  Sparkles,
  ShieldCheck
} from 'lucide-react-native';
import LocationPicker from '../../components/LocationPicker';
import QuoteReview from '../../components/QuoteReview';
import OrderSuccess from '../../components/OrderSuccess';
import { getHourlyQuote, confirmHourlyOrder, getQuote as getQuoteAPI, confirmOrder as confirmOrderAPI, formatOrderData, formatHourlyOrderData } from '../../services/orderService';
import { Picker } from '@react-native-picker/picker';
const { width } = Dimensions.get('window');

interface FormData {
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: { [key: string]: string };
  // Per-stop address/maps link, keyed the same as pickup_drop_location.
  // Prefilled with the city name; vendor can overwrite with a real Google
  // Maps link or a plain address. Shown to drivers before they accept.
  location_links: { [key: string]: string };
  start_date_time: Date;
  // Round Trip "return" / Multi City "drop" date & time. null = default
  // (same date as pickup, 9:30 PM) until the vendor picks one explicitly.
  end_date_time: Date | null;
  customer_name: string;
  customer_number: string;
  customer_country_code: string;
  max_time_hours: string;
  max_time_minutes: string;
  // Exact date & time to keep the booking live (visible to drivers) until.
  // null = default: pickup time + 15 minutes.
  live_until: Date | null;
  // Advance bookings only: extra days before auto-cancel-if-unaccepted kicks
  // in. Blank/0 = default (pickup time + 15 minutes).
  accept_by_days: string;
  toll_charge_update: boolean;
  // Regular trip fields
  cost_per_km: string;
  extra_cost_per_km: string;
  driver_allowance: string;
  extra_driver_allowance: string;
  permit_charges: string;
  extra_permit_charges: string;
  hill_charges: string;
  toll_charges: string;
  // Hourly rental fields
  package_hours: { hours: number; km_range: number } | null;
  cost_per_hour: string;
  extra_cost_per_hour: string;
  cost_for_addon_km: string;
  extra_cost_for_addon_km: string;
  pickup_notes: string;
  send_to: string;
  near_city: string[];
  night_charges: string;
  override_km: string;
  override_trip_time: string;
  require_car_make_year: boolean;
  car_make_year_requirement: string;
  car_year_charge: string;
  carrier_required: boolean;
  carrier_charge: string;
  non_cng: boolean;
  non_cng_charge: string;
  pet_friendly: boolean;
  pet_friendly_charge: string;
  priority_for_paid: boolean;
  priority_cutoff_at: Date | null;
  fare_type: 'ALL_INCLUSIVE' | 'ITEMIZED';
  // amount is the rupee value bundled into the flat price for this item -
  // '0'/blank means "included, no specific amount called out"; a real
  // value means the modal shows "₹X included" instead of a bare label.
  charge_items: { label: string; included: boolean; amount: string }[];
  waiting_hours_included: string;
  total_booking_amount: string;
  extra_amount: string;
  advance_received: string;
  // "10% CC" toggle (added 2026-09-04) - on by default, unchanged platform
  // commission behavior; off skips admin_profit entirely at trip close
  // (see backend crud/end_records.py's update_end_trip_record).
  apply_commission: boolean;
}

const carTypes = [
  "HATCHBACK",
  "SEDAN_4_PLUS_1",
  "ETIOS_4_PLUS_1",
  "SUV",
  "SUV_6_PLUS_1",
  "SUV_7_PLUS_1",
  "INNOVA",
  "INNOVA_6_PLUS_1",
  "INNOVA_7_PLUS_1",
  "INNOVA_CRYSTA",
  "INNOVA_CRYSTA_6_PLUS_1",
  "INNOVA_CRYSTA_7_PLUS_1"
];


// Car make year requirement: 2008 through the current year, newest first.
const carMakeYears: string[] = (() => {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let y = currentYear; y >= 2008; y--) years.push(String(y));
  return years;
})();

const tripTypes = [
  { value: 'Oneway', label: 'One Way', subtitle: 'Point-to-point intercity drop', minLocations: 2, maxLocations: 2, icon: Car },
  { value: 'Round Trip', label: 'Round Trip', subtitle: 'Return back to pickup location', minLocations: 3, maxLocations: 10, icon: Route },
  { value: 'Multy City', label: 'Multi City', subtitle: 'Travel across multiple cities', minLocations: 3, maxLocations: 10, icon: Truck },
  { value: 'Hourly Rental', label: 'Hourly Rental', subtitle: 'Book cab by hours & km package', minLocations: 1, maxLocations: 1, icon: Timer },
  { value: 'Local', label: 'Local Booking', subtitle: 'Intra-city travel & local drop', minLocations: 2, maxLocations: 2, icon: MapPin },
];


/* ---------------------------------------------------------------
   Custom Calendar Date Picker
--------------------------------------------------------------- */
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
          {/* drag handle */}
          <View style={{width:40,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginBottom:4}}/>

          {/* Header row */}
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12}}>
            <Text style={{fontSize:17,fontWeight:'700',color:'#0F172A'}}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{padding:4}}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Month navigation */}
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,marginBottom:12}}>
            <TouchableOpacity onPress={prevMonth} style={{padding:8,borderRadius:20,backgroundColor:'#F1F5F9'}}>
              <ChevronLeft size={18} color="#1D4ED8" />
            </TouchableOpacity>
            <Text style={{fontSize:16,fontWeight:'700',color:'#1E293B'}}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={{padding:8,borderRadius:20,backgroundColor:'#F1F5F9'}}>
              <ChevronRight size={18} color="#1D4ED8" />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={{flexDirection:'row',paddingHorizontal:16,marginBottom:4}}>
            {DAYS_SHORT.map(d => (
              <View key={d} style={{flex:1,alignItems:'center'}}>
                <Text style={{fontSize:12,fontWeight:'600',color:'#94A3B8'}}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Date grid */}
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

          {/* Selected date display + Confirm */}
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:16,marginTop:4,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:14,color:'#475569',fontWeight:'500'}}>
              {sel.toLocaleDateString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric'})}
            </Text>
            <TouchableOpacity onPress={() => onConfirm(sel)}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius:12}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------------------------------------------
   Custom Scroll-Wheel Time Picker
--------------------------------------------------------------- */
const ITEM_H = 48;
const VISIBLE = 5;

function WheelColumn({ items, selectedIndex, onSelect }: { items: string[]; selectedIndex: number; onSelect: (i: number) => void; }) {
  const ref = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={ref}
      style={{height: ITEM_H * VISIBLE, width: 72}}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{paddingVertical: ITEM_H * 2}}
      onMomentumScrollEnd={e => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
        onSelect(Math.max(0, Math.min(idx, items.length - 1)));
      }}
    >
      {items.map((item, i) => (
        <TouchableOpacity key={i} onPress={() => { onSelect(i); ref.current?.scrollTo({ y: i * ITEM_H, animated: true }); }} activeOpacity={0.7}
          style={{height: ITEM_H, justifyContent:'center', alignItems:'center'}}>
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

          {/* Wheel picker */}
          <View style={{alignItems:'center',paddingVertical:8}}>
            {/* Selection highlight bar - must align with the wheel's own
                vertically-centered (3rd of 5 visible) row. An absolutely
                positioned sibling's `top` is relative to the parent's
                content box, same origin the wheel row itself flows from,
                so this is just "how many full rows sit above the centered
                one" - no extra offset needed. The previous formula added a
                stray +20px, so the highlight band sat 20px below the
                actual selected (larger, bold) value the whole time. */}
            <View style={{position:'absolute',top: ITEM_H * Math.floor(VISIBLE / 2), left:0, right:0, height:ITEM_H,
              backgroundColor:'#EFF6FF', borderTopWidth:1.5, borderBottomWidth:1.5, borderColor:'#BFDBFE'}}/>

            <View style={{flexDirection:'row', alignItems:'center', gap:4}}>
              <WheelColumn items={hours12} selectedIndex={hIdx} onSelect={setHIdx} />
              <Text style={{fontSize:26,fontWeight:'700',color:'#1D4ED8',marginBottom:4}}>:</Text>
              <WheelColumn items={minutes} selectedIndex={mIdx} onSelect={setMIdx} />
              <View style={{width:4}}/>
              <WheelColumn items={periods} selectedIndex={pIdx} onSelect={setPIdx} />
            </View>
          </View>

          {/* Time display + confirm */}
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:12,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:22,fontWeight:'700',color:'#1D4ED8'}}>{displayTime()}</Text>
            <TouchableOpacity onPress={confirm}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius:12}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CreateOrderScreen() {
  const [formData, setFormData] = useState<FormData>({
    // Populated from the logged-in vendor's own profile (see fetchVendorId
    // below) - never hardcode this, it identifies who the order belongs to.
    vendor_id: '',
    trip_type: 'Oneway',
    car_type: 'SEDAN_4_PLUS_1',
    pickup_drop_location: { '0': '', '1': '' },
    location_links: {},
    // Defaults to now + 30 minutes, not the exact current moment - so an
    // urgent booking can be posted right away without first having to open
    // the date/time pickers (kept in sync with Admin/Driver App's default).
    start_date_time: new Date(Date.now() + 30 * 60 * 1000),
    end_date_time: null,
    customer_name: '',
    customer_number: '',
    max_time_hours: '0',
    max_time_minutes: '30',
    live_until: null,
    accept_by_days: '',
    toll_charge_update: true,
    // Regular trip fields
    cost_per_km: '15',
    extra_cost_per_km: '0',
    driver_allowance: '300',
    extra_driver_allowance: '100',
    permit_charges: '0',
    extra_permit_charges: '0',
    hill_charges: '0',
    toll_charges: '0',
    // Hourly rental fields
    package_hours: null,
    cost_per_hour: '',
    extra_cost_per_hour: '',
    cost_for_addon_km: '',
    extra_cost_for_addon_km: '',
    pickup_notes: '',
    send_to: 'ALL',
    near_city: ['ALL'],
    night_charges: '0',
    override_km: '',
    override_trip_time: '',
    require_car_make_year: false,
    car_make_year_requirement: '',
    car_year_charge: '0',
    carrier_required: false,
    carrier_charge: '0',
    non_cng: false,
    non_cng_charge: '0',
    pet_friendly: false,
    pet_friendly_charge: '0',
    priority_for_paid: true,
    priority_cutoff_at: null,
    customer_country_code: '+91',
    fare_type: 'ITEMIZED',
    // Toll is deliberately NOT in this list - it already has its own
    // dedicated toggle in the modal below (formData.toll_charge_update,
    // the same field the Standard/Itemized pricing section uses), so
    // including it here too used to render Toll twice in the same list.
    charge_items: [
      { label: 'State Permit', included: false, amount: '0' },
      { label: 'Parking', included: false, amount: '0' },
      { label: 'Waiting', included: false, amount: '0' },
    ],
    waiting_hours_included: '2',
    total_booking_amount: '',
    extra_amount: '0',
    advance_received: '0',
    apply_commission: true,
  });
  const [newChargeLabel, setNewChargeLabel] = useState('');

  const [showCarTypePicker, setShowCarTypePicker] = useState(false);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [showPriorityCutoffDatePicker, setShowPriorityCutoffDatePicker] = useState(false);
  const [showPriorityCutoffTimePicker, setShowPriorityCutoffTimePicker] = useState(false);
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [showCarPreferencesModal, setShowCarPreferencesModal] = useState(false);
  const [showSpecialRequestsModal, setShowSpecialRequestsModal] = useState(false);
  const [showAdvancedConfigModal, setShowAdvancedConfigModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showChargeItemsModal, setShowChargeItemsModal] = useState(false);
  const [activeLocationField, setActiveLocationField] = useState<string | null>(null);
  const [quoteResponse, setQuoteResponse] = useState<any | null>(null);
  const [orderResponse, setOrderResponse] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Checkbox gate for the optional address/maps-link inputs below each
  // location - off by default so the form stays short; the driver app
  // shows these as a tappable map link when provided.
  const [addLocationLinks, setAddLocationLinks] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showQuoteReview, setShowQuoteReview] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [packageHoursOptions, setPackageHoursOptions] = useState<Array<{hours: number, km_range: number}>>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLiveUntilDatePicker, setShowLiveUntilDatePicker] = useState(false);
  const [showLiveUntilTimePicker, setShowLiveUntilTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [dateMode, setDateMode] = useState<'date' | 'time'>('date');
  const [showPackageHoursPicker, setShowPackageHoursPicker] = useState(false);
  const [localServiceableCities, setLocalServiceableCities] = useState<string[]>([]);
  const [showTargetCityModal, setShowTargetCityModal] = useState(false);
  const [targetCitySearchQuery, setTargetCitySearchQuery] = useState('');
  const [availableCitiesList, setAvailableCitiesList] = useState<string[]>([]);
  const [vendorProfile, setVendorProfile] = useState<{ full_name?: string; business_name?: string; primary_number?: string; allow_vendor_as_customer?: boolean } | null>(null);
  const [isVendorAsCustomer, setIsVendorAsCustomer] = useState(false);

  const fetchCities = async () => {
    try {
      const response = await publicApi.get('/cities/public');
      setAvailableCitiesList(response.data || []);
    } catch (error) {
      console.error('Failed to fetch public cities:', error);
    }
  };

  // Which cities Local Bookings can be posted in (Settings > Local Bookings
  // on the admin side). Off by default outside Tamil Nadu - checked here so
  // the vendor gets an immediate inline warning instead of a round trip to
  // the server before finding out.
  const fetchLocalServiceableCities = async () => {
    try {
      const response = await publicApi.get('/cities/local-serviceable');
      setLocalServiceableCities(response.data || []);
    } catch (error) {
      console.error('Failed to fetch local-serviceable cities:', error);
    }
  };

  const fetchPackageHours = async () => {
    try {
      const response = await publicApi.get('/orders/rental_hrs_data');
      setPackageHoursOptions(response.data);
      console.log('Fetched package hours:', response.data);
    } catch (error) {
      console.error('Failed to fetch package hours:', error);
    }
  };

  // The logged-in vendor's id (same "/users/vendor-details/me" endpoint used
  // by the dashboard/menu screens). This must be the real signed-in vendor,
  // never a hardcoded id, or orders get attributed to the wrong account.
  const fetchVendorId = async () => {
    try {
      const response = await publicApi.get('/users/vendor-details/me');
      const id = response?.data?.id;
      if (id) {
        setFormData(prev => ({ ...prev, vendor_id: id }));
      } else {
        console.error('Vendor details response missing id:', response?.data);
      }
      if (response?.data) {
        setVendorProfile(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch vendor id:', error);
    }
  };

  const handleToggleVendorAsCustomer = () => {
    const nextVal = !isVendorAsCustomer;
    setIsVendorAsCustomer(nextVal);
    if (nextVal && vendorProfile) {
      const name = vendorProfile.full_name || vendorProfile.business_name || '';
      let phone = (vendorProfile.primary_number || '').replace(/[^0-9]/g, '');
      if (phone.startsWith('91') && phone.length > 10) phone = phone.slice(2);
      else if (phone.startsWith('0') && phone.length > 10) phone = phone.slice(1);
      phone = phone.slice(0, 10);

      handleInputChange('customer_name', name);
      handleInputChange('customer_number', phone);
      handleInputChange('customer_country_code', '+91');
    }
  };

  useEffect(() => {
    fetchPackageHours();
    fetchVendorId();
    fetchLocalServiceableCities();
    fetchCities();
  }, []);

  const handleDateChange = (event: any, selectedDate?: Date) => {
  setShowDatePicker(false);
  if (selectedDate) {
    // Combine selected date with existing time
    const currentDateTime = formData.start_date_time;
    const newDate = new Date(selectedDate);
    newDate.setHours(currentDateTime.getHours());
    newDate.setMinutes(currentDateTime.getMinutes());
    handleInputChange('start_date_time', newDate);
  }
};

const handleTimeChange = (event: any, selectedTime?: Date) => {
  setShowTimePicker(false);
  if (selectedTime) {
    // Combine selected time with existing date
    const currentDateTime = formData.start_date_time;
    const newDateTime = new Date(currentDateTime);
    newDateTime.setHours(selectedTime.getHours());
    newDateTime.setMinutes(selectedTime.getMinutes());
    handleInputChange('start_date_time', newDateTime);
  }
};

// "Keep booking live until" - defaults to pickup time + 15 minutes until the
// vendor picks an exact date & time.
const getEffectiveLiveUntil = (): Date =>
  formData.live_until ?? new Date(formData.start_date_time.getTime() + 15 * 60 * 1000);

const handleLiveUntilDateChange = (event: any, selectedDate?: Date) => {
  setShowLiveUntilDatePicker(false);
  if (selectedDate) {
    const current = getEffectiveLiveUntil();
    const newDate = new Date(selectedDate);
    newDate.setHours(current.getHours());
    newDate.setMinutes(current.getMinutes());
    handleInputChange('live_until', newDate);
  }
};

const handleLiveUntilTimeChange = (event: any, selectedTime?: Date) => {
  setShowLiveUntilTimePicker(false);
  if (selectedTime) {
    const newDateTime = new Date(getEffectiveLiveUntil());
    newDateTime.setHours(selectedTime.getHours());
    newDateTime.setMinutes(selectedTime.getMinutes());
    handleInputChange('live_until', newDateTime);
  }
};

// Priority window default: midpoint between now and pickup for scheduled
// bookings; a 5-minute floor (never later than pickup) for immediate ones.
const getDefaultsForCarType = (carType: string, tripType?: string) => {
  const t = (carType || '').toUpperCase();
  const isRoundTrip = tripType === 'Round Trip' || tripType === 'roundtrip';
  if (t.includes('CRYSTA')) {
    return {
      cost_per_km: isRoundTrip ? '22' : '23',
      extra_cost_per_km: '0',
      driver_allowance: isRoundTrip ? '400' : '300',
      extra_driver_allowance: '0',
    };
  }
  if (t.includes('INNOVA')) {
    return {
      cost_per_km: isRoundTrip ? '20' : '21',
      extra_cost_per_km: '0',
      driver_allowance: isRoundTrip ? '400' : '300',
      extra_driver_allowance: '0',
    };
  }
  if (t.includes('SUV')) {
    return {
      cost_per_km: isRoundTrip ? '19' : '20',
      extra_cost_per_km: '0',
      driver_allowance: '300',
      extra_driver_allowance: '0',
    };
  }
  if (t.includes('ETIOS')) {
    return {
      cost_per_km: isRoundTrip ? '14' : '15',
      extra_cost_per_km: '0',
      driver_allowance: '300',
      extra_driver_allowance: '0',
    };
  }
  // Sedan / Hatchback / Default
  return {
    cost_per_km: isRoundTrip ? '14' : '15',
    extra_cost_per_km: '0',
    driver_allowance: '300',
    extra_driver_allowance: '0',
  };
};

const getEffectivePriorityCutoff = (): Date => {
  if (formData.priority_cutoff_at) return formData.priority_cutoff_at;
  const now = new Date();
  const pickup = formData.start_date_time;
  if (pickup.getTime() <= now.getTime()) {
    return new Date(now.getTime() + 5 * 60 * 1000);
  }
  const midpoint = new Date(now.getTime() + (pickup.getTime() - now.getTime()) / 2);
  const floor = new Date(now.getTime() + 5 * 60 * 1000);
  let candidate = midpoint.getTime() > floor.getTime() ? midpoint : floor;

  // IST Night Sleep Protection (10:00 PM - 7:00 AM IST)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const cutoffIst = new Date(candidate.getTime() + istOffsetMs);
  const istHours = cutoffIst.getUTCHours();

  if (istHours >= 22 || istHours < 7) {
    const morningIst = new Date(cutoffIst);
    if (istHours >= 22) {
      morningIst.setUTCDate(morningIst.getUTCDate() + 1);
    }
    morningIst.setUTCHours(7, 0, 0, 0); // 7:00 AM IST
    candidate = new Date(morningIst.getTime() - istOffsetMs);
  }

  // Safety Lead-Time Buffer: Lock MUST expire at least 2 hours before pickup time
  const twoHoursBeforePickup = new Date(pickup.getTime() - 2 * 60 * 60 * 1000);
  const safeCutoff = candidate.getTime() < twoHoursBeforePickup.getTime() ? candidate : twoHoursBeforePickup;

  const bounded = safeCutoff.getTime() > floor.getTime() ? safeCutoff : floor;
  return bounded.getTime() < pickup.getTime() ? bounded : pickup;
};

const handlePriorityCutoffDateChange = (event: any, selectedDate?: Date) => {
  setShowPriorityCutoffDatePicker(false);
  if (selectedDate) {
    const current = getEffectivePriorityCutoff();
    const newDate = new Date(selectedDate);
    newDate.setHours(current.getHours());
    newDate.setMinutes(current.getMinutes());
    handleInputChange('priority_cutoff_at', newDate);
  }
};

const handlePriorityCutoffTimeChange = (event: any, selectedTime?: Date) => {
  setShowPriorityCutoffTimePicker(false);
  if (selectedTime) {
    const newDateTime = new Date(getEffectivePriorityCutoff());
    newDateTime.setHours(selectedTime.getHours());
    newDateTime.setMinutes(selectedTime.getMinutes());
    handleInputChange('priority_cutoff_at', newDateTime);
  }
};

// Round Trip "Return Date & Time" / Multi City "Drop Date & Time" - default
// is the same date as pickup at 9:30 PM until the vendor picks one.
const getEffectiveEndDateTime = (): Date => {
  if (formData.end_date_time) return formData.end_date_time;
  const d = new Date(formData.start_date_time);
  d.setHours(21, 30, 0, 0);
  return d;
};

const handleEndDateChange = (event: any, selectedDate?: Date) => {
  setShowEndDatePicker(false);
  if (selectedDate) {
    const current = getEffectiveEndDateTime();
    const newDate = new Date(selectedDate);
    newDate.setHours(current.getHours());
    newDate.setMinutes(current.getMinutes());
    handleInputChange('end_date_time', newDate);
  }
};

const handleEndTimeChange = (event: any, selectedTime?: Date) => {
  setShowEndTimePicker(false);
  if (selectedTime) {
    const newDateTime = new Date(getEffectiveEndDateTime());
    newDateTime.setHours(selectedTime.getHours());
    newDateTime.setMinutes(selectedTime.getMinutes());
    handleInputChange('end_date_time', newDateTime);
  }
};

  // Auto-populate return location for round trip
  useEffect(() => {
    if (formData.trip_type === 'Round Trip') {
      const locations = getLocationKeys();
      const lastLocationIndex = (locations.length - 1).toString();
      const firstLocation = formData.pickup_drop_location['0'];
      
      if (firstLocation && locations.length > 1) {
        setFormData(prev => ({
          ...prev,
          pickup_drop_location: {
            ...prev.pickup_drop_location,
            [lastLocationIndex]: firstLocation
          }
        }));
      }
    }
  }, [formData.trip_type, formData.pickup_drop_location['0']]);

  const getCurrentTripType = () => {
    return tripTypes.find(type => type.value === formData.trip_type) || tripTypes[0];
  };

  const getLocationKeys = () => {
    return Object.keys(formData.pickup_drop_location).sort((a, b) => parseInt(a) - parseInt(b));
  };

  const getLocationLabel = (index: string) => {
    const keys = getLocationKeys();
    const position = keys.indexOf(index);
    const tripType = getCurrentTripType();
    
    if (tripType.value === 'Hourly Rental') return 'Pickup Location';
    if (position === 0) return 'Pickup Location';
    if (tripType.value === 'Round Trip' && position === keys.length - 1) return 'Return to Pickup';
    if (position === keys.length - 1) return 'Final Destination';
    return `Stop ${position}`;
  };

  const addLocation = () => {
    const keys = getLocationKeys();
    const nextIndex = keys.length.toString();
    const maxLocations = getCurrentTripType().maxLocations;
    
    if (keys.length < maxLocations) {
      const newLocations = {
        ...formData.pickup_drop_location,
        [nextIndex]: ''
      };
      
      // For round trip, auto-populate the last location with pickup location
      if (formData.trip_type === 'Round Trip' && formData.pickup_drop_location['0']) {
        const lastIndex = (keys.length).toString();
        newLocations[lastIndex] = formData.pickup_drop_location['0'];
      }
      
      setFormData(prev => ({
        ...prev,
        pickup_drop_location: newLocations
      }));
    }
  };

  const removeLocation = (index: string) => {
    const keys = getLocationKeys();
    if (keys.length > getCurrentTripType().minLocations) {
      const newLocations = { ...formData.pickup_drop_location };
      delete newLocations[index];
      
      // Reindex remaining locations
      const remaining = Object.entries(newLocations)
        .sort(([a], [b]) => parseInt(a) - parseInt(b));
      
      const reindexed: { [key: string]: string } = {};
      remaining.forEach(([, value], i) => {
        reindexed[i.toString()] = value;
      });

      // For round trip, auto-populate the last location with pickup location
      if (formData.trip_type === 'Round Trip' && reindexed['0'] && Object.keys(reindexed).length > 1) {
        const lastIndex = (Object.keys(reindexed).length - 1).toString();
        reindexed[lastIndex] = reindexed['0'];
      }

      setFormData(prev => ({
        ...prev,
        pickup_drop_location: reindexed
      }));
    }
  };

  const moveLocation = (fromIndex: number, toIndex: number) => {
    const keys = getLocationKeys();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= keys.length || toIndex >= keys.length) {
      return;
    }

    const newKeys = [...keys];
    const [movedKey] = newKeys.splice(fromIndex, 1);
    newKeys.splice(toIndex, 0, movedKey);

    const reindexed: { [key: string]: string } = {};
    newKeys.forEach((key, i) => {
      reindexed[i.toString()] = formData.pickup_drop_location[key];
    });

    // For round trip, auto-populate the last location with pickup location
    if (formData.trip_type === 'Round Trip' && reindexed['0']) {
      const lastIndex = (Object.keys(reindexed).length - 1).toString();
      reindexed[lastIndex] = reindexed['0'];
    }

    setFormData(prev => ({
      ...prev,
      pickup_drop_location: reindexed
    }));
  };

  const canReorderLocations = () => {
    const tripType = getCurrentTripType();
    return tripType.value === 'Round Trip' || tripType.value === 'Multy City';
  };

  const handleTripTypeChange = (tripType: string) => {
    const newTripType = tripTypes.find(type => type.value === tripType)!;
    let newLocations: { [key: string]: string } = {};
    if (newTripType.value === 'Hourly Rental') {
      newLocations = { '0': ''};
    } else if (newTripType.value === 'Round Trip') {
      newLocations = { '0': '', '1': ''};
    } else if (newTripType.value === 'Multicity') {
      newLocations = { '0': '', '1': ''};
    } else {
      newLocations = { '0': '', '1': ''};
    }
    
    setFormData(prev => ({
      ...prev,
      trip_type: tripType,
      pickup_drop_location: newLocations
    }));
  };

  // These amount fields start at '0' (a real default value, not just a
  // placeholder), so typing into them appended onto that leading zero
  // ("1" typed after "0" became the string "01") instead of replacing it -
  // strips a leading zero the same way a fresh empty field would behave.
  const stripLeadingZero = (value: string) => value.replace(/^0+(?=\d)/, '');

  const handleInputChange = (field: keyof FormData, value: string | Date | boolean | { hours: number; km_range: number } | null | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // All-Inclusive means all-inclusive: switching into it should default
  // every charge (Toll + the whole Included/Extra Charges list) to
  // "bundled into the total price" rather than making the vendor manually
  // toggle each one on - they can still turn individual items off to flag
  // them as collected extra from the customer.
  const handleFareTypeChange = (ft: 'ALL_INCLUSIVE' | 'ITEMIZED') => {
    setFormData(prev => ({
      ...prev,
      fare_type: ft,
      ...(ft === 'ALL_INCLUSIVE' ? {
        toll_charge_update: false,
        charge_items: prev.charge_items.map(item => ({ ...item, included: true })),
      } : {}),
    }));
  };

  const parsePhoneAndCountryCode = (
    rawInput: string,
    defaultCountryCode = '+91'
  ): { countryCode: string; nationalNumber: string } => {
    if (!rawInput) return { countryCode: defaultCountryCode, nationalNumber: '' };
    const trimmed = rawInput.trim();

    // 1. Starts with + and has space/separator (e.g. "+91 8838480505", "+91-8838480505", "+1 (555) 234-5678")
    const separatedMatch = trimmed.match(/^\+(\d{1,4})[\s\-\(\)\.\/]+(.*)$/);
    if (separatedMatch) {
      const code = `+${separatedMatch[1]}`;
      let num = separatedMatch[2].replace(/\D/g, '');
      if (code === '+91') num = num.slice(0, 10);
      else num = num.slice(0, 15);
      return { countryCode: code, nationalNumber: num };
    }

    // 2. Starts with + without space (e.g. "+918838480505", "+15552345678")
    if (trimmed.startsWith('+')) {
      const digitsOnly = trimmed.slice(1).replace(/\D/g, '');
      if (digitsOnly.startsWith('91') && digitsOnly.length >= 12) {
        return { countryCode: '+91', nationalNumber: digitsOnly.slice(2, 12) };
      }
      if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
        return { countryCode: '+1', nationalNumber: digitsOnly.slice(1, 11) };
      }
      if (digitsOnly.startsWith('44') && digitsOnly.length >= 12) {
        return { countryCode: '+44', nationalNumber: digitsOnly.slice(2, 14) };
      }
      if (digitsOnly.startsWith('971') && digitsOnly.length >= 12) {
        return { countryCode: '+971', nationalNumber: digitsOnly.slice(3, 12) };
      }
      if (digitsOnly.startsWith('65') && digitsOnly.length === 10) {
        return { countryCode: '+65', nationalNumber: digitsOnly.slice(2, 10) };
      }
      if (digitsOnly.startsWith('60') && digitsOnly.length >= 11) {
        return { countryCode: '+60', nationalNumber: digitsOnly.slice(2, 12) };
      }
      if (digitsOnly.length === 10) {
        return { countryCode: defaultCountryCode || '+91', nationalNumber: digitsOnly };
      }
    }

    // 3. Starts with international 00 prefix (e.g. "00918838480505")
    if (trimmed.startsWith('00')) {
      const digits = trimmed.slice(2).replace(/\D/g, '');
      if (digits.startsWith('91') && digits.length >= 12) {
        return { countryCode: '+91', nationalNumber: digits.slice(2, 12) };
      }
    }

    // 4. Plain digits with 91 or 0 prefix (e.g. "918838480505", "08838480505", "88384 80505")
    let cleanDigits = trimmed.replace(/\D/g, '');
    if (cleanDigits.startsWith('91') && cleanDigits.length === 12) {
      return { countryCode: '+91', nationalNumber: cleanDigits.slice(2, 12) };
    }
    if (cleanDigits.startsWith('0') && cleanDigits.length === 11) {
      return { countryCode: '+91', nationalNumber: cleanDigits.slice(1, 11) };
    }

    // 5. Standard national number input
    const isIndia = (defaultCountryCode || '+91').trim() === '+91';
    const national = isIndia ? cleanDigits.slice(0, 10) : cleanDigits.slice(0, 15);
    return { countryCode: defaultCountryCode || '+91', nationalNumber: national };
  };

  // Indian numbers (+91) are always exactly 10 digits - any other country
  // code allows 8-15 (international numbers vary in length).
  const isIndianNumber = (formData.customer_country_code || '+91').replace(/\D/g, '') === '91';
  const phoneMaxLen = isIndianNumber ? 10 : 15;
  const phoneMinLen = isIndianNumber ? 10 : 8;

  const handleCountryCodeChange = (text: string) => {
    if (text.length > 5 || text.includes(' ')) {
      const parsed = parsePhoneAndCountryCode(text, formData.customer_country_code || '+91');
      handleInputChange('customer_country_code', parsed.countryCode);
      if (parsed.nationalNumber) {
        handleInputChange('customer_number', parsed.nationalNumber);
      }
      return;
    }
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    handleInputChange('customer_country_code', digits ? `+${digits}` : '');
  };

  const handleCustomerPhoneChange = (rawText: string) => {
    const parsed = parsePhoneAndCountryCode(rawText, formData.customer_country_code || '+91');
    if (parsed.countryCode && parsed.countryCode !== formData.customer_country_code) {
      handleInputChange('customer_country_code', parsed.countryCode);
    }
    handleInputChange('customer_number', parsed.nationalNumber);
  };

  const handleLocationChange = (index: string, value: string) => {
    const newLocations = {
      ...formData.pickup_drop_location,
      [index]: value
    };

    // For round trip, auto-populate the last location with pickup location
    if (formData.trip_type === 'Round Trip' && index === '0') {
      const keys = getLocationKeys();
      const lastIndex = (keys.length - 1).toString();
      if (keys.length > 1) {
        newLocations[lastIndex] = value;
      }
    }

    // Address/maps link field: prefilled with the city name. Keep it in
    // sync with the city as long as the vendor hasn't customized it (i.e.
    // it's still blank or still matches the previous city text).
    const newLinks = { ...formData.location_links };
    const prevCity = formData.pickup_drop_location[index] || '';
    if (!newLinks[index] || newLinks[index] === prevCity) {
      newLinks[index] = value;
    }
    if (formData.trip_type === 'Round Trip' && index === '0') {
      const keys = getLocationKeys();
      const lastIndex = (keys.length - 1).toString();
      const prevLastCity = formData.pickup_drop_location[lastIndex] || '';
      if (keys.length > 1 && (!newLinks[lastIndex] || newLinks[lastIndex] === prevLastCity)) {
        newLinks[lastIndex] = value;
      }
    }

    setFormData(prev => ({
      ...prev,
      pickup_drop_location: newLocations,
      location_links: newLinks,
    }));
  };

  const openLocationPicker = (index: string) => {
    // For round trip return location, don't allow editing
    const keys = getLocationKeys();
    const position = keys.indexOf(index);
    if (formData.trip_type === 'Round Trip' && position === keys.length - 1) {
      Alert.alert('Info', 'Return location is automatically set to pickup location for round trip');
      return;
    }
    
    setActiveLocationField(index);
    setShowLocationPicker(true);
  };

  const handleDateTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
    
    if (selectedDate) {
      handleInputChange('start_date_time', selectedDate);
    }
  };

  const showDateTimePicker = (mode: 'date' | 'time') => {
    setDateMode(mode);
    if (mode === 'date') {
      setShowDatePicker(true);
    } else {
      setShowTimePicker(true);
    }
  };

  const getQuote = async () => {
    // Clear any distance override left over from a previous quote attempt -
    // it belongs to that quote, not this fresh calculation.
    if (formData.override_km) {
      setFormData(prev => ({ ...prev, override_km: '', override_trip_time: '' }));
    }
    // Validation
    if (!formData.customer_name.trim()) {
      Alert.alert('Error', 'Please enter customer name');
      return;
    }
    if (!formData.customer_number.trim()) {
      Alert.alert('Error', 'Please enter customer number');
      return;
    }
    if (formData.customer_number.trim().length < phoneMinLen || formData.customer_number.trim().length > phoneMaxLen) {
      Alert.alert(
        'Error',
        isIndianNumber
          ? 'Indian mobile numbers (+91) must be exactly 10 digits'
          : `Mobile number must be ${phoneMinLen}-${phoneMaxLen} digits for country code ${formData.customer_country_code}`
      );
      return;
    }

    const locationKeys = getLocationKeys();
    for (const key of locationKeys) {
      if (!formData.pickup_drop_location[key]) {
        Alert.alert('Error', `Please enter ${getLocationLabel(key).toLowerCase()}`);
        return;
      }
    }
    
    if (formData.trip_type === 'Local') {
      const pickupCity = formData.pickup_drop_location['0']?.trim();
      const isServiceable = localServiceableCities.some(
        (c) => c.toLowerCase() === pickupCity?.toLowerCase()
      );
      if (!isServiceable) {
        Alert.alert(
          'Not Available Here',
          `Local Bookings aren't enabled for "${pickupCity}" yet. Available cities: ${localServiceableCities.join(', ') || 'none configured'}`
        );
        return;
      }
    }

    // Different validation for hourly rental vs regular trips
    if (formData.trip_type === 'Hourly Rental') {
      if (!formData.package_hours) {
        Alert.alert('Error', 'Please select package hours');
        return;
      }
      if (!formData.cost_per_hour) {
        Alert.alert('Error', 'Please enter cost per hour');
        return;
      }
    } else {
      if (formData.fare_type !== 'ALL_INCLUSIVE' && !formData.cost_per_km) {
        Alert.alert('Error', 'Please enter cost per km');
        return;
      }
    }

    if (formData.fare_type === 'ALL_INCLUSIVE' && (!formData.total_booking_amount || parseFloat(formData.total_booking_amount) <= 0)) {
      Alert.alert('Error', 'Please enter a valid Total Booking Amount for All-Inclusive fare');
      return;
    }

    setIsLoading(true);
    
    try {
      let quoteResponse;
      
      if (formData.trip_type === 'Hourly Rental') {
        // Use hourly rental API
        console.log('Fetching hourly rental quote...',formData);
        const apiData = formatHourlyOrderData(formData);
        console.log('Formatted Hourly API Data:', apiData);
        quoteResponse = await getHourlyQuote(apiData);
      } else {
        // Use regular trip API
        const apiData = formatOrderData(formData);
        console.log('Formatted Regular API Data:', apiData);
        quoteResponse = await getQuoteAPI(apiData);
      }
      
      setQuoteResponse(quoteResponse);
      setShowQuoteReview(true);
    } catch (error: any) {
      console.error('Error creating quote:', error);
      const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Unknown error occurred';
      Alert.alert('Error', `Failed to generate quote: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // const confirmOrder = async (sendTo: string, nearCity?: string) => {
  //   setIsLoading(true);
    
  //   try {
  //     let orderResponse;
      
  //     if (formData.trip_type === 'Hourly Rental') {
  //       // Use hourly rental confirm API
  //       const apiData = formatHourlyOrderData(formData, sendTo, nearCity);
  //       orderResponse = await confirmHourlyOrder(apiData);
  //     } else {
  //       // Use regular trip confirm API
  //       const apiData = formatOrderData(formData, sendTo, nearCity);
  //       orderResponse = await confirmOrderAPI(apiData);
  //     }
      
  //     setOrderResponse(orderResponse);
  //     setShowQuoteReview(false);
  //     setShowOrderSuccess(true);
      
  //   } catch (error: any) {
  //     console.error('Error confirming order:', error);
  //     const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
  //     Alert.alert('Error', `Failed to create order: ${errorMessage}`);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const confirmOrder = async (sendTo: string, nearCity?: string[]) => { // Change to string[]
  if (!formData.vendor_id) {
    Alert.alert('Error', 'Could not verify your vendor account yet. Please wait a moment and try again, or restart the app.');
    return;
  }
  setIsLoading(true);

  try {
    let orderResponse;
    
    if (formData.trip_type === 'Hourly Rental') {
      // Use hourly rental confirm API
      const apiData = formatHourlyOrderData(formData, sendTo, nearCity); // Pass array
      orderResponse = await confirmHourlyOrder(apiData);
    } else {
      // Use regular trip confirm API
      const apiData = formatOrderData(formData, sendTo, nearCity); // Pass array
      orderResponse = await confirmOrderAPI(apiData);
    }
    
    setOrderResponse(orderResponse);
    setShowQuoteReview(false);
    setShowOrderSuccess(true);
    
  } catch (error: any) {
    console.error('Error confirming order:', error);
    const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Unknown error occurred';
    Alert.alert('Error', `Failed to create Booking: ${errorMessage}`);
  } finally {
    setIsLoading(false);
  }
};

  const formatDateTime = (date: Date) => {
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

  const getTripTypeIcon = () => {
    const tripType = getCurrentTripType();
    const IconComponent = tripType.icon;
    return <IconComponent size={32} color="#FFFFFF" />;
  };

  const getTripTypeColors = (): [ColorValue, ColorValue, ...ColorValue[]] => {
    if (formData.trip_type === 'Hourly Rental') {
      return ['#8B5A3C', '#A0522D', '#CD853F'];
    }
    // All other trip types use the same blue color scheme
    return ['#1E40AF', '#3B82F6', '#60A5FA'];
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create {formData.trip_type} Booking</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. Trip Type Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <Route size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Trip Type</Text>
          </View>
          
          <TouchableOpacity
            style={styles.summaryCardTouchable}
            onPress={() => setShowTripTypePicker(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={styles.summaryIconCircle}>
                <Route size={20} color="#1D4ED8" />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={styles.summaryTitle}>{getCurrentTripType().label}</Text>
                <Text style={styles.summarySubtitle}>{getCurrentTripType().subtitle}</Text>
              </View>
            </View>
            <View style={styles.editPillButton}>
              <Text style={styles.editPillText}>Change</Text>
              <ChevronRight size={14} color="#1D4ED8" />
            </View>
          </TouchableOpacity>
        </View>

        {/* 2. Locations & Schedule Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <MapPin size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Locations & Schedule ({getLocationKeys().length})</Text>
            {canReorderLocations() && (
              <Text style={styles.reorderHint}>Use ↑↓ to reorder</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.locationLinkToggleRow}
            onPress={() => {
              const nextVal = !addLocationLinks;
              setAddLocationLinks(nextVal);
              if (!nextVal) {
                setFormData(prev => ({ ...prev, location_links: {} }));
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.locationLinkToggleText}>
              Add address / Google Maps link (optional)
            </Text>
            <Switch
              value={addLocationLinks}
              onValueChange={(v) => {
                setAddLocationLinks(v);
                if (!v) {
                  setFormData(prev => ({ ...prev, location_links: {} }));
                }
              }}
              trackColor={{ false: '#E2E8F0', true: '#3B82F6' }}
              thumbColor={addLocationLinks ? '#FFFFFF' : '#94A3B8'}
            />
          </TouchableOpacity>

          {getLocationKeys().map((index, position) => (
            <View key={index}>
              <Text style={styles.fieldLabel}>{getLocationLabel(index)} *</Text>
              <View style={styles.locationItem}>
                <View style={styles.locationNumberContainer}>
                  <Text style={styles.locationNumber}>{parseInt(index) + 1}</Text>
                </View>
                
                <TouchableOpacity
                  style={styles.locationInputContainer}
                  onPress={() => openLocationPicker(index)}
                >
                  <View style={styles.locationTextContainer}>
                    <Text style={[
                      styles.locationInputText, 
                      formData.pickup_drop_location[index] ? styles.locationInputTextActive : styles.locationInputTextPlaceholder
                    ]}>
                      {formData.pickup_drop_location[index] || 'Tap to select location'}
                    </Text>
                  </View>
                  <MapPin size={18} color="#1D4ED8" />
                </TouchableOpacity>

                {canReorderLocations() && (
                  <View style={styles.reorderControls}>
                    <TouchableOpacity 
                      style={[styles.reorderButton, parseInt(index) === 0 && styles.disabledReorderButton]}
                      onPress={() => {
                        const currentIndex = parseInt(index);
                        if (currentIndex > 0) {
                          moveLocation(currentIndex, currentIndex - 1);
                        }
                      }}
                      disabled={parseInt(index) === 0}
                    >
                      <ChevronUp size={14} color={parseInt(index) === 0 ? "#94A3B8" : "#64748B"} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.reorderButton, parseInt(index) === getLocationKeys().length - 1 && styles.disabledReorderButton]}
                      onPress={() => {
                        const currentIndex = parseInt(index);
                        const keys = getLocationKeys();
                        if (currentIndex < keys.length - 1) {
                          moveLocation(currentIndex, currentIndex + 1);
                        }
                      }}
                      disabled={parseInt(index) === getLocationKeys().length - 1}
                    >
                      <ChevronDownIcon size={14} color={parseInt(index) === getLocationKeys().length - 1 ? "#94A3B8" : "#64748B"} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {addLocationLinks && (
                <TextInput
                  style={styles.addressLinkInput}
                  value={formData.location_links[index] ?? formData.pickup_drop_location[index] ?? ''}
                  onChangeText={(text) => {
                    setFormData(prev => ({
                      ...prev,
                      location_links: { ...prev.location_links, [index]: text },
                    }));
                  }}
                  placeholder="Address or Google Maps link (optional)"
                  placeholderTextColor="#94A3B8"
                />
              )}
            </View>
          ))}

          {getLocationKeys().length < getCurrentTripType().maxLocations && (
            <TouchableOpacity onPress={addLocation} style={styles.addLocationButton}>
              <Text style={styles.addLocationText}>+ Add Stop</Text>
            </TouchableOpacity>
          )}

          {/* Date & Time Selection */}
          <View style={[styles.row, { marginTop: 16 }]}>
            <View style={[styles.halfWidth, { marginRight: 8 }]}>
              <Text style={styles.fieldLabel}>Start Date *</Text>
              <TouchableOpacity 
                style={styles.inputContainer}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Calendar size={18} color="#64748B" style={styles.inputIcon} />
                <Text style={styles.pickerButtonText}>
                  {formatDateTime(formData.start_date_time).date}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.halfWidth, { marginLeft: 8 }]}>
              <Text style={styles.fieldLabel}>Start Time *</Text>
              <TouchableOpacity
                style={styles.inputContainer}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
              >
                <Clock size={18} color="#64748B" style={styles.inputIcon} />
                <Text style={styles.pickerButtonText}>
                  {formatDateTime(formData.start_date_time).time}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {(formData.trip_type === 'Round Trip' || formData.trip_type === 'Multy City') && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                {formData.trip_type === 'Round Trip' ? 'Return Date & Time' : 'Drop Date & Time'}
              </Text>
              <View style={styles.row}>
                <View style={[styles.halfWidth, { marginRight: 8 }]}>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setShowEndDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Calendar size={18} color="#64748B" style={styles.inputIcon} />
                    <Text style={styles.pickerButtonText}>
                      {formatDateTime(getEffectiveEndDateTime()).date}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setShowEndTimePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Clock size={18} color="#64748B" style={styles.inputIcon} />
                    <Text style={styles.pickerButtonText}>
                      {formatDateTime(getEffectiveEndDateTime()).time}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.fieldHint}>
                {formData.trip_type === 'Round Trip'
                  ? 'When the car returns to pickup. Default: same day, 9:30 PM. A later date means a multi-day trip - minimum km and driver allowance scale per day.'
                  : 'When the trip ends at the final drop. Default: same day, 9:30 PM. A later date means a multi-day trip - minimum km and driver allowance scale per day.'}
              </Text>
            </>
          )}
        </View>

        {/* Native Date Pickers */}
        {/* -- Custom Date Picker Modal -- (start date, drop date and the Trusted-Partners window end;
            the priority-window buttons used to set a flag that nothing rendered, so tapping did nothing) */}
        <CustomDatePickerModal
          visible={showDatePicker || showEndDatePicker || showPriorityCutoffDatePicker}
          title={showDatePicker ? 'Select Start Date' : showPriorityCutoffDatePicker ? 'Priority window end date' : 'Select Drop Date'}
          initialDate={showDatePicker ? formData.start_date_time : showPriorityCutoffDatePicker ? getEffectivePriorityCutoff() : getEffectiveEndDateTime()}
          minimumDate={showDatePicker || showPriorityCutoffDatePicker ? new Date() : formData.start_date_time}
          onConfirm={(date) => {
            if (showDatePicker) { handleDateChange(null as any, date); setShowDatePicker(false); }
            else if (showPriorityCutoffDatePicker) { handlePriorityCutoffDateChange(null as any, date); }
            else { handleEndDateChange(null as any, date); setShowEndDatePicker(false); }
          }}
          onClose={() => { setShowDatePicker(false); setShowEndDatePicker(false); setShowPriorityCutoffDatePicker(false); }}
        />

        {/* -- Custom Time Picker Modal -- */}
        <CustomTimePickerModal
          visible={showTimePicker || showEndTimePicker || showPriorityCutoffTimePicker}
          title={showTimePicker ? 'Select Start Time' : showPriorityCutoffTimePicker ? 'Priority window end time' : 'Select Drop Time'}
          initialDate={showTimePicker ? formData.start_date_time : showPriorityCutoffTimePicker ? getEffectivePriorityCutoff() : getEffectiveEndDateTime()}
          onConfirm={(date) => {
            if (showTimePicker) { handleTimeChange(null as any, date); setShowTimePicker(false); }
            else if (showPriorityCutoffTimePicker) { handlePriorityCutoffTimeChange(null as any, date); }
            else { handleEndTimeChange(null as any, date); setShowEndTimePicker(false); }
          }}
          onClose={() => { setShowTimePicker(false); setShowEndTimePicker(false); setShowPriorityCutoffTimePicker(false); }}
        />

        {/* 3. Car & Preferences Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <Car size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Car & Vehicle Preferences</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryCardTouchable}
            onPress={() => setShowCarPreferencesModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={styles.summaryIconCircle}>
                <Car size={20} color="#1D4ED8" />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={styles.summaryTitle}>
                  {formData.car_type ? formData.car_type.replace(/_/g, ' ').replace(/PLUS/g, '+') : 'Select Car Type'}
                </Text>
                <Text style={styles.summarySubtitle}>
                  10% CC: {formData.apply_commission ? 'Active' : 'Off'}
                </Text>
              </View>
            </View>
            <View style={styles.editPillButton}>
              <Edit3 size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
              <Text style={styles.editPillText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 4. Fare Type Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <IndianRupee size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Fare Type</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
            {(['ITEMIZED', 'ALL_INCLUSIVE'] as const).map((ft) => (
              <TouchableOpacity
                key={ft}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: formData.fare_type === ft ? '#2563EB' : '#E2E8F0',
                  backgroundColor: formData.fare_type === ft ? '#EFF6FF' : '#FFFFFF',
                }}
                onPress={() => handleFareTypeChange(ft)}
              >
                <Text style={{
                  fontSize: 13.5,
                  fontWeight: '700',
                  color: formData.fare_type === ft ? '#1D4ED8' : '#64748B',
                }}>
                  {ft === 'ITEMIZED' ? 'Standard' : 'All Inclusive'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 5. Pricing Details Section */}
        {formData.fare_type === 'ALL_INCLUSIVE' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.iconBadge}>
                <IndianRupee size={18} color="#1D4ED8" />
              </View>
              <Text style={styles.sectionTitle}>All Inclusive Pricing</Text>
            </View>

            <Text style={styles.fieldLabel}>Total Booking Amount (₹) *</Text>
            <View style={styles.inputContainer}>
              <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Flat amount for the driver, e.g. 10000"
                value={formData.total_booking_amount}
                onChangeText={(value) => handleInputChange('total_booking_amount', value)}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.fieldLabel}>Extra Amount (Your Markup, Optional)</Text>
            <View style={styles.inputContainer}>
              <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="0"
                value={formData.extra_amount}
                onChangeText={(value) => handleInputChange('extra_amount', value)}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Included & Extra Charges Summary Card */}
            <View style={{ marginTop: 14 }}>
              <Text style={styles.fieldLabel}>Included & Extra Charges</Text>
              <TouchableOpacity
                style={styles.summaryCardTouchable}
                onPress={() => setShowChargeItemsModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.summaryCardLeft}>
                  <View style={styles.summaryIconCircle}>
                    <IndianRupee size={20} color="#1D4ED8" />
                  </View>
                  <View style={styles.summaryTextContent}>
                    <Text style={styles.summaryTitle}>
                      {(() => {
                        const excludedCount = (formData.toll_charge_update ? 1 : 0) + formData.charge_items.filter(i => !i.included).length;
                        return excludedCount === 0 ? 'All Charges Included' : `${excludedCount} Extra Charge${excludedCount > 1 ? 's' : ''}`;
                      })()}
                    </Text>
                    <Text style={styles.summarySubtitle} numberOfLines={1}>
                      {(() => {
                        const excluded: string[] = [];
                        if (formData.toll_charge_update) excluded.push('Toll');
                        formData.charge_items.filter(i => !i.included).forEach(i => excluded.push(i.label));
                        return excluded.length === 0
                          ? 'Toll, Permit, Parking, Waiting bundled'
                          : `Collected Extra: ${excluded.join(', ')}`;
                      })()}
                    </Text>
                  </View>
                </View>
                <View style={styles.editPillButton}>
                  <Sliders size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
                  <Text style={styles.editPillText}>Manage</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Waiting Hours Included field removed - "Waiting" is already
                one of the Included & Extra Charges items above, with its
                own amount field; a separate standalone hours count here
                was redundant. formData.waiting_hours_included keeps its
                '2' default and is still submitted as before. */}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Advance Received (₹)</Text>
            <View style={[styles.inputContainer, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <IndianRupee size={18} color="#0284C7" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: '#0369A1', fontWeight: '600' }]}
                placeholder="0"
                value={formData.advance_received}
                onChangeText={(value) => handleInputChange('advance_received', value)}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <Text style={styles.fieldHint}>
              Amount collected upfront from the customer (default is 0). Used in trip billing.
            </Text>

            {/* Bold Cash to Collect Highlight Banner */}
            {(() => {
              const tot = parseFloat(formData.total_booking_amount) || 0;
              const extra = parseFloat(formData.extra_amount) || 0;
              const adv = parseFloat(formData.advance_received) || 0;
              const cashToCollect = Math.max(0, (tot + extra) - adv);
              return (
                <View style={{
                  backgroundColor: '#EFF6FF',
                  borderColor: '#2563EB',
                  borderWidth: 1.5,
                  borderRadius: 14,
                  padding: 14,
                  marginTop: 14,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    💵 Cash to Collect from Customer
                  </Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#1E40AF', marginTop: 4 }}>
                    ₹{cashToCollect}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#3B82F6', marginTop: 2 }}>
                    (Total Booking: ₹{tot} + Extra: ₹{extra} - Advance: ₹{adv})
                  </Text>
                </View>
              );
            })()}
          </View>
        ) : formData.trip_type === 'Hourly Rental' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.iconBadge}>
                <Timer size={18} color="#8B5A3C" />
              </View>
              <Text style={styles.sectionTitle}>Hourly Rental Pricing</Text>
            </View>
            
            <Text style={styles.fieldLabel}>Package Hours *</Text>
            <View style={styles.inputContainer}>
              <Timer size={18} color="#64748B" style={styles.inputIcon} />
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPackageHoursPicker(true)}
              >
                <Text style={[styles.pickerButtonText, formData.package_hours ? styles.pickerButtonTextActive : styles.pickerButtonTextPlaceholder]}>
                  {formData.package_hours ? `${formData.package_hours.hours} hrs (${formData.package_hours.km_range} km)` : 'Select package hours'}
                </Text>
                <ChevronDown size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Cost per Hour *</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Cost/hour"
                    value={formData.cost_per_hour}
                    onChangeText={(value) => handleInputChange('cost_per_hour', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Extra Cost per Hour</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Extra/hour"
                    value={formData.extra_cost_per_hour}
                    onChangeText={(value) => handleInputChange('extra_cost_per_hour', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Cost for Addon KM</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Cost/KM"
                    value={formData.cost_for_addon_km}
                    onChangeText={(value) => handleInputChange('cost_for_addon_km', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Extra Cost for Addon KM</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Extra/KM"
                    value={formData.extra_cost_for_addon_km}
                    onChangeText={(value) => handleInputChange('extra_cost_for_addon_km', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Advance Received (₹)</Text>
            <View style={[styles.inputContainer, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <IndianRupee size={18} color="#0284C7" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: '#0369A1', fontWeight: '600' }]}
                placeholder="0"
                value={formData.advance_received}
                onChangeText={(value) => handleInputChange('advance_received', value)}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <Text style={styles.fieldHint}>
              Amount collected upfront from the customer (default is 0). Used in trip billing.
            </Text>
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.iconBadge}>
                <IndianRupee size={18} color="#1D4ED8" />
              </View>
              <Text style={styles.sectionTitle}>Standard Pricing Details</Text>
            </View>
            
            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Cost per KM *</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Cost/KM"
                    value={formData.cost_per_km}
                    onChangeText={(value) => handleInputChange('cost_per_km', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Extra Cost per KM</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Extra/KM"
                    value={formData.extra_cost_per_km}
                    onChangeText={(value) => handleInputChange('extra_cost_per_km', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Driver Allowance</Text>
                <View style={styles.inputContainer}>
                  <Car size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="DA"
                    value={formData.driver_allowance}
                    onChangeText={(value) => handleInputChange('driver_allowance', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Extra Driver Allowance</Text>
                <View style={styles.inputContainer}>
                  <Car size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Extra DA"
                    value={formData.extra_driver_allowance}
                    onChangeText={(value) => handleInputChange('extra_driver_allowance', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Permit Charges</Text>
                <View style={styles.inputContainer}>
                  <FileText size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Permit"
                    value={formData.permit_charges}
                    onChangeText={(value) => handleInputChange('permit_charges', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Extra Permit Charges</Text>
                <View style={styles.inputContainer}>
                  <FileText size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ext Permit"
                    value={formData.extra_permit_charges}
                    onChangeText={(value) => handleInputChange('extra_permit_charges', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.halfWidth, { marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Hill Charges</Text>
                <View style={styles.inputContainer}>
                  <Mountain size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Hill charges"
                    value={formData.hill_charges}
                    onChangeText={(value) => handleInputChange('hill_charges', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={[styles.halfWidth, { marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Night Charges</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ngt charges"
                    value={formData.night_charges}
                    onChangeText={(value) => handleInputChange('night_charges', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>

            {!formData.toll_charge_update && (
              <>
                <Text style={styles.fieldLabel}>Toll Charges</Text>
                <View style={styles.inputContainer}>
                  <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Toll charges"
                    value={formData.toll_charges}
                    onChangeText={(value) => handleInputChange('toll_charges', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Advance Received (₹)</Text>
            <View style={[styles.inputContainer, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <IndianRupee size={18} color="#0284C7" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: '#0369A1', fontWeight: '600' }]}
                placeholder="0"
                value={formData.advance_received}
                onChangeText={(value) => handleInputChange('advance_received', value)}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <Text style={styles.fieldHint}>
              Amount collected upfront from the customer (default is 0). Used in trip billing.
            </Text>
          </View>
        )}

        {/* Special Requests Summary Card (Below Pricing Details) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <Sliders size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Special Requests</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryCardTouchable}
            onPress={() => setShowSpecialRequestsModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={styles.summaryIconCircle}>
                <Sliders size={20} color="#1D4ED8" />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={styles.summaryTitle}>
                  {(() => {
                    const reqs: string[] = [];
                    if (formData.non_cng) reqs.push('Non CNG');
                    if (formData.carrier_required) reqs.push('Carrier');
                    if (formData.pet_friendly) reqs.push('Pet Friendly');
                    if (formData.require_car_make_year && formData.car_make_year_requirement) {
                      reqs.push(`Year ${formData.car_make_year_requirement}+`);
                    }
                    return reqs.length === 0 ? 'No Special Requests' : reqs.join(', ');
                  })()}
                </Text>
                <Text style={styles.summarySubtitle}>
                  {(() => {
                    const reqsCount = (formData.non_cng ? 1 : 0) + (formData.carrier_required ? 1 : 0) + (formData.pet_friendly ? 1 : 0) + (formData.require_car_make_year ? 1 : 0);
                    return reqsCount === 0
                      ? 'Tap to select Non CNG, Carrier, Pet Friendly, Year'
                      : `${reqsCount} active request${reqsCount > 1 ? 's' : ''}`;
                  })()}
                </Text>
              </View>
            </View>
            <View style={styles.editPillButton}>
              <Edit3 size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
              <Text style={styles.editPillText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 6. Customer Details Section */}
        <View style={styles.sectionCard}>
          <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.iconBadge}>
                <User size={18} color="#1D4ED8" />
              </View>
              <Text style={styles.sectionTitle}>Customer Details</Text>
            </View>

            {/* Vendor Checkbox - only shown if this specific vendor has this privilege enabled by Admin */}
            {Boolean(vendorProfile?.allow_vendor_as_customer) && (
              <TouchableOpacity
                onPress={handleToggleVendorAsCustomer}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  backgroundColor: isVendorAsCustomer ? '#EFF6FF' : 'transparent',
                  borderWidth: 1,
                  borderColor: isVendorAsCustomer ? '#2563EB' : '#E2E8F0',
                }}
                activeOpacity={0.7}
                accessibilityLabel="Auto-fill Vendor details as Customer"
              >
                <View style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: isVendorAsCustomer ? '#2563EB' : '#94A3B8',
                  backgroundColor: isVendorAsCustomer ? '#2563EB' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {isVendorAsCustomer && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text style={{
                  fontSize: 12.5,
                  fontWeight: isVendorAsCustomer ? '700' : '500',
                  color: isVendorAsCustomer ? '#2563EB' : '#64748B',
                }}>
                  Vendor
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 240 }}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <View style={styles.inputContainer}>
                <User size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter customer name"
                  value={formData.customer_name}
                  onChangeText={(value) => handleInputChange('customer_name', value)}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={{ flex: 1, minWidth: 240 }}>
              <Text style={styles.fieldLabel}>Customer Mobile Number *</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <TextInput
                  style={{
                    width: 72,
                    height: 48,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#E8EAED',
                    backgroundColor: '#FFFFFF',
                    textAlign: 'center',
                    fontSize: 15,
                    fontWeight: '600',
                    color: '#1E293B',
                    paddingHorizontal: 4,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                  value={formData.customer_country_code}
                  onChangeText={handleCountryCodeChange}
                  placeholder="+91"
                  keyboardType="phone-pad"
                  maxLength={5}
                  placeholderTextColor="#94A3B8"
                />
                <View style={[styles.inputContainer, { flex: 1, marginBottom: 0 }]}>
                  <Phone size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={isIndianNumber ? 'Enter 10-digit number' : 'Enter 8-15 digit number'}
                    value={formData.customer_number}
                    onChangeText={handleCustomerPhoneChange}
                    keyboardType="phone-pad"
                    maxLength={phoneMaxLen}
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 6.5. Target Drivers & Vacant Cities (Select City) Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <Send size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Target Drivers (Broadcast Option)</Text>
          </View>

          <Text style={styles.fieldHint}>
            Choose whether to broadcast to all drivers or restrict to drivers who updated vacant status in specific cities.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[
                styles.broadcastOptionBtn,
                formData.send_to === 'ALL' && styles.broadcastOptionBtnActive
              ]}
              onPress={() => {
                handleInputChange('send_to', 'ALL');
                handleInputChange('near_city', ['ALL']);
              }}
              activeOpacity={0.8}
            >
              <Send size={16} color={formData.send_to === 'ALL' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.broadcastOptionText, formData.send_to === 'ALL' && styles.broadcastOptionTextActive]}>
                All Drivers
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.broadcastOptionBtn,
                formData.send_to === 'NEAR_CITY' && styles.broadcastOptionBtnActive
              ]}
              onPress={() => {
                handleInputChange('send_to', 'NEAR_CITY');
                if (!formData.near_city || formData.near_city.length === 0 || formData.near_city.includes('ALL')) {
                  setShowTargetCityModal(true);
                }
              }}
              activeOpacity={0.8}
            >
              <MapPin size={16} color={formData.send_to === 'NEAR_CITY' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.broadcastOptionText, formData.send_to === 'NEAR_CITY' && styles.broadcastOptionTextActive]}>
                Select Vacant City
              </Text>
            </TouchableOpacity>
          </View>

          {formData.send_to === 'NEAR_CITY' && (
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={styles.fieldLabel}>Selected Target Vacant Cities:</Text>
                <TouchableOpacity onPress={() => setShowTargetCityModal(true)}>
                  <Text style={{ color: '#1D4ED8', fontSize: 13 }}>
                    + Add / Edit Cities
                  </Text>
                </TouchableOpacity>
              </View>

              {formData.near_city.filter(c => c !== 'ALL').length === 0 ? (
                <TouchableOpacity
                  style={styles.selectCityPlaceholderBtn}
                  onPress={() => setShowTargetCityModal(true)}
                >
                  <MapPin size={18} color="#94A3B8" />
                  <Text style={styles.selectCityPlaceholderText}>
                    Tap to select cities where drivers updated vacant status...
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {formData.near_city.filter(c => c !== 'ALL').map((city) => (
                    <View key={city} style={styles.selectedCityChip}>
                      <MapPin size={13} color="#1D4ED8" style={{ marginRight: 4 }} />
                      <Text style={styles.selectedCityChipText}>{city}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          const updated = formData.near_city.filter(c => c !== city);
                          if (updated.length === 0) {
                            handleInputChange('near_city', ['ALL']);
                            handleInputChange('send_to', 'ALL');
                          } else {
                            handleInputChange('near_city', updated);
                          }
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 6 }}
                      >
                        <X size={14} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* 7. Driver Assignment & Priority Summary Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <Clock size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Driver Assignment & Priority</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryCardTouchable}
            onPress={() => setShowAdvancedConfigModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={styles.summaryIconCircle}>
                <Clock size={20} color="#1D4ED8" />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={styles.summaryTitle}>
                  Assign Max Time: {formData.max_time_minutes || '30'} Mins
                </Text>
                <Text style={styles.summarySubtitle}>
                  Trusted Partners Only: {formData.priority_for_paid ? `Active (Until ${formatDateTime(getEffectivePriorityCutoff()).time})` : 'Disabled (Open to all)'}
                </Text>
              </View>
            </View>
            <View style={styles.editPillButton}>
              <Edit3 size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
              <Text style={styles.editPillText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 8. Additional Pickup Notes Summary Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBadge}>
              <FileText size={18} color="#1D4ED8" />
            </View>
            <Text style={styles.sectionTitle}>Pickup Notes</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryCardTouchable}
            onPress={() => setShowNotesModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.summaryCardLeft}>
              <View style={styles.summaryIconCircle}>
                <FileText size={20} color="#1D4ED8" />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={styles.summaryTitle} numberOfLines={1}>
                  {formData.pickup_notes ? formData.pickup_notes : 'No special instructions added'}
                </Text>
                <Text style={styles.summarySubtitle}>
                  {formData.pickup_notes ? 'Tap to edit notes' : 'Tap to add driver instructions'}
                </Text>
              </View>
            </View>
            <View style={styles.editPillButton}>
              <Edit3 size={13} color="#1D4ED8" style={{ marginRight: 3 }} />
              <Text style={styles.editPillText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Floating action button - fare and every other detail is already
          reviewed on the next page (the quote/broadcast review screen),
          so this bar no longer duplicates a "Total Fare Preview" here -
          just the single floating CTA. */}
      <View style={styles.floatingFooterWrap}>
        <TouchableOpacity
          style={[styles.broadcastTripBtn, isLoading && styles.broadcastTripBtnDisabled]}
          onPress={getQuote}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.broadcastTripBtnText}>Review & Broadcast Trip</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Date Picker */}
      {/* {showDatePicker && (
        <DateTimePicker
          value={formData.start_date_time}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // onChange={onDateChange}
          minimumDate={new Date()}
        />
      )} */}

      {/* Time Picker */}
      {/* {showTimePicker && (
        <DateTimePicker
          value={formData.start_date_time}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // onChange={onTimeChange}
        />
      )} */}

      {/* Enhanced Trip Type Picker Modal */}
      <Modal
        visible={showTripTypePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTripTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTripTypePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheetContainer}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Select Trip Type</Text>
                <Text style={styles.modalHeaderSubtitle}>Choose your journey type for this booking</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTripTypePicker(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginTop: 14 }}>
              {tripTypes.map((type) => {
                const isActive = formData.trip_type === type.value;
                const IconComponent = type.icon;
                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.enhancedModalOptionCard,
                      isActive && styles.enhancedModalOptionCardActive
                    ]}
                    onPress={() => {
                      handleTripTypeChange(type.value);
                      setShowTripTypePicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.optionIconBox, isActive && styles.optionIconBoxActive]}>
                      <IconComponent size={22} color={isActive ? "#FFFFFF" : "#1D4ED8"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitleText, isActive && styles.optionTitleTextActive]}>
                        {type.label}
                      </Text>
                      <Text style={styles.optionSubtitleText}>{type.subtitle}</Text>
                    </View>
                    <View style={[styles.radioBadge, isActive && styles.radioBadgeActive]}>
                      {isActive && <Check size={14} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>



      {/* Car & Vehicle Preferences Modal */}
      <Modal
        visible={showCarPreferencesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCarPreferencesModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCarPreferencesModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Car & Vehicle Preferences</Text>
                <Text style={styles.modalHeaderSubtitle}>Select vehicle type and requirements</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCarPreferencesModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <Text style={styles.modalSectionLabel}>Car Type *</Text>
              <View style={{ gap: 8 }}>
                {carTypes.map((type) => {
                  const isActive = formData.car_type === type;
                  const displayText = type.replace(/_/g, ' ').replace(/PLUS/g, '+');
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.carSelectRow,
                        isActive && styles.carSelectRowActive
                      ]}
                      onPress={() => {
                        const defaults = getDefaultsForCarType(type, formData.trip_type);
                        setFormData(prev => ({
                          ...prev,
                          car_type: type,
                          cost_per_km: defaults.cost_per_km,
                          extra_cost_per_km: defaults.extra_cost_per_km,
                          driver_allowance: defaults.driver_allowance,
                          extra_driver_allowance: defaults.extra_driver_allowance,
                        }));
                      }}
                    >
                      <Car size={18} color={isActive ? "#1D4ED8" : "#64748B"} />
                      <Text style={[styles.carSelectText, isActive && styles.carSelectTextActive]}>
                        {displayText}
                      </Text>
                      {isActive && <CheckCircle2 size={18} color="#1D4ED8" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.switchContainer, { marginTop: 14 }]}>
                <View style={styles.switchLabel}>
                  <IndianRupee size={18} color="#64748B" />
                  <Text style={styles.switchText}>10% CC (Commission)</Text>
                </View>
                <Switch
                  value={formData.apply_commission}
                  onValueChange={(value) => handleInputChange('apply_commission', value)}
                  trackColor={{ false: '#E2E8F0', true: '#3B82F6' }}
                  thumbColor={formData.apply_commission ? '#FFFFFF' : '#94A3B8'}
                />
              </View>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setShowCarPreferencesModal(false)}
              >
                <Text style={styles.modalSaveButtonText}>Save Preferences</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Dedicated Special Requests Pop-Up Modal */}
      <Modal
        visible={showSpecialRequestsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSpecialRequestsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSpecialRequestsModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Special Requests</Text>
                <Text style={styles.modalHeaderSubtitle}>Select vehicle requirements and optional extra charges</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSpecialRequestsModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <Text style={styles.modalSectionLabel}>Vehicle Requirements</Text>
              <Text style={styles.fieldHint}>Select options to apply requirement to booking</Text>

              <View style={styles.specialReqChipRow}>
                {/* Non CNG */}
                <TouchableOpacity
                  style={[
                    styles.specialReqChip,
                    formData.non_cng && styles.specialReqChipActive
                  ]}
                  onPress={() => {
                    const nextVal = !formData.non_cng;
                    handleInputChange('non_cng', nextVal);
                    if (nextVal && (formData.non_cng_charge === undefined || formData.non_cng_charge === '')) {
                      handleInputChange('non_cng_charge', '0');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.specialReqChipText, formData.non_cng && styles.specialReqChipTextActive]}>
                    ⚡ Non CNG
                  </Text>
                  {formData.non_cng && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                {/* Carrier */}
                <TouchableOpacity
                  style={[
                    styles.specialReqChip,
                    formData.carrier_required && styles.specialReqChipActive
                  ]}
                  onPress={() => {
                    const nextVal = !formData.carrier_required;
                    handleInputChange('carrier_required', nextVal);
                    if (nextVal && (formData.carrier_charge === undefined || formData.carrier_charge === '')) {
                      handleInputChange('carrier_charge', '0');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.specialReqChipText, formData.carrier_required && styles.specialReqChipTextActive]}>
                    🧳 Carrier
                  </Text>
                  {formData.carrier_required && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                {/* Pet Friendly */}
                <TouchableOpacity
                  style={[
                    styles.specialReqChip,
                    formData.pet_friendly && styles.specialReqChipActive
                  ]}
                  onPress={() => {
                    const nextVal = !formData.pet_friendly;
                    handleInputChange('pet_friendly', nextVal);
                    if (nextVal && (formData.pet_friendly_charge === undefined || formData.pet_friendly_charge === '')) {
                      handleInputChange('pet_friendly_charge', '0');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.specialReqChipText, formData.pet_friendly && styles.specialReqChipTextActive]}>
                    🐾 Pet Friendly
                  </Text>
                  {formData.pet_friendly && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                {/* Year From */}
                <TouchableOpacity
                  style={[
                    styles.specialReqChip,
                    formData.require_car_make_year && styles.specialReqChipActive
                  ]}
                  onPress={() => {
                    const nextVal = !formData.require_car_make_year;
                    handleInputChange('require_car_make_year', nextVal);
                    if (nextVal) {
                      if (!formData.car_make_year_requirement) {
                        handleInputChange('car_make_year_requirement', '2020');
                      }
                      if (formData.car_year_charge === undefined || formData.car_year_charge === '') {
                        handleInputChange('car_year_charge', '0');
                      }
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.specialReqChipText, formData.require_car_make_year && styles.specialReqChipTextActive]}>
                    📅 Year From {formData.require_car_make_year && formData.car_make_year_requirement ? `(${formData.car_make_year_requirement}+)` : ''}
                  </Text>
                  {formData.require_car_make_year && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              </View>

              {/* Dynamic Extra Charges Inputs */}
              {formData.non_cng && (
                <View style={styles.extraChargeCard}>
                  <Text style={styles.extraChargeTitle}>⚡ Non CNG Driver Allowance</Text>
                  <View style={styles.inputContainer}>
                    <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      value={formData.non_cng_charge}
                      onChangeText={(val) => handleInputChange('non_cng_charge', stripLeadingZero(val))}
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {(parseFloat(formData.non_cng_charge || '0') || 0) > 0 && (
                    <Text style={styles.chargeItemCaption}>₹{parseFloat(formData.non_cng_charge || '0') || 0} allowance included</Text>
                  )}
                </View>
              )}

              {formData.carrier_required && (
                <View style={styles.extraChargeCard}>
                  <Text style={styles.extraChargeTitle}>🧳 Carrier Driver Allowance</Text>
                  <View style={styles.inputContainer}>
                    <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      value={formData.carrier_charge}
                      onChangeText={(val) => handleInputChange('carrier_charge', stripLeadingZero(val))}
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {(parseFloat(formData.carrier_charge || '0') || 0) > 0 && (
                    <Text style={styles.chargeItemCaption}>₹{parseFloat(formData.carrier_charge || '0') || 0} allowance included</Text>
                  )}
                </View>
              )}

              {formData.pet_friendly && (
                <View style={styles.extraChargeCard}>
                  <Text style={styles.extraChargeTitle}>🐾 Pet Friendly Driver Allowance</Text>
                  <View style={styles.inputContainer}>
                    <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      value={formData.pet_friendly_charge}
                      onChangeText={(val) => handleInputChange('pet_friendly_charge', stripLeadingZero(val))}
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {(parseFloat(formData.pet_friendly_charge || '0') || 0) > 0 && (
                    <Text style={styles.chargeItemCaption}>₹{parseFloat(formData.pet_friendly_charge || '0') || 0} allowance included</Text>
                  )}
                </View>
              )}

              {formData.require_car_make_year && (
                <View style={styles.extraChargeCard}>
                  <Text style={styles.extraChargeTitle}>📅 Min Car Make Year & Extra Charge</Text>
                  <Text style={styles.fieldLabel}>Select Minimum Year</Text>
                  <TouchableOpacity
                    style={styles.inputContainer}
                    onPress={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                  >
                    <Calendar size={18} color="#64748B" style={styles.inputIcon} />
                    <Text style={[styles.pickerButtonText, formData.car_make_year_requirement ? styles.pickerButtonTextActive : styles.pickerButtonTextPlaceholder]}>
                      {formData.car_make_year_requirement ? `${formData.car_make_year_requirement} or newer` : 'Select Year'}
                    </Text>
                    {isYearDropdownOpen ? (
                      <ChevronUp size={18} color="#1D4ED8" />
                    ) : (
                      <ChevronDown size={18} color="#64748B" />
                    )}
                  </TouchableOpacity>

                  {isYearDropdownOpen && (
                    <View style={{
                      maxHeight: 180,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      marginTop: 6,
                      paddingVertical: 4,
                      elevation: 3,
                    }}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 170 }}>
                        {carMakeYears.map((year) => {
                          const isActive = formData.car_make_year_requirement === year;
                          return (
                            <TouchableOpacity
                              key={year}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                                borderBottomWidth: 0.5,
                                borderBottomColor: '#F1F5F9',
                              }}
                              onPress={() => {
                                handleInputChange('car_make_year_requirement', year);
                                setIsYearDropdownOpen(false);
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Calendar size={16} color={isActive ? "#1D4ED8" : "#64748B"} />
                                <Text style={{
                                  fontSize: 14,
                                  fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                                  color: isActive ? '#1D4ED8' : '#334155',
                                  fontWeight: isActive ? '700' : '500',
                                }}>
                                  {year} or newer
                                </Text>
                              </View>
                              {isActive && <CheckCircle2 size={16} color="#1D4ED8" />}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Year Requirement Driver Allowance (₹)</Text>
                  <View style={styles.inputContainer}>
                    <IndianRupee size={18} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      value={formData.car_year_charge}
                      onChangeText={(val) => handleInputChange('car_year_charge', stripLeadingZero(val))}
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  {(parseFloat(formData.car_year_charge || '0') || 0) > 0 && (
                    <Text style={styles.chargeItemCaption}>₹{parseFloat(formData.car_year_charge || '0') || 0} allowance included</Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setShowSpecialRequestsModal(false)}
              >
                <Text style={styles.modalSaveButtonText}>Save Special Requests</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Driver Assignment & Priority Modal */}
      <Modal
        visible={showAdvancedConfigModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAdvancedConfigModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAdvancedConfigModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Driver Assignment & Priority</Text>
                <Text style={styles.modalHeaderSubtitle}>Configure driver search time & partner access</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAdvancedConfigModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <Text style={styles.modalSectionLabel}>Trusted Partners Only Window</Text>
              <TouchableOpacity
                style={styles.switchContainer}
                activeOpacity={0.7}
                onPress={() => handleInputChange('priority_for_paid', !formData.priority_for_paid)}
              >
                <View style={styles.switchLabel}>
                  <ShieldCheck size={18} color="#1D4ED8" />
                  <Text style={styles.switchText}>Restrict to Trusted Partners</Text>
                </View>
                <View style={[styles.checkbox, formData.priority_for_paid && styles.checkboxChecked]}>
                  {formData.priority_for_paid && <Check size={14} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>

              {formData.priority_for_paid && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>Priority Window End Time</Text>
                  <View style={styles.timeInputRow}>
                    <View style={[styles.inputContainer, styles.timeInput]}>
                      <Calendar size={18} color="#64748B" style={styles.inputIcon} />
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setShowPriorityCutoffDatePicker(true)}
                      >
                        <Text style={styles.pickerButtonText}>
                          {formatDateTime(getEffectivePriorityCutoff()).date}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.inputContainer, styles.timeInput]}>
                      <Clock size={18} color="#64748B" style={styles.inputIcon} />
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setShowPriorityCutoffTimePicker(true)}
                      >
                        <Text style={styles.pickerButtonText}>
                          {formatDateTime(getEffectivePriorityCutoff()).time}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.fieldHint}>
                    Only Trusted Partners can accept until this time. Standard Partners can accept after.
                  </Text>
                </View>
              )}

              <Text style={[styles.modalSectionLabel, { marginTop: 20 }]}>Driver Assignment Time (Max Time)</Text>
              <Text style={styles.fieldHint}>Time allowed for a driver to accept this booking & assign vehicle details</Text>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {['7', '15', '30', '45', '60'].map((mins) => {
                  const isActive = formData.max_time_minutes === mins && formData.max_time_hours === '0';
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.presetChip, isActive && styles.presetChipActive]}
                      onPress={() => {
                        handleInputChange('max_time_hours', '0');
                        handleInputChange('max_time_minutes', mins);
                      }}
                    >
                      <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                        {mins === '30' ? '30 Mins (Default)' : `${mins} Mins`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setShowAdvancedConfigModal(false)}
              >
                <Text style={styles.modalSaveButtonText}>Save Configuration</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Pickup Notes Modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotesModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowNotesModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '75%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Pickup Notes & Instructions</Text>
                <Text style={styles.modalHeaderSubtitle}>Special instructions for the driver</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowNotesModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <TextInput
                style={styles.modalTextArea}
                placeholder="Type any special instructions (e.g. Airport drop, punctual driver needed...)"
                value={formData.pickup_notes}
                onChangeText={(value) => handleInputChange('pickup_notes', value)}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Quick Suggestion Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {[
                  "Airport Transfer",
                  "Luggage Support Needed",
                  "English Speaking Driver",
                  "AC Mandatory",
                  "Punctual Driver"
                ].map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.tagChip}
                    onPress={() => {
                      const current = formData.pickup_notes ? formData.pickup_notes + ', ' + tag : tag;
                      handleInputChange('pickup_notes', current);
                    }}
                  >
                    <Text style={styles.tagChipText}>+ {tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setShowNotesModal(false)}
              >
                <Text style={styles.modalSaveButtonText}>Save Notes</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Included & Extra Charges Modal */}
      <Modal
        visible={showChargeItemsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChargeItemsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChargeItemsModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Included & Extra Charges</Text>
                <Text style={styles.modalHeaderSubtitle}>Toggle off items that are collected extra from customer</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowChargeItemsModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <View style={{ gap: 10 }}>
                {/* Toll Toggle */}
                <View style={styles.switchContainer}>
                  <View style={styles.switchLabel}>
                    <IndianRupee size={16} color="#64748B" />
                    <View>
                      <Text style={styles.switchText}>Toll</Text>
                      <Text style={styles.chargeItemCaption}>
                        {!formData.toll_charge_update ? 'Bundled into total price' : 'Collected extra from customer'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={!formData.toll_charge_update}
                    onValueChange={(value) => handleInputChange('toll_charge_update', !value)}
                    trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                    thumbColor={!formData.toll_charge_update ? '#FFFFFF' : '#94A3B8'}
                  />
                </View>

                {/* Additional Charges list */}
                {formData.charge_items.map((item, index) => {
                  const amountValue = parseFloat(item.amount || '0') || 0;
                  return (
                  <View key={item.label} style={styles.chargeItemCard}>
                    <View style={styles.switchContainer}>
                      <View style={styles.switchLabel}>
                        <IndianRupee size={16} color="#64748B" />
                        <View>
                          <Text style={styles.switchText}>{item.label}</Text>
                          <Text style={styles.chargeItemCaption}>
                            {!item.included
                              ? 'Collected extra from customer'
                              : amountValue > 0
                                ? `₹${amountValue} included`
                                : 'Bundled into total price'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Switch
                          value={item.included}
                          onValueChange={(value) => {
                            const updated = [...formData.charge_items];
                            updated[index] = { ...updated[index], included: value };
                            handleInputChange('charge_items', updated as any);
                          }}
                          trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                          thumbColor={item.included ? '#FFFFFF' : '#94A3B8'}
                        />
                        {index >= 3 && (
                          <TouchableOpacity
                            onPress={() => {
                              const updated = formData.charge_items.filter((_, i) => i !== index);
                              handleInputChange('charge_items', updated as any);
                            }}
                            hitSlop={8}
                          >
                            <X size={16} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {item.included && (
                      <View style={styles.chargeItemAmountRow}>
                        <Text style={styles.chargeItemAmountLabel}>Amount included in fare (optional)</Text>
                        <View style={styles.chargeItemAmountInputWrap}>
                          <Text style={styles.chargeItemAmountPrefix}>₹</Text>
                          <TextInput
                            style={styles.chargeItemAmountInput}
                            placeholder="0"
                            value={item.amount}
                            onChangeText={(value) => {
                              const updated = [...formData.charge_items];
                              updated[index] = { ...updated[index], amount: stripLeadingZero(value) };
                              handleInputChange('charge_items', updated as any);
                            }}
                            keyboardType="numeric"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                  );
                })}
              </View>

              {/* Add Custom Charge */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Add Custom Charge</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14 }]}
                  placeholder="e.g. State Border Fee, Parking"
                  value={newChargeLabel}
                  onChangeText={setNewChargeLabel}
                  placeholderTextColor="#94A3B8"
                />
                <TouchableOpacity
                  style={{ backgroundColor: '#2563EB', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' }}
                  onPress={() => {
                    const label = newChargeLabel.trim();
                    if (!label) return;
                    handleInputChange('charge_items', [...formData.charge_items, { label, included: formData.fare_type === 'ALL_INCLUSIVE', amount: '0' }] as any);
                    setNewChargeLabel('');
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => setShowChargeItemsModal(false)}
              >
                <Text style={styles.modalSaveButtonText}>Save Charge Settings</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Target City Multi-Select Modal */}
      <Modal
        visible={showTargetCityModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTargetCityModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTargetCityModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalHeaderTitle}>Select Target Vacant Cities</Text>
                <Text style={styles.modalHeaderSubtitle}>Only drivers waiting in these cities will receive booking alert</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTargetCityModal(false)}
                style={styles.modalCloseIcon}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12 }}>
              <View style={[styles.inputContainer, { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' }]}>
                <MapPin size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Search city name..."
                  value={targetCitySearchQuery}
                  onChangeText={setTargetCitySearchQuery}
                  placeholderTextColor="#94A3B8"
                />
                {targetCitySearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setTargetCitySearchQuery('')} style={{ padding: 4 }}>
                    <X size={16} color="#64748B" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12, maxHeight: 320 }}>
              {availableCitiesList
                .filter(c => c.toLowerCase().includes(targetCitySearchQuery.toLowerCase()))
                .map(city => {
                  const isSelected = formData.near_city.includes(city);
                  return (
                    <TouchableOpacity
                      key={city}
                      style={[
                        styles.citySelectRow,
                        isSelected && styles.citySelectRowActive
                      ]}
                      onPress={() => {
                        let current = formData.near_city.filter(c => c !== 'ALL');
                        if (isSelected) {
                          current = current.filter(c => c !== city);
                        } else {
                          current.push(city);
                        }
                        if (current.length === 0) {
                          handleInputChange('near_city', ['ALL']);
                          handleInputChange('send_to', 'ALL');
                        } else {
                          handleInputChange('near_city', current);
                          handleInputChange('send_to', 'NEAR_CITY');
                        }
                      }}
                    >
                      <MapPin size={18} color={isSelected ? "#1D4ED8" : "#64748B"} />
                      <Text style={[styles.citySelectText, isSelected && styles.citySelectTextActive]}>
                        {city}
                      </Text>
                      {isSelected && <CheckCircle2 size={18} color="#1D4ED8" />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => setShowTargetCityModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>
                Done ({formData.near_city.filter(c => c !== 'ALL').length} Cities Selected)
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Location Picker */}
      <LocationPicker
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={(location) => {
          if (activeLocationField) {
            handleLocationChange(activeLocationField, location);
          }
        }}
        title={activeLocationField ? `Select ${getLocationLabel(activeLocationField)}` : 'Select Location'}
        placeholder="Search for a location..."
      />

         {/* Quote Review */}
      <QuoteReview
        visible={showQuoteReview}
        onClose={() => setShowQuoteReview(false)}
        quoteData={quoteResponse}
        onConfirmOrder={confirmOrder}
        isLoading={isLoading}
        onDistanceOverride={(km, tripTime) => {
          setFormData(prev => ({
            ...prev,
            override_km: String(km),
            override_trip_time: tripTime,
          }));
        }}
      />

      {/* Order Success */}
      <OrderSuccess
        visible={showOrderSuccess}
        onClose={() => {
          setShowOrderSuccess(false);
          // Reset form (vendor_id is preserved from the signed-in vendor,
          // not reset - it doesn't change between orders in this session)
          setFormData(prev => ({
            vendor_id: prev.vendor_id,
            trip_type: 'Oneway',
            car_type: 'SEDAN_4_PLUS_1',
            pickup_drop_location: { '0': '', '1': '' },
            location_links: {},
            start_date_time: new Date(Date.now() + 30 * 60 * 1000),
            end_date_time: null,
            customer_name: '',
            customer_number: '',
            max_time_hours: '0',
            max_time_minutes: '30',
            live_until: null,
            accept_by_days: '',
            toll_charge_update: true,
            cost_per_km: '15',
            extra_cost_per_km: '0',
            driver_allowance: '300',
            extra_driver_allowance: '100',
            permit_charges: '0',
            extra_permit_charges: '0',
            hill_charges: '0',
            toll_charges: '0',
            package_hours: null,
            cost_per_hour: '',
            extra_cost_per_hour: '',
            cost_for_addon_km: '',
            extra_cost_for_addon_km: '',
            pickup_notes: '',
            send_to: 'ALL',
            near_city: ['ALL'],
            night_charges: '0',
            override_km: '',
            override_trip_time: '',
            require_car_make_year: false,
            car_make_year_requirement: '',
            car_year_charge: '0',
            carrier_required: false,
            carrier_charge: '0',
            non_cng: false,
            non_cng_charge: '0',
            pet_friendly: false,
            pet_friendly_charge: '0',
            priority_for_paid: true,
            priority_cutoff_at: null,
            customer_country_code: '+91',
            fare_type: 'ITEMIZED',
            charge_items: [
              { label: 'State Permit', included: false, amount: '0' },
              { label: 'Parking', included: false, amount: '0' },
              { label: 'Waiting', included: false, amount: '0' },
            ],
            waiting_hours_included: '2',
            total_booking_amount: '',
            extra_amount: '0',
            advance_received: '',
            apply_commission: true,
          }));
          setQuoteResponse(null);
          setOrderResponse(null);
        }}
        orderData={orderResponse}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    backgroundColor: '#1E3A8A',
    paddingTop: Platform.OS === 'ios' ? 44 : ANDROID_STATUS_BAR + 12,
    paddingBottom: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  section: {
    marginTop: 16,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginLeft: 2,
  },
  fieldHint: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 15,
  },
  reorderHint: {
    fontSize: 10,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  addLocationButton: {
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#1E40AF',
    borderStyle: 'dashed',
  },
  addLocationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reorderControls: {
    flexDirection: 'column',
    marginLeft: 8,
  },
  reorderButton: {
    padding: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    marginVertical: 1,
  },
  disabledReorderButton: {
    backgroundColor: '#F9FAFB',
  },
  locationNumberContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  locationNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  locationInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  addressLinkInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E8EAED',
    fontSize: 13,
    color: '#374151',
    marginBottom: 12,
    marginLeft: 36,
  },
  locationLinkToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 2,
  },
  locationLinkToggleText: {
    fontSize: 13.5,
    color: '#374151',
    fontWeight: '600',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 16,
    // A real TextInput child (styles.input) carries its own height:48, so
    // this container was implicitly 48px tall wherever that's what's
    // inside it. The Start/Return Date & Time buttons instead wrap a bare
    // Text with no height of its own, so with nothing floored here they
    // collapsed to the text's natural line-height - visibly shorter than
    // every text-input field around them. minHeight is a no-op for the
    // TextInput case (already ≥48) and fixes the date/time buttons.
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#202124',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  halfWidth: {
    flex: 1,
  },
  timeInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeInput: {
    width: '48%',
  },
  timeUnit: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '500',
  },
  chargeItemCaption: {
    fontSize: 10.5,
    color: '#9CA3AF',
    marginLeft: 12,
    marginTop: 1,
  },
  chargeItemCard: {
    gap: 6,
  },
  chargeItemAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chargeItemAmountLabel: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },
  chargeItemAmountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    width: 90,
  },
  chargeItemAmountPrefix: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 4,
  },
  chargeItemAmountInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 8,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  pickerButtonText: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '500',
  },
  pickerButtonTextActive: {
    color: '#202124',
  },
  pickerButtonTextPlaceholder: {
    color: '#9AA0A6',
  },
  locationTextContainer: {
    flex: 1,
  },
  locationInputText: {
    fontSize: 14,
  },
  locationInputTextActive: {
    color: '#202124',
    fontWeight: '500',
  },
  locationInputTextPlaceholder: {
    color: '#9AA0A6',
  },
  quoteButton: {
    marginVertical: 24,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
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
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalOptionActive: {
    backgroundColor: '#F0F7FF',
    borderColor: '#1E40AF',
  },
  modalOptionText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
    fontWeight: '500',
  },
  modalOptionTextActive: {
    color: '#1E40AF',
    fontWeight: '600',
  },

  // Summary Card Styles
  summaryCardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  summaryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  summaryTextContent: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  summarySubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  editPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  miniChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  // Enhanced Bottom Sheet Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalHeaderSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhancedModalOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  enhancedModalOptionCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  optionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionIconBoxActive: {
    backgroundColor: '#2563EB',
  },
  optionTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  optionTitleTextActive: {
    color: '#1D4ED8',
  },
  optionSubtitleText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  radioBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  radioBadgeActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  carSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  carSelectRowActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  carSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginLeft: 12,
  },
  carSelectTextActive: {
    color: '#1D4ED8',
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  modalSaveButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  modalSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalTextArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
    fontSize: 14,
    color: '#1E293B',
    textAlignVertical: 'top',
    height: 100,
  },
  tagChip: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagChipText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
  },
  specialReqChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  specialReqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  specialReqChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  specialReqChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  specialReqChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  extraChargeCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  extraChargeTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  broadcastOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  broadcastOptionBtnActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  broadcastOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  broadcastOptionTextActive: {
    color: '#FFFFFF',
  },
  selectCityPlaceholderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 14,
    marginTop: 4,
  },
  selectCityPlaceholderText: {
    fontSize: 13,
    color: '#64748B',
    },
  selectedCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectedCityChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  citySelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  citySelectRowActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  citySelectText: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
    marginLeft: 10,
  },
  passThroughBadge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  passThroughBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  stickyFooterCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  stickyFooterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stickyFareCol: {
    gap: 4,
  },
  stickyFareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stickyFareAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#10B981',
  },
  stickyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  stickyBadgePill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stickyCommActive: {
    backgroundColor: '#EEF2FF',
  },
  stickyCommOff: {
    backgroundColor: '#F1F5F9',
  },
  stickyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  floatingFooterWrap: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
  },
  broadcastTripBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 24,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  broadcastTripBtnDisabled: {
    opacity: 0.5,
  },
  broadcastTripBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  citySelectTextActive: {
    fontWeight: '700',
    color: '#1D4ED8',
  },
});
