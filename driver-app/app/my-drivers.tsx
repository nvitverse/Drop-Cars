import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Linking,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Users,
  Plus,
  Phone,
  MapPin,
  CreditCard,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Edit2,
  MessageCircle,
  FileText,
  Upload,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { fetchDocumentStatuses, DocumentStatusResponse } from '@/services/documents/documentStatusService';
import DocumentStatusIcon from '@/components/DocumentStatusIcon';
import DocumentUpdateModal from '@/components/DocumentUpdateModal';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosInstance from '@/app/api/axiosInstance';

export default function MyDriversScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const {
    loading,
    error,
    fetchData,
    availableDrivers,
    availableDriversLoading,
    availableDriversError,
    fetchAvailableDriversData,
    refreshAvailableDrivers,
  } = useDashboard();
  const router = useRouter();
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatusResponse[]>([]);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{
    entityId: string;
    documentType: string;
    documentName: string;
    targetSide?: 'front' | 'back';
    initialDocumentNumber?: string;
    initialDriverName?: string;
  } | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  // Driver Name Edit Modal state
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [editingDriver, setEditingDriver] = useState<{ id: string; name: string } | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchAvailableDriversData();
    fetchDocumentStatuses()
      .then(setDocumentStatuses)
      .catch((err) => {
        console.error('Failed to fetch document statuses:', err);
      });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAvailableDrivers();
      await fetchDocumentStatuses().then(setDocumentStatuses);
    } catch (err) {
      console.error('Error refreshing drivers:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const getDocumentStatus = (driverId: string, documentType: string): string => {
    const driverStatus = documentStatuses.find(
      (status) => status.entity_type === 'driver' && status.entity_id === driverId
    );
    if (!driverStatus || !driverStatus.documents[documentType]) {
      return 'PENDING';
    }
    return driverStatus.documents[documentType].status;
  };

  const getDaysLeft = (driverId: string, documentType: string): number | null => {
    const st = documentStatuses.find((x: any) => x.entity_type === 'driver' && x.entity_id === driverId);
    const d = st?.documents?.[documentType]?.days_left;
    return typeof d === 'number' ? d : null;
  };

  const licenceRenewNote = (driverId: string): string => {
    const d = getDaysLeft(driverId, 'licence');
    if (d === null || d > 15) return '';
    return d < 0 ? `Licence expired ${-d} day(s) ago` : `Licence expires in ${d} day(s)`;
  };

  const handleDocumentUpdate = (
    driverId: string,
    documentType: string,
    documentName: string,
    targetSide?: 'front' | 'back',
    initialDocumentNumber?: string,
    initialDriverName?: string
  ) => {
    setSelectedDocument({
      entityId: driverId,
      documentType,
      documentName,
      targetSide,
      initialDocumentNumber,
      initialDriverName,
    });
    setShowUpdateModal(true);
  };

  const handleDocumentUpdateSuccess = () => {
    fetchDocumentStatuses()
      .then(setDocumentStatuses)
      .catch((err) => {
        console.error('Failed to refresh document statuses:', err);
      });
    refreshAvailableDrivers();
  };

  // Open Name Edit Modal
  const openEditNameModal = (driverId: string, currentName: string) => {
    setEditingDriver({ id: driverId, name: currentName });
    setEditedName(currentName);
    setEditNameModalVisible(true);
  };

  // Save updated driver name
  const saveDriverName = async () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed.length < 2) {
      Alert.alert('Invalid Name', 'Please enter a name with at least 2 characters.');
      return;
    }
    if (!editingDriver) return;

    try {
      setSavingName(true);
      await axiosInstance.put(`/api/users/cardriver/${editingDriver.id}/name`, {
        full_name: trimmed,
      });
      Alert.alert('Success', 'Driver name updated successfully!');
      setEditNameModalVisible(false);
      setEditingDriver(null);
      await refreshAvailableDrivers();
    } catch (err: any) {
      console.error('Error saving driver name:', err);
      const msg = err?.response?.data?.detail || 'Failed to update driver name. Please try again.';
      Alert.alert('Error', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingName(false);
    }
  };

  const getFilteredAvailableDrivers = () => {
    if (!availableDrivers || availableDrivers.length === 0) return [];
    if (selectedStatusFilter === 'ALL') {
      return availableDrivers;
    }
    return availableDrivers.filter((driver) => driver.driver_status?.toUpperCase() === selectedStatusFilter);
  };

  const getStatusCounts = () => {
    if (!availableDrivers || availableDrivers.length === 0) {
      return { ALL: 0, PROCESSING: 0 };
    }
    return {
      ALL: availableDrivers.length,
      PROCESSING: availableDrivers.filter((d) => d.driver_status === 'PROCESSING').length,
    };
  };

  const totalDriversCount = availableDrivers?.length || 0;
  const onlineDriversCount =
    availableDrivers?.filter((d) => (d.driver_status || '').toUpperCase() === 'ONLINE').length || 0;
  const verifyingDriversCount =
    availableDrivers?.filter((d) => (d.driver_status || '').toUpperCase() === 'PROCESSING').length || 0;

  const handleAddDriver = () => {
    router.push('/add-driver-menu');
  };

  const makeCall = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  const openWhatsApp = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9]/g, '');
    const num = clean.startsWith('91') ? clean : `91${clean}`;
    Linking.openURL(`https://wa.me/${num}`);
  };

  const getStatusColor = (status: string) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'ONLINE':
        return '#10B981';
      case 'DRIVING':
        return '#3B82F6';
      case 'OFFLINE':
        return '#64748B';
      case 'BLOCKED':
        return '#EF4444';
      case 'PROCESSING':
        return '#F59E0B';
      default:
        return '#94A3B8';
    }
  };

  const getStatusText = (status: string) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'ONLINE':
        return t('myDrivers.statusOnline') || 'Online';
      case 'DRIVING':
        return t('myDrivers.statusOnDuty') || 'On Duty';
      case 'OFFLINE':
        return t('myDrivers.statusOffline') || 'Offline';
      case 'BLOCKED':
        return t('myDrivers.statusBlocked') || 'Blocked';
      case 'PROCESSING':
        return t('myDrivers.statusVerifying') || 'Verifying';
      default:
        return status || 'Unknown';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'D';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backButton}>
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('myDrivers.headerTitle') || 'My Drivers'}</Text>
            <Text style={styles.headerSubtitle}>
              {totalDriversCount} {totalDriversCount === 1 ? 'driver' : 'drivers'} registered
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddDriver} activeOpacity={0.85}>
          <Plus color="#FFFFFF" size={17} />
          <Text style={styles.addButtonText}>{t('myDrivers.addDriver') || 'Add Driver'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4F46E5']} />}
      >
        {/* KPI / Stats Overview Banner */}
        <View style={styles.statsBanner}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalDriversCount}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <View style={styles.inlineIndicator}>
              <View style={[styles.liveDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.statValue, { color: '#10B981' }]}>{onlineDriversCount}</Text>
            </View>
            <Text style={styles.statLabel}>Online</Text>
          </View>
        </View>

        {/* Drivers List */}
        {availableDriversLoading ? (
          <View style={styles.loadingContainer}>
            <RefreshCw size={24} color="#6366F1" style={{ marginBottom: 10 }} />
            <Text style={styles.loadingText}>{t('myDrivers.loadingAvailable') || 'Loading drivers...'}</Text>
          </View>
        ) : availableDriversError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{availableDriversError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refreshAvailableDrivers}>
              <Text style={styles.retryButtonText}>{t('myDrivers.retry') || 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : getFilteredAvailableDrivers().length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Users color="#6366F1" size={40} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Drivers Found</Text>
            <Text style={styles.emptySubtitle}>
              Add your first driver to assign trips and manage duties.
            </Text>
            <TouchableOpacity style={styles.addDriverCta} onPress={handleAddDriver}>
              <Plus color="#FFFFFF" size={16} />
              <Text style={styles.addDriverCtaText}>Add New Driver</Text>
            </TouchableOpacity>
          </View>
        ) : (
          getFilteredAvailableDrivers().map((driver) => {
            const isExpanded = expandedDriverId === driver.id;
            const frontStatus = getDocumentStatus(driver.id, 'licence');
            const backStatus = getDocumentStatus(driver.id, 'licence_back');
            const aadharStatus = getDocumentStatus(driver.id, 'aadhar');
            const isApprovedDoc = (st: string) => (st || '').toUpperCase() === 'VERIFIED' || (st || '').toUpperCase() === 'APPROVED';

            const ownerPhone = (user?.primaryMobile || (user as any)?.phone || (user as any)?.primary_number || '').replace(/\D/g, '').slice(-10);
            const driverPhone = (driver.primary_number || '').replace(/\D/g, '').slice(-10);
            const isSelfDriver =
              Boolean((driver as any).is_owner) ||
              Boolean((driver as any).is_self_driver) ||
              (Boolean(ownerPhone) && ownerPhone === driverPhone);

            // Verified = licence AND the police verification certificate checked (decided by the server); Active / Inactive is separate
            const activity = (documentStatuses.find((x: any) => x.entity_type === 'driver' && x.entity_id === driver.id) as any)?.activity as
              { active: boolean; inactive_reasons: string[]; verified: boolean; not_verified: string[] } | undefined;
            const isDriverVerified = !!activity?.verified;
            const policeStatus = getDocumentStatus(driver.id, 'police');

            const renewNote = licenceRenewNote(driver.id);
            const canEditName =
              frontStatus === 'REJECTED' ||
              backStatus === 'REJECTED' ||
              aadharStatus === 'REJECTED' ||
              (driver.driver_status || '').toUpperCase() === 'REJECTED' ||
              (driver.driver_status || '').toUpperCase() === 'REJECTED_DOCS' ||
              ((driver as any).verification_status || '').toUpperCase() === 'REJECTED' ||
              ((driver as any).verification_status || '').toUpperCase() === 'FAILED';

            return (
              <View key={driver.id} style={[styles.driverCard, { backgroundColor: colors.surface }]}>
                {/* Header Row */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandedDriverId(isExpanded ? null : driver.id)}
                  style={styles.cardHeader}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{getInitials(driver.full_name)}</Text>
                  </View>

                  <View style={styles.headerInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.driverName, { color: colors.text }]} numberOfLines={1}>
                        {driver.full_name}
                      </Text>

                      {/* Quick Edit Name Button - Only if rejected/verification failed */}
                      {canEditName && (
                        <TouchableOpacity
                          style={styles.inlineEditBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            openEditNameModal(driver.id, driver.full_name);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Edit2 size={13} color="#6366F1" />
                        </TouchableOpacity>
                      )}

                      {isDriverVerified && (
                        <View style={styles.verifiedShield}>
                          <ShieldCheck color="#10B981" size={13} />
                          <Text style={styles.verifiedShieldText}>Verified</Text>
                        </View>
                      )}
                    </View>

                    {!!activity && (
                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                        <View style={{ backgroundColor: activity.active ? '#DCFCE7' : '#FEE2E2', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: activity.active ? '#166534' : '#B91C1C' }}>{activity.active ? 'ACTIVE' : 'INACTIVE'}</Text>
                        </View>
                      </View>
                    )}

                    {/* Status Pill */}
                    <View style={styles.statusPillsRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: `${getStatusColor(driver.driver_status)}18` },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(driver.driver_status) },
                          ]}
                        />
                        <Text style={[styles.statusText, { color: getStatusColor(driver.driver_status) }]}>
                          {getStatusText(driver.driver_status)}
                        </Text>
                      </View>
                      <Text style={styles.phoneQuick}>{driver.primary_number}</Text>
                    </View>
                  </View>

                  <View style={styles.chevronBtn}>
                    {isExpanded ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
                  </View>
                </TouchableOpacity>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <View style={styles.cardDetails}>
                    <View style={styles.divider} />

                    {/* Info Rows */}
                    <View style={styles.infoGrid}>
                      <View style={styles.infoRow}>
                        <CreditCard size={15} color="#64748B" style={styles.infoIcon} />
                        <Text style={styles.infoLabel}>Licence No:</Text>
                        <Text style={[styles.infoValue, { color: colors.text, fontWeight: '700' }]}>
                          {driver.licence_number || 'Not provided'}
                        </Text>
                      </View>

                      {driver.secondary_number ? (
                        <View style={styles.infoRow}>
                          <Phone size={15} color="#64748B" style={styles.infoIcon} />
                          <Text style={styles.infoLabel}>Secondary:</Text>
                          <Text style={[styles.infoValue, { color: colors.text }]}>{driver.secondary_number}</Text>
                        </View>
                      ) : null}

                      <View style={styles.infoRow}>
                        <MapPin size={15} color="#64748B" style={styles.infoIcon} />
                        <Text style={styles.infoLabel}>Address:</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>
                          {driver.address || driver.adress || 'No address registered'}
                          {driver.city ? `, ${driver.city}` : ''}
                          {driver.pincode ? ` - ${driver.pincode}` : ''}
                        </Text>
                      </View>
                    </View>

                    {!!activity && !activity.active && activity.inactive_reasons.map((r) => (
                      <View key={`inactive-${r}`} style={styles.expiryWarningBox}>
                        <AlertTriangle size={15} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={styles.expiryWarningText}>Inactive: {r}</Text>
                      </View>
                    ))}
                    {!!activity && activity.active && !activity.verified && (
                      <Text style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                        Active - can take trips. Not verified yet: {activity.not_verified.join(', ')}. Upload the police verification certificate to get the Verified badge.
                      </Text>
                    )}

                    {/* Expiry Warning if Applicable */}
                    {!!renewNote && (
                      <View style={styles.expiryWarningBox}>
                        <AlertTriangle size={15} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={styles.expiryWarningText}>⚠️ {renewNote}</Text>
                      </View>
                    )}

                    {/* KYC Documents Section */}
                    <View style={styles.kycSection}>
                      <View style={styles.kycHeader}>
                        <FileText size={16} color="#6366F1" />
                        <Text style={styles.kycTitle}>
                          {isSelfDriver ? 'Licence Documents (Auto-Verified)' : 'Licence & Aadhaar Documents (Auto-Verified)'}
                        </Text>
                      </View>
                      <Text style={styles.kycHint}>
                        {isSelfDriver
                          ? 'Auto-verify checks driving licence photo, number & name match.'
                          : 'Auto-verify checks driving licence, Aadhaar ID, photo & name match.'}
                      </Text>

                      <View style={styles.documentCardsRow}>
                        {/* Licence Front Card */}
                        <TouchableOpacity
                          style={styles.docUploadCard}
                          activeOpacity={0.8}
                          onPress={() =>
                            handleDocumentUpdate(
                              driver.id,
                              'licence',
                              'Licence',
                              'front',
                              driver.licence_number,
                              driver.full_name
                            )
                          }
                        >
                          <View style={styles.docTopRow}>
                            <CreditCard size={18} color="#3B82F6" />
                            <DocumentStatusIcon status={frontStatus} size={3} />
                          </View>
                          <Text style={styles.docCardTitle}>Licence (Front)</Text>
                          <View style={styles.docUploadAction}>
                            <Upload size={12} color="#4F46E5" />
                            <Text style={styles.docUploadText}>
                              {frontStatus === 'VERIFIED' ? 'Update Front' : 'Upload Front'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Licence Back Card */}
                        <TouchableOpacity
                          style={styles.docUploadCard}
                          activeOpacity={0.8}
                          onPress={() =>
                            handleDocumentUpdate(
                              driver.id,
                              'licence',
                              'Licence',
                              'back',
                              driver.licence_number,
                              driver.full_name
                            )
                          }
                        >
                          <View style={styles.docTopRow}>
                            <CreditCard size={18} color="#8B5CF6" />
                            <DocumentStatusIcon status={backStatus} size={3} />
                          </View>
                          <Text style={styles.docCardTitle}>Licence (Back)</Text>
                          <View style={styles.docUploadAction}>
                            <Upload size={12} color="#4F46E5" />
                            <Text style={styles.docUploadText}>
                              {backStatus === 'VERIFIED' ? 'Update Back' : 'Upload Back'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Police Verification Certificate - needed for the Verified badge */}
                        <TouchableOpacity
                          style={styles.docUploadCard}
                          activeOpacity={0.8}
                          onPress={() => handleDocumentUpdate(driver.id, 'police', 'Police Verification', undefined, undefined, driver.full_name)}
                        >
                          <View style={styles.docTopRow}>
                            <ShieldCheck size={18} color="#0EA5E9" />
                            <DocumentStatusIcon status={policeStatus} size={3} />
                          </View>
                          <Text style={styles.docCardTitle}>Police Verification</Text>
                          <View style={styles.docUploadAction}>
                            <Upload size={12} color="#4F46E5" />
                            <Text style={styles.docUploadText}>{policeStatus === 'VERIFIED' ? 'Update Certificate' : 'Upload Certificate'}</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Aadhaar Card (Only for External Added Drivers) */}
                        {!isSelfDriver && (
                          <TouchableOpacity
                            style={styles.docUploadCard}
                            activeOpacity={0.8}
                            onPress={() =>
                              handleDocumentUpdate(
                                driver.id,
                                'aadhar',
                                'Aadhaar Card',
                                undefined,
                                (driver as any).aadhar_number,
                                driver.full_name
                              )
                            }
                          >
                            <View style={styles.docTopRow}>
                              <ShieldCheck size={18} color="#10B981" />
                              <DocumentStatusIcon status={getDocumentStatus(driver.id, 'aadhar')} size={3} />
                            </View>
                            <Text style={styles.docCardTitle}>Aadhaar Card</Text>
                            <View style={styles.docUploadAction}>
                              <Upload size={12} color="#4F46E5" />
                              <Text style={styles.docUploadText}>
                                {getDocumentStatus(driver.id, 'aadhar') === 'VERIFIED' ? 'Update Aadhaar' : 'Upload Aadhaar'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Document Update Modal (Single-Side Aware) */}
      {selectedDocument && (
        <DocumentUpdateModal
          visible={showUpdateModal}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedDocument(null);
          }}
          entityId={selectedDocument.entityId}
          entityType="driver"
          documentType={selectedDocument.documentType}
          documentName={selectedDocument.documentName}
          targetSide={selectedDocument.targetSide}
          initialDocumentNumber={selectedDocument.initialDocumentNumber}
          initialDriverName={selectedDocument.initialDriverName}
          onSuccess={handleDocumentUpdateSuccess}
        />
      )}

      {/* Quick Edit Driver Name Modal */}
      <Modal visible={editNameModalVisible} transparent animationType="fade" onRequestClose={() => setEditNameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.nameModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Driver Name</Text>
              <TouchableOpacity onPress={() => setEditNameModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
              Enter the exact full name as printed on the driving licence to ensure auto-verification succeeds.
            </Text>

            <View style={styles.nameInputBox}>
              <TextInput
                style={styles.nameTextInput}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Driver Full Name"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
                autoFocus
              />
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditNameModalVisible(false)}
                disabled={savingName}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveNameBtn} onPress={saveDriverName} disabled={savingName}>
                <Check size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveNameBtnText}>{savingName ? 'Saving...' : 'Save Name'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <RefreshFab onRefresh={handleRefresh} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  backButton: {
    padding: 8,
    marginRight: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  addButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  inlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statusTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    gap: 8,
  },
  statusTabSelected: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  statusTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  statusTabTextSelected: {
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  countBadgeTextSelected: {
    color: '#FFFFFF',
  },
  driverCard: {
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4F46E5',
  },
  headerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  inlineEditBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  verifiedShield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedShieldText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  phoneQuick: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  chevronBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    marginLeft: 6,
  },
  quickActionsBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 8,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickActionText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  infoGrid: {
    gap: 10,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    width: 90,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  expiryWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  expiryWarningText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  kycSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kycHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kycTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  kycHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  documentCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  docUploadCard: {
    // 2-column grid: nothing overlaps, every tile wraps its own text.
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  docTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  docCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  docUploadAction: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
  },
  docUploadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 18,
  },
  addDriverCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
  },
  addDriverCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  nameModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 14,
  },
  nameInputBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  nameTextInput: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  saveNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
  },
  saveNameBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});