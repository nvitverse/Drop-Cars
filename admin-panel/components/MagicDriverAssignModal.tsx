import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  X,
  Sparkles,
  User,
  Phone,
  Car,
  CheckCircle2,
  Share2,
  Truck,
  ArrowRight,
} from 'lucide-react-native';
import { parseDriverCabMessage } from '@/utils/magicParser';
import { openWhatsApp } from '@/utils/whatsapp';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

interface MagicDriverAssignModalProps {
  visible: boolean;
  onClose: () => void;
  order: any;
  onSuccess: () => void;
}

export default function MagicDriverAssignModal({
  visible,
  onClose,
  order,
  onSuccess,
}: MagicDriverAssignModalProps) {
  const { themeColors, isDark } = useTheme();

  const [rawMagicText, setRawMagicText] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [carName, setCarName] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [executedPlatform, setExecutedPlatform] = useState('External Drivers Portal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseConfidence, setParseConfidence] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'>('NONE');

  useEffect(() => {
    if (visible && order) {
      setRawMagicText('');
      setDriverName(order.assigned_driver?.name || order.assigned_driver?.full_name || order.driver_name || '');
      setDriverPhone(order.assigned_driver?.phone || order.driver_number || '');
      setCarName(order.assigned_car?.car_name || order.car_name || '');
      setCarNumber(order.assigned_car?.car_number || order.car_number || '');
      setExecutedPlatform(order.executed_platform || 'External Drivers Portal');
      setParseConfidence('NONE');
    }
  }, [visible, order]);

  const handleMagicParse = () => {
    if (!rawMagicText.trim()) {
      Alert.alert('Empty Message', 'Please paste the WhatsApp / SMS driver message into the Magic Box.');
      return;
    }

    const parsed = parseDriverCabMessage(rawMagicText);
    if (parsed.driverName) setDriverName(parsed.driverName);
    if (parsed.driverPhone) setDriverPhone(parsed.driverPhone);
    if (parsed.carName) setCarName(parsed.carName);
    if (parsed.carNumber) setCarNumber(parsed.carNumber);
    setParseConfidence(parsed.rawConfidence);
  };

  const handleSaveDriverDetails = async () => {
    if (!order) return;
    if (!driverName.trim() || !driverPhone.trim() || !carNumber.trim()) {
      Alert.alert('Missing Fields', 'Please fill in Driver Name, Phone, and Vehicle Number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetId = order.id || order._id;

      // 1. Update executed platform tag
      if (executedPlatform) {
        try {
          await apiService.updateOrderExecutedPlatform(targetId, executedPlatform);
        } catch (e) {
          console.warn('Could not update executed platform:', e);
        }
      }

      // 2. Persist driver & car details to backend/portal
      const endpoint = `https://dropcars.in/api/portal-orders.php?action=submit_driver`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: targetId,
          driver_name: driverName.trim(),
          driver_phone: driverPhone.trim(),
          car_model: carName.trim() || 'Sedan',
          car_number: carNumber.trim(),
          executed_platform: executedPlatform,
        }),
      }).catch((e) => console.warn('Portal orders sync:', e));

      Alert.alert(
        'Driver Details Assigned! 🎉',
        `Driver: ${driverName} (${driverPhone})\nCab: ${carName} - ${carNumber}\n\nWould you like to share these details with the customer on WhatsApp now?`,
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
          {
            text: 'Share on WhatsApp',
            style: 'default',
            onPress: () => {
              shareToCustomer();
              onSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update driver details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareToCustomer = () => {
    if (!order) return;
    const custName = order.customer_name || 'Valued Customer';
    const pLoc = order.pickup_drop_location?.pickup;
    const dLoc = order.pickup_drop_location?.drop;
    const pCity = pLoc?.city || pLoc?.address || order.pickup_location || 'Pickup City';
    const dCity = dLoc?.city || dLoc?.address || order.drop_location || 'Drop City';
    const totFare = Number(order.quoted_total_amount || order.estimated_price || order.total_amount || 0);

    const msg =
      `*Drop Cars - Booking Confirmed!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Dear *${custName}*, your cab and driver have been successfully assigned for your upcoming trip.\n\n` +
      `📌 *Booking ID:* #DC-${order.id || order._id}\n` +
      `📍 *Pickup:* ${pCity}\n` +
      `🏁 *Drop:* ${dCity}\n\n` +
      `🚗 *VEHICLE & DRIVER DETAILS:*\n` +
      `• *Car Model:* ${carName || 'Sedan'}\n` +
      `• *Vehicle No:* *${carNumber}*\n` +
      `• *Driver Name:* *${driverName}*\n` +
      `• *Driver Contact:* *+91 ${driverPhone.replace(/[^0-9]/g, '').slice(-10)}*\n\n` +
      `💵 *Total Fare:* ₹${totFare.toLocaleString('en-IN')}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📞 *24x7 Customer Support:* +91 93630 12345\n` +
      `🌐 *Website:* https://dropcars.in\n\n` +
      `_Have a safe and pleasant journey with Drop Cars!_`;

    openWhatsApp({
      phone: order.customer_number || '',
      message: msg,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.magicIconPill}>
                <Sparkles size={18} color="#9333EA" />
              </View>
              <View>
                <Text style={[styles.title, { color: themeColors.text }]}>Magic Box Driver Assign</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Booking #{order?.id || order?._id}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* Magic Box Input */}
            <View style={[styles.magicBoxContainer, { backgroundColor: isDark ? '#1E1B4B' : '#FAF5FF', borderColor: isDark ? '#4338CA' : '#E9D5FF' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} color="#9333EA" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#9333EA' }}>MAGIC BOX (Paste WhatsApp Message)</Text>
                </View>
                {parseConfidence !== 'NONE' && (
                  <View style={[styles.confidenceBadge, { backgroundColor: parseConfidence === 'HIGH' ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: parseConfidence === 'HIGH' ? '#15803D' : '#B45309' }}>
                      {parseConfidence} CONFIDENCE
                    </Text>
                  </View>
                )}
              </View>

              <TextInput
                style={[styles.magicTextarea, { color: themeColors.text, backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#334155' : '#DDD6FE' }]}
                placeholder={`Paste raw WhatsApp text e.g.:\nDriver: Ramesh\nSwift Dzire\nTN09AB1234\n9876543210`}
                placeholderTextColor={themeColors.textMuted}
                value={rawMagicText}
                onChangeText={setRawMagicText}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity style={styles.parseBtn} onPress={handleMagicParse} activeOpacity={0.8}>
                <Sparkles size={15} color="#FFFFFF" />
                <Text style={styles.parseBtnText}>✨ Auto-Parse Driver & Cab Details</Text>
              </TouchableOpacity>
            </View>

            {/* Platform / Execution Type */}
            <Text style={[styles.sectionLabel, { color: themeColors.text }]}>Executed Platform / Source:</Text>
            <View style={styles.platformRow}>
              {['External Drivers Portal', 'Savaari', 'MakeMyTrip', 'Goibibo', 'Local Vendor', 'Own Driver'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.platformPill,
                    { backgroundColor: executedPlatform === p ? '#2563EB' : isDark ? '#1E293B' : '#F1F5F9' },
                  ]}
                  onPress={() => setExecutedPlatform(p)}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: executedPlatform === p ? '#FFFFFF' : themeColors.text }}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Extracted Fields */}
            <Text style={[styles.sectionLabel, { color: themeColors.text, marginTop: 10 }]}>Driver & Vehicle Info:</Text>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Name:</Text>
                <View style={[styles.inputContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <User size={15} color="#6B7280" />
                  <TextInput
                    style={[styles.textInput, { color: themeColors.text }]}
                    placeholder="e.g. Suresh Kumar"
                    placeholderTextColor={themeColors.textMuted}
                    value={driverName}
                    onChangeText={setDriverName}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Mobile:</Text>
                <View style={[styles.inputContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Phone size={15} color="#6B7280" />
                  <TextInput
                    style={[styles.textInput, { color: themeColors.text }]}
                    placeholder="9876543210"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="phone-pad"
                    value={driverPhone}
                    onChangeText={setDriverPhone}
                  />
                </View>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Car Model / Name:</Text>
                <View style={[styles.inputContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Car size={15} color="#6B7280" />
                  <TextInput
                    style={[styles.textInput, { color: themeColors.text }]}
                    placeholder="e.g. Swift Dzire"
                    placeholderTextColor={themeColors.textMuted}
                    value={carName}
                    onChangeText={setCarName}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Vehicle Registration No:</Text>
                <View style={[styles.inputContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Truck size={15} color="#6B7280" />
                  <TextInput
                    style={[styles.textInput, { color: themeColors.text, textTransform: 'uppercase' }]}
                    placeholder="TN 09 AB 1234"
                    placeholderTextColor={themeColors.textMuted}
                    value={carNumber}
                    onChangeText={setCarNumber}
                  />
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.btnCancel, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} onPress={onClose}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSave, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSaveDriverDetails}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="#FFFFFF" />
                    <Text style={styles.btnSaveText}>Save & Update Driver</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  magicIconPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  bodyScroll: {
    marginTop: 4,
  },
  magicBoxContainer: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  magicTextarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  parseBtn: {
    backgroundColor: '#9333EA',
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  parseBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  platformPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    gap: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSave: {
    flex: 2,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});
