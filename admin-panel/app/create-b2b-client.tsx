import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Briefcase,
  User,
  Building,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Lock,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import { Card } from '@/components/ui';

const CLIENT_SEGMENTS = [
  { label: 'B2B Enterprise', value: 'B2B' },
  { label: 'Corporate Desk', value: 'CORPORATE' },
  { label: 'Hotel & Resort Partner', value: 'HOTEL_PARTNER' },
  { label: 'Retail Customer', value: 'RETAIL' },
];

export default function CreateB2BClientScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();

  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [email, setEmail] = useState('');
  const [segment, setSegment] = useState('B2B');
  const [gstin, setGstin] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing Contact', 'Please enter primary contact person name.');
      return;
    }
    const cleanPhone = primaryNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit primary mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiService.createCustomerAccount({
        full_name: fullName.trim(),
        company_name: companyName.trim() || undefined,
        primary_number: cleanPhone,
        email: email.trim() || undefined,
        city: city.trim() || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        customer_segment: segment,
        password: password.trim() || undefined,
      });
      setCreatedResult(res);
    } catch (e: any) {
      Alert.alert('Failed to Onboard Client', e.message || 'Could not register B2B client.');
    } finally {
      setLoading(false);
    }
  };

  if (createdResult) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={styles.successWrapper}>
          <View style={[styles.successIconBox, { backgroundColor: '#EC489920' }]}>
            <CheckCircle2 size={48} color="#EC4899" />
          </View>
          <Text style={[styles.successTitle, { color: themeColors.text }]}>Client Onboarded!</Text>
          <Text style={[styles.successSub, { color: themeColors.textSecondary }]}>
            Corporate B2B account has been created successfully.
          </Text>

          <Card style={[styles.credCard, { borderColor: '#EC489940', backgroundColor: isDark ? '#83184320' : '#FDF2F8' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#EC4899', marginBottom: 8 }}>
              CLIENT ACCESS CREDENTIALS
            </Text>

            <View style={styles.credRow}>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Contact Person:</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>{createdResult.credentials?.full_name}</Text>
            </View>

            <View style={styles.credRow}>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Primary Mobile:</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>{createdResult.credentials?.primary_number}</Text>
            </View>

            <View style={styles.credRow}>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Segment:</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#EC4899' }}>{createdResult.credentials?.segment}</Text>
            </View>

            <View style={styles.credRow}>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>Password:</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#D97706', letterSpacing: 0.5 }}>
                {createdResult.credentials?.temporary_password}
              </Text>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: themeColors.border }]}
              onPress={() => router.push('/(tabs)/fleet-hub')}
            >
              <Text style={[styles.outlineBtnText, { color: themeColors.text }]}>Back to Fleet Hub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#EC4899' }]}
              onPress={() => router.push('/(tabs)/fleet-hub')}
            >
              <Text style={styles.primaryBtnText}>View Client Hub</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border, backgroundColor: themeColors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Onboard B2B / Corporate</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Register enterprise billing & hotel partner clients
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* SECTION 1: CORPORATE & CONTACT INFO */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBox, { backgroundColor: '#EC489920' }]}>
              <Briefcase size={18} color="#EC4899" />
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>1. Client & Corporate Profile</Text>
              <Text style={[styles.sectionSub, { color: themeColors.textSecondary }]}>Enterprise & Point of Contact</Text>
            </View>
          </View>

          <Text style={[styles.label, { color: themeColors.textSecondary }]}>Company / Hotel / Entity Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="e.g. Infosys Ltd, Leela Palace Hotel"
            placeholderTextColor={themeColors.textMuted}
            value={companyName}
            onChangeText={setCompanyName}
          />

          <Text style={[styles.label, { color: themeColors.textSecondary }]}>
            Primary Contact Person <Text style={{ color: colors.error }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="e.g. Ramesh Kumar (Admin Manager)"
            placeholderTextColor={themeColors.textMuted}
            value={fullName}
            onChangeText={setFullName}
          />

          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                Primary Mobile <Text style={{ color: colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="9876543210"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="phone-pad"
                maxLength={10}
                value={primaryNumber}
                onChangeText={setPrimaryNumber}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>Email Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="billing@company.com"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: themeColors.textSecondary, marginTop: 10 }]}>Client Segment</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CLIENT_SEGMENTS.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.typeChip, segment === s.value && { backgroundColor: '#EC4899', borderColor: '#EC4899' }]}
                onPress={() => setSegment(s.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeChipText, segment === s.value && { color: '#FFFFFF', fontWeight: '800' }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* SECTION 2: BILLING & TAX INFORMATION */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBox, { backgroundColor: '#3B82F620' }]}>
              <FileText size={18} color="#3B82F6" />
            </View>
            <View>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>2. Billing & GST Registration</Text>
              <Text style={[styles.sectionSub, { color: themeColors.textSecondary }]}>Invoicing & Tax Credentials</Text>
            </View>
          </View>

          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>GSTIN Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="33AAAAA0000A1Z5"
                placeholderTextColor={themeColors.textMuted}
                autoCapitalize="characters"
                value={gstin}
                onChangeText={setGstin}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>City</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="Chennai, Bangalore"
                placeholderTextColor={themeColors.textMuted}
                value={city}
                onChangeText={setCity}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: themeColors.textSecondary }]}>Billing Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Official Registered Billing Address"
            placeholderTextColor={themeColors.textMuted}
            value={address}
            onChangeText={setAddress}
          />

          <View style={{ marginTop: 10 }}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Custom Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Auto: DropCars@last4"
              placeholderTextColor={themeColors.textMuted}
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </Card>

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: '#EC4899' }, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Onboard & Create B2B Account</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 50,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 10,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    marginTop: 10,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  successWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  successSub: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    marginBottom: 20,
  },
  credCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  outlineBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
