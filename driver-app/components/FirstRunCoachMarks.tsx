import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Car, Wallet, HelpCircle, X, ChevronRight, Check } from 'lucide-react-native';

const STORAGE_KEY = '@has_seen_home_coach_marks_v1';

export function FirstRunCoachMarks() {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (!val) {
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const steps = [
    {
      icon: Car,
      color: '#6366F1',
      title: t('coach.bookingsTitle') || 'Live Booking Radar',
      desc:
        t('coach.bookingsDesc') ||
        'New customer trip requests appear here in real-time. Tap Accept quickly to get the ride.',
    },
    {
      icon: Wallet,
      color: '#10B981',
      title: t('coach.walletTitle') || 'Your Driver Wallet',
      desc:
        t('coach.walletDesc') ||
        'Track all trip earnings, commission debits, and request instant payouts to your bank or UPI.',
    },
    {
      icon: HelpCircle,
      color: '#F59E0B',
      title: t('coach.helpTitle') || 'Instant Help & Answers',
      desc:
        t('coach.helpDesc') ||
        'Facing document rejections, OTP issues, or payment doubts? Tap the (i) button on any card for instant guidance.',
    },
  ];


  const handleDismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: current.color + '18' }]}>
          <Icon size={20} color={current.color} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.badgeRow}>
            <Text style={[styles.stepBadge, { color: current.color }]}>
              TIP {step + 1} OF {steps.length}
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeBtn}
          accessibilityLabel="Dismiss tips"
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.desc, { color: colors.textSecondary }]}>{current.desc}</Text>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? current.color : colors.border,
                  width: i === step ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleDismiss} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.nextBtn, { backgroundColor: current.color }]}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>
              {step === steps.length - 1 ? 'Got it' : 'Next'}
            </Text>
            {step === steps.length - 1 ? (
              <Check size={14} color="#FFFFFF" />
            ) : (
              <ChevronRight size={14} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  badgeRow: {
    marginBottom: 2,
  },
  stepBadge: {
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  closeBtn: {
    padding: 4,
  },
  desc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
  },
});
