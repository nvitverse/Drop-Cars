import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import TermsModal from '@/components/TermsModal';
import { useAppContent, markWelcomeSeen, HAS_SEEN_WELCOME_KEY as SEEN_KEY, OnboardingContent, TermsContent } from '@/services/appContent';
import {
  Car, 
  MapPin, 
  ArrowRight, 
  CheckCircle,
  Clock,
  TrendingUp,
  X,
  Users,
  Shield,
  ShieldCheck,
  FileText,
  IndianRupee,
  AlertTriangle,
  Phone,
  Star,
  Lock,
  Route,
  Heart,
  Navigation,
  Wallet,
  Bell,
  Camera,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// Persisted flag so the full onboarding slideshow is only ever shown once,
// on the driver's very first login. Exported so login.tsx and
// verification.tsx can check it before deciding to show this screen.
export const HAS_SEEN_WELCOME_KEY = SEEN_KEY;

interface WelcomeScreenProps {
  onComplete: () => void;
}

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { user } = useAuth();
  const { t, translations, language } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Admin-editable content (Admin App > App Content); the built-in locale text is the fallback
  const remote = useAppContent<OnboardingContent>('driver_onboarding', language);
  const remoteTerms = useAppContent<TermsContent>('driver_terms', language);
  const termsAndConditions = remoteTerms?.body || t('terms.body');

  // Animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(40)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.92)).current;

  // Re-trigger animation smooth transitions on step change
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    scaleAnim.setValue(0.95);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep]);

  useEffect(() => {
    AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true').catch(() => {});
  }, []);

  const ICONS: Record<string, any> = {
    'check-circle': CheckCircle, 'file-text': FileText, 'map-pin': MapPin, clock: Clock, 'indian-rupee': IndianRupee, shield: Shield,
    'shield-check': ShieldCheck, users: Users, 'alert-triangle': AlertTriangle, car: Car, phone: Phone, star: Star, lock: Lock,
    route: Route, heart: Heart, navigation: Navigation, wallet: Wallet, bell: Bell, camera: Camera,
  };

  const COLOR_SETS: Record<string, { gradient: [string, string, ...string[]]; accent: string }> = {
    emerald: { gradient: ['#047857', '#10B981', '#34D399'], accent: '#059669' },
    blue: { gradient: ['#1D4ED8', '#3B82F6', '#60A5FA'], accent: '#1D4ED8' },
    purple: { gradient: ['#6D28D9', '#8B5CF6', '#C4B5FD'], accent: '#6D28D9' },
    red: { gradient: ['#B91C1C', '#EF4444', '#FCA5A5'], accent: '#B91C1C' },
    indigo: { gradient: ['#4338CA', '#6366F1', '#A5B4FC'], accent: '#4338CA' },
    amber: { gradient: ['#B45309', '#F59E0B', '#FCD34D'], accent: '#B45309' },
    teal: { gradient: ['#0F766E', '#14B8A6', '#5EEAD4'], accent: '#0F766E' },
    rose: { gradient: ['#BE123C', '#F43F5E', '#FDA4AF'], accent: '#BE123C' },
  };

  // Fallback (offline, first ever launch): the five built-in cards from the locale files
  const fallbackSteps = [
    { icon: 'check-circle', color: 'emerald' }, { icon: 'car', color: 'blue' }, { icon: 'map-pin', color: 'purple' },
    { icon: 'shield', color: 'red' }, { icon: 'shield', color: 'indigo' },
  ];
  const localizedSteps: { title: string; subtitle: string; description: string }[] =
    (translations?.welcome?.steps as any) || [];

  const sourceSteps: { icon: string; color: string; title: string; subtitle: string; description: string }[] =
    remote && remote.steps && remote.steps.length
      ? remote.steps
      : fallbackSteps.map((f, i) => ({ ...f, title: localizedSteps[i]?.title || '', subtitle: localizedSteps[i]?.subtitle || '', description: localizedSteps[i]?.description || '' }));

  const welcomeSteps = sourceSteps.map((st) => {
    const Icon = ICONS[st.icon] || Shield;
    const set = COLOR_SETS[st.color] || COLOR_SETS.indigo;
    return {
      icon: <Icon size={56} color="#FFFFFF" />,
      title: st.title,
      subtitle: st.subtitle,
      description: st.description,
      gradientColors: set.gradient,
      accentColor: set.accent,
    };
  });

  useEffect(() => {
    if (currentStep > welcomeSteps.length - 1) setCurrentStep(Math.max(0, welcomeSteps.length - 1));
  }, [welcomeSteps.length]);

  const nextStep = () => {
    if (currentStep < welcomeSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      if (termsAccepted) {
        markWelcomeSeen(remote?.version);
        onComplete();
      } else {
        setShowTermsModal(true);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSwipeGesture = (event: any) => {
    const { translationX, state } = event.nativeEvent;
    
    if (state === State.END) {
      if (translationX > 50 && currentStep > 0) {
        prevStep();
      } else if (translationX < -50 && currentStep < welcomeSteps.length - 1) {
        nextStep();
      }
    }
  };

  const currentStepData = welcomeSteps[currentStep];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={currentStepData.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header: Step Badge & Progress Dots */}
        <View style={styles.headerBar}>
          <View style={styles.stepCounterPill}>
            <Text style={styles.stepCounterText}>
              Step {currentStep + 1} of {welcomeSteps.length}
            </Text>
          </View>
          <View style={styles.dotsRow}>
            {welcomeSteps.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setCurrentStep(i)}
                activeOpacity={0.7}
                style={[
                  styles.dot,
                  i === currentStep ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.flexContainer}>
        <PanGestureHandler onHandlerStateChange={onSwipeGesture}>
          <View style={styles.scrollHost}>
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              showsVerticalScrollIndicator={false}
            >
              {/* Glassmorphic Floating Card */}
              <Animated.View
                style={[
                  styles.glassCard,
                  {
                    opacity: fadeAnim,
                    transform: [
                      { translateY: slideAnim },
                      { scale: scaleAnim },
                    ],
                  },
                ]}
              >
                {/* Glowing double-ring icon badge */}
                <View style={styles.iconCircleOuter}>
                  <View style={styles.iconCircleInner}>
                    {currentStepData.icon}
                  </View>
                </View>

                {/* Card Header & Content */}
                <Text style={styles.cardTitle}>{currentStepData.title}</Text>
                {!!currentStepData.subtitle && (
                  <Text style={styles.cardSubtitle}>{currentStepData.subtitle}</Text>
                )}

                <View style={styles.dividerLine} />

                <Text style={styles.cardDescription}>{currentStepData.description}</Text>
              </Animated.View>
            </ScrollView>
          </View>
        </PanGestureHandler>

            {/* Footer Navigation - fixed below the card, never overlapped */}
            <View style={styles.footer}>
              {currentStep === welcomeSteps.length - 1 && (
                <View style={styles.termsSection}>
                  <TouchableOpacity 
                    style={styles.termsCheckbox}
                    onPress={() => setTermsAccepted(!termsAccepted)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.checkbox,
                      termsAccepted && styles.checkboxChecked
                    ]}>
                      {termsAccepted && <CheckCircle size={16} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.termsText}>
                      {t('welcome.agreePrefix')}{' '}
                      <Text
                        style={styles.termsLink}
                        onPress={() => setShowTermsModal(true)}
                      >
                        {t('welcome.termsLink')}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.navigationButtons}>
                {currentStep > 0 ? (
                  <TouchableOpacity
                    style={styles.prevButton}
                    onPress={prevStep}
                    activeOpacity={0.8}
                  >
                    <ArrowRight size={20} color="#FFFFFF" style={{ transform: [{ rotate: '180deg' }] }} />
                    <Text style={styles.prevButtonText}>{t('welcome.previous')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.prevButton, styles.prevButtonSpacer]} pointerEvents="none" />
                )}

                <TouchableOpacity 
                  style={[
                    styles.nextButton,
                    currentStep === welcomeSteps.length - 1 && !termsAccepted && styles.nextButtonDisabled
                  ]} 
                  onPress={nextStep}
                  activeOpacity={0.85}
                  disabled={currentStep === welcomeSteps.length - 1 && !termsAccepted}
                >
                  <Text style={[styles.nextButtonText, { color: currentStepData.accentColor }]}>
                    {currentStep === welcomeSteps.length - 1 ? t('welcome.getStarted') : t('welcome.next')}
                  </Text>
                  <ArrowRight size={20} color={currentStepData.accentColor} />
                </TouchableOpacity>
              </View>
            </View>
        </View>

        {/* Terms and Conditions Modal */}
        <TermsModal
          visible={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          onAccept={() => setTermsAccepted(true)}
          title={remoteTerms?.title || t('welcome.modalTitle')}
          body={termsAndConditions}
          summary={remoteTerms?.summary}
          fullUrl={remoteTerms?.full_url}
          agreeButtonText={t('welcome.agreePrefix') + ' ' + t('welcome.termsLink')}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  stepCounterPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  stepCounterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    width: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  flexContainer: {
    flex: 1,
    minHeight: 0,
  },
  scrollHost: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
  },
  iconCircleOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  iconCircleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 34,
  },
  cardSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  dividerLine: {
    width: 50,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    marginBottom: 18,
  },
  cardDescription: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 23,
    opacity: 0.95,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    flexShrink: 0,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  prevButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    flex: 0.4,
  },
  prevButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 6,
  },
  prevButtonSpacer: {
    opacity: 0,
  },
  nextButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.55,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  nextButtonText: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    marginRight: 6,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  termsSection: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  termsCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  termsText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: height * 0.8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  termsModalText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
});
