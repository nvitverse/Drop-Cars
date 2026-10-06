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
} from 'react-native';
import {
  X,
  Users,
  Globe,
  MapPin,
  Car,
  TrendingUp,
  Coffee,
  Check,
  Send,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { colors } from '@/constants/theme';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';

export interface TransferReason {
  id: string;
  label: string;
  category: 'language' | 'route' | 'vehicle' | 'escalation' | 'break' | 'other';
  icon: any;
  subtext: string;
}

export const TRANSFER_REASONS: TransferReason[] = [
  {
    id: 'lang_kannada',
    label: 'Kannada Preferred (ಕನ್ನಡ)',
    category: 'language',
    icon: Globe,
    subtext: 'Customer requested Kannada speaking agent',
  },
  {
    id: 'lang_telugu',
    label: 'Telugu Preferred (తెలుగు)',
    category: 'language',
    icon: Globe,
    subtext: 'Customer requested Telugu speaking agent',
  },
  {
    id: 'lang_hindi',
    label: 'Hindi Preferred (हिन्दी)',
    category: 'language',
    icon: Globe,
    subtext: 'Customer requested Hindi speaking agent',
  },
  {
    id: 'lang_malayalam',
    label: 'Malayalam Preferred (മലയാളം)',
    category: 'language',
    icon: Globe,
    subtext: 'Customer requested Malayalam speaking agent',
  },
  {
    id: 'route_hill_station',
    label: 'Hill Station / Route Specialist',
    category: 'route',
    icon: MapPin,
    subtext: 'Permits, Ghat roads (Ooty, Kodaikanal, Munnar)',
  },
  {
    id: 'route_airport_outstation',
    label: 'Outstation / Airport Operations',
    category: 'route',
    icon: MapPin,
    subtext: 'Specialized interstate / airport booking specialist',
  },
  {
    id: 'vehicle_luxury',
    label: 'Luxury / Premium Cars (Audi/BMW)',
    category: 'vehicle',
    icon: Car,
    subtext: 'Wedding / VIP / Luxury fleet coordination',
  },
  {
    id: 'vehicle_tempo_bus',
    label: 'Tempo Traveller / Mini-Bus',
    category: 'vehicle',
    icon: Car,
    subtext: 'Group travel & customized tariff structure',
  },
  {
    id: 'discount_escalation',
    label: 'Price Escalation / High Discount',
    category: 'escalation',
    icon: TrendingUp,
    subtext: 'Requires Manager / Team Lead approval',
  },
  {
    id: 'break_handover',
    label: 'Break / Shift Buddy Handover',
    category: 'break',
    icon: Coffee,
    subtext: 'Temporary handover during lunch/tea break',
  },
];

interface LeadTransferModalProps {
  visible: boolean;
  onClose: () => void;
  enquiryId: string | number;
  customerName?: string;
  customerPhone?: string;
  currentAssignedStaff?: string;
  onTransferSuccess: (newStaffName: string, reasonLabel: string, note: string) => void;
}

export default function LeadTransferModal({
  visible,
  onClose,
  enquiryId,
  customerName,
  customerPhone,
  currentAssignedStaff,
  onTransferSuccess,
}: LeadTransferModalProps) {
  const { themeColors, isDark } = useTheme();
  const { toast, showToast } = useToast();

  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffList, setStaffList] = useState<Array<{ id: string; username: string; role: string; phone?: string }>>([]);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; username: string } | null>(null);
  const [selectedReason, setSelectedReason] = useState<TransferReason>(TRANSFER_REASONS[0]);
  const [customNote, setCustomNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadStaffMembers();
      setSelectedStaff(null);
      setCustomNote('');
    }
  }, [visible]);

  const loadStaffMembers = async () => {
    setLoadingStaff(true);
    try {
      const admins = await apiService.getAdminsList();
      if (Array.isArray(admins)) {
        const list = admins.map((a: any) => ({
          id: String(a.id),
          username: a.username,
          role: a.role || 'Staff',
          phone: a.phone,
        }));
        setStaffList(list);
        if (list.length > 0) {
          setSelectedStaff({ id: list[0].id, username: list[0].username });
        }
      }
    } catch (err) {
      console.warn('Could not load staff list for transfer modal:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!selectedStaff) {
      Alert.alert('Select Staff', 'Please choose a staff member to transfer this lead to.');
      return;
    }

    setSubmitting(true);
    try {
      const handoverRemarks = `[Transferred to ${selectedStaff.username}]: Reason - ${selectedReason.label}${
        customNote.trim() ? ` | Notes: ${customNote.trim()}` : ''
      }`;

      onTransferSuccess(selectedStaff.username, selectedReason.label, handoverRemarks);
      onClose();
    } catch (err: any) {
      Alert.alert('Transfer Error', err?.message || 'Failed to transfer lead. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.headerRow,
              {
                borderBottomColor: isDark ? '#334155' : '#F1F5F9',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isDark ? '#3B82F625' : '#EEF2FF' },
                ]}
              >
                <Users size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Transfer Lead #{enquiryId}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                  {customerName ? `${customerName} (${customerPhone || ''})` : 'Multi-Reason Reassignment'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Step 1: Select Target Staff */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                1. Transfer To (Assignee):
              </Text>

              {loadingStaff ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
              ) : staffList.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginVertical: 6 }}>
                  No other active staff found.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {staffList.map((member) => {
                      const isSelected = selectedStaff?.id === member.id;
                      return (
                        <TouchableOpacity
                          key={member.id}
                          activeOpacity={0.8}
                          onPress={() => setSelectedStaff({ id: member.id, username: member.username })}
                          style={[
                            styles.staffChip,
                            {
                              backgroundColor: isSelected
                                ? isDark ? '#1D4ED835' : '#EEF2FF'
                                : isDark ? '#0F172A' : '#F8FAFC',
                              borderColor: isSelected ? colors.primary : isDark ? '#334155' : '#E2E8F0',
                            },
                          ]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View
                              style={[
                                styles.avatarCircle,
                                { backgroundColor: isSelected ? colors.primary : isDark ? '#334155' : '#CBD5E1' },
                              ]}
                            >
                              <Text style={styles.avatarText}>{member.username.charAt(0).toUpperCase()}</Text>
                            </View>
                            <View>
                              <Text
                                style={[
                                  styles.staffName,
                                  { color: isSelected ? colors.primary : themeColors.text },
                                ]}
                              >
                                {member.username}
                              </Text>
                              <Text style={styles.staffRole}>{member.role}</Text>
                            </View>
                            {isSelected && <Check size={14} color={colors.primary} style={{ marginLeft: 4 }} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </View>

            {/* Step 2: Transfer Reason Selection */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 8 }]}>
                2. Reason for Transfer:
              </Text>

              <View style={styles.reasonsGrid}>
                {TRANSFER_REASONS.map((r) => {
                  const IconComp = r.icon;
                  const isSelected = selectedReason.id === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={0.85}
                      onPress={() => setSelectedReason(r)}
                      style={[
                        styles.reasonCard,
                        {
                          backgroundColor: isSelected
                            ? isDark ? '#1E3A8A30' : '#EFF6FF'
                            : isDark ? '#0F172A' : '#F8FAFC',
                          borderColor: isSelected ? '#3B82F6' : isDark ? '#334155' : '#E2E8F0',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <View
                          style={[
                            styles.reasonIconBox,
                            { backgroundColor: isSelected ? '#3B82F620' : isDark ? '#1E293B' : '#E2E8F0' },
                          ]}
                        >
                          <IconComp size={15} color={isSelected ? '#3B82F6' : themeColors.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.reasonLabel,
                              { color: isSelected ? '#2563EB' : themeColors.text },
                            ]}
                          >
                            {r.label}
                          </Text>
                          <Text style={[styles.reasonSubtext, { color: themeColors.textSecondary }]}>
                            {r.subtext}
                          </Text>
                        </View>
                        {isSelected && <Check size={16} color="#3B82F6" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Step 3: Handover Note / Context */}
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 6 }]}>
                3. Handover Remarks for {selectedStaff?.username || 'Assignee'}:
              </Text>
              <TextInput
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: isDark ? '#334155' : '#CBD5E1',
                    color: themeColors.text,
                  },
                ]}
                placeholder="e.g. Customer requested Kannada quote, promised ₹18/km for Innova..."
                placeholderTextColor={themeColors.textMuted}
                multiline
                numberOfLines={3}
                value={customNote}
                onChangeText={setCustomNote}
              />
            </View>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View
            style={[
              styles.footerRow,
              {
                borderTopColor: isDark ? '#334155' : '#F1F5F9',
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: themeColors.border }]}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleConfirmTransfer}
              disabled={submitting || !selectedStaff}
              style={[
                styles.confirmBtn,
                { backgroundColor: selectedStaff ? colors.primary : '#94A3B8' },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={15} color="#FFFFFF" />
                  <Text style={styles.confirmBtnText}>
                    Transfer to {selectedStaff?.username || 'Staff'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionWrap: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  staffName: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  staffRole: {
    fontSize: 10,
    color: '#64748B',
  },
  reasonsGrid: {
    gap: 8,
  },
  reasonCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  reasonIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  reasonLabel: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  reasonSubtext: {
    fontSize: 10.5,
    marginTop: 2,
  },
  noteInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 64,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
});
