import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleCheck as CheckCircle, Phone, User, FileCheck, BellRing, Rocket, ArrowRight } from 'lucide-react-native';
import { useVendorAuth } from '../../hooks/useVendorAuth';

// Shown once, right after a vendor creates an account. The account is already signed in; this page only tells them what happens next
// (instead of the old page that listed a "password" box that was really the account status).
export default function SignupSuccessScreen() {
  const { getStoredVendorData } = useVendorAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const pop = useRef(new Animated.Value(0.6)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const v = await getStoredVendorData();
      if (v) { setName(v.full_name); setPhone(v.primary_number); }
      else router.replace('/(auth)/sign-in');
    })();
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const steps = [
    { icon: FileCheck, title: 'We check your details', text: 'Our team verifies your Aadhaar and mobile number.' },
    { icon: BellRing, title: 'We tell you', text: 'You get a notification, usually within 24 hours.' },
    { icon: Rocket, title: 'You start', text: 'Then you can post bookings and earn commission on every trip.' },
  ];

  return (
    <LinearGradient colors={['#1D4ED8', '#312E81']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.check, { transform: [{ scale: pop }] }]}>
          <CheckCircle size={64} color="#FFFFFF" />
        </Animated.View>
        <Animated.View style={{ opacity: fade, alignItems: 'center', width: '100%' }}>
          <Text style={styles.title}>Account created</Text>
          <Text style={styles.subtitle}>Thank you for joining Drop Cars as a vendor partner.</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <User size={18} color="#C7D2FE" />
              <Text style={styles.rowText} numberOfLines={1}>{name || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Phone size={18} color="#C7D2FE" />
              <Text style={styles.rowText}>{phone || '-'}</Text>
            </View>
            <Text style={styles.hint}>Use this mobile number and the password you just set to sign in.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>What happens next</Text>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.stepRow, i === steps.length - 1 && { marginBottom: 0 }]}>
                <View style={styles.stepIcon}><s.icon size={18} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepText}>{s.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.cta} onPress={() => router.replace('/(auth)/account-status?status=Pending')} activeOpacity={0.85}>
            <Text style={styles.ctaText}>Continue</Text>
            <ArrowRight size={18} color="#1E3A8A" />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 80, paddingBottom: 40 },
  check: { width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#E0E7FF', fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: 22, maxWidth: 360 },
  card: { width: '100%', maxWidth: 460, backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: 18, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  rowText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flex: 1 },
  hint: { color: '#C7D2FE', fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stepText: { color: '#D1D5DB', fontSize: 13, lineHeight: 18, marginTop: 2 },
  cta: { width: '100%', maxWidth: 460, minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#1E3A8A', fontSize: 16, fontWeight: '800' },
});
