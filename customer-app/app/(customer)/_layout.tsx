import React, { useState, useMemo } from 'react';
import { Tabs, Redirect, useRouter, usePathname } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  Car,
  Zap,
  Users,
  History,
  Menu as MenuIcon,
  Search,
  PlusCircle,
  MessageSquare,
  User,
  Sparkles,
  Mic,
  Send,
  X,
} from 'lucide-react-native';
import { View, Text, TouchableOpacity, Modal, TextInput, ScrollView, Platform, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { getPalette } from '@/constants/theme';
import { useTaxiFlow } from '@/contexts/TaxiFlowContext';

export default function CustomerTabsLayout() {
  const systemColorScheme = useColorScheme();
  const { themeMode } = useThemePreference();
  const isDark = themeMode !== 'system' ? themeMode === 'dark' : systemColorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { activeMode } = useServiceMode();
  const { user } = useAuth();

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 14 : 6);

  const isTaxiMode = activeMode === 'TAXI';
  const isCarpoolMode = activeMode === 'CARPOOL';

  const activeColor = isCarpoolMode ? '#0EA5E9' : (isDark ? '#F59E0B' : '#D97706');

  // No saved sign-in (first launch, or after Logout): go to sign in. Nothing inside the app works without a real customer session.
  if (!user) return <Redirect href={'/auth' as any} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
          tabBarLabelStyle: {
            fontSize: 8.5,
            fontWeight: '700',
            paddingBottom: Platform.OS === 'ios' ? 0 : 2,
            marginTop: -3,
          },
          tabBarStyle: {
            backgroundColor: isDark ? '#070B12' : '#FFFFFF',
            borderTopColor: isDark ? (isCarpoolMode ? 'rgba(14, 165, 233, 0.3)' : '#152238') : '#E2E8F0',
            height: 50 + bottomInset,
            paddingTop: 4,
            paddingBottom: bottomInset,
            shadowColor: isDark ? '#000000' : '#0F172A',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: isDark ? 0.3 : 0.06,
            shadowRadius: 6,
            elevation: 8,
          },
        }}
      >
        {/* 1. TAXI HOME (VISIBLE ONLY IN TAXI MODE) */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Home color={color} size={16} />,
            href: isTaxiMode ? undefined : null,
          }}
        />

        {/* 2. BLABLACAR SEARCH TAB (PRIMARY TAB IN CARPOOL MODE) */}
        <Tabs.Screen
          name="carpool"
          options={{
            title: isCarpoolMode ? 'Search' : 'Drop Connect',
            tabBarIcon: ({ color }) => isCarpoolMode ? <Search color={color} size={16} /> : <Users color={color} size={16} />,
            href: isCarpoolMode ? undefined : null,
          }}
        />

        {/* 3. TAXI BOOKING FLOW (VISIBLE ONLY IN TAXI MODE) */}
        <Tabs.Screen
          name="book/standard"
          options={{
            title: 'Taxi',
            tabBarIcon: ({ color }) => <Car color={color} size={16} />,
            href: isTaxiMode ? undefined : null,
          }}
        />

        {/* 4. DROP NOW TAB (VISIBLE ONLY IN TAXI MODE) */}
        <Tabs.Screen
          name="book/dropbid"
          options={{
            title: 'Drop Bid',
            tabBarIcon: ({ color }) => <Zap color={color} size={16} />,
            href: isTaxiMode ? undefined : null,
          }}
        />

        {/* 5. BLABLACAR PUBLISH TAB (VISIBLE ONLY IN CARPOOL MODE) */}
        <Tabs.Screen
          name="book/index"
          options={{
            title: 'Publish',
            tabBarIcon: ({ color }) => <PlusCircle color={color} size={16} />,
            href: isCarpoolMode ? undefined : null,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              if (isCarpoolMode) {
                e.preventDefault();
                navigation.navigate('carpool', { initialTab: 'CREATE' });
              }
            },
          })}
        />

        {/* TARIFF (HIDDEN) */}
        <Tabs.Screen name="tariff" options={{ href: null }} />

        {/* 6. YOUR RIDES / MY RIDES (BLABLACAR STYLE IN CARPOOL MODE) */}
        <Tabs.Screen
          name="my-trips"
          options={{
            title: isCarpoolMode ? 'Your rides' : 'My Rides',
            tabBarIcon: ({ color }) => <History color={color} size={16} />,
          }}
        />

        {/* 7. INBOX TAB (VISIBLE ONLY IN CARPOOL MODE) */}
        <Tabs.Screen
          name="support"
          options={{
            title: 'Inbox',
            tabBarIcon: ({ color }) => <MessageSquare color={color} size={16} />,
            href: isCarpoolMode ? undefined : null,
          }}
        />

        {/* 8. PROFILE / MENU (BLABLACAR PROFILE IN CARPOOL MODE) */}
        <Tabs.Screen
          name="menu"
          options={{
            title: isCarpoolMode ? 'Profile' : 'Menu',
            tabBarIcon: ({ color }) => isCarpoolMode ? <User color={color} size={16} /> : <MenuIcon color={color} size={16} />,
          }}
        />

        {/* B2B PORTAL SCREENS, WALLET, GIFT CARDS, SAFETY & SUBSCRIPTION PAGES */}
        <Tabs.Screen name="wallet" options={{ href: null }} />
        <Tabs.Screen name="gift-cards" options={{ href: null }} />
        <Tabs.Screen name="safety" options={{ href: null }} />
        <Tabs.Screen name="subscription" options={{ href: null }} />
        <Tabs.Screen name="live-trip" options={{ href: null }} />
        <Tabs.Screen name="b2b/billing" options={{ href: null }} />
        <Tabs.Screen name="b2b/employees" options={{ href: null }} />
      </Tabs>

      {/* GLOBAL DROP CARS AI ASSISTANT FAB (AVAILABLE ON ALL PAGES) */}
      <GlobalDropCarsAI isDark={isDark} />
    </View>
  );
}

function GlobalDropCarsAI({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const palette = getPalette(isDark);
  const { updateStandardDraft } = useTaxiFlow();

  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '1',
      sender: 'ai',
      text: 'Hello! I am DropCars AI. I can assist you on this page, answer questions, or navigate anywhere across the app. What can I do for you?',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);

  const pageContextTitle = useMemo(() => {
    if (pathname.includes('dropbid')) return 'Drop Bid';
    if (pathname.includes('carpool')) return 'Drop Connect Carpool';
    if (pathname.includes('my-trips')) return 'My Rides & History';
    if (pathname.includes('billing')) return 'Corporate GST Billing';
    if (pathname.includes('menu')) return 'Account Menu & Settings';
    if (pathname.includes('standard')) return 'Standard Taxi Booking';
    return 'Drop Cars Dashboard';
  }, [pathname]);

  const handleSendMessage = (userMsg?: string) => {
    const textToSend = userMsg || inputText;
    if (!textToSend.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userBubble = { id: String(Date.now()), sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userBubble]);
    setInputText('');

    setTimeout(() => {
      let aiResponseText = 'Processing your request...';
      const query = textToSend.toLowerCase();

      if (query.includes('trip') || query.includes('history') || query.includes('rides')) {
        aiResponseText = 'Navigating to My Rides & Booking History...';
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/my-trips' as any);
        }, 1000);
      } else if (query.includes('bangalore') || query.includes('bengaluru')) {
        aiResponseText = 'Configuring Chennai ➔ Bangalore Outstation Cabs. Directing to booking...';
        updateStandardDraft({ pickup: 'Chennai', drop: 'Bangalore', tripType: 'ONEWAY' });
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/book/standard' as any);
        }, 1000);
      } else if (query.includes('dropbid') || query.includes('bid')) {
        aiResponseText = 'Opening DropBid Instant Driver Bidding...';
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/book/dropbid' as any);
        }, 1000);
      } else if (query.includes('carpool') || query.includes('connect')) {
        aiResponseText = 'Opening Drop Connect Community Carpools...';
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/carpool' as any);
        }, 1000);
      } else if (query.includes('billing') || query.includes('gst') || query.includes('invoice')) {
        aiResponseText = 'Opening Corporate GST Billing Ledger...';
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/b2b/billing' as any);
        }, 1000);
      } else if (query.includes('menu') || query.includes('setting') || query.includes('profile')) {
        aiResponseText = 'Opening Menu & Profile Settings...';
        setTimeout(() => {
          setVisible(false);
          router.push('/(customer)/menu' as any);
        }, 1000);
      } else {
        aiResponseText = `Currently on ${pageContextTitle}. Ask me to book a ride, find carpools, check tariffs, or navigate!`;
      }

      setMessages((prev) => [...prev, { id: String(Date.now() + 1), sender: 'ai', text: aiResponseText }]);
    }, 600);
  };

  const handleVoiceMicToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isListening) {
      setIsListening(true);
      setTimeout(() => {
        setIsListening(false);
        handleSendMessage('Show my past rides');
      }, 2200);
    } else {
      setIsListening(false);
    }
  };

  return (
    <>
      {/* FLOATING COMPACT CIRCULAR DROP CARS AI FAB (AVAILABLE ON EVERY PAGE) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setVisible(true);
        }}
        style={{
          position: 'absolute',
          bottom: 68,
          right: 18,
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: '#0EA5E9',
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 10,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          zIndex: 9999,
          borderWidth: 2,
          borderColor: '#FFFFFF',
        }}
      >
        <Sparkles color="#FFFFFF" size={22} />
      </TouchableOpacity>

      {/* GLOBAL DROP CARS AI ASSISTANT MODAL */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.82)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: palette.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 16,
            maxHeight: '85%',
            borderWidth: 1,
            borderColor: palette.border,
            gap: 12,
          }}>
            {/* MODAL HEADER */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: 'rgba(14,165,233,0.15)',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Sparkles color="#0EA5E9" size={18} />
                </View>
                <View>
                  <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: '900' }}>DropCars AI Assistant</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 10 }}>Page: {pageContextTitle}</Text>
                </View>
              </View>

              <TouchableOpacity onPress={() => setVisible(false)} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
                <X color={palette.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            {/* CHAT MESSAGES */}
            <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 10 }}>
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender === 'user' ? '#0EA5E9' : palette.cardBg,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 14,
                    maxWidth: '85%',
                    borderWidth: m.sender === 'ai' ? 1 : 0,
                    borderColor: palette.border,
                  }}
                >
                  <Text style={{ color: m.sender === 'user' ? '#FFFFFF' : palette.textPrimary, fontSize: 12.5, fontWeight: '600', lineHeight: 17 }}>
                    {m.text}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* QUICK SUGGESTIONS FOR THE APP */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {['My Rides History', 'Book Outstation Cab', 'DropBid Bids', 'Drop Connect', 'GST Invoices'].map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={{
                    backgroundColor: palette.cardBg, borderWidth: 1, borderColor: palette.border,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                  }}
                  onPress={() => handleSendMessage(chip)}
                >
                  <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: '700' }}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* INPUT BAR WITH VOICE & TEXT */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', backgroundColor: palette.cardBg,
              borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, gap: 8,
              borderWidth: 1, borderColor: isListening ? '#EF4444' : palette.border,
            }}>
              <TouchableOpacity
                onPress={handleVoiceMicToggle}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: isListening ? '#EF4444' : 'rgba(14,165,233,0.15)',
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Mic color={isListening ? '#FFFFFF' : '#0EA5E9'} size={18} />
              </TouchableOpacity>

              <TextInput
                style={{ flex: 1, color: palette.textPrimary, fontSize: 13, fontWeight: '600' }}
                value={inputText}
                onChangeText={setInputText}
                placeholder={isListening ? 'Listening... (Speak now)' : `Ask AI or navigate from ${pageContextTitle}...`}
                placeholderTextColor={isListening ? '#EF4444' : palette.placeholder}
                onSubmitEditing={() => handleSendMessage()}
              />

              <TouchableOpacity
                onPress={() => handleSendMessage()}
                style={{
                  backgroundColor: '#0EA5E9', width: 38, height: 38, borderRadius: 19,
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Send color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
