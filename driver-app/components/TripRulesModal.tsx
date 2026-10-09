import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ShieldAlert, CheckCircle2, Tag, Percent, Lock } from 'lucide-react-native';

interface TripRulesModalProps {
  visible: boolean;
  onClose: () => void;
  tripType?: string;
  isAllInclusive?: boolean;
  isBiddingLead?: boolean;
  kmCommission?: number;
  driverAllowance?: number;
  tollCharges?: number;
  permitCharges?: number;
}

export default function TripRulesModal({
  visible,
  onClose,
  tripType = 'Outstation One-Way',
  isAllInclusive = false,
  isBiddingLead = false,
  kmCommission = 0,
}: TripRulesModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={22} color="#3B82F6" />
              <Text style={styles.headerTitle}>Drop Cars Duty & Fare Guidelines</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* 1. Fare Structure & Drop Cars Model */}
            <View style={styles.ruleCard}>
              <Text style={styles.ruleCardTitle}>🚗 Fare Model & Payout Breakdown</Text>

              {isAllInclusive ? (
                <View style={styles.ruleRow}>
                  <CheckCircle2 size={16} color="#10B981" />
                  <Text style={styles.ruleText}>
                    <Text style={styles.bold}>All-Inclusive Package:</Text> Final fare includes all trip charges. No extra km rate deductions.
                  </Text>
                </View>
              ) : (
                <View style={styles.ruleRow}>
                  <Percent size={16} color="#3B82F6" />
                  <Text style={styles.ruleText}>
                    <Text style={styles.bold}>Per-Km Booking (10% Commission):</Text> 10% Drop Cars platform commission is calculated on per-km fare.
                  </Text>
                </View>
              )}

              {isBiddingLead && (
                <View style={styles.ruleRow}>
                  <Tag size={16} color="#F59E0B" />
                  <Text style={styles.ruleText}>
                    <Text style={styles.bold}>Drop Bid Bidding Lead:</Text> Instant dispatch lead with competitive driver counter-bidding enabled.
                  </Text>
                </View>
              )}
            </View>

            {/* 2. Wallet Security Hold Policy */}
            <View style={[styles.ruleCard, { borderLeftColor: '#10B981' }]}>
              <Text style={styles.ruleCardTitle}>🔒 Wallet Balance & Security Hold</Text>

              <View style={styles.ruleRow}>
                <Lock size={16} color="#10B981" />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Security Deposit Hold:</Text> At least ₹500 (or your commission with extras, if more) is held from your wallet when you accept. After the trip the commission is deducted and the rest is refunded to your wallet.
                </Text>
              </View>

              <View style={styles.ruleRow}>
                <CheckCircle2 size={16} color="#10B981" />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>No External Dealing Policy:</Text> Direct dealings outside the Drop Cars platform will result in account suspension.
                </Text>
              </View>
            </View>

            {/* 3. Mandatory Trip Execution Checks */}
            <View style={[styles.ruleCard, { borderLeftColor: '#F59E0B' }]}>
              <Text style={styles.ruleCardTitle}>📸 Mandatory Trip Start Checks</Text>

              <View style={styles.ruleRow}>
                <CheckCircle2 size={16} color="#F59E0B" />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Odometer Reading Check:</Text> Take clear photo of starting & ending dashboard odometer.
                </Text>
              </View>

              <View style={styles.ruleRow}>
                <CheckCircle2 size={16} color="#F59E0B" />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Customer 4-Digit Start OTP:</Text> Collect customer Start OTP before moving vehicle.
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.gotItBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.gotItBtnText}>Understood Drop Cars Guidelines</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  body: {
    marginVertical: 16,
  },
  ruleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  ruleCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  ruleText: {
    fontSize: 12.5,
    color: '#334155',
    flex: 1,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  gotItBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  gotItBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
