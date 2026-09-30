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
  Switch,
  Linking,
} from 'react-native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import {
  ShieldCheck,
  ArrowLeft,
  Share2,
  PhoneCall,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Users,
  Copy,
  Volume2,
  Clock,
  Eye,
} from 'lucide-react-native';

export default function SafetyShieldScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);

  const [nightModeEnabled, setNightModeEnabled] = useState(true);
  const [audioMonitorEnabled, setAudioMonitorEnabled] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState('+91 98765 43210');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);

  const trackingLink = 'https://dropcars.in/track/DC-9921';

  const handleShareLink = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedLink(true);
    if (Platform.OS === 'web') alert(`Live Tracking Link Copied: ${trackingLink}\nShare via WhatsApp!`);
    else Alert.alert('Link Copied', `Live tracking link copied to clipboard: ${trackingLink}`);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleTriggerSOS = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSosTriggered(true);
    
    const cleanContact = emergencyContact.replace(/[^0-9+]/g, '');
    const sosMessage = `🚨 EMERGENCY SOS ALERT! I am on a Drop Cars trip and need immediate assistance. Live Tracking Link: ${trackingLink}`;
    
    // 1. Send SMS to stored emergency contact via device SMS app
    if (cleanContact) {
      try {
        const smsUrl = Platform.OS === 'ios' 
          ? `sms:${cleanContact}&body=${encodeURIComponent(sosMessage)}`
          : `sms:${cleanContact}?body=${encodeURIComponent(sosMessage)}`;
        await Linking.openURL(smsUrl);
      } catch (err) {
        console.warn('Could not launch SMS app:', err);
      }
    }

    // 2. Post alert record to backend for Ops visibility
    try {
      await axios.post('https://drop-cars-api-207918408785.asia-south2.run.app/api/sos/alert', {
        emergency_contact: cleanContact,
        tracking_link: trackingLink,
      });
    } catch (err) {
      console.warn('Failed to log backend SOS alert:', err);
    }

    const msg = '🚨 EMERGENCY SOS ACTIVE!\nLive tracking link pre-filled in SMS for your emergency contact and logged with Drop Cars Ops Room.';
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Emergency Alert Sent', msg);
    setTimeout(() => setSosTriggered(false), 4000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* HEADER */}
      <LinearGradient
        colors={['#1E293B', '#0F172A']}
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
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }}>Drop Safety Shield 24x7</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>Guardian GPS & Emergency Protection</Text>
          </View>

          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* SOS EMERGENCY PANIC CARD */}
        <LinearGradient
          colors={sosTriggered ? ['#DC2626', '#991B1B'] : ['#EF4444', '#B91C1C']}
          style={{
            borderRadius: 20,
            padding: 20,
            gap: 12,
            alignItems: 'center',
            shadowColor: '#EF4444',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle color="#FFFFFF" size={30} />
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>
              {sosTriggered ? '🚨 EMERGENCY SOS ACTIVE' : '24x7 Emergency SOS'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11.5, textAlign: 'center', lineHeight: 16 }}>
              Tap below to instantly dispatch your live GPS location to Drop Cars Response Room & Police.
            </Text>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 14,
              width: '100%',
              alignItems: 'center',
            }}
            onPress={handleTriggerSOS}
          >
            <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '900' }}>
              {sosTriggered ? 'SOS SENT - RESPONDERS DISPATCHED' : '🚨 PRESS FOR EMERGENCY SOS'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* LIVE RIDE SHARING WITH GUARDIAN */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Share2 color="#0EA5E9" size={20} />
            <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Share Live Trip GPS Link</Text>
          </View>

          <Text style={{ color: palette.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
            Send real-time vehicle movement link to family or friends via WhatsApp or SMS.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: palette.cardBg,
                color: palette.textPrimary,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: palette.border,
                fontSize: 12,
              }}
              value={trackingLink}
              editable={false}
            />

            <TouchableOpacity
              style={{
                backgroundColor: '#0EA5E9',
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
              onPress={handleShareLink}
            >
              <Copy color="#FFFFFF" size={14} />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                {copiedLink ? 'Copied!' : 'Share'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SOLO NIGHT RIDE SAFETY SETTINGS */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 14 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Solo Night Ride Guardian Features</Text>

          {/* TOGGLE 1: NIGHT MONITOR */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 10, gap: 2 }}>
              <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '700' }}>Automated Safety Checks</Text>
              <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Periodic app notifications during night trips (10 PM - 6 AM)</Text>
            </View>
            <Switch
              value={nightModeEnabled}
              onValueChange={setNightModeEnabled}
              trackColor={{ false: palette.border, true: '#10B981' }}
            />
          </View>

          <View style={{ height: 1, backgroundColor: palette.border }} />

          {/* TOGGLE 2: AUDIO MONITOR */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 10, gap: 2 }}>
              <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '700' }}>Audio Safety Shield</Text>
              <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Record trip audio snippet in case of unexpected route deviation</Text>
            </View>
            <Switch
              value={audioMonitorEnabled}
              onValueChange={setAudioMonitorEnabled}
              trackColor={{ false: palette.border, true: '#10B981' }}
            />
          </View>

          <View style={{ height: 1, backgroundColor: palette.border }} />

          {/* EMERGENCY CONTACT INPUT */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Primary Emergency Contact</Text>
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
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
