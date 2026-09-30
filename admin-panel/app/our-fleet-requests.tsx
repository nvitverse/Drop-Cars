import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Car,
  User,
  Plus,
  XCircle,
  Compass,
  Repeat,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';
import { Card, StatusPill, Btn } from '@/components/ui';

interface FleetRouteReservation {
  id: string;
  driverName: string;
  vehicleType: string;
  preferredRoute: string;
  maxBookingsAllowed: number;
  acceptedCount: number;
  status: 'ACTIVE_RESERVED' | 'AUTO_RELEASED' | 'COMPLETED';
}

export default function OurFleetRequestsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [reservations, setReservations] = useState<FleetRouteReservation[]>([
    {
      id: 'res1',
      driverName: 'Kannan M (Mukil #1)',
      vehicleType: 'Sedan (Swift Dzire)',
      preferredRoute: 'Chennai ➔ Trichy / Madurai',
      maxBookingsAllowed: 2,
      acceptedCount: 1,
      status: 'ACTIVE_RESERVED',
    },
    {
      id: 'res2',
      driverName: 'Suresh Kumar (Mukil #2)',
      vehicleType: 'Innova Crysta',
      preferredRoute: 'Coimbatore ➔ Chennai',
      maxBookingsAllowed: 1,
      acceptedCount: 0,
      status: 'ACTIVE_RESERVED',
    },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [vehicleType, setVehicleType] = useState('Sedan');
  const [preferredRoute, setPreferredRoute] = useState('');
  const [maxCount, setMaxCount] = useState('2');

  const handleCreateRequest = () => {
    if (!driverName || !preferredRoute) {
      Alert.alert('Required', 'Enter driver name and preferred route');
      return;
    }
    const newRes: FleetRouteReservation = {
      id: `res_${Date.now()}`,
      driverName: driverName.trim(),
      vehicleType: vehicleType.trim(),
      preferredRoute: preferredRoute.trim(),
      maxBookingsAllowed: parseInt(maxCount, 10) || 1,
      acceptedCount: 0,
      status: 'ACTIVE_RESERVED',
    };
    setReservations([newRes, ...reservations]);
    setShowModal(false);
    setDriverName('');
    setPreferredRoute('');
    showToast('Route reservation active! Confirmed bookings will auto-assign.', 'success');
  };

  const handleRelease = (id: string) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'AUTO_RELEASED' } : r))
    );
    showToast('Route reservation released', 'info');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Our Fleet Route Reservations</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Banner Box */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? themeColors.surfaceAlt : '#EFF6FF', borderColor: themeColors.border }]}>
          <Sparkles size={20} color={themeColors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBannerTitle, { color: themeColors.text }]}>On-the-Way Route Intelligence</Text>
            <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginTop: 2 }}>
              When a confirmed booking matches our fleet's reserved route, it will auto-assign to our driver. If assigned elsewhere, the request auto-releases!
            </Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: themeColors.primary }]} onPress={() => setShowModal(true)}>
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Reserve Route for In-House Fleet</Text>
        </TouchableOpacity>

        {reservations.map((item) => (
          <Card key={item.id} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <User size={18} color={themeColors.primary} />
                <Text style={[styles.driverTitle, { color: themeColors.text }]}>{item.driverName}</Text>
              </View>
              <StatusPill
                label={item.status === 'ACTIVE_RESERVED' ? 'AUTO-ASSIGN' : 'RELEASED'}
                variant={item.status === 'ACTIVE_RESERVED' ? 'success' : 'neutral'}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <View style={styles.row}>
              <Car size={14} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '500' }}>Vehicle: {item.vehicleType}</Text>
            </View>

            <View style={styles.row}>
              <Compass size={14} color={themeColors.primary} />
              <Text style={{ fontSize: 13, color: themeColors.primary, fontWeight: '700' }}>Route: {item.preferredRoute}</Text>
            </View>

            <View style={styles.row}>
              <Repeat size={14} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 13, color: themeColors.textSecondary, fontWeight: '500' }}>
                Bookings Accepted: {item.acceptedCount} / {item.maxBookingsAllowed} max
              </Text>
            </View>

            {item.status === 'ACTIVE_RESERVED' && (
              <TouchableOpacity
                style={styles.releaseBtn}
                onPress={() => handleRelease(item.id)}
              >
                <XCircle size={14} color={themeColors.error} />
                <Text style={{ color: themeColors.error, fontSize: 12.5, fontWeight: '700' }}>Release Reservation</Text>
              </TouchableOpacity>
            )}
          </Card>
        ))}
      </ScrollView>

      {/* Reserve Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Reserve Route for In-House Fleet</Text>

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginTop: 12 }]}
              placeholder="Driver Name (e.g. Kannan M)"
              value={driverName}
              onChangeText={setDriverName}
              placeholderTextColor={themeColors.textMuted}
            />

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginTop: 10 }]}
              placeholder="Vehicle Type (e.g. Sedan, Innova)"
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholderTextColor={themeColors.textMuted}
            />

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginTop: 10 }]}
              placeholder="Preferred Route (e.g. Chennai ➔ Trichy)"
              value={preferredRoute}
              onChangeText={setPreferredRoute}
              placeholderTextColor={themeColors.textMuted}
            />

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginTop: 10 }]}
              placeholder="Max Bookings Allowed (e.g. 2)"
              value={maxCount}
              onChangeText={setMaxCount}
              keyboardType="numeric"
              placeholderTextColor={themeColors.textMuted}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: isDark ? themeColors.surfaceAlt : '#E2E8F0', flex: 1 }]} onPress={() => setShowModal(false)}>
                <Text style={{ color: themeColors.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: themeColors.primary, flex: 1 }]} onPress={handleCreateRequest}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Reserve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  infoBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '800' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 8, padding: 16, marginBottom: 12 },
  driverTitle: { fontSize: 15, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  releaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingTop: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 10, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 },
  modalBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 8 },
});
