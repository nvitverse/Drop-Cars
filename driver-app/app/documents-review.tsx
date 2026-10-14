import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, CheckCircle, Clock, FileText, Car, User, Home } from 'lucide-react-native';
import { fetchDocumentStatuses } from '@/services/documents/documentStatusService';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function DocumentsReviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();

  // The REAL state of each group of documents (it used to say "Under Review" for everything, whatever the truth was, and promised 24-48 hours
  // before the account would be "activated" - but a car or driver works as soon as its documents are valid; checking runs in the background).
  type Group = 'owner' | 'driver' | 'car';
  const [state, setState] = useState<Record<Group, 'verified' | 'checking' | 'fix' | 'none'>>({ owner: 'checking', driver: 'checking', car: 'checking' });
  useEffect(() => {
    let alive = true;
    fetchDocumentStatuses().then((list: any[]) => {
      if (!alive) return;
      const next: Record<Group, 'verified' | 'checking' | 'fix' | 'none'> = { owner: 'none', driver: 'none', car: 'none' };
      (['owner', 'driver', 'car'] as Group[]).forEach((g) => {
        const sts: string[] = [];
        (list || []).filter((e: any) => String(e.entity_type || '').toLowerCase() === (g === 'owner' ? 'vehicle_owner' : g)).forEach((e: any) => {
          Object.values(e.documents || {}).forEach((d: any) => sts.push(String(d?.status || 'PENDING').toUpperCase()));
        });
        next[g] = sts.length === 0 ? 'none' : sts.some((x) => x === 'INVALID') ? 'fix' : sts.every((x) => x === 'VERIFIED') ? 'verified' : 'checking';
      });
      setState(next);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const chip = (st: 'verified' | 'checking' | 'fix' | 'none') =>
    st === 'verified' ? { text: t('documentsReview.verifiedLabel'), color: '#16A34A', bg: isDarkMode ? '#064E3B' : '#DCFCE7' }
    : st === 'fix' ? { text: t('documentsReview.needsAttention'), color: '#DC2626', bg: isDarkMode ? '#7F1D1D' : '#FEE2E2' }
    : st === 'none' ? { text: t('documentsReview.notUploaded'), color: colors.textSecondary, bg: isDarkMode ? '#1F2937' : '#F1F5F9' }
    : { text: t('documentsReview.underReview'), color: colors.warning, bg: isDarkMode ? '#78350F' : '#FEF3C7' };

  const handleGoToDashboard = () => {
    router.replace('/(tabs)');
  };

  const handleContactSupport = () => {
    Linking.openURL('tel:7200217986');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#064E3B' : '#F0FDF4' }]}>
            <CheckCircle color={colors.success} size={48} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('documentsReview.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('documentsReview.subtitle', { name: user?.fullName || '' })}
          </Text>
        </View>

        {/* Progress Summary */}
        <View style={styles.progressSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('documentsReview.whatWeCompleted')}</Text>

          <View style={styles.progressItem}>
            <View style={styles.progressIcon}>
              <CheckCircle color={colors.success} size={24} />
            </View>
            <View style={styles.progressContent}>
              <Text style={[styles.progressTitle, { color: colors.text }]}>{t('documentsReview.accountCreatedTitle')}</Text>
              <Text style={[styles.progressDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.accountCreatedDesc')}
              </Text>
            </View>
          </View>

          <View style={styles.progressItem}>
            <View style={styles.progressIcon}>
              <CheckCircle color={colors.success} size={24} />
            </View>
            <View style={styles.progressContent}>
              <Text style={[styles.progressTitle, { color: colors.text }]}>{t('documentsReview.carAddedTitle')}</Text>
              <Text style={[styles.progressDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.carAddedDesc')}
              </Text>
            </View>
          </View>

          <View style={styles.progressItem}>
            <View style={styles.progressIcon}>
              <CheckCircle color={colors.success} size={24} />
            </View>
            <View style={styles.progressContent}>
              <Text style={[styles.progressTitle, { color: colors.text }]}>{t('documentsReview.driverProfileTitle')}</Text>
              <Text style={[styles.progressDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.driverProfileDesc')}
              </Text>
            </View>
          </View>
        </View>

        {/* Documents Review Status */}
        <View style={styles.reviewSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('documentsReview.documentsUnderReview')}</Text>

          <View style={[styles.reviewCard, { backgroundColor: isDarkMode ? '#451A03' : '#FEF3C7', borderLeftColor: colors.warning }]}>
            <View style={styles.reviewHeader}>
              <Clock color={colors.warning} size={24} />
              <Text style={[styles.reviewTitle, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>{t('documentsReview.reviewInProgress')}</Text>
            </View>
            <Text style={[styles.reviewDescription, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>
              {t('documentsReview.reviewDescription')}
            </Text>

            <View style={styles.documentList}>
              <View style={[styles.documentItem, { backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.7)' }]}>
                <FileText color={colors.textSecondary} size={16} />
                <Text style={[styles.documentText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>{t('documentsReview.accountOwnerDocuments')}</Text>
                <Text style={[styles.documentStatus, { color: chip(state.owner).color, backgroundColor: chip(state.owner).bg }]}>{chip(state.owner).text}</Text>
              </View>

              <View style={[styles.documentItem, { backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.7)' }]}>
                <FileText color={colors.textSecondary} size={16} />
                <Text style={[styles.documentText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>{t('documentsReview.driverDocuments')}</Text>
                <Text style={[styles.documentStatus, { color: chip(state.driver).color, backgroundColor: chip(state.driver).bg }]}>{chip(state.driver).text}</Text>
              </View>

              <View style={[styles.documentItem, { backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.7)' }]}>
                <FileText color={colors.textSecondary} size={16} />
                <Text style={[styles.documentText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>{t('documentsReview.carRegistration')}</Text>
                <Text style={[styles.documentStatus, { color: chip(state.car).color, backgroundColor: chip(state.car).bg }]}>{chip(state.car).text}</Text>
              </View>
            </View>
            {(state.owner === 'fix' || state.driver === 'fix' || state.car === 'fix') ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                <AlertTriangle color="#DC2626" size={18} />
                <Text style={{ flex: 1, color: '#B91C1C', fontSize: 13, lineHeight: 19 }}>{t('documentsReview.fixHint')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Next Steps */}
        <View style={styles.nextStepsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('documentsReview.whatHappensNext')}</Text>

          <View style={styles.stepItem}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>{t('documentsReview.step1Title')}</Text>
              <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.step1Desc')}
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>{t('documentsReview.step2Title')}</Text>
              <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.step2Desc')}
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>{t('documentsReview.step3Title')}</Text>
              <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                {t('documentsReview.step3Desc')}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleGoToDashboard}>
            <Home color="#FFFFFF" size={20} />
            <Text style={styles.primaryButtonText}>{t('documentsReview.goToDashboard')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.background }]} onPress={handleContactSupport}>
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>{t('documentsReview.contactSupport')}</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <View style={[styles.footerNote, { backgroundColor: colors.background }]}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {t('documentsReview.footerNote')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  progressSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 20,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  progressIcon: {
    marginRight: 16,
    marginTop: 2,
  },
  progressContent: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 4,
  },
  progressDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 20,
  },
  reviewSection: {
    marginBottom: 32,
  },
  reviewCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#92400E',
    marginLeft: 12,
  },
  reviewDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#92400E',
    lineHeight: 20,
    marginBottom: 20,
  },
  documentList: {
    gap: 12,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 6,
    padding: 12,
  },
  documentText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginLeft: 8,
  },
  documentStatus: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nextStepsSection: {
    marginBottom: 32,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 20,
  },
  actionSection: {
    marginBottom: 32,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  footerNote: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});


