import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import {
  Gift,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Send,
  Heart,
  Award,
  Building2,
  PartyPopper,
  ShieldCheck,
  Tag,
  Copy,
} from 'lucide-react-native';

export default function GiftCardsScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);

  const [redeemCode, setRedeemCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleRedeem = () => {
    if (!redeemCode.trim()) {
      if (Platform.OS === 'web') alert('Please enter a Gift Card Code');
      else Alert.alert('Error', 'Please enter a Gift Card Code');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRedeemSuccess(true);
    setRedeemCode('');
    setTimeout(() => {
      setRedeemSuccess(false);
    }, 2000);
  };

  const handleSendGiftCard = () => {
    if (!recipientName || !recipientPhone) {
      if (Platform.OS === 'web') alert('Please enter Recipient Name and Phone Number');
      else Alert.alert('Error', 'Please enter Recipient Name and Phone Number');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendSuccess(true);
    setTimeout(() => {
      setSendSuccess(false);
      setRecipientName('');
      setRecipientPhone('');
      const msg = `₹${selectedAmount} Drop Cars Gift Card sent successfully to ${recipientName}!`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Gift Card Sent', msg);
    }, 1500);
  };

  const giftOccasions = [
    { id: '1', title: 'Festive Pongal & Diwali', color: ['#F59E0B', '#D97706'], icon: PartyPopper, sub: 'Celebrate with smooth road trips' },
    { id: '2', title: 'Birthday Surprise', color: ['#EC4899', '#DB2777'], icon: Heart, sub: 'Gift a getaway drive experience' },
    { id: '3', title: 'Wedding & Anniversary', color: ['#8B5CF6', '#7C3AED'], icon: Sparkles, sub: 'Luxury cabs for happy couples' },
    { id: '4', title: 'Corporate Recognition', color: ['#0EA5E9', '#0284C7'], icon: Building2, sub: 'Reward top team performers' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* HEADER */}
      <LinearGradient
        colors={palette.headerGradient}
        style={{ paddingTop: topPadding + 4, paddingBottom: 14, paddingHorizontal: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.back()}
          >
            <ArrowLeft color="#FFFFFF" size={20} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }}>Drop Gift Cards</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>Easy to Love, Easier to Gift</Text>
          </View>

          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* HERO BANNER */}
        <LinearGradient
          colors={['#D97706', '#B45309']}
          style={{
            borderRadius: 20,
            padding: 20,
            gap: 8,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Gift color="#FFFFFF" size={24} />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>Gift an Unforgettable Drive</Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 18 }}>
            Send instant Drop Cars travel vouchers for outstation intercity trips, airport cabs, or hourly packages!
          </Text>
        </LinearGradient>

        {/* REDEEM GIFT CARD CODE */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Have a Gift Card Code?</Text>
          
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: palette.cardBg,
                color: palette.textPrimary,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: palette.border,
                fontSize: 13,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
              placeholder="Enter Code (e.g. DROP-GIFT-500)"
              placeholderTextColor={palette.placeholder}
              value={redeemCode}
              onChangeText={setRedeemCode}
            />

            <TouchableOpacity
              style={{
                backgroundColor: palette.accent,
                paddingHorizontal: 18,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={handleRedeem}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' }}>Redeem</Text>
            </TouchableOpacity>
          </View>

          {redeemSuccess && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.15)', padding: 8, borderRadius: 10 }}>
              <CheckCircle2 color="#10B981" size={16} />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>₹500 Gift Voucher added to your Drop Wallet!</Text>
            </View>
          )}
        </View>

        {/* GIFT CARDS BY OCCASIONS */}
        <View style={{ gap: 10 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Gift Cards by Occasion</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {giftOccasions.map((occ) => {
              const IconComp = occ.icon;
              return (
                <View
                  key={occ.id}
                  style={{
                    width: '48%',
                    backgroundColor: palette.surface,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: palette.border,
                    gap: 8,
                  }}
                >
                  <LinearGradient
                    colors={occ.color as any}
                    style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <IconComp color="#FFFFFF" size={18} />
                  </LinearGradient>
                  <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '800' }}>{occ.title}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 10, lineHeight: 14 }}>{occ.sub}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* SEND GIFT CARD FORM */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Send a Gift Card to Loved Ones</Text>

          {/* AMOUNT SELECTOR */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Select Card Value</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[500, 1000, 2500, 5000].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={{
                    flex: 1,
                    backgroundColor: selectedAmount === amt ? palette.accent : palette.cardBg,
                    borderWidth: 1,
                    borderColor: selectedAmount === amt ? palette.accent : palette.border,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setSelectedAmount(amt)}
                >
                  <Text style={{ color: selectedAmount === amt ? '#FFFFFF' : palette.textPrimary, fontSize: 12.5, fontWeight: '900' }}>
                    ₹{amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* RECIPIENT FIELDS */}
          <View style={{ gap: 8 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Recipient Name</Text>
              <TextInput
                style={{
                  backgroundColor: palette.cardBg,
                  color: palette.textPrimary,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: palette.border,
                  fontSize: 13,
                }}
                placeholder="e.g. Priya Sharma"
                placeholderTextColor={palette.placeholder}
                value={recipientName}
                onChangeText={setRecipientName}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Recipient Mobile Number</Text>
              <TextInput
                style={{
                  backgroundColor: palette.cardBg,
                  color: palette.textPrimary,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: palette.border,
                  fontSize: 13,
                }}
                placeholder="+91 98765 43210"
                placeholderTextColor={palette.placeholder}
                keyboardType="phone-pad"
                value={recipientPhone}
                onChangeText={setRecipientPhone}
              />
            </View>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: '#0EA5E9',
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              marginTop: 4,
            }}
            onPress={handleSendGiftCard}
          >
            <Send color="#FFFFFF" size={16} />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>
              {sendSuccess ? 'Processing Gift Card...' : `Purchase & Send ₹${selectedAmount} Gift Card ➔`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
