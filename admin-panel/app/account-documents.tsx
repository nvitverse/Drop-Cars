import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  Animated,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, FileText, ExternalLink, PartyPopper, X } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import ZoomableImage from '@/components/ZoomableImage';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DatePickButton from '@/components/DatePickButton';

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
}

const EXPIRY_TRACKED_TYPES = ['rc_front', 'insurance', 'licence'];

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

export default function AccountDocumentsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const params = useLocalSearchParams<{
    accountId: string;
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver';
    accountName: string;
  }>();

  const { toast, showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentsResponse | null>(null);
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
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'OWNER' | 'CARS' | 'DRIVERS'>('ALL');
  const [unverifyModalVisible, setUnverifyModalVisible] = useState(false);
  const [unverifyReason, setUnverifyReason] = useState('');

  const getFutureDateStr = (yearsToAdd: number): string => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + yearsToAdd);
    return d.toISOString().split('T')[0];
  };

  const UNVERIFY_REASON_PRESETS = [
    'Document re-verification required',
    'Suspicious activity / Security audit',
    'Temporary pause requested by owner/driver',
    'Expired document / Invalid credentials',
    'Incorrect account information',
  ];

  const REJECT_REASON_PRESETS = [
    'Original document not uploaded',
    'Image is blurry / not readable',
    'Document has expired',
    'Details do not match account',
    'Wrong document uploaded',
    'Photo is cropped / incomplete',
  ];
  const [expiryInput, setExpiryInput] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Trusted Partner + the "Account Verified" master toggle both live here,
  // tucked behind a collapsed "Advanced" row instead of sitting in the top
  // summary card - moved less-prominent per owner feedback 2026-09-30.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [savingTrusted, setSavingTrusted] = useState(false);
  const [canManageTrusted, setCanManageTrusted] = useState(false);

  useEffect(() => {
    if (params.accountType !== 'vehicle_owner' || !params.accountId) return;
    (async () => {
      try {
        const [role, perms, details] = await Promise.all([
          apiService.getCachedAdminRole(),
          apiService.getCachedAdminPermissions(),
          apiService.getAccountDetails(params.accountId!, 'vehicle_owner'),
        ]);
        setCanManageTrusted(role === 'Owner' || (perms || []).includes('trusted_partner_management'));
        setIsTrusted(!!details?.admin_trusted_override || details?.tier === 'PREFERRED');
      } catch (e) {
        console.error('Failed to load trusted-partner status:', e);
      }
    })();
  }, [params.accountId, params.accountType]);

  const handleToggleTrusted = async (next: boolean) => {
    if (!params.accountId) return;
    setSavingTrusted(true);
    try {
      await apiService.setTrustedPartnerOverride(params.accountId, next, next ? 'Marked Trusted from Documents Verification screen' : 'Removed Trusted from Documents Verification screen');
      setIsTrusted(next);
      showToast(next ? 'Marked as Trusted Partner' : 'Trusted Partner removed', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update Trusted Partner status');
    } finally {
      setSavingTrusted(false);
    }
  };

  // Smooth cross-fade whenever the viewed document changes, instead of the
  // image/card snapping in instantly - makes stepping through a stack of
  // documents feel like one continuous flow rather than a jump-cut.
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [currentDocIndex]);

  // Keep the expiry-date input in sync with whichever document is on
  // screen - has to read straight from `documents`/`currentDocIndex` state
  // rather than the later-derived `currentDocument` var, since hooks can't
  // sit after the loading/error early-returns below.
  useEffect(() => {
    if (!documents) return;
    const all = [...documents.account_documents, ...documents.car_documents];
    const doc = all[currentDocIndex];
    setExpiryInput(doc?.expiry_date || '');
  }, [documents, currentDocIndex]);

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
    if (params.accountId && params.accountType) {
      fetchDocuments();
    }
  }, [params.accountId, params.accountType]);

  const fetchDocuments = async () => {
    try {
      setError(null);
      const data = await apiService.getAccountDocuments(
        params.accountId!,
        params.accountType!
      );
      setDocuments(data);
      
      // Find first pending document
      const allDocs = [...data.account_documents, ...data.car_documents];
      const firstPendingIndex = allDocs.findIndex(doc => doc.status === 'PENDING');
      if (firstPendingIndex !== -1) {
        setCurrentDocIndex(firstPendingIndex);
      }
    } catch (error: any) {
      console.error('Failed to fetch documents:', error);
      setError(error?.message || 'Failed to load documents. Please try again.');
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
        params.accountId!,
        documentId,
        params.accountType!,
        status,
        reason
      );

      // Refresh documents
      await fetchDocuments();

      showToast('Document status updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to update document:', error);
      Alert.alert('Error', error?.message || 'Failed to update document status');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveExpiry = async (doc: DocumentItem) => {
    const trimmed = expiryInput.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      Alert.alert('Invalid date', 'Enter the date as YYYY-MM-DD, e.g. 2027-03-31.');
      return;
    }
    setSavingExpiry(true);
    try {
      if (doc.document_type === 'licence') {
        await apiService.updateDriverLicenceExpiry(params.accountId!, trimmed || null);
      } else {
        await apiService.updateDocumentExpiry(params.accountId!, doc.document_id, trimmed || null);
      }
      await fetchDocuments();
      showToast(trimmed ? `Expiry date set to ${trimmed}.` : 'Expiry date cleared.', 'success');
    } catch (error: any) {
      console.error('Failed to update expiry date:', error);
      Alert.alert('Error', error?.message || 'Failed to update expiry date');
    } finally {
      setSavingExpiry(false);
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

  if (!documents) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No documents found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Separate documents into Owner, Car, and Driver categories
  const ownerDocs = documents.account_documents;
  const carDocs = documents.car_documents.filter(d => d.document_type !== 'licence');
  const driverDocs = documents.car_documents.filter(d => d.document_type === 'licence');
  const allDocuments = [...ownerDocs, ...carDocs, ...driverDocs];

  let categoryFilteredDocs = allDocuments;
  if (categoryFilter === 'OWNER') categoryFilteredDocs = ownerDocs;
  else if (categoryFilter === 'CARS') categoryFilteredDocs = carDocs;
  else if (categoryFilter === 'DRIVERS') categoryFilteredDocs = driverDocs;

  const filteredDocuments = statusFilter === 'ALL'
    ? categoryFilteredDocs
    : categoryFilteredDocs.filter(d => d.status === statusFilter);
  const currentDocument = allDocuments[currentDocIndex];

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
    if (currentDocIndex > 0) {
      setCurrentDocIndex(currentDocIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentDocIndex < allDocuments.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1);
    }
  };

  const handleVerify = () => {
    Alert.alert(
      'Verify Document',
      `Are you sure you want to verify "${currentDocument.document_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: () => updateDocumentStatus(currentDocument.document_id, 'VERIFIED'),
        },
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

  const docsToVerify = allDocuments.filter((d) => d.status !== 'VERIFIED');
  const canVerifyAll = docsToVerify.length > 0;

  const handleVerifyAll = () => {
    Alert.alert(
      'Approve All Documents',
      `Are you sure you want to approve all ${docsToVerify.length} document(s)? This includes account and car documents.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            setUpdating(true);
            try {
              for (const doc of docsToVerify) {
                await apiService.updateDocumentStatus(
                  params.accountId!,
                  doc.document_id,
                  params.accountType!,
                  'VERIFIED'
                );
              }
              await fetchDocuments();
              showToast(`All ${docsToVerify.length} document(s) approved successfully.`, 'success');
            } catch (error: any) {
              console.error('Failed to approve all documents:', error);
              Alert.alert('Error', error?.message || 'Failed to approve some documents.');
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
      for (const doc of allDocuments) {
        if (doc.status === 'VERIFIED') {
          await apiService.updateDocumentStatus(
            params.accountId!,
            doc.document_id,
            params.accountType!,
            'PENDING',
            reasonToUse
          );
        }
      }
      await fetchDocuments();
      showToast(`Account unverified: ${reasonToUse}`, 'info');
    } catch (error: any) {
      console.error('Failed to unverify account:', error);
      Alert.alert('Error', error?.message || 'Failed to unverify account');
    } finally {
      setUpdating(false);
    }
  };

  const reviewProgress = documents.total_documents > 0
    ? (documents.verified_count + documents.invalid_count) / documents.total_documents
    : 0;
  const allReviewed = documents.pending_count === 0 && documents.total_documents > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Top Header Bar */}
      <View style={[styles.topBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backPill, { backgroundColor: themeColors.background }]} activeOpacity={0.7}>
          <ArrowLeft size={18} color={themeColors.text} />
          <Text style={[styles.backPillText, { color: themeColors.text }]}>Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={[styles.portalTitle, { color: themeColors.text }]} numberOfLines={1}>
            {params.accountName || 'Account'} Verification
          </Text>
          <Text style={[styles.portalSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {params.accountType?.toUpperCase() || 'PARTNER'} • Document Approval Console
          </Text>
        </View>

        <ThemeToggle size={20} />

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
        {/* Separate Category Sub-Tabs Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.categoryTabBtn, categoryFilter === 'ALL' && styles.categoryTabBtnActive]}
              onPress={() => setCategoryFilter('ALL')}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabBtnText, categoryFilter === 'ALL' && styles.categoryTabBtnTextActive]}>
                All Docs ({allDocuments.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryTabBtn, categoryFilter === 'OWNER' && styles.categoryTabBtnActive]}
              onPress={() => setCategoryFilter('OWNER')}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabBtnText, categoryFilter === 'OWNER' && styles.categoryTabBtnTextActive]}>
                👤 Owner Docs ({ownerDocs.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryTabBtn, categoryFilter === 'CARS' && styles.categoryTabBtnActive]}
              onPress={() => setCategoryFilter('CARS')}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabBtnText, categoryFilter === 'CARS' && styles.categoryTabBtnTextActive]}>
                🚗 Car Docs ({carDocs.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryTabBtn, categoryFilter === 'DRIVERS' && styles.categoryTabBtnActive]}
              onPress={() => setCategoryFilter('DRIVERS')}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryTabBtnText, categoryFilter === 'DRIVERS' && styles.categoryTabBtnTextActive]}>
                🪪 Driver Docs ({driverDocs.length})
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Light Theme Executive Summary Card with Interactive Filter Tabs */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'ALL' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('ALL')}
              activeOpacity={0.7}
            >
              <Text style={styles.summaryStatNum}>{documents.total_documents}</Text>
              <Text style={styles.summaryStatLbl}>TOTAL DOCS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'PENDING' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('PENDING')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#D97706' }]}>{documents.pending_count}</Text>
              <Text style={styles.summaryStatLbl}>PENDING</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'VERIFIED' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('VERIFIED')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#059669' }]}>{documents.verified_count}</Text>
              <Text style={styles.summaryStatLbl}>APPROVED</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.summaryStatItem, statusFilter === 'INVALID' && styles.summaryStatItemActive]}
              onPress={() => setStatusFilter('INVALID')}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryStatNum, { color: '#DC2626' }]}>{documents.invalid_count}</Text>
              <Text style={styles.summaryStatLbl}>REJECTED</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.progressText}>
                Filter: <Text style={{ color: '#2563EB', fontWeight: '800' }}>{statusFilter}</Text> • Approval Progress
              </Text>
              <Text style={styles.progressPercent}>{Math.round(reviewProgress * 100)}% Complete</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${Math.round(reviewProgress * 100)}%` }]} />
            </View>
          </View>

          {/* Advanced controls - Account Verified master toggle + Trusted
              Partner override, tucked behind a collapsed row instead of
              sitting in the always-visible summary card. */}
          <TouchableOpacity
            style={styles.advancedToggleHeader}
            onPress={() => setShowAdvanced(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.advancedToggleHeaderText}>Advanced controls</Text>
            {showAdvanced ? <ChevronLeft size={16} color="#64748B" style={{ transform: [{ rotate: '-90deg' }] }} /> : <ChevronRight size={16} color="#64748B" style={{ transform: [{ rotate: '90deg' }] }} />}
          </TouchableOpacity>

          {showAdvanced && (
            <>
              <View style={styles.summaryToggleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <CheckCircle size={18} color={allReviewed ? '#059669' : '#64748B'} />
                  <View>
                    <Text style={styles.summaryToggleTitle}>
                      ACCOUNT VERIFIED STATUS
                    </Text>
                    <Text style={styles.summaryToggleSubtitle}>
                      {allReviewed ? '✓ All documents verified - Account Active' : 'Auto toggles ON when all docs are approved'}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={allReviewed}
                  onValueChange={(val) => {
                    if (val) {
                      handleVerifyAll();
                    } else {
                      setUnverifyReason('');
                      setUnverifyModalVisible(true);
                    }
                  }}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  thumbColor={allReviewed ? '#FFFFFF' : '#F1F5F9'}
                />
              </View>

              {params.accountType === 'vehicle_owner' && (
                <View style={styles.summaryToggleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <CheckCircle size={18} color={isTrusted ? '#7C3AED' : '#64748B'} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryToggleTitle}>
                        TRUSTED PARTNER
                      </Text>
                      <Text style={styles.summaryToggleSubtitle}>
                        {canManageTrusted
                          ? 'Unlocks posting bookings to the whole driver network'
                          : 'Only selected staff can change this - ask the Owner'}
                      </Text>
                    </View>
                  </View>

                  {savingTrusted ? (
                    <ActivityIndicator size="small" color="#7C3AED" />
                  ) : (
                    <Switch
                      value={isTrusted}
                      disabled={!canManageTrusted}
                      onValueChange={handleToggleTrusted}
                      trackColor={{ false: '#CBD5E1', true: '#7C3AED' }}
                      thumbColor={isTrusted ? '#FFFFFF' : '#F1F5F9'}
                    />
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {allReviewed && (
          <View style={styles.allDoneBanner}>
            <PartyPopper size={20} color="#059669" />
            <Text style={styles.allDoneBannerText}>🎉 All documents verified! Account automatically marked VERIFIED!</Text>
          </View>
        )}

        {/* Executive Document Feed Cards */}
        <View style={{ gap: 16, marginTop: 10 }}>
          {filteredDocuments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No {statusFilter.toLowerCase()} documents found.</Text>
            </View>
          ) : (
            filteredDocuments.map((doc, idx) => {
              const isVerified = doc.status === 'VERIFIED';
              const isInvalid = doc.status === 'INVALID';
              const isPending = doc.status === 'PENDING';

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
                        {doc.car_name && (
                          <Text style={styles.docCardCarTag}>🚗 {doc.car_name} ({doc.car_number})</Text>
                        )}
                      </View>
                    </View>

                    <View style={[styles.statusBadgePill, { backgroundColor: isVerified ? '#ECFDF5' : isInvalid ? '#FEF2F2' : '#FFFBEB', borderColor: isVerified ? '#10B98130' : isInvalid ? '#EF444430' : '#F59E0B30' }]}>
                      <View style={[styles.statusDot, { backgroundColor: isVerified ? '#10B981' : isInvalid ? '#EF4444' : '#F59E0B' }]} />
                      <Text style={[styles.statusBadgePillText, { color: isVerified ? '#047857' : isInvalid ? '#B91C1C' : '#B45309' }]}>
                        {isVerified ? 'VERIFIED' : isInvalid ? 'REJECTED' : 'PENDING'}
                      </Text>
                    </View>
                  </View>

                  {/* Compact Side-by-Side Content Row (Thumbnail + Expiry Date Field) */}
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

                    {/* Right: Expiry Date & Upload Date Details */}
                    <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
                      <Text style={styles.docCardSubtitle}>
                        Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                      </Text>

                      {/* Expiry / Validity Date Field with Quick Date Picker Chips */}
                      <View style={styles.compactExpiryBox}>
                        <Text style={styles.compactExpiryLabel}>Expiry / Valid Date:</Text>
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
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
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
              Why is "{currentDocument.document_name}" being rejected? This will be sent to the account holder.
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

      {/* Unverify Account Modal with Preset Reasons */}
      <Modal
        visible={unverifyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnverifyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Unverify Account</Text>
            <Text style={styles.modalSubtitle}>
              Please select or type a reason for unverifying this account:
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
                <Text style={styles.modalConfirmButtonText}>Unverify Account</Text>
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
              <Text style={styles.lightboxTitle}>{currentDocument?.document_name || 'Document Preview'}</Text>
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
                <Text style={styles.lightboxDateLabel}>Expiry Date:</Text>
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
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
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
    color: '#1E293B',
  },
  portalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  portalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
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
    backgroundColor: colors.background,
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
    textTransform: 'uppercase',
  },
  switchStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
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
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  allDoneBannerText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
  },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  docCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  docCardCarTag: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '700',
    marginTop: 4,
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
  expiryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  expiryBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  expiryInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expiryTextInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
  },
  expirySaveButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expirySaveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  advancedToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  advancedToggleHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
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
  compactExpiryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactExpiryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
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
  categoryTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryTabBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  categoryTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  categoryTabBtnTextActive: {
    color: '#FFFFFF',
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

