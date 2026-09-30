import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import { ShieldAlert, X, ChevronRight, FileCheck, AlertTriangle, ArrowUpRight, Clock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { DocumentAlertItem } from '@/services/documents/documentStatusService';

const { width, height } = Dimensions.get('window');

interface KycPendingModalProps {
  visible: boolean;
  onClose: () => void;
  onCompleteKyc: () => void;
  alerts?: DocumentAlertItem[];
  onUpdateItem?: (targetRoute: string) => void;
}

export default function KycPendingModal({
  visible,
  onClose,
  onCompleteKyc,
  alerts = [],
  onUpdateItem,
}: KycPendingModalProps) {
  const { colors, isDarkMode } = useTheme();

  const hasExpiredDocs = alerts.some((a) => a.status === 'EXPIRED');
  const hasExpiringSoonDocs = alerts.some((a) => a.status === 'EXPIRING_SOON');

  const getHeaderTitle = () => {
    if (hasExpiredDocs) return 'Documents Expired!';
    if (hasExpiringSoonDocs) return 'Document Renewal Required';
    return 'KYC & Verification Pending';
  };

  const getHeaderSubtitle = () => {
    if (hasExpiredDocs)
      return 'Some of your uploaded documents have expired. Please update them immediately to stay compliant and accept bookings.';
    if (hasExpiringSoonDocs)
      return 'Some of your documents are expiring within 10 days. Please update them to avoid account disruption.';
    return 'Your account verification is currently pending. Complete your Aadhar & PAN document verification to unlock full platform features.';
  };

  const handleItemUpdate = (targetRoute: string) => {
    onClose();
    if (onUpdateItem) {
      onUpdateItem(targetRoute);
    } else {
      onCompleteKyc();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
              borderColor: hasExpiredDocs
                ? 'rgba(239, 68, 68, 0.4)'
                : isDarkMode
                ? 'rgba(245, 158, 11, 0.3)'
                : 'rgba(245, 158, 11, 0.25)',
            },
          ]}
        >
          {/* Close X Button in Top Right */}
          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={styles.iconContainer}>
            <View
              style={[
                styles.iconRing,
                {
                  backgroundColor: hasExpiredDocs
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                  borderColor: hasExpiredDocs
                    ? 'rgba(239, 68, 68, 0.3)'
                    : 'rgba(245, 158, 11, 0.3)',
                },
              ]}
            >
              <ShieldAlert
                size={34}
                color={hasExpiredDocs ? '#EF4444' : '#F59E0B'}
              />
            </View>
          </View>

          {/* Header Title & Pill */}
          <View style={styles.headerTextGroup}>
            <View
              style={[
                styles.alertPill,
                {
                  backgroundColor: hasExpiredDocs
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(245, 158, 11, 0.18)',
                },
              ]}
            >
              <AlertTriangle
                size={12}
                color={hasExpiredDocs ? '#EF4444' : '#D97706'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.alertPillText,
                  { color: hasExpiredDocs ? '#EF4444' : '#D97706' },
                ]}
              >
                {hasExpiredDocs
                  ? 'CRITICAL UPLOAD NEEDED'
                  : 'ACTION REQUIRED'}
              </Text>
            </View>

            <Text style={[styles.title, { color: colors.text }]}>
              {getHeaderTitle()}
            </Text>

            <Text
              style={[styles.description, { color: colors.textSecondary }]}
            >
              {getHeaderSubtitle()}
            </Text>
          </View>

          {/* Alert List Container */}
          <ScrollView
            style={styles.alertScroll}
            contentContainerStyle={styles.alertScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {alerts && alerts.length > 0 ? (() => {
              const groupsMap: Record<string, {
                entity_type: string;
                title: string;
                target_route: string;
                items: DocumentAlertItem[];
                hasExpired: boolean;
                hasExpiringSoon: boolean;
              }> = {};

              alerts.forEach((item) => {
                const key = item.entity_type;
                let groupTitle = 'Owner Verification';
                if (key === 'car') groupTitle = 'Vehicle Documents';
                if (key === 'driver') groupTitle = 'Driver Documents';

                if (!groupsMap[key]) {
                  groupsMap[key] = {
                    entity_type: key,
                    title: groupTitle,
                    target_route: item.target_route,
                    items: [],
                    hasExpired: false,
                    hasExpiringSoon: false,
                  };
                }

                groupsMap[key].items.push(item);
                if (item.status === 'EXPIRED') groupsMap[key].hasExpired = true;
                if (item.status === 'EXPIRING_SOON') groupsMap[key].hasExpiringSoon = true;
              });

              const groupList = Object.values(groupsMap);

              return groupList.map((group) => {
                const isExpired = group.hasExpired;
                const isExpiringSoon = group.hasExpiringSoon;

                const badgeBg = isExpired
                  ? 'rgba(239, 68, 68, 0.15)'
                  : isExpiringSoon
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)';

                const badgeTextColor = isExpired
                  ? '#EF4444'
                  : isExpiringSoon
                  ? '#D97706'
                  : '#4F46E5';

                // Multiple cars/drivers each missing the same document type
                // (e.g. 2 drivers both missing "Driving Licence (Back)")
                // used to print that title twice in a row here, reading
                // like a literal duplicate-data bug rather than "2 drivers
                // need this". Collapse repeats into a single "Title x2".
                const titleCounts = new Map<string, number>();
                group.items.forEach((i) => titleCounts.set(i.title, (titleCounts.get(i.title) || 0) + 1));
                const docNames = Array.from(titleCounts.entries())
                  .map(([title, count]) => (count > 1 ? `${title} x${count}` : title))
                  .join(', ');

                return (
                  <View
                    key={group.entity_type}
                    style={[
                      styles.alertItemCard,
                      {
                        backgroundColor: isDarkMode
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(243, 244, 246, 0.8)',
                        borderColor: isExpired
                          ? 'rgba(239, 68, 68, 0.3)'
                          : isDarkMode
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(229, 231, 235, 1)',
                      },
                    ]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 2,
                        }}
                      >
                        <Text
                          style={[styles.itemTitleText, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {group.title}
                        </Text>
                        <View
                          style={[
                            styles.badgeContainer,
                            { backgroundColor: badgeBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: badgeTextColor },
                            ]}
                          >
                            {group.items.length} {group.items.length === 1 ? 'Pending' : 'Pending'}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.itemSubtitleText,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {docNames}
                      </Text>
                    </View>

                    {/* Dedicated Update Button for Group */}
                    <TouchableOpacity
                      style={styles.updateButton}
                      onPress={() => handleItemUpdate(group.target_route)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.updateButtonText}>Update ({group.items.length})</Text>
                      <ArrowUpRight size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                );
              });
            })() : (
              <View
                style={[
                  styles.requirementsCard,
                  {
                    backgroundColor: isDarkMode
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(254, 243, 199, 0.6)',
                    borderColor: isDarkMode
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(245, 158, 11, 0.3)',
                  },
                ]}
              >
                <View style={styles.reqItem}>
                  <FileCheck
                    size={16}
                    color="#D97706"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.reqText, { color: colors.text }]}>
                    Aadhar Card (Front & Back)
                  </Text>
                  <Text style={styles.statusBadge}>Pending</Text>
                </View>

                <View style={[styles.reqItem, { marginTop: 8 }]}>
                  <FileCheck
                    size={16}
                    color="#D97706"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.reqText, { color: colors.text }]}>
                    PAN Card Verification
                  </Text>
                  <Text style={styles.statusBadge}>Pending</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: hasExpiredDocs ? '#EF4444' : '#F59E0B' },
              ]}
              onPress={() => {
                onClose();
                onCompleteKyc();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                {hasExpiredDocs ? 'Update Expired Documents' : 'Update Verification Now'}
              </Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  borderColor: isDarkMode
                    ? 'rgba(255, 255, 255, 0.15)'
                    : 'rgba(0, 0, 0, 0.12)',
                },
              ]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.textSecondary },
                ]}
              >
                Remind Me Later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: Math.min(width - 40, 420),
    maxHeight: height * 0.85,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 14,
    alignItems: 'center',
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  headerTextGroup: {
    alignItems: 'center',
    marginBottom: 14,
  },
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  alertPillText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  alertScroll: {
    width: '100%',
    maxHeight: 220,
    marginBottom: 16,
  },
  alertScrollContent: {
    gap: 8,
  },
  alertItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemTitleText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
  itemSubtitleText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  badgeContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  updateButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
  },
  requirementsCard: {
    width: '100%',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
  },
  reqItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reqText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },
  statusBadge: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#D97706',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
    marginRight: 4,
  },
  secondaryButton: {
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
  },
});
