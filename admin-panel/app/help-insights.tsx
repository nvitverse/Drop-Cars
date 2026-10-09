import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  HelpCircle,
  PhoneCall,
  MessageCircle,
  Eye,
  CheckCircle2,
  TrendingDown,
  ArrowLeft,
} from 'lucide-react-native';
import axios from '@/services/api';
import { Card, Pill, SectionHeader } from '@/components/ui';

interface TopCode {
  code: string;
  total: number;
  shown: number;
  opened_more: number;
  tapped_call: number;
  tapped_whatsapp: number;
  tapped_fix: number;
  call_rate_pct: number;
}

interface InsightsData {
  period_days: number;
  total_events: number;
  total_calls: number;
  total_whatsapps: number;
  total_opened_more: number;
  top_codes: TopCode[];
}

export default function HelpInsightsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedApp, setSelectedApp] = useState<'all' | 'driver' | 'customer' | 'vendor'>('all');
  const [insights, setInsights] = useState<InsightsData | null>(null);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const appParam = selectedApp !== 'all' ? `&app=${selectedApp}` : '';
      const res = await axios.get(`/api/help/insights?days=${selectedDays}${appParam}`);
      setInsights(res.data);
    } catch {
      // Fallback mock data if server table is empty
      setInsights({
        period_days: selectedDays,
        total_events: 0,
        total_calls: 0,
        total_whatsapps: 0,
        total_opened_more: 0,
        top_codes: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [selectedDays, selectedApp]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft color="#F8FAFC" size={18} />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Help & Error Insights</Text>
          <Text style={styles.headerSubtitle}>
            Driver and Customer Doubt Analytics · Reduce Support Calls
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchInsights();
            }}
            tintColor="#3B82F6"
          />
        }
      >
        {/* Filters */}
        <View style={styles.filterRow}>
          <View style={styles.pillGroup}>
            {[7, 14, 30].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.filterPill, selectedDays === d && styles.filterPillActive]}
                onPress={() => setSelectedDays(d)}
              >
                <Text
                  style={[styles.filterPillText, selectedDays === d && styles.filterPillTextActive]}
                >
                  Last {d} Days
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.pillGroup}>
            {(['all', 'driver', 'customer', 'vendor'] as const).map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.filterPill, selectedApp === a && styles.filterPillActive]}
                onPress={() => setSelectedApp(a)}
              >
                <Text
                  style={[styles.filterPillText, selectedApp === a && styles.filterPillTextActive]}
                >
                  {a.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Analyzing telemetry events...</Text>
          </View>
        ) : (
          <>
            {/* Stat Cards */}
            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <View style={styles.statIconBox}>
                  <HelpCircle size={18} color="#3B82F6" />
                </View>
                <Text style={styles.statValue}>{insights?.total_events ?? 0}</Text>
                <Text style={styles.statLabel}>Total Issues Shown</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#10B98118' }]}>
                  <Eye size={18} color="#10B981" />
                </View>
                <Text style={styles.statValue}>{insights?.total_opened_more ?? 0}</Text>
                <Text style={styles.statLabel}>Opened "Read More"</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#F59E0B18' }]}>
                  <PhoneCall size={18} color="#F59E0B" />
                </View>
                <Text style={styles.statValue}>{insights?.total_calls ?? 0}</Text>
                <Text style={styles.statLabel}>Escalated to Call</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#8B5CF618' }]}>
                  <MessageCircle size={18} color="#8B5CF6" />
                </View>
                <Text style={styles.statValue}>{insights?.total_whatsapps ?? 0}</Text>
                <Text style={styles.statLabel}>WhatsApp Inquiries</Text>
              </Card>
            </View>

            {/* Top Doubt Situations */}
            <SectionHeader
              title="Top 10 Situations Prompting Calls"
              actionLabel="Explainers"
            />

            {insights?.top_codes && insights.top_codes.length > 0 ? (
              insights.top_codes.map((item, idx) => (
                <Card key={item.code} style={styles.codeCard}>
                  <View style={styles.codeHeader}>
                    <View style={styles.codeBadgeRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{idx + 1}</Text>
                      </View>
                      <Text style={styles.codeName}>{item.code}</Text>
                    </View>
                    <Pill
                      label={`${item.call_rate_pct}% Call Rate`}
                      color={item.call_rate_pct > 25 ? '#DC2626' : '#F59E0B'}
                    />
                  </View>

                  <View style={styles.codeMetricsRow}>
                    <Text style={styles.metricText}>
                      Shown: <Text style={styles.metricVal}>{item.total}</Text>
                    </Text>
                    <Text style={styles.metricText}>
                      Details Opened: <Text style={styles.metricVal}>{item.opened_more}</Text>
                    </Text>
                    <Text style={styles.metricText}>
                      Calls: <Text style={styles.metricVal}>{item.tapped_call}</Text>
                    </Text>
                    <Text style={styles.metricText}>
                      Self-Fixed: <Text style={styles.metricVal}>{item.tapped_fix}</Text>
                    </Text>
                  </View>
                </Card>
              ))
            ) : (
              <Card style={styles.emptyCard}>
                <CheckCircle2 size={32} color="#10B981" />
                <Text style={styles.emptyTitle}>Zero High-Call Issues Detected</Text>
                <Text style={styles.emptyDesc}>
                  Drivers are resolving queries via self-service HelpSheets without needing to phone the desk.
                </Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pillGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#3B82F625',
    borderColor: '#3B82F6',
  },
  filterPillText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
    color: '#94A3B8',
  },
  filterPillTextActive: {
    color: '#60A5FA',
    fontFamily: 'Inter-Bold',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#94A3B8',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '48.5%',
    padding: 14,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#3B82F618',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#94A3B8',
    marginTop: 2,
  },
  codeCard: {
    padding: 14,
    marginBottom: 10,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  codeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#3B82F620',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    color: '#60A5FA',
  },
  codeName: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    color: '#F8FAFC',
  },
  codeMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#334155',
  },
  metricText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
  },
  metricVal: {
    fontFamily: 'Inter-SemiBold',
    color: '#F1F5F9',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    color: '#F8FAFC',
  },
  emptyDesc: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
});
