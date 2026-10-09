import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import {
  X,
  UserPlus,
  Car,
  Building2,
  Briefcase,
  User,
  CheckCircle2,
  Phone,
  MapPin,
  Lock,
  FileText,
  CreditCard,
  CarFront,
  Shield,
  Copy,
  ChevronDown,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

interface AdminCreateAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialType?: 'fleet' | 'vendor' | 'customer';
}

const CAR_TYPES = [
  { label: 'Sedan (Dzire, Etios)', value: 'SEDAN_4_PLUS_1' },
  { label: 'New Sedan (2022+ Dzire/Aura)', value: 'NEW_SEDAN_2022_MODEL' },
  { label: 'SUV (Ertiga, Triber)', value: 'SUV_6_PLUS_1' },
  { label: 'Innova / Marazzo', value: 'INNOVA_7_PLUS_1' },
  { label: 'Innova Crysta', value: 'INNOVA_CRYSTA_7_PLUS_1' },
  { label: 'Tempo Traveller', value: 'TEMPO_TRAVELLER_12_PLUS_1' },
];

export default function AdminCreateAccountModal({
  visible,
  onClose,
  onSuccess,
  initialType = 'fleet',
}: AdminCreateAccountModalProps) {
  const { themeColors, isDark } = useTheme();
  const [accountType, setAccountType] = useState<'fleet' | 'vendor' | 'customer'>(initialType);

  // Common Fields
  const [fullName, setFullName] = useState('');
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [secondaryNumber, setSecondaryNumber] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [password, setPassword] = useState('');

  // Fleet Specific
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [isPreferredTier, setIsPreferredTier] = useState(false);

  // Optional Nested Car
  const [includeCar, setIncludeCar] = useState(false);
  const [carName, setCarName] = useState('');
  const [carType, setCarType] = useState('SEDAN_4_PLUS_1');
  const [carNumber, setCarNumber] = useState('');
  const [carYear, setCarYear] = useState('');

  // Optional Nested Driver
  const [includeDriver, setIncludeDriver] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverNumber, setDriverNumber] = useState('');
  const [driverLicence, setDriverLicence] = useState('');
  const [isOwnerDriver, setIsOwnerDriver] = useState(true);

  // Vendor Specific
  const [gpayNumber, setGpayNumber] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Customer / B2B Specific
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [customerSegment, setCustomerSegment] = useState<'B2B' | 'CORPORATE' | 'RETAIL'>('B2B');

  // UI States
  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<any>(null);

  const resetForm = () => {
    setFullName('');
    setPrimaryNumber('');
    setSecondaryNumber('');
    setCity('');
    setAddress('');
    setPincode('');
    setPassword('');
    setAadharNumber('');
    setPanNumber('');
    setInitialBalance('');
    setIsPreferredTier(false);
    setIncludeCar(false);
    setCarName('');
    setCarType('SEDAN_4_PLUS_1');
    setCarNumber('');
    setCarYear('');
    setIncludeDriver(false);
    setDriverName('');
    setDriverNumber('');
    setDriverLicence('');
    setIsOwnerDriver(true);
    setGpayNumber('');
    setBusinessName('');
    setEmail('');
    setCompanyName('');
    setGstin('');
    setCustomerSegment('B2B');
    setSuccessResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing Field', 'Please enter full name or business name.');
      return;
    }
    const cleanPhone = primaryNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit primary mobile number.');
      return;
    }
    if (!city.trim() && accountType !== 'customer') {
      Alert.alert('Missing City', 'Please enter operating base city.');
      return;
    }

    setLoading(true);
    try {
      let res;
      if (accountType === 'fleet') {
        res = await apiService.createFleetOwner({
          full_name: fullName.trim(),
          primary_number: cleanPhone,
          secondary_number: secondaryNumber.trim() || undefined,
          city: city.trim(),
          address: address.trim() || undefined,
          pincode: pincode.trim() || undefined,
          aadhar_number: aadharNumber.trim() || undefined,
          pan_number: panNumber.trim() || undefined,
          password: password.trim() || undefined,
          initial_wallet_balance: initialBalance ? parseFloat(initialBalance) : 0,
          account_status: 'ACTIVE',
          tier: isPreferredTier ? 'PREFERRED' : 'STANDARD',
          ...(includeCar && carNumber.trim()
            ? {
                car_name: carName.trim() || 'Swift Dzire',
                car_type: carType,
                car_number: carNumber.trim().toUpperCase(),
                year_of_the_car: carYear.trim() || undefined,
              }
            : {}),
          ...(includeDriver && (driverName.trim() || driverNumber.trim())
            ? {
                driver_name: driverName.trim() || fullName.trim(),
                driver_primary_number: driverNumber.trim() || cleanPhone,
                driver_licence_number: driverLicence.trim() || undefined,
                is_owner_driver: isOwnerDriver,
              }
            : {}),
        });
      } else if (accountType === 'vendor') {
        res = await apiService.createVendor({
          full_name: fullName.trim(),
          primary_number: cleanPhone,
          secondary_number: secondaryNumber.trim() || undefined,
          city: city.trim(),
          address: address.trim() || undefined,
          pincode: pincode.trim() || undefined,
          aadhar_number: aadharNumber.trim() || undefined,
          gpay_number: gpayNumber.trim() || undefined,
          business_name: businessName.trim() || undefined,
          password: password.trim() || undefined,
          account_status: 'ACTIVE',
        });
      } else {
        res = await apiService.createCustomerAccount({
          full_name: fullName.trim(),
          primary_number: cleanPhone,
          email: email.trim() || undefined,
          city: city.trim() || undefined,
          password: password.trim() || undefined,
          company_name: companyName.trim() || undefined,
          gstin: gstin.trim() || undefined,
          customer_segment: customerSegment,
        });
      }

      setSuccessResult(res);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      Alert.alert('Onboarding Failed', e.message || 'Could not create account. Please check details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={modalStyles.overlay}>
        <View
          style={[
            modalStyles.sheet,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[modalStyles.header, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[modalStyles.headerIconBox, { backgroundColor: colors.primaryLight }]}>
                <UserPlus size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[modalStyles.headerTitle, { color: themeColors.text }]}>
                  Manual Account Onboarding
                </Text>
                <Text style={[modalStyles.headerSub, { color: themeColors.textSecondary }]}>
                  Create verified partner & customer accounts
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={modalStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {successResult ? (
            /* Success View */
            <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
              <View style={modalStyles.successIconBox}>
                <CheckCircle2 size={42} color="#10B981" />
              </View>
              <Text style={[modalStyles.successTitle, { color: themeColors.text }]}>
                Account Created Successfully!
              </Text>
              <Text style={[modalStyles.successSub, { color: themeColors.textSecondary }]}>
                Account is verified and ready for live platform access.
              </Text>

              <View
                style={[
                  modalStyles.credBox,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <View style={modalStyles.credRow}>
                  <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Full Name:</Text>
                  <Text style={[modalStyles.credValue, { color: themeColors.text }]}>
                    {successResult.credentials?.full_name}
                  </Text>
                </View>
                <View style={modalStyles.credRow}>
                  <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Mobile Number:</Text>
                  <Text style={[modalStyles.credValue, { color: colors.primary, fontWeight: '800' }]}>
                    {successResult.credentials?.primary_number}
                  </Text>
                </View>
                <View style={modalStyles.credRow}>
                  <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Default Password:</Text>
                  <Text style={[modalStyles.credValue, { color: '#059669', fontWeight: '800' }]}>
                    {successResult.credentials?.temporary_password}
                  </Text>
                </View>
                {successResult.credentials?.reg_id && (
                  <View style={modalStyles.credRow}>
                    <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Reg ID:</Text>
                    <Text style={[modalStyles.credValue, { color: themeColors.text }]}>
                      {successResult.credentials?.reg_id}
                    </Text>
                  </View>
                )}
                {successResult.car && (
                  <View style={modalStyles.credRow}>
                    <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Linked Car:</Text>
                    <Text style={[modalStyles.credValue, { color: themeColors.text }]}>
                      {successResult.car.car_number} ({successResult.car.car_name})
                    </Text>
                  </View>
                )}
                {successResult.driver && (
                  <View style={modalStyles.credRow}>
                    <Text style={[modalStyles.credLabel, { color: themeColors.textSecondary }]}>Linked Driver:</Text>
                    <Text style={[modalStyles.credValue, { color: themeColors.text }]}>
                      {successResult.driver.full_name} ({successResult.driver.primary_number})
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[modalStyles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={handleClose}
              >
                <Text style={modalStyles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* Form View */
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Type Switcher Capsule */}
              <View
                style={[
                  modalStyles.typeSwitcher,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    modalStyles.typePill,
                    accountType === 'fleet' && {
                      backgroundColor: isDark ? '#334155' : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setAccountType('fleet')}
                >
                  <Car size={15} color={accountType === 'fleet' ? colors.primary : themeColors.textSecondary} />
                  <Text
                    style={[
                      modalStyles.typePillText,
                      { color: accountType === 'fleet' ? colors.primary : themeColors.textSecondary },
                    ]}
                  >
                    Fleet Owner
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    modalStyles.typePill,
                    accountType === 'vendor' && {
                      backgroundColor: isDark ? '#334155' : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setAccountType('vendor')}
                >
                  <Building2 size={15} color={accountType === 'vendor' ? '#3B82F6' : themeColors.textSecondary} />
                  <Text
                    style={[
                      modalStyles.typePillText,
                      { color: accountType === 'vendor' ? '#3B82F6' : themeColors.textSecondary },
                    ]}
                  >
                    Vendor
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    modalStyles.typePill,
                    accountType === 'customer' && {
                      backgroundColor: isDark ? '#334155' : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setAccountType('customer')}
                >
                  <Briefcase size={15} color={accountType === 'customer' ? '#EC4899' : themeColors.textSecondary} />
                  <Text
                    style={[
                      modalStyles.typePillText,
                      { color: accountType === 'customer' ? '#EC4899' : themeColors.textSecondary },
                    ]}
                  >
                    B2B Client
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={{ marginTop: 14 }}>
                <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                  {accountType === 'vendor' ? 'Agency / Partner Name *' : accountType === 'customer' ? 'Contact Person / Client Name *' : 'Fleet Owner Full Name *'}
                </Text>
                <TextInput
                  style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder={accountType === 'vendor' ? 'e.g. Royal Travels' : 'e.g. S. Murugan'}
                  placeholderTextColor={themeColors.textMuted}
                  value={fullName}
                  onChangeText={setFullName}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                      Primary Mobile *
                    </Text>
                    <TextInput
                      style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="9876543210"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={10}
                      value={primaryNumber}
                      onChangeText={setPrimaryNumber}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                      Secondary Mobile
                    </Text>
                    <TextInput
                      style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="Optional"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={10}
                      value={secondaryNumber}
                      onChangeText={setSecondaryNumber}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                      Base City *
                    </Text>
                    <TextInput
                      style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="e.g. Chennai, Madurai"
                      placeholderTextColor={themeColors.textMuted}
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                      Pincode
                    </Text>
                    <TextInput
                      style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="600001"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                      maxLength={6}
                      value={pincode}
                      onChangeText={setPincode}
                    />
                  </View>
                </View>

                <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>
                  Address
                </Text>
                <TextInput
                  style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border, minHeight: 44 }]}
                  placeholder="Street / Office Address"
                  placeholderTextColor={themeColors.textMuted}
                  value={address}
                  onChangeText={setAddress}
                />

                {/* Fleet Specific Fields */}
                {accountType === 'fleet' && (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          Aadhar Number
                        </Text>
                        <TextInput
                          style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                          placeholder="12 digits"
                          placeholderTextColor={themeColors.textMuted}
                          keyboardType="numeric"
                          maxLength={12}
                          value={aadharNumber}
                          onChangeText={setAadharNumber}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          PAN Card
                        </Text>
                        <TextInput
                          style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                          placeholder="ABCDE1234F"
                          placeholderTextColor={themeColors.textMuted}
                          autoCapitalize="characters"
                          maxLength={10}
                          value={panNumber}
                          onChangeText={setPanNumber}
                        />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          Initial Wallet (₹)
                        </Text>
                        <TextInput
                          style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                          placeholder="0.00"
                          placeholderTextColor={themeColors.textMuted}
                          keyboardType="numeric"
                          value={initialBalance}
                          onChangeText={setInitialBalance}
                        />
                      </View>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          Preferred Partner
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <Switch
                            value={isPreferredTier}
                            onValueChange={setIsPreferredTier}
                            trackColor={{ false: '#94A3B8', true: colors.primary }}
                          />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isPreferredTier ? colors.primary : themeColors.textSecondary }}>
                            {isPreferredTier ? 'Preferred' : 'Standard'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* NESTED CAR ATTACHMENT */}
                    <View
                      style={[
                        modalStyles.subSectionBox,
                        {
                          backgroundColor: isDark ? '#1E293B40' : '#F8FAFC',
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CarFront size={16} color={colors.primary} />
                          <Text style={[modalStyles.subSectionTitle, { color: themeColors.text }]}>
                            Attach First Car (Optional)
                          </Text>
                        </View>
                        <Switch
                          value={includeCar}
                          onValueChange={setIncludeCar}
                          trackColor={{ false: '#94A3B8', true: colors.primary }}
                        />
                      </View>

                      {includeCar && (
                        <View style={{ marginTop: 10, gap: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                              style={[modalStyles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                              placeholder="Car Number (TN01AB1234) *"
                              placeholderTextColor={themeColors.textMuted}
                              autoCapitalize="characters"
                              value={carNumber}
                              onChangeText={setCarNumber}
                            />
                            <TextInput
                              style={[modalStyles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                              placeholder="Car Model (Swift Dzire)"
                              placeholderTextColor={themeColors.textMuted}
                              value={carName}
                              onChangeText={setCarName}
                            />
                          </View>

                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                              style={[modalStyles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                              placeholder="Model Year (e.g. 2023)"
                              placeholderTextColor={themeColors.textMuted}
                              keyboardType="numeric"
                              maxLength={4}
                              value={carYear}
                              onChangeText={setCarYear}
                            />
                            <View style={[modalStyles.selectWrap, { flex: 1, backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                              <Text style={{ fontSize: 11.5, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                                {CAR_TYPES.find((c) => c.value === carType)?.label.split(' ')[0] || 'Sedan'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* NESTED DRIVER ATTACHMENT */}
                    <View
                      style={[
                        modalStyles.subSectionBox,
                        {
                          backgroundColor: isDark ? '#1E293B40' : '#F8FAFC',
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <User size={16} color="#8B5CF6" />
                          <Text style={[modalStyles.subSectionTitle, { color: themeColors.text }]}>
                            Attach First Driver (Optional)
                          </Text>
                        </View>
                        <Switch
                          value={includeDriver}
                          onValueChange={setIncludeDriver}
                          trackColor={{ false: '#94A3B8', true: '#8B5CF6' }}
                        />
                      </View>

                      {includeDriver && (
                        <View style={{ marginTop: 10, gap: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                              style={[modalStyles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                              placeholder="Driver Name (or Owner)"
                              placeholderTextColor={themeColors.textMuted}
                              value={driverName}
                              onChangeText={setDriverName}
                            />
                            <TextInput
                              style={[modalStyles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                              placeholder="Driver Mobile"
                              placeholderTextColor={themeColors.textMuted}
                              keyboardType="phone-pad"
                              maxLength={10}
                              value={driverNumber}
                              onChangeText={setDriverNumber}
                            />
                          </View>
                          <TextInput
                            style={[modalStyles.input, { backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
                            placeholder="Driving Licence Number (e.g. TN0120150001234)"
                            placeholderTextColor={themeColors.textMuted}
                            autoCapitalize="characters"
                            value={driverLicence}
                            onChangeText={setDriverLicence}
                          />
                        </View>
                      )}
                    </View>
                  </>
                )}

                {/* Vendor Specific */}
                {accountType === 'vendor' && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                        GPay / UPI Number
                      </Text>
                      <TextInput
                        style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                        placeholder="e.g. 9876543210"
                        placeholderTextColor={themeColors.textMuted}
                        keyboardType="phone-pad"
                        value={gpayNumber}
                        onChangeText={setGpayNumber}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                        Aadhar Number
                      </Text>
                      <TextInput
                        style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                        placeholder="12 digits"
                        placeholderTextColor={themeColors.textMuted}
                        keyboardType="numeric"
                        maxLength={12}
                        value={aadharNumber}
                        onChangeText={setAadharNumber}
                      />
                    </View>
                  </View>
                )}

                {/* Customer / B2B Specific */}
                {accountType === 'customer' && (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          Email Address
                        </Text>
                        <TextInput
                          style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                          placeholder="client@company.com"
                          placeholderTextColor={themeColors.textMuted}
                          keyboardType="email-address"
                          value={email}
                          onChangeText={setEmail}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                          Company GSTIN
                        </Text>
                        <TextInput
                          style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                          placeholder="33AAAAA0000A1Z5"
                          placeholderTextColor={themeColors.textMuted}
                          autoCapitalize="characters"
                          value={gstin}
                          onChangeText={setGstin}
                        />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        style={[
                          modalStyles.segmentBtn,
                          customerSegment === 'B2B' && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setCustomerSegment('B2B')}
                      >
                        <Text style={[modalStyles.segmentBtnText, customerSegment === 'B2B' && { color: '#FFFFFF' }]}>
                          B2B Travel Desk
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          modalStyles.segmentBtn,
                          customerSegment === 'CORPORATE' && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setCustomerSegment('CORPORATE')}
                      >
                        <Text style={[modalStyles.segmentBtnText, customerSegment === 'CORPORATE' && { color: '#FFFFFF' }]}>
                          Corporate Client
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          modalStyles.segmentBtn,
                          customerSegment === 'RETAIL' && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setCustomerSegment('RETAIL')}
                      >
                        <Text style={[modalStyles.segmentBtnText, customerSegment === 'RETAIL' && { color: '#FFFFFF' }]}>
                          Retail Customer
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Password Setting */}
                <View style={{ marginTop: 10 }}>
                  <Text style={[modalStyles.fieldLabel, { color: themeColors.textSecondary }]}>
                    Custom Password (Optional - defaults to DropCars@&lt;last4digits&gt;)
                  </Text>
                  <TextInput
                    style={[modalStyles.input, { backgroundColor: themeColors.surfaceAlt, color: themeColors.text, borderColor: themeColors.border }]}
                    placeholder="Leave empty to auto-generate default password"
                    placeholderTextColor={themeColors.textMuted}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[modalStyles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <UserPlus size={17} color="#FFFFFF" />
                    <Text style={modalStyles.submitBtnText}>
                      Create Verified {accountType === 'fleet' ? 'Fleet Account' : accountType === 'vendor' ? 'Vendor Account' : 'B2B Account'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '90%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  typeSwitcher: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  typePillText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  selectWrap: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  subSectionBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  subSectionTitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 10,
    marginTop: 18,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  successIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    marginBottom: 4,
  },
  successSub: {
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  credBox: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 20,
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  credValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  doneBtn: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
