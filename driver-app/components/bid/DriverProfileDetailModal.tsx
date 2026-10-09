import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import {
  X,
  Star,
  ShieldCheck,
  Car,
  UserCheck,
  Phone,
  MessageSquare,
  Award,
  CheckCircle2,
  Clock,
  ChevronRight,
} from 'lucide-react-native';
import AppText from '@/components/AppText';
import PartnerBadge from '@/components/PartnerBadge';
import { colors } from '@/theme/tokens';

export interface DriverProfileDetailModalProps {
  visible: boolean;
  driverData: {
    driver_id?: string;
    driver_name: string;
    driver_phone?: string;
    profile_photo_url?: string;
    rating?: number;
    total_trips?: number;
    on_time_percentage?: number;
    car_name?: string;
    car_number?: string;
    car_type?: string;
    vehicle_front_photo?: string;
    vehicle_side_photo?: string;
    vendor_name?: string;
    vendor_phone?: string;
    is_verified_partner?: boolean;
  };
  onClose: () => void;
  onAcceptDriver?: () => void;
  onOpenChat?: () => void;
}

export const DriverProfileDetailModal: React.FC<DriverProfileDetailModalProps> = ({
  visible,
  driverData,
  onClose,
  onAcceptDriver,
  onOpenChat,
}) => {
  const [selectedPhotoTab, setSelectedPhotoTab] = useState<'front' | 'side'>('front');

  const {
    driver_name = 'Driver Partner',
    profile_photo_url,
    rating = 4.9,
    total_trips = 145,
    on_time_percentage = 98,
    car_name = 'Maruti Swift Dzire',
    car_number = 'TN-01-AB-1234',
    car_type = 'Sedan',
    vehicle_front_photo,
    vehicle_side_photo,
    vendor_name = 'Drop Cars Fleet Driver',
    is_verified_partner = true,
  } = driverData || {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Modal Header */}
          <View style={styles.header}>
            <AppText variant="subtitle" weight="bold">
              Driver & Vehicle Profile
            </AppText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Driver Identity Card */}
            <View style={styles.driverHeaderCard}>
              <View style={styles.avatarContainer}>
                {profile_photo_url ? (
                  <Image source={{ uri: profile_photo_url }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <UserCheck size={32} color="#FFFFFF" />
                  </View>
                )}
                {is_verified_partner && (
                  <View style={styles.verifiedCheckBadge}>
                    <CheckCircle2 size={16} color="#FFFFFF" />
                  </View>
                )}
              </View>

              <View style={styles.driverMainInfo}>
                <View style={styles.nameBadgeRow}>
                  <AppText variant="subtitle" weight="bold" numberOfLines={1}>
                    {driver_name}
                  </AppText>
                  {is_verified_partner && (
                    <View style={styles.verifiedBadge}>
                      <ShieldCheck size={12} color={colors.success.main} />
                      <AppText variant="caption" weight="bold" color={colors.success.main}>
                        Verified Driver
                      </AppText>
                    </View>
                  )}
                </View>

                <AppText variant="caption" color={colors.text.secondary}>
                  Fleet Partner: {vendor_name}
                </AppText>

                {/* Rating & Performance Metrics */}
                <View style={styles.metricsRow}>
                  <View style={styles.ratingTag}>
                    <Star size={13} color="#F59E0B" fill="#F59E0B" />
                    <AppText variant="caption" weight="bold" color="#D97706">
                      {rating.toFixed(1)} ({total_trips} Trips)
                    </AppText>
                  </View>

                  <View style={styles.onTimeTag}>
                    <Clock size={12} color={colors.primary.main} />
                    <AppText variant="caption" weight="semibold" color={colors.primary.main}>
                      {on_time_percentage}% On-Time
                    </AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* Vehicle Photos Showcase */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Car size={16} color={colors.primary.main} />
                <AppText variant="label" weight="bold">
                  Assigned Vehicle ({car_type})
                </AppText>
              </View>

              <View style={styles.carInfoBar}>
                <AppText variant="body" weight="bold" color={colors.text.primary} style={{ flex: 1 }}>
                  {car_name}
                </AppText>
                <View style={styles.plateBadge}>
                  <AppText variant="caption" weight="bold" color="#0F172A">
                    {car_number}
                  </AppText>
                </View>
              </View>

              {/* Photo Selector Tabs */}
              <View style={styles.photoTabsRow}>
                <TouchableOpacity
                  style={[styles.photoTab, selectedPhotoTab === 'front' && styles.photoTabActive]}
                  onPress={() => setSelectedPhotoTab('front')}
                >
                  <AppText
                    variant="caption"
                    weight={selectedPhotoTab === 'front' ? 'bold' : 'medium'}
                    color={selectedPhotoTab === 'front' ? colors.primary.main : colors.text.secondary}
                  >
                    Front View Photo
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.photoTab, selectedPhotoTab === 'side' && styles.photoTabActive]}
                  onPress={() => setSelectedPhotoTab('side')}
                >
                  <AppText
                    variant="caption"
                    weight={selectedPhotoTab === 'side' ? 'bold' : 'medium'}
                    color={selectedPhotoTab === 'side' ? colors.primary.main : colors.text.secondary}
                  >
                    Side View Photo
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Photo Preview Container */}
              <View style={styles.imagePreviewBox}>
                {selectedPhotoTab === 'front' && vehicle_front_photo ? (
                  <Image source={{ uri: vehicle_front_photo }} style={styles.vehicleImage} resizeMode="cover" />
                ) : selectedPhotoTab === 'side' && vehicle_side_photo ? (
                  <Image source={{ uri: vehicle_side_photo }} style={styles.vehicleImage} resizeMode="cover" />
                ) : (
                  <View style={styles.noPhotoPlaceholder}>
                    <Car size={40} color={colors.text.muted} />
                    <AppText variant="caption" color={colors.text.muted}>
                      Vehicle inspection photo verified by Drop Cars
                    </AppText>
                  </View>
                )}
              </View>
            </View>

            {/* Performance Badges */}
            <View style={styles.scorecardGrid}>
              <View style={styles.scoreCardItem}>
                <Award size={18} color="#D97706" />
                <AppText variant="caption" weight="bold" color={colors.text.primary}>
                  Top Partner
                </AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  High Customer Rating
                </AppText>
              </View>

              <View style={styles.scoreCardItem}>
                <ShieldCheck size={18} color={colors.success.main} />
                <AppText variant="caption" weight="bold" color={colors.text.primary}>
                  KYC Verified
                </AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  DL & Police Checked
                </AppText>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionFooter}>
            {onOpenChat && (
              <TouchableOpacity
                style={styles.chatButton}
                onPress={onOpenChat}
                activeOpacity={0.8}
              >
                <MessageSquare size={18} color={colors.primary.main} />
                <AppText variant="label" weight="bold" color={colors.primary.main}>
                  In-App Chat
                </AppText>
              </TouchableOpacity>
            )}

            {onAcceptDriver && (
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={onAcceptDriver}
                activeOpacity={0.8}
              >
                <AppText variant="body" weight="bold" color="#FFFFFF">
                  Accept Driver & Vehicle
                </AppText>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 16,
  },
  driverHeaderCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.surface.bg,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.success.main,
    borderRadius: 6,
    padding: 2,
  },
  driverMainInfo: {
    flex: 1,
    gap: 4,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.success.subtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.success.border,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  ratingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  onTimeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary.subtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sectionContainer: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  plateBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  photoTabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  photoTabActive: {
    borderBottomColor: colors.primary.main,
  },
  imagePreviewBox: {
    height: 160,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  noPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  scorecardGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  scoreCardItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  actionFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: colors.primary.subtle,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: colors.primary.main,
  },
});

export default DriverProfileDetailModal;
