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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useRouter } from 'expo-router';
import { formatCarType } from '@/utils/format';
import {
  ArrowLeft,
  Car,
  Plus,
  Image as ImageIcon,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { fetchDashboardData } from '@/services/orders/dashboardService';
import axiosInstance from '@/app/api/axiosInstance';
import { fetchDocumentStatuses, DocumentStatusResponse } from '@/services/documents/documentStatusService';
import DocumentStatusIcon from '@/components/DocumentStatusIcon';
import DocumentUpdateModal from '@/components/DocumentUpdateModal';
import { useLanguage } from '@/contexts/LanguageContext';

export default function MyCarsScreen() {
  const { user } = useAuth();
  const { colors, isDarkMode } = useTheme();
  const { dashboardData, loading, error, fetchData, refreshData } = useDashboard();
  const router = useRouter();
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatusResponse[]>([]);
  const [availableCarsMap, setAvailableCarsMap] = useState<Record<string, any>>({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{
    entityId: string;
    documentType: string;
    documentName: string;
  } | null>(null);
  const [expandedCarId, setExpandedCarId] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Use simple refresh logic - only refresh cars data and document statuses
      await refreshData();
      await fetchDocumentStatuses().then(setDocumentStatuses);  
      await loadAvailableCars();
    } catch (error: any) {
      console.error('Error refreshing cars:', error);
      
      // Handle authentication errors
      if (error.message?.includes('No authentication token found') || 
          error.message?.includes('Authentication failed') || 
          error.message?.includes('401')) {
        console.log('🔐 Authentication error detected, redirecting to login');
        Alert.alert(
          t('myCars.sessionExpiredTitle'),
          t('myCars.sessionExpiredBody'),
          [
            {
              text: t('myCars.ok'),
              onPress: () => router.replace('/login')
            }
          ]
        );
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch document statuses on component mount
  useEffect(() => {
    fetchDocumentStatuses()
      .then(setDocumentStatuses)
      .catch(error => {
        console.error('Failed to fetch document statuses:', error);
      });
    // Also load available cars with status for display
    loadAvailableCars();
  }, []);

  // Fetch available cars (with car_status) and index by id for quick lookup
  const loadAvailableCars = async () => {
    try {
      const res = await axiosInstance.get('/api/assignments/available-cars');
      if (Array.isArray(res.data)) {
        const map: Record<string, any> = {};
        for (const c of res.data) {
          if (c && c.id) map[c.id] = c;
        }
        setAvailableCarsMap(map);
      }
    } catch (err) {
      console.warn('⚠️ Failed to load available cars status:', err);
    }
  };

  // Get document status for a specific car and document type
  const getDocumentStatus = (carId: string, documentType: string): 'PENDING' | 'INVALID' | 'VERIFIED' => {
    const carStatus = documentStatuses.find(status => 
      status.entity_type === 'car' && status.entity_id === carId
    );
    
    if (!carStatus || !carStatus.documents[documentType]) {
      return 'PENDING';
    }
    
    return carStatus.documents[documentType].status;
  };

  // Documents that are about to expire (15 days) or already expired can be renewed straight away: upload the new one,
  // it goes for verification, and the old image is removed automatically once the new one is verified.
  const getDaysLeft = (carId: string, documentType: string): number | null => {
    const st = documentStatuses.find((x: any) => x.entity_type === 'car' && x.entity_id === carId);
    const d = st?.documents?.[documentType]?.days_left;
    return typeof d === 'number' ? d : null;
  };
  const canReupload = (carId: string, documentType: string) => {
    const status = getDocumentStatus(carId, documentType);
    const d = getDaysLeft(carId, documentType);
    return status !== 'VERIFIED' || (d !== null && d <= 15);
  };
  const expiryNotes = (carId: string): string[] =>
    [['rc_front', 'RC'], ['insurance', 'Insurance']]
      .map(([k, label]) => {
        const d = getDaysLeft(carId, k);
        if (d === null || d > 15) return '';
        return d < 0 ? `${label} expired ${-d} day(s) ago - tap it to renew` : `${label} expires in ${d} day(s) - tap it to renew`;
      })
      .filter(Boolean);

  // Handle document update
  const handleDocumentUpdate = (carId: string, documentType: string, documentName: string) => {
    setSelectedDocument({
      entityId: carId,
      documentType,
      documentName,
    });
    setShowUpdateModal(true);
  };

  // Handle successful document update
  const handleDocumentUpdateSuccess = () => {
    // Refresh document statuses
    fetchDocumentStatuses()
      .then(setDocumentStatuses)
      .catch(error => {
        console.error('Failed to refresh document statuses:', error);
      });
  };

  const handleAddCar = () => {
    router.push('/add-car-menu');
  };

  // Edit/Delete not implemented – hide controls

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      flexShrink: 1,
      marginRight: 12,
    },
    refreshButton: {
      padding: 6,
      borderRadius: 6,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      flexShrink: 1,
    },
    addButton: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    addButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      marginLeft: 4,
    },
    content: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyIcon: {
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    carCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDarkMode ? 0.2 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    carHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    carHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    carIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    carTitle: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      letterSpacing: -0.2,
    },
    carPlateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    numberPlateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7',
      borderWidth: 1,
      borderColor: isDarkMode ? '#334155' : '#FDE68A',
      borderRadius: 5,
      overflow: 'hidden',
      paddingRight: 6,
    },
    indStrip: {
      backgroundColor: '#1E3A8A',
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      marginRight: 5,
    },
    indText: {
      color: '#FFFFFF',
      fontSize: 8.5,
      fontFamily: 'Inter-Bold',
      letterSpacing: 0.2,
    },
    numberPlateText: {
      fontSize: 11.5,
      fontFamily: 'Inter-Bold',
      color: isDarkMode ? '#F8FAFC' : '#78350F',
      letterSpacing: 0.6,
    },
    carTypeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    },
    carTypeBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
    },
    carHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 6,
      gap: 5,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter-Bold',
      letterSpacing: 0.3,
    },
    docHealthSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      justifyContent: 'space-between',
    },
    docHealthLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    docHealthText: {
      fontSize: 12,
      fontFamily: 'Inter-SemiBold',
    },
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginVertical: 14,
    },
    specChip: {
      flex: 1,
      minWidth: '46%',
      backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC',
      padding: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    specLabel: {
      fontSize: 11,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    specValue: {
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginTop: 2,
    },
    docMatrixContainer: {
      marginTop: 6,
    },
    docMatrixHeader: {
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: 0.2,
    },
    docTilesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    docTile: {
      flex: 1,
      minWidth: '30%',
      padding: 10,
      borderRadius: 6,
      borderWidth: 1,
    },
    docTileTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    docTileTitle: {
      fontSize: 11.5,
      fontFamily: 'Inter-Bold',
      marginBottom: 4,
    },
    docTileStatusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    docTileStatusText: {
      fontSize: 9.5,
      fontFamily: 'Inter-Bold',
      textTransform: 'uppercase',
    },
    expiryWarningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 6,
      padding: 10,
      marginBottom: 10,
      gap: 8,
    },
    expiryWarningText: {
      color: '#DC2626',
      fontSize: 12,
      fontFamily: 'Inter-SemiBold',
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    errorText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.error,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <Text style={dynamicStyles.loadingText}>{t('myCars.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorText}>{t('myCars.errorPrefix', { message: error })}</Text>
          <TouchableOpacity style={dynamicStyles.retryButton} onPress={fetchData}>
            <Text style={dynamicStyles.retryButtonText}>{t('myCars.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const cars = dashboardData?.cars || [];

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={dynamicStyles.headerLeft}>
          <TouchableOpacity onPress={() => safeBack(router)} style={dynamicStyles.backButton}>
            <ArrowLeft color={colors.text} size={24} />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle} numberOfLines={1}>{t('myCars.headerTitle')}</Text>
        </View>
        <TouchableOpacity style={dynamicStyles.addButton} onPress={handleAddCar}>
          <Plus color="#FFFFFF" size={16} />
          <Text style={dynamicStyles.addButtonText}>{t('myCars.addCar')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={dynamicStyles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {cars.length === 0 ? (
          <View style={dynamicStyles.emptyState}>
            <Car color={colors.textSecondary} size={64} style={dynamicStyles.emptyIcon} />
            <Text style={dynamicStyles.emptyTitle}>{t('myCars.noCarsTitle')}</Text>
            <Text style={dynamicStyles.emptySubtitle}>
              {t('myCars.noCarsSubtitle')}
            </Text>
            <TouchableOpacity style={dynamicStyles.addButton} onPress={handleAddCar}>
              <Plus color="#FFFFFF" size={16} />
              <Text style={dynamicStyles.addButtonText}>{t('myCars.addFirstCar')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          cars.map((car) => {
            const isExpanded = expandedCarId === car.id;
            const carStatus = availableCarsMap[car.id]?.car_status || 'AVAILABLE';
            const docs = [
              { key: 'rc_front', label: t('myCars.rcFront') || 'RC Front' },
              { key: 'rc_back', label: t('myCars.rcBack') || 'RC Back' },
              { key: 'insurance', label: t('myCars.insurance') || 'Insurance' },
              { key: 'fc', label: t('myCars.fc') || 'Fitness (FC)' },
              { key: 'permit', label: t('myCars.permit') || 'Permit' },
              { key: 'car_img', label: t('myCars.carImage') || 'Car Photo' },
            ];
            const verifiedDocs = docs.filter((d) => getDocumentStatus(car.id, d.key) === 'VERIFIED');
            const verifiedCount = verifiedDocs.length;
            const notes = expiryNotes(car.id);
            const isAllVerified = verifiedCount === docs.length;

            const statusColor =
              carStatus === 'ASSIGNED' ? '#3B82F6' :
              carStatus === 'AVAILABLE' ? '#10B981' :
              carStatus === 'ON_TRIP' ? '#8B5CF6' : '#F59E0B';

            return (
              <View
                key={car.id}
                style={[
                  dynamicStyles.carCard,
                  isExpanded && { borderColor: colors.primary + '60' },
                ]}
              >
                {/* Header Row */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandedCarId(isExpanded ? null : car.id)}
                  style={dynamicStyles.carHeader}
                >
                  <View style={dynamicStyles.carHeaderLeft}>
                    <View style={dynamicStyles.carIconCircle}>
                      <Car color={colors.primary} size={22} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={dynamicStyles.carTitle} numberOfLines={1}>
                        {car.car_name || `${car.car_brand || ''} ${car.car_model || ''}`.trim() || t('myCars.unnamedCar')}
                      </Text>
                      <View style={dynamicStyles.carPlateRow}>
                        <View style={dynamicStyles.numberPlateBadge}>
                          <View style={dynamicStyles.indStrip}>
                            <Text style={dynamicStyles.indText}>IND</Text>
                          </View>
                          <Text style={dynamicStyles.numberPlateText}>{car.car_number}</Text>
                        </View>
                        <View style={dynamicStyles.carTypeBadge}>
                          <Text style={dynamicStyles.carTypeBadgeText}>{formatCarType(car.car_type)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={dynamicStyles.carHeaderRight}>
                    <View style={[dynamicStyles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                      <View style={[dynamicStyles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[dynamicStyles.statusBadgeText, { color: statusColor }]}>
                        {carStatus}
                      </Text>
                    </View>
                    {isExpanded ? (
                      <ChevronUp color={colors.textSecondary} size={20} />
                    ) : (
                      <ChevronDown color={colors.textSecondary} size={20} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Document Health Row on Card */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandedCarId(isExpanded ? null : car.id)}
                  style={dynamicStyles.docHealthSummary}
                >
                  <View style={dynamicStyles.docHealthLeft}>
                    {isAllVerified ? (
                      <ShieldCheck color="#10B981" size={15} />
                    ) : (
                      <AlertTriangle color="#F59E0B" size={15} />
                    )}
                    <Text
                      style={[
                        dynamicStyles.docHealthText,
                        { color: isAllVerified ? '#10B981' : '#F59E0B' },
                      ]}
                    >
                      {isAllVerified
                        ? '6/6 Fleet Documents Active'
                        : `${verifiedCount}/6 Documents Active · Tap to update`}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                    {isExpanded ? 'Hide details' : 'View details'}
                  </Text>
                </TouchableOpacity>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <>
                    {/* Vehicle Specifications Grid */}
                    <View style={dynamicStyles.specsGrid}>
                      <View style={dynamicStyles.specChip}>
                        <Text style={dynamicStyles.specLabel}>{t('myCars.registration')}</Text>
                        <Text style={dynamicStyles.specValue}>{car.car_number}</Text>
                      </View>
                      <View style={dynamicStyles.specChip}>
                        <Text style={dynamicStyles.specLabel}>{t('myCars.type')}</Text>
                        <Text style={dynamicStyles.specValue}>{formatCarType(car.car_type)}</Text>
                      </View>
                      <View style={dynamicStyles.specChip}>
                        <Text style={dynamicStyles.specLabel}>{t('myCars.year')}</Text>
                        <Text style={dynamicStyles.specValue}>{car.year_of_the_car || car.car_year || car.year || 'N/A'}</Text>
                      </View>
                      <View style={dynamicStyles.specChip}>
                        <Text style={dynamicStyles.specLabel}>{t('myCars.status')}</Text>
                        <Text style={[dynamicStyles.specValue, { color: statusColor }]}>{carStatus}</Text>
                      </View>
                    </View>

                    {/* Expiry Alerts */}
                    {notes.map((note) => (
                      <View key={note} style={dynamicStyles.expiryWarningBox}>
                        <AlertTriangle size={15} color="#DC2626" />
                        <Text style={dynamicStyles.expiryWarningText}>⚠️ {note}</Text>
                      </View>
                    ))}

                    {/* Document Matrix Grid */}
                    <View style={dynamicStyles.docMatrixContainer}>
                      <Text style={dynamicStyles.docMatrixHeader}>Vehicle Documents & Compliance</Text>
                      <View style={dynamicStyles.docTilesGrid}>
                        {docs.map((docItem) => {
                          const status = getDocumentStatus(car.id, docItem.key);
                          const days = getDaysLeft(car.id, docItem.key);
                          const isVerified = status === 'VERIFIED';
                          const isExpiring = days !== null && days <= 15;
                          const reupload = canReupload(car.id, docItem.key);

                          return (
                            <TouchableOpacity
                              key={docItem.key}
                              style={[
                                dynamicStyles.docTile,
                                {
                                  backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC',
                                  borderColor: isExpiring ? '#EF4444' : isVerified ? '#10B98130' : colors.border,
                                },
                              ]}
                              onPress={() => {
                                if (reupload) {
                                  handleDocumentUpdate(car.id, docItem.key, docItem.label);
                                }
                              }}
                              activeOpacity={reupload ? 0.75 : 1}
                            >
                              <View style={dynamicStyles.docTileTop}>
                                <FileText
                                  size={16}
                                  color={isVerified ? '#10B981' : isExpiring ? '#EF4444' : colors.primary}
                                />
                                <DocumentStatusIcon status={status as any} size={14} />
                              </View>
                              <Text
                                style={[dynamicStyles.docTileTitle, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {docItem.label}
                              </Text>
                              <View
                                style={[
                                  dynamicStyles.docTileStatusBadge,
                                  {
                                    backgroundColor: isExpiring
                                      ? '#EF444415'
                                      : isVerified
                                      ? '#10B98115'
                                      : '#F59E0B15',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    dynamicStyles.docTileStatusText,
                                    {
                                      color: isExpiring
                                        ? '#EF4444'
                                        : isVerified
                                        ? '#10B981'
                                        : '#F59E0B',
                                    },
                                  ]}
                                >
                                  {isExpiring
                                    ? (days !== null && days < 0 ? 'Expired' : `${days}d left`)
                                    : status}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Document Update Modal */}
      {selectedDocument && (
        <DocumentUpdateModal
          visible={showUpdateModal}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedDocument(null);
          }}
          entityId={selectedDocument.entityId}
          entityType="car"
          documentType={selectedDocument.documentType}
          documentName={selectedDocument.documentName}
          onSuccess={handleDocumentUpdateSuccess}
        />
      )}
      <RefreshFab onRefresh={handleRefresh} />
    </SafeAreaView>
  );
}