import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { ShieldCheck, Calculator } from 'lucide-react-native';
import { ScreenShell, useScreenTheme } from '@/components/SafeArea';
import { TARIFF, MIN_BILLED_KM, StandardVehicleCategory } from '@/constants/bookingConfig';

// Sourced from the official Standard Booking tariff in constants/bookingConfig.ts
// (Usual Plan) so this screen never shows numbers that disagree with the
// actual booking flow.
const TARIFFS: {
  id: StandardVehicleCategory;
  type: string;
  models: string;
  seats: string;
  luggage: string;
  tag: string;
}[] = [
  { id: 'SEDAN', type: 'Sedan (Dzire / Etios)', models: 'Swift Dzire, Toyota Etios', seats: '4+1 Seats', luggage: '3 Bags', tag: 'Most Popular' },
  { id: 'SUV', type: 'SUV (Ertiga / Carens)', models: 'Maruti Ertiga, Kia Carens', seats: '6+1 Seats', luggage: '5 Bags', tag: 'Family Travel' },
  { id: 'INNOVA', type: 'Toyota Innova Classic', models: 'Toyota Innova Classic', seats: '7+1 Seats', luggage: '6 Bags', tag: 'Outstation King' },
  { id: 'CRYSTA', type: 'Innova Crysta Premium', models: 'Innova Crysta Premium', seats: '7+1 Seats', luggage: '6 Bags', tag: 'Premium Choice' },
];

export default function TariffScreen() {
  const { isDark } = useScreenTheme();

  const [selectedTab, setSelectedTab] = useState<'ONEWAY' | 'ROUNDTRIP'>('ONEWAY');
  const [calcKm, setCalcKm] = useState('350');

  const themeStyles = getStyles(isDark);

  return (
    <ScreenShell title="Tariff & Rate Card" subtitle="Transparent Pricing • 100% Guaranteed Lowest Fares">
        {/* INTERACTIVE RATE CALCULATOR BAR */}
        <View style={themeStyles.calcCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calculator color="#0EA5E9" size={20} />
            <Text style={themeStyles.calcTitle}>Quick Rate Estimator</Text>
          </View>

          <View style={themeStyles.tabContainer}>
            <TouchableOpacity
              style={[themeStyles.tabChip, selectedTab === 'ONEWAY' && themeStyles.activeTabChip]}
              onPress={() => setSelectedTab('ONEWAY')}
            >
              <Text style={[themeStyles.tabText, selectedTab === 'ONEWAY' && themeStyles.activeTabText]}>One-Way Drop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[themeStyles.tabChip, selectedTab === 'ROUNDTRIP' && themeStyles.activeTabChip]}
              onPress={() => setSelectedTab('ROUNDTRIP')}
            >
              <Text style={[themeStyles.tabText, selectedTab === 'ROUNDTRIP' && themeStyles.activeTabText]}>Round Trip</Text>
            </TouchableOpacity>
          </View>

          <View style={themeStyles.kmInputRow}>
            <Text style={themeStyles.kmLabel}>Estimated Distance (KM):</Text>
            <View style={themeStyles.kmInputBox}>
              <TextInput
                style={themeStyles.kmTextInput}
                value={calcKm}
                onChangeText={setCalcKm}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={themeStyles.kmUnit}>KM</Text>
            </View>
          </View>
        </View>

        {/* TARIFF LIST */}
        <Text style={themeStyles.sectionHeader}>Intercity Vehicle Tariff List</Text>
        {TARIFFS.map((t) => {
          const isRound = selectedTab === 'ROUNDTRIP';
          const rate = isRound ? TARIFF.ROUNDTRIP_USUAL[t.id] : TARIFF.ONEWAY[t.id];
          const currentRate = rate.perKm;
          const currentBata = rate.driverBeta;
          const minKm = isRound ? MIN_BILLED_KM.ROUNDTRIP : MIN_BILLED_KM.ONEWAY;
          const inputKm = parseInt(calcKm) || 130;
          const billedKm = Math.max(inputKm, minKm);
          const totalFare = (billedKm * currentRate) + currentBata;

          return (
            <View key={t.id} style={themeStyles.card}>
              <View style={themeStyles.rowHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={themeStyles.carType}>{t.type}</Text>
                    <View style={themeStyles.tagBadge}>
                      <Text style={themeStyles.tagText}>{t.tag}</Text>
                    </View>
                  </View>
                  <Text style={themeStyles.models}>Models: {t.models}</Text>
                  <Text style={themeStyles.specs}>{t.seats} • {t.luggage}</Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={themeStyles.rate}>₹{currentRate} <Text style={themeStyles.perKm}>/ KM</Text></Text>
                  <Text style={themeStyles.allowance}>₹{currentBata} Driver Batta</Text>
                </View>
              </View>

              <View style={themeStyles.calcDivider} />

              <View style={themeStyles.estRow}>
                <Text style={themeStyles.estLabel}>Est. Total for {billedKm} KM ({isRound ? 'Round Trip' : 'One-Way'}):</Text>
                <Text style={themeStyles.estPrice}>₹{totalFare}</Text>
              </View>
            </View>
          );
        })}

        {/* DROP CARS TRANSPARENT GUARANTEE BOX */}
        <View style={themeStyles.infoBox}>
          <ShieldCheck color="#10B981" size={26} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={themeStyles.infoTitle}>Drop Cars Price Guarantee</Text>
            <Text style={themeStyles.infoText}>• <Text style={{ fontWeight: '700' }}>One-Way Drop Taxi Fares</Text>: Pay only for the distance traveled for one-way journeys.</Text>
            <Text style={themeStyles.infoText}>• <Text style={{ fontWeight: '700' }}>Minimum Billable Distance</Text>: 130 KM min for One-Way Drops | 250 KM/day min limit for Round Trips.</Text>
            <Text style={themeStyles.infoText}>• <Text style={{ fontWeight: '700' }}>Tolls & Permits</Text>: Toll gate fees and state permit taxes charged as per actual receipts.</Text>
            <Text style={themeStyles.infoText}>• <Text style={{ fontWeight: '700' }}>Night Charges</Text>: ₹300 driver night allowance applies for trips running between 10:00 PM to 05:00 AM.</Text>
          </View>
        </View>

        <View style={{ height: 30 }} />
    </ScreenShell>
  );
}

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    calcCard: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 18, gap: 12, borderWidth: isDark ? 1 : 0, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    calcTitle: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 16, fontWeight: '800' },
    tabContainer: { flexDirection: 'row', backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 12, padding: 4, gap: 4 },
    tabChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTabChip: { backgroundColor: '#0EA5E9' },
    tabText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' },
    activeTabText: { color: '#FFFFFF' },
    kmInputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    kmLabel: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 14, fontWeight: '600' },
    kmInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
    kmTextInput: { color: '#0EA5E9', fontSize: 16, fontWeight: '800', width: 50, textAlign: 'center' },
    kmUnit: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' },
    sectionHeader: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 12 },
    card: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 14, gap: 10, borderWidth: isDark ? 1 : 0, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    carType: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 16, fontWeight: '800' },
    tagBadge: { backgroundColor: 'rgba(14, 165, 233, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    tagText: { color: '#0EA5E9', fontSize: 10, fontWeight: '800' },
    models: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, marginTop: 2 },
    specs: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 12, marginTop: 2 },
    rate: { color: '#0EA5E9', fontSize: 18, fontWeight: '900' },
    perKm: { fontSize: 12, fontWeight: '600' },
    allowance: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, marginTop: 2 },
    calcDivider: { height: 1, backgroundColor: isDark ? '#334155' : '#E2E8F0' },
    estRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    estLabel: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: '600' },
    estPrice: { color: '#10B981', fontSize: 17, fontWeight: '900' },
    infoBox: { flexDirection: 'row', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 18, padding: 18, gap: 14, marginTop: 10, borderWidth: 1, borderColor: '#10B981', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    infoTitle: { color: '#10B981', fontSize: 16, fontWeight: '800' },
    infoText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 13, lineHeight: 18 },
  });
}
