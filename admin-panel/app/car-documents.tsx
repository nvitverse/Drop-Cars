import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, FileText, ExternalLink, X } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import AccountActivityBar from '@/components/AccountActivityBar';
import UseAsModelButton from '@/components/UseAsModelButton';
import ErrorMessage from '@/components/ErrorMessage';
import ZoomableImage from '@/components/ZoomableImage';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DatePickButton from '@/components/DatePickButton';

const REJECT_REASON_PRESETS = [
  'Original document not uploaded',
  'Image is blurry or details not visible',
  'Document expired (RC / Insurance / Permit)',
  'Vehicle number mismatch',
  'Missing back side photo',
  'Incorrect or invalid document uploaded',
];

interface DocumentItem {
  document_id: string;
  document_type: string;
  document_name: string;
  image_url: string | null;
  status: string;
  uploaded_at: string;
  car_id?: string | null;
  car_name?: string | null;
  car_number?: string | null;
  expiry_date?: string | null;
  date_label?: string | null; // 'Registration date' for an RC, 'Expiry date' for the rest
}

interface DocumentsResponse {
  account_id: string;
  account_type: string;
  account_name: string;
  account_documents: DocumentItem[];
  car_documents: DocumentItem[];
  total_documents: number;
  pending_count: number;
  verified_count: number;
  invalid_count: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function ensureString(p: string | string[] | undefined): string {
  if (p === undefined) return '';
  return Array.isArray(p) ? p[0] ?? '' : p;
}

export default function CarDocumentsScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams<{
    carId: string;
    vehicleOwnerId: string;
    carName: string;
  }>();
  const carId = ensureString(rawParams.carId);
  const vehicleOwnerId = ensureString(rawParams.vehicleOwnerId);
  const carName = ensureString(rawParams.carName);

  const { toast, showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentsResponse | null>(null);
  const [carDocuments, setCarDocuments] = useState<DocumentItem[]>([]);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'compact' | 'focus'>('compact');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxImageUri, setLightboxImageUri] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'INVALID'>('ALL');
  const [unverifyModalVisible, setUnverifyModalVisible] = useState(false);
  const [unverifyReason, setUnverifyReason] = useState('');

  const [expiryInput, setExpiryInput] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  const getFutureDateStr = (yearsToAdd: number): string => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + yearsToAdd);
    return d.toISOString().split('T')[0];
  };

  const UNVERIFY_REASON_PRESETS = [
    'Document re-verification required',
    'Suspicious vehicle activity / Security check',
    'Temporary pause requested by vehicle owner',
    'Expired car document / Invalid RC',
    'Incorrect car details / plate mismatch',
  ];

  const handleSaveExpiry = async (doc?: any) => {
    const targetDoc = doc || currentDocument;
    if (!targetDoc) return;
    const trimmed = expiryInput.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      Alert.alert('Invalid date', 'Enter the date as YYYY-MM-DD, e.g. 2027-03-31.');
      return;
    }
    setSavingExpiry(true);
    try {
      await apiService.updateDocumentExpiry(vehicleOwnerId, targetDoc.document_id, trimmed || null);
      await fetchDocuments();
      showToast(trimmed ? `Expiry date set to ${trimmed}.` : 'Expiry date cleared.', 'success');
    } catch (error: any) {
      console.error('Failed to update expiry date:', error);
      Alert.alert('Error', error?.message || 'Failed to update expiry date');
    } finally {
      setSavingExpiry(false);
    }
  };

  const openInBrowser = async () => {
    const url = currentDocument?.image_url;
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (err) {
      console.error('Failed to open URL:', err);
      Alert.alert('Error', 'Could not open document in browser.');
    }
  };

  useEffect(() => {
    if (vehicleOwnerId && carId) {
      fetchDocuments();
    }
  }, [vehicleOwnerId, carId]);

  const fetchDocuments = async () => {
    try {
      setError(null);
      const data = await apiService.getAccountDocuments(vehicleOwnerId, 'vehicle_owner');
      setDocuments(data);
      const forThisCar = (data.car_documents || []).filter(
        (doc: DocumentItem) => String(doc.car_id) === String(carId)
      );
      setCarDocuments(forThisCar);
      const firstPendingIndex = forThisCar.findIndex((doc: DocumentItem) => doc.status === 'PENDING');
      if (firstPendingIndex !== -1) {
        setCurrentDocIndex(firstPendingIndex);
      } else {
        setCurrentDocIndex(0);
      }
    } catch (err: any) {
      console.error('Failed to fetch documents:', err);
      setError(err?.message || 'Failed to load documents. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDocuments();
  };

  const updateDocumentStatus = async (documentId: string, status: 'VERIFIED' | 'INVALID' | 'PENDING', reason?: string) => {
    setUpdating(true);
    try {
      await apiService.updateDocumentStatus(
        vehicleOwnerId,
        documentId,
        'vehicle_owner',
        status,
        reason
      );
      await fetchDocuments();
      showToast('Document status updated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to update document:', err);
      Alert.alert('Error', err?.message || 'Failed to update document status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return '#10B981';
      case 'INVALID':
        return '#EF4444';
      case 'PENDING':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <CheckCircle size={20} color="#10B981" />;
      case 'INVALID':
        return <XCircle size={20} color="#EF4444" />;
      case 'PENDING':
        return <Clock size={20} color="#F59E0B" />;
      default:
        return <FileText size={20} color="#6B7280" />;
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchDocuments} />;
  }

  const pendingCount = carDocuments.filter((d) => d.status === 'PENDING').length;
  const verifiedCount = carDocuments.filter((d) => d.status === 'VERIFIED').length;
  const invalidCount = carDocuments.filter((d) => d.status === 'INVALID').length;

  if (carDocuments.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backPill} activeOpacity={0.7}>
            <ArrowLeft size={18} color="#1E293B" />
            <Text style={styles.backPillText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={styles.portalTitle}>{carName || 'Car'} Documents</Text>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <FileText size={48} color="#9CA3AF" />
          <Text style={styles.emptyText}>No documents found for this car</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentDocument = carDocuments[currentDocIndex];
  if (!currentDocument) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No documents to display</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handlePrevious = () => {
    if (currentDocIndex > 0) setCurrentDocIndex(currentDocIndex - 1);
  };

  const handleNext = () => {
    if (currentDocIndex < carDocuments.length - 1) setCurrentDocIndex(currentDocIndex + 1);
  };

  const handleVerify = () => {
    Alert.alert(
      'Verify Document',
      `Are you sure you want to verify "${currentDocument.document_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: () => updateDocumentStatus(currentDocument.document_id, 'VERIFIED') },
      ]
    );
  };

  const handleReject = () => {
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const confirmReject = () => {
    setRejectModalVisible(false);
    updateDocumentStatus(currentDocument.document_id, 'INVALID', rejectReason);
  };

  const docsToVerify = carDocuments.filter((d) => d.status !== 'VERIFIED');
  const canVerifyAll = docsToVerify.length > 0;

  const handleVerifyAll = () => {
    Alert.alert(
      'Approve All Documents',
      `Are you sure you want to approve all ${docsToVerify.length} document(s) for this car?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            setUpdating(true);
            try {
              for (const doc of docsToVerify) {
                await apiService.updateDocumentStatus(
                  vehicleOwnerId,
                  doc.document_id,
                  'vehicle_owner',
                  'VERIFIED'
                );
              }
              await fetchDocuments();
              showToast(`All ${docsToVerify.length} document(s) approved successfully.`, 'success');
            } catch (err: any) {
              console.error('Failed to approve all documents:', err);
              Alert.alert('Error', err?.message || 'Failed to approve some documents.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleUnverifyAllConfirm = async () => {
    const reasonToUse = unverifyReason.trim() || 'Document re-verification required';
    setUnverifyModalVisible(false);
    setUpdating(true);
    try {
      for (const doc of carDocuments) {
        if (doc.status === 'VERIFIED') {
          await apiService.updateDocumentStatus(
            vehicleOwnerId,
            doc.document_id,
            'vehicle_owner',
            'PENDING',
            reasonToUse
          );
        }
      }
      await fetchDocuments();
      showToast(`Car unverified: ${reasonToUse}`, 'info');
    } catch (err: any) {
      console.error('Failed to unverify car:', err);
      Alert.alert('Error', err?.message || 'Failed to unverify car');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backPill} activeOpacity={0.7}>
          <ArrowLeft size={18} color="#1E293B" />
          <Text style={styles.backPillText}>Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={styles.portalTitle} numberOfLines={1}>
            {carName || 'Vehicle'} Verification
          </Text>
          <Text style={styles.portalSubtitle} numberOfLines={1}>
            CAR DOCUMENTS • Approval Console
          </Text>
        </View>

        {canVerifyAll && (
          <TouchableOpacity
            style={[styles.approveAllBtn, updating && { opacity: 0.6 }]}
            onPress={handleVerifyAll}
            disabled={updating}
            activeOpacity={0.8}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <CheckCircle size={15} color="#FFFFFF" />
                <Text style={styles.approveAllBtnText}>Approve All ({docsToVerify.length})</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Light Theme Executive Summary Card with Interactive Filter Tabs */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'ALL' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('ALL')}
              activeOpacity={0.7}
            >
              <Text style={styles.summaryStatNum}>{carDocuments.length}</Text>
              <Text style={styles.summaryStatLbl}>TOTAL DOCS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'PENDING' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('PENDING')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#D97706' }]}>{pendingCount}</Text>
              <Text style={styles.summaryStatLbl}>PENDING</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'VERIFIED' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('VERIFIED')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#059669' }]}>{verifiedCount}</Text>
              <Text style={styles.summaryStatLbl}>APPROVED</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'INVALID' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('INVALID')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#DC2626' }]}>{invalidCount}</Text>
              <Text style={styles.summaryStatLbl}>REJECTED</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.progressText}>
                Filter: <Text style={{ color: '#2563EB', fontWeight: '800' }}>{statusFilter}</Text> • Approval Progress
              </Text>
              <Text style={styles.progressPercent}>
                {carDocuments.length > 0 ? Math.round(((verifiedCount + invalidCount) / carDocuments.length) * 100) : 0}% Complete
              </Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${carDocuments.length > 0 ? Math.round(((verifiedCount + invalidCount) / carDocuments.length) * 100) : 0}%` },
                ]}
              />
            </View>
          </View>

          {/* Active / Inactive (may work or not) - separate from Verified (originals checked) */}
          <AccountActivityBar kind="car" entityId={carId} />

          {/* Car Verification Master Toggle Switch Bar */}
          <View style={styles.summaryToggleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <CheckCircle size={18} color={pendingCount === 0 && carDocuments.length > 0 ? '#059669' : '#64748B'} />
              <View>
                <Text style={styles.summaryToggleTitle}>
                  CAR VERIFIED (ORIGINALS CHECKED)
                </Text>
                <Text style={styles.summaryToggleSubtitle}>
                  {pendingCount === 0 && carDocuments.length > 0 ? '✓ All car documents verified' : 'Turns ON when all car documents are approved (Active / Inactive is separate, above)'}
                </Text>
              </View>
            </View>

            <Switch
              value={pendingCount === 0 && carDocuments.length > 0}
              onValueChange={(val) => {
                if (val) {
                  handleVerifyAll();
                } else {
                  setUnverifyReason('');
                  setUnverifyModalVisible(true);
                }
              }}
              trackColor={{ false: '#CBD5E1', true: '#10B981' }}
              thumbColor={pendingCount === 0 && carDocuments.length > 0 ? '#FFFFFF' : '#F1F5F9'}
            />
          </View>
        </View>

        {pendingCount === 0 && carDocuments.length > 0 && (
          <View style={styles.allDoneBanner}>
            <CheckCircle size={20} color="#059669" />
            <Text style={styles.allDoneBannerText}>🎉 All car documents verified! Status automatically marked VERIFIED!</Text>
          </View>
        )}

        {/* Executive Document Feed Cards */}
        <View style={{ gap: 16, marginTop: 10 }}>
          {carDocuments.filter(d => statusFilter === 'ALL' || d.status === statusFilter).length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No {statusFilter.toLowerCase()} documents found.</Text>
            </View>
          ) : (
            carDocuments
              .filter(d => statusFilter === 'ALL' || d.status === statusFilter)
              .map((doc, idx) => {
                const isVerified = doc.status === 'VERIFIED';
                const isInvalid = doc.status === 'INVALID';

                return (
                  <View key={doc.document_id} style={styles.docCard}>
                    {/* Card Header */}
                    <View style={styles.docCardHeader}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.docIconBg, { backgroundColor: isVerified ? '#D1FAE5' : isInvalid ? '#FEE2E2' : '#FEF3C7' }]}>
                          {isVerified ? (
                            <CheckCircle size={16} color="#10B981" />
                          ) : isInvalid ? (
                            <XCircle size={16} color="#EF4444" />
                          ) : (
                            <Clock size={16} color="#F59E0B" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docCardTitle}>{doc.document_name}</Text>
                        </View>
                      </View>

                      <View style={[styles.statusBadgePill, { backgroundColor: isVerified ? '#ECFDF5' : isInvalid ? '#FEF2F2' : '#FFFBEB', borderColor: isVerified ? '#10B98130' : isInvalid ? '#EF444430' : '#F59E0B30' }]}>
                        <View style={[styles.statusDot, { backgroundColor: isVerified ? '#10B981' : isInvalid ? '#EF4444' : '#F59E0B' }]} />
                        <Text style={[styles.statusBadgePillText, { color: isVerified ? '#047857' : isInvalid ? '#B91C1C' : '#B45309' }]}>
                          {isVerified ? 'VERIFIED' : isInvalid ? 'REJECTED' : 'PENDING'}
                        </Text>
                      </View>
                    </View>

                    {isVerified && ['rc_front', 'rc_back', 'insurance', 'fc', 'permit'].includes(String(doc.document_type)) && (
                      <UseAsModelButton documentId={doc.document_id} accountId={vehicleOwnerId} accountType="vehicle_owner" documentName={doc.document_name} />
                    )}

                    {/* Compact Side-by-Side Content Row (Thumbnail + Details) */}
                    <View style={styles.compactRow}>
                      {/* Left: Compact Thumbnail Trigger */}
                      <TouchableOpacity
                        style={styles.compactThumbnailFrame}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (doc.image_url) {
                            setCurrentDocIndex(idx);
                            setLightboxImageUri(doc.image_url);
                            setLightboxVisible(true);
                          }
                        }}
                      >
                        {doc.image_url ? (
                          <ZoomableImage uri={doc.image_url} width={120} height={85} />
                        ) : (
                          <View style={styles.compactNoImage}>
                            <FileText size={24} color="#94A3B8" />
                          </View>
                        )}
                        {doc.image_url && (
                          <View style={styles.thumbnailZoomBadge}>
                            <Text style={styles.thumbnailZoomBadgeText}>🔍 Zoom Pop-up</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Right: Upload Date, Expiry Input & Quick Date Picker Chips */}
                      <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
                        <Text style={styles.docCardSubtitle}>
                          Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                        </Text>

                        {/* Expiry / Validity Date Field */}
                        <View style={styles.compactExpiryBox}>
                          <Text style={styles.compactExpiryLabel}>{doc.date_label === 'Registration date' ? 'Registration Date:' : 'Expiry / Valid Date:'}</Text>
                          <View style={styles.expiryInputRow}>
                            <DatePickButton
                              style={[styles.compactExpiryInput, { justifyContent: 'center' }]}
                              textStyle={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }}
                              placeholder="Pick date"
                              title="Expiry / valid date"
                              value={doc.document_id === currentDocument?.document_id ? expiryInput : doc.expiry_date || ''}
                              onChange={(v) => {
                                setCurrentDocIndex(idx);
                                setExpiryInput(v);
                              }}
                              />
                            <TouchableOpacity
                              style={[styles.compactExpirySaveBtn, savingExpiry && { opacity: 0.6 }]}
                              onPress={() => handleSaveExpiry(doc)}
                              disabled={savingExpiry}
                            >
                              {savingExpiry ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.compactExpirySaveBtnText}>Save</Text>
                              )}
                            </TouchableOpacity>
                          </View>

                          {/* Quick Date Picker Chips */}
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, display: doc.date_label === 'Registration date' ? 'none' : 'flex' }}>
                            {['+1 Yr', '+2 Yrs', '+3 Yrs', '+5 Yrs'].map((chip, chipIdx) => {
                              const years = [1, 2, 3, 5][chipIdx];
                              return (
                                <TouchableOpacity
                                  key={chip}
                                  style={styles.quickDateChip}
                                  onPress={() => {
                                    setCurrentDocIndex(idx);
                                    setExpiryInput(getFutureDateStr(years));
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.quickDateChipText}>{chip}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Compact Side-by-Side Action Buttons Without Word "Document" */}
                    <View style={styles.docCardActions}>
                      <TouchableOpacity
                        style={[
                          styles.actionApproveBtn,
                          isVerified && styles.actionApproveBtnActive,
                          updating && { opacity: 0.6 },
                        ]}
                        onPress={() => updateDocumentStatus(doc.document_id, 'VERIFIED')}
                        disabled={updating || isVerified}
                        activeOpacity={0.8}
                      >
                        <CheckCircle size={15} color={isVerified ? '#10B981' : '#047857'} />
                        <Text style={[styles.actionApproveBtnText, { color: isVerified ? '#047857' : '#047857' }]}>
                          {isVerified ? 'Approved ✓' : 'Approve'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionRejectBtn,
                          isInvalid && styles.actionRejectBtnActive,
                          updating && { opacity: 0.6 },
                        ]}
                        onPress={() => {
                          setCurrentDocIndex(idx);
                          handleReject();
                        }}
                        disabled={updating || isInvalid}
                        activeOpacity={0.8}
                      >
                        <XCircle size={15} color={isInvalid ? '#EF4444' : '#B91C1C'} />
                        <Text style={[styles.actionRejectBtnText, { color: isInvalid ? '#B91C1C' : '#B91C1C' }]}>
                          {isInvalid ? 'Rejected ✕' : 'Reject'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
          )}
        </View>
      </ScrollView>

      {/* Reject Reason Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Document</Text>
            <Text style={styles.modalSubtitle}>
              Why is "{currentDocument?.document_name}" being rejected? This will be sent to the owner.
            </Text>
            {REJECT_REASON_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.rejectReasonPreset, rejectReason === preset && styles.rejectReasonPresetActive]}
                onPress={() => setRejectReason(preset)}
              >
                <Text style={[styles.rejectReasonPresetText, rejectReason === preset && styles.rejectReasonPresetTextActive]}>
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.modalInput}
              placeholder="Or type a custom reason..."
              placeholderTextColor="#9CA3AF"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={confirmReject}
              >
                <Text style={styles.modalConfirmButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unverify Car Modal with Preset Reasons */}
      <Modal
        visible={unverifyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnverifyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Unverify Car</Text>
            <Text style={styles.modalSubtitle}>
              Please select or type a reason for unverifying this car:
            </Text>
            {UNVERIFY_REASON_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.rejectReasonPreset, unverifyReason === preset && styles.rejectReasonPresetActive]}
                onPress={() => setUnverifyReason(preset)}
              >
                <Text style={[styles.rejectReasonPresetText, unverifyReason === preset && styles.rejectReasonPresetTextActive]}>
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.modalInput}
              placeholder="Or type custom unverify reason..."
              placeholderTextColor="#9CA3AF"
              value={unverifyReason}
              onChangeText={setUnverifyReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setUnverifyModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleUnverifyAllConfirm}
              >
                <Text style={styles.modalConfirmButtonText}>Unverify Car</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Pop-Up Lightbox Modal */}
      <Modal
        visible={lightboxVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxVisible(false)}
      >
        <View style={styles.lightboxOverlay}>
          <View style={styles.lightboxHeader}>
            <View>
              <Text style={styles.lightboxTitle}>{currentDocument?.document_name || 'Car Document Preview'}</Text>
              <Text style={styles.lightboxSubTitle}>🔍 Pinch or Scroll to Zoom Full Image</Text>
            </View>
            <TouchableOpacity onPress={() => setLightboxVisible(false)} style={styles.lightboxCloseBtn}>
              <X size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.lightboxBody}>
            {lightboxImageUri ? (
              <ZoomableImage uri={lightboxImageUri} width={SCREEN_WIDTH - 32} height={SCREEN_HEIGHT * 0.65} />
            ) : (
              <Text style={{ color: '#94A3B8' }}>No image loaded</Text>
            )}
          </View>

          {/* Bottom Action Bar inside Lightbox Pop-up */}
          {currentDocument && (
            <View style={styles.lightboxActionBar}>
              {/* Date Edit Row Inside Pop-up */}
              <View style={styles.lightboxDateBox}>
                <Text style={styles.lightboxDateLabel}>{currentDocument?.date_label === 'Registration date' ? 'Registration Date:' : 'Expiry Date:'}</Text>
                <DatePickButton
                  style={[styles.lightboxDateInput, { justifyContent: 'center' }]}
                  textStyle={{ fontSize: 12, fontWeight: '600', color: '#F8FAFC' }}
                  placeholder="Pick date"
                  title="Expiry date"
                  value={expiryInput}
                  onChange={setExpiryInput}
                  />
                <TouchableOpacity
                  style={[styles.compactExpirySaveBtn, savingExpiry && { opacity: 0.6 }]}
                  onPress={() => handleSaveExpiry(currentDocument)}
                  disabled={savingExpiry}
                >
                  {savingExpiry ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.compactExpirySaveBtnText}>Save Date</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Lightbox Quick Date Picker Chips */}
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', display: currentDocument?.date_label === 'Registration date' ? 'none' : 'flex' }}>
                {['+1 Year', '+2 Years', '+3 Years', '+5 Years'].map((chip, chipIdx) => {
                  const years = [1, 2, 3, 5][chipIdx];
                  return (
                    <TouchableOpacity
                      key={chip}
                      style={styles.lightboxQuickDateChip}
                      onPress={() => setExpiryInput(getFutureDateStr(years))}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.lightboxQuickDateChipText}>{chip}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionApproveBtn, { flex: 1 }]}
                  onPress={() => {
                    setLightboxVisible(false);
                    updateDocumentStatus(currentDocument.document_id, 'VERIFIED');
                  }}
                >
                  <CheckCircle size={16} color="#047857" />
                  <Text style={[styles.actionApproveBtnText, { color: '#047857' }]}>Approve</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRejectBtn, { flex: 1 }]}
                  onPress={() => {
                    setLightboxVisible(false);
                    handleReject();
                  }}
                >
                  <XCircle size={16} color="#B91C1C" />
                  <Text style={[styles.actionRejectBtnText, { color: '#B91C1C' }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  backPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  portalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  portalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  approveAllBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  approveAllBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryStatItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
  },
  summaryStatItemActive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  summaryStatNum: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  summaryStatLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  switchStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  allDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 12,
  },
  allDoneBannerText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
  },
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  docCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  docIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  docCardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  compactExpirySaveBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactExpirySaveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  imageFrame: {
    backgroundColor: '#0F172A',
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  noImagePlaceholder: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  noImagePlaceholderText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  imageFrameFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  zoomHintText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  openExternalBtnText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  summaryToggleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  summaryToggleSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  compactRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  compactThumbnailFrame: {
    width: 120,
    height: 85,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactNoImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailZoomBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 3,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  thumbnailZoomBadgeText: {
    color: '#2563EB',
    fontSize: 9,
    fontWeight: '800',
  },
  docCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 9,
    borderRadius: 6,
  },
  actionApproveBtnActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
  },
  actionApproveBtnText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
  },
  actionRejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 9,
    borderRadius: 6,
  },
  actionRejectBtnActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  actionRejectBtnText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  rejectReasonPreset: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rejectReasonPresetActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  rejectReasonPresetText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  rejectReasonPresetTextActive: {
    color: '#EF4444',
    fontWeight: '700',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F3F4F6',
  },
  modalCancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    backgroundColor: '#EF4444',
  },
  modalConfirmButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  lightboxTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  lightboxSubTitle: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
    marginTop: 2,
  },
  lightboxCloseBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  lightboxBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  lightboxActionBar: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  lightboxDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    padding: 8,
    borderRadius: 6,
  },
  lightboxDateLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  lightboxDateInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  compactExpiryBox: {
    marginTop: 4,
  },
  compactExpiryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
  },
  expiryInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactExpiryInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  quickDateChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickDateChipText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563EB',
  },
  lightboxQuickDateChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lightboxQuickDateChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
  },
});
