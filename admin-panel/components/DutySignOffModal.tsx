import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  AlertCircle,
  Star,
  Sparkles,
  TrendingUp,
  X,
  ThumbsUp,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  getDailyPerformance,
  calculateMoodScore,
  saveDutyAcknowledgment,
  formatDurationFriendly,
  renderStars,
  StaffDailyPerformance,
} from '@/utils/performance';

interface DutySignOffModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmOffline?: (acknowledgmentType: 'acknowledged' | 'will_improve') => void;
  staffId?: string;
  isViewOnly?: boolean;
}

export default function DutySignOffModal({
  visible,
  onClose,
  onConfirmOffline,
  staffId = 'Admin',
  isViewOnly = false,
}: DutySignOffModalProps) {
  const { themeColors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [perfData, setPerfData] = useState<StaffDailyPerformance | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPerformance();
    }
  }, [visible, staffId]);

  const loadPerformance = async () => {
    try {
      setLoading(true);
      const data = await getDailyPerformance(staffId);
      setPerfData(data);
    } catch {
      setPerfData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (choice: 'acknowledged' | 'will_improve') => {
    try {
      setSubmitting(true);
      await saveDutyAcknowledgment(staffId, choice);
      if (onConfirmOffline) {
        onConfirmOffline(choice);
      }
      onClose();
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  const scoreInfo = perfData ? calculateMoodScore(perfData) : null;
  const avgStarsRounded = scoreInfo ? Math.round(scoreInfo.avgStars) : 3;
  const avgResponseTimeStr = scoreInfo && scoreInfo.avgResponseSeconds > 0
    ? formatDurationFriendly(scoreInfo.avgResponseSeconds)
    : '0 min';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.headerBanner, { backgroundColor: themeColors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: themeColors.onPrimary }]}>
                {isViewOnly ? 'Today’s Performance' : 'Shift Sign-Off Summary'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: themeColors.onPrimary, opacity: 0.85 }]}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {staffId}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={20} color={themeColors.onPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Calculating today’s performance...
              </Text>
            </View>
          ) : !perfData || !scoreInfo ? (
            <View style={styles.fallbackBox}>
              <Text style={{ fontSize: 36 }}>👋</Text>
              <Text style={[styles.fallbackTitle, { color: themeColors.text }]}>Take care! See you tomorrow</Text>
              <Text style={[styles.fallbackSub, { color: themeColors.textSecondary }]}>
                Shift record noted for today. Have a restful evening!
              </Text>
              <TouchableOpacity style={[styles.btnFull, { backgroundColor: themeColors.primary }]} onPress={onClose}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {/* Mood & Headline Score Box */}
              <View
                style={[
                  styles.moodBox,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Text style={styles.moodEmoji}>{scoreInfo.mood}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.moodLabel, { color: themeColors.text }]}>
                    {scoreInfo.moodLabel}
                  </Text>
                  <Text style={[styles.moodScoreText, { color: themeColors.textSecondary }]}>
                    Overall day rating: <Text style={{ fontWeight: '800', color: themeColors.primary }}>{scoreInfo.score.toFixed(1)} / 5.0</Text>
                  </Text>
                </View>
              </View>

              {/* Headline Stat Lines */}
              <View
                style={[
                  styles.statsContainer,
                  {
                    backgroundColor: themeColors.surface,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                {/* 1. On time response */}
                <View style={styles.statRow}>
                  <View style={[styles.statIconBox, { backgroundColor: '#10B98115' }]}>
                    <CheckCircle2 size={16} color="#10B981" />
                  </View>
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>Enquiries answered on time:</Text>
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    {perfData.enquiriesAnsweredOnTime}
                  </Text>
                </View>

                {/* 2. Average response & stars */}
                <View style={styles.statRow}>
                  <View style={[styles.statIconBox, { backgroundColor: '#F59E0B15' }]}>
                    <Star size={16} color="#F59E0B" />
                  </View>
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>Average response:</Text>
                  <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                    {renderStars(avgStarsRounded)} ({avgStarsRounded}★) · {avgResponseTimeStr}
                  </Text>
                </View>

                {/* 3. Missed leads */}
                <View style={styles.statRow}>
                  <View style={[styles.statIconBox, { backgroundColor: '#EF444415' }]}>
                    <AlertCircle size={16} color="#EF4444" />
                  </View>
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>Missed:</Text>
                  <Text style={[styles.statValue, { color: perfData.missedCount > 0 ? '#EF4444' : themeColors.textSecondary }]}>
                    {perfData.missedCount}
                  </Text>
                </View>

                {/* 4. Comments pending */}
                <View style={styles.statRow}>
                  <View style={[styles.statIconBox, { backgroundColor: '#3B82F615' }]}>
                    <MessageSquare size={16} color="#3B82F6" />
                  </View>
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>Comments pending:</Text>
                  <Text style={[styles.statValue, { color: perfData.commentsPendingCount > 0 ? '#F59E0B' : '#10B981' }]}>
                    {perfData.commentsPendingCount}
                  </Text>
                </View>

                {/* 5. Customer feedback tasks */}
                <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.statIconBox, { backgroundColor: '#8B5CF615' }]}>
                    <ThumbsUp size={16} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.statLabel, { color: themeColors.text }]}>Customer feedback:</Text>
                  <Text style={[styles.statValue, { color: themeColors.text }]}>
                    {perfData.feedbackTasksDone} done, {perfData.feedbackTasksPending} pending
                  </Text>
                </View>
              </View>

              {/* Warm, Motivational Suggestions */}
              {scoreInfo.suggestions.length > 0 && (
                <View
                  style={[
                    styles.suggestionsBox,
                    {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : '#EEF2FF',
                      borderColor: isDark ? '#4338CA' : '#C7D2FE',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Sparkles size={15} color={themeColors.primary} />
                    <Text style={[styles.suggestionsTitle, { color: themeColors.primary }]}>Coach's Daily Note</Text>
                  </View>
                  {scoreInfo.suggestions.map((suggestion, idx) => (
                    <Text key={idx} style={[styles.suggestionText, { color: themeColors.text }]}>
                      • {suggestion}
                    </Text>
                  ))}
                </View>
              )}

              {/* Action Buttons */}
              {!isViewOnly ? (
                <View style={styles.actionRow}>
                  {/* Left Button: I Acknowledge */}
                  <TouchableOpacity
                    style={[styles.improveBtn, { borderColor: themeColors.border, backgroundColor: isDark ? '#334155' : '#FFFFFF' }]}
                    onPress={() => handleAction('acknowledged')}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={themeColors.text} />
                    ) : (
                      <>
                        <CheckCircle2 size={16} color={themeColors.textSecondary} />
                        <Text style={[styles.improveBtnText, { color: themeColors.text, fontWeight: '700' }]}>I Acknowledge</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Right Button: I Will Improve (Dark Green) */}
                  <TouchableOpacity
                    style={[styles.ackBtn, { backgroundColor: '#047857' }]}
                    onPress={() => handleAction('will_improve')}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Sparkles size={16} color="#FFFFFF" />
                        <Text style={[styles.ackBtnText, { color: '#FFFFFF', fontWeight: '800' }]}>I Will Improve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btnFull, { backgroundColor: themeColors.primary, marginTop: 14 }]}
                  onPress={onClose}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Close</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackBox: {
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
    gap: 10,
  },
  fallbackTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  fallbackSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  moodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  moodEmoji: {
    fontSize: 40,
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  moodScoreText: {
    fontSize: 13,
    marginTop: 2,
  },
  statsContainer: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    gap: 10,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionsBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  suggestionsTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  suggestionText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  improveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  improveBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  ackBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ackBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  btnFull: {
    height: 42,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
