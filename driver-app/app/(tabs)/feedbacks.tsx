import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, Gift, Sparkles, MessageSquare, Award, TrendingUp, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosInstance from '@/app/api/axiosInstance';

interface FeedbackItem {
  id: string;
  bookingId: string;
  customerName: string;
  rating: number;
  tags: string[];
  comment: string;
  date: string;
  incentiveAmount: number; // +₹50 for 5-star, +₹40 for 4-star
}

export default function FeedbacksScreen() {
  const { colors, isDarkMode: isDark } = useTheme();
  const { t } = useLanguage();

  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/api/users/vehicleowner/feedbacks');
      // Used to fall back to 3 invented reviews (fake names, ratings,
      // comments, incentive amounts) whenever this was empty or errored -
      // rendered identically to genuine reviews, with no way to tell them
      // apart. An empty/failed fetch must show an honest empty state.
      setFeedbacks(Array.isArray(response.data) ? response.data : []);
      setLoadError(false);
    } catch (error) {
      console.log('Failed to fetch feedbacks:', error);
      setFeedbacks([]);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeedbacks();
  };

  const totalIncentiveEarned = feedbacks.reduce((acc, curr) => acc + curr.incentiveAmount, 0);


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{t('feedbacks.title')}</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {t('feedbacks.subtitle')}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
        {/* Total Incentive Card */}
        <View style={[styles.incentiveCard, { backgroundColor: isDark ? '#1E293B' : '#ECFDF5', borderColor: '#A7F3D0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.incentiveIconCircle}>
              <Gift size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, color: '#047857', fontWeight: '800' }}>{t('feedbacks.totalIncentivesLabel')}</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#059669', marginTop: 2 }}>
                ₹{totalIncentiveEarned} <Text style={{ fontSize: 13, fontWeight: '700' }}>{t('feedbacks.creditedToWallet')}</Text>
              </Text>
            </View>
          </View>
          <View style={styles.incentiveNotice}>
            <Sparkles size={14} color="#D97706" />
            <Text style={{ fontSize: 11.5, color: '#B45309', fontWeight: '700', flex: 1 }}>
              {t('feedbacks.incentiveNoticeText')}
            </Text>
          </View>
        </View>

        {/* Feedback List Header */}
        <Text style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{t('feedbacks.recentReviews')}</Text>

        {feedbacks.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: isDark ? '#10B9811F' : '#10B98112',
              borderWidth: 1, borderColor: isDark ? '#10B98135' : '#10B98120',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <MessageSquare size={30} color="#10B981" strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', textAlign: 'center', marginBottom: 4 }}>
              {loadError ? "Couldn't Load Reviews" : 'No Reviews Yet'}
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
              {loadError ? 'Please check your connection and try again.' : "Customer reviews will show up here after your trips."}
            </Text>
          </View>
        )}

        {feedbacks.map((fb) => (
          <View
            key={fb.id}
            style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={[styles.customerName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{fb.customerName}</Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>{t('feedbacks.bookingDateLine', { bookingId: fb.bookingId, date: fb.date })}</Text>
              </View>

              {/* Rating Pill */}
              <View style={styles.ratingBadge}>
                <Star size={14} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.ratingText}>{fb.rating.toFixed(1)}</Text>
              </View>
            </View>

            {/* Incentive Badge */}
            {fb.incentiveAmount > 0 && (
              <View style={styles.incentivePill}>
                <Sparkles size={13} color="#10B981" />
                <Text style={{ color: '#059669', fontSize: 11.5, fontWeight: '800' }}>
                  {t('feedbacks.incentiveCreditedText', { amount: fb.incentiveAmount, rating: fb.rating })}
                </Text>
              </View>
            )}

            {/* Tags */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {fb.tags.map((tag, idx) => (
                <View key={idx} style={[styles.tagPill, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569' }}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Comment */}
            {!!fb.comment && (
              <View style={[styles.commentBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                <MessageSquare size={14} color="#64748B" />
                <Text style={{ flex: 1, fontSize: 12.5, fontStyle: 'italic', color: isDark ? '#E2E8F0' : '#334155' }}>
                  "{fb.comment}"
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11.5, marginTop: 2 },
  incentiveCard: { padding: 16, borderRadius: 8, borderWidth: 1, marginBottom: 20 },
  incentiveIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  incentiveNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#FEF3C7', padding: 10, borderRadius: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  customerName: { fontSize: 15, fontWeight: '800' },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  ratingText: { fontSize: 13, fontWeight: '900', color: '#B45309' },
  incentivePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginTop: 10 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  commentBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 6, marginTop: 10 },
});
