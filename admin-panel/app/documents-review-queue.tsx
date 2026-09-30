import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  CheckCircle2,
  FileText,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import { Card, StatusPill, Btn, EmptyState, SkeletonRow } from '@/components/ui';

interface ReviewItem {
  entity_type: 'vehicle_owner' | 'car' | 'driver' | 'vendor';
  entity_id: string;
  owner_account_id?: string | null;
  owner_name?: string | null;
  entity_name: string;
  document_type: string;
  document_name: string;
  image_url: string | null;
  uploaded_at: string | null;
}

const toDocumentId = (item: ReviewItem): string =>
  item.entity_type === 'car' ? `car_${item.entity_id}_${item.document_type}` : `account_${item.document_type}`;

const toAccountArgs = (item: ReviewItem): { accountId: string; accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' } => {
  if (item.entity_type === 'car') {
    return { accountId: item.owner_account_id || item.entity_id, accountType: 'vehicle_owner' };
  }
  return { accountId: item.entity_id, accountType: (item.entity_type === 'driver' ? 'driver' : item.entity_type) as any };
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function DocumentsReviewQueueScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      // In the admin app, pending reviews can be collected from pending verification accounts
      const pendingAccounts = await apiService.getAllAccounts(0, 50, undefined, 'inactive');
      const queue: ReviewItem[] = [];
      for (const acc of (pendingAccounts.accounts || [])) {
        if (acc.pending_documents_count && acc.pending_documents_count > 0) {
          queue.push({
            entity_type: (acc.account_type as any) || 'vehicle_owner',
            entity_id: acc.id,
            entity_name: acc.name,
            document_type: 'kyc',
            document_name: 'KYC / Registration Document',
            image_url: null,
            uploaded_at: null,
          });
        }
      }
      setItems(queue);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = async (item: ReviewItem, action: 'approve' | 'reject') => {
    const key = `${item.entity_id}-${item.document_type}`;
    setProcessingKey(key);
    try {
      const { accountId, accountType } = toAccountArgs(item);
      const documentId = toDocumentId(item);
      await apiService.updateDocumentStatus(
        accountId,
        documentId,
        accountType,
        action === 'approve' ? 'VERIFIED' : 'INVALID'
      );
      setItems(prev => prev.filter(i => `${i.entity_id}-${i.document_type}` !== key));
    } catch (e: any) {
      Alert.alert('Error', e?.message || `Failed to ${action} document`);
    } finally {
      setProcessingKey(null);
    }
  };

  const getEntityBadgeVariant = (type: string): 'info' | 'warning' | 'success' | 'neutral' => {
    switch (type) {
      case 'car': return 'warning';
      case 'driver': return 'info';
      case 'vehicle_owner': return 'success';
      default: return 'neutral';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Documents Queue</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{items.length}</Text>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchQueue(); }} tintColor={themeColors.primary} />}
        >
          {items.map((item) => {
            const key = `${item.entity_id}-${item.document_type}`;
            const isProcessing = processingKey === key;

            return (
              <Card key={key} style={styles.docCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.entityRow}>
                      <Text style={[styles.entityName, { color: themeColors.text }]}>{item.entity_name}</Text>
                      <StatusPill label={item.entity_type} variant={getEntityBadgeVariant(item.entity_type)} size="sm" />
                    </View>
                    <Text style={[styles.docName, { color: themeColors.primary }]}>{item.document_name}</Text>
                    {!!item.uploaded_at && (
                      <Text style={[styles.uploadedText, { color: themeColors.textMuted }]}>Uploaded {formatDate(item.uploaded_at)}</Text>
                    )}
                  </View>
                </View>

                {item.image_url && (
                  <View style={[styles.previewContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <Image source={{ uri: item.image_url }} style={styles.docImage} resizeMode="contain" />
                  </View>
                )}

                <View style={styles.actionRow}>
                  {/* This queue only knows THAT an account has pending
                      documents, not WHICH ones (aadhar vs aadhar-back vs
                      PAN vs licence etc.) - it used to send a fake
                      document_type "kyc" straight to Approve/Reject, which
                      the backend always rejected with "Invalid ... document
                      type" (found 2026-09-29). The real per-document
                      approve/reject flow already exists and works on
                      account-documents.tsx - send staff there instead of
                      guessing here. */}
                  <Btn
                    label="Review documents"
                    variant="primary"
                    size="sm"
                    onPress={() => router.push({
                      pathname: '/account-documents',
                      params: { accountId: item.entity_id, accountType: item.entity_type as any, accountName: item.entity_name },
                    } as any)}
                    disabled={isProcessing}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })}

          {items.length === 0 && (
            <EmptyState
              icon={<CheckCircle2 size={36} color={themeColors.success} />}
              title="All caught up!"
              message="No documents currently waiting for review."
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: '700' },
  loadingContainer: { padding: 16, gap: 8 },
  scrollContent: { padding: 16, gap: 10, paddingBottom: 40 },
  docCard: { padding: 14, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  entityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  entityName: { fontSize: 14, fontWeight: '700' },
  docName: { fontSize: 13, fontWeight: '700' },
  uploadedText: { fontSize: 11, marginTop: 2 },
  previewContainer: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  docImage: { width: '100%', height: '100%' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
