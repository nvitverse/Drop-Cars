import React, { useState, useEffect } from 'react';
import { View,RefreshControl, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRightLeft, Wallet, Building2, Send, CircleAlert as AlertCircle,HistoryIcon, ChevronRight } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import api from '../api/api';

export default function TransferScreen() {
  const [balance, setBalance] = useState({ wallet_balance: 0, bank_balance: 0, total_balance: 0 });
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadBalance();
    }, [])
  );

  const loadBalance = async () => {
    try {
      const response = await api.get('/transfer/balance');
      const balanceData = response.data;
      setBalance(balanceData);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await loadBalance();
    setRefreshing(false);
  };

  const handleTransfer = async () => {
    const transferAmount = parseFloat(amount);
    
    if (!transferAmount || transferAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0');
      return;
    }

    if (transferAmount > balance.wallet_balance) {
      Alert.alert('Insufficient Balance', `You only have Rs.${balance.wallet_balance.toLocaleString('en-IN')} in your wallet`);
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/transfer/request', { amount: transferAmount });
      Alert.alert('Transfer Requested', 'Your transfer request has been submitted for admin approval');
      setAmount('');
      loadBalance();
    } catch (error : any) {
      console.log('Transfer request error:', error);

      const errorMessage =
        error?.response?.data?.detail ??
        'Failed to create transfer request. Please try again later.';

      Alert.alert('Sorry', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Compact Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <HistoryIcon size={20} color="#3B82F6" />
            </View>
            <Text style={styles.headerTitle}>Transfer Funds</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}      refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }>
        {/* Balance Overview */}
        <View style={styles.balanceSection}>
          <Text style={styles.sectionTitle}>Available Balance</Text>
          <View style={styles.balanceCards}>
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <Wallet size={20} color="#3B82F6" />
                <Text style={styles.balanceLabel}>Wallet</Text>
              </View>
              <Text style={styles.balanceAmount}>₹{balance.wallet_balance.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <Building2 size={20} color="#10B981" />
                <Text style={styles.balanceLabel}>Received</Text>
              </View>
              <Text style={styles.balanceAmount}>₹{balance.bank_balance.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>

        {/* Transfer History (moved here from the bottom bar) */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/history')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
            marginHorizontal: 20, marginBottom: 8,
            borderWidth: 1, borderColor: '#E5E7EB',
          }}
        >
          <HistoryIcon size={20} color="#3B82F6" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1F2937' }}>Transfer History</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>All your past transfer requests</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Transfer Form */}
        <View style={styles.transferSection}>
          <Text style={styles.sectionTitle}>Request Transfer</Text>
          <View style={styles.transferCard}>
            <View style={styles.transferFlow}>
              <View style={styles.transferPoint}>
                <Wallet size={24} color="#3B82F6" />
                <Text style={styles.transferLabel}>Wallet</Text>
              </View>
              <ArrowRightLeft size={20} color="#6B7280" />
              <View style={styles.transferPoint}>
                <Building2 size={24} color="#10B981" />
                <Text style={styles.transferLabel}>Received</Text>
              </View>
            </View>

            <View style={styles.amountSection}>
              <Text style={styles.inputLabel}>Transfer Amount</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <Text style={styles.maxAmount}>
                Max: Rs.{balance.wallet_balance.toLocaleString('en-IN')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.transferButton, loading && styles.transferButtonDisabled]}
              onPress={handleTransfer}
              disabled={loading}
            >
              <LinearGradient
                colors={loading ? ['#9CA3AF', '#6B7280'] : ['#3B82F6', '#1D4ED8']}
                style={styles.transferButtonGradient}
              >
                <Send size={20} color="white" />
                <Text style={styles.transferButtonText}>
                  {loading ? 'Processing...' : 'Request Transfer'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transfer Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <AlertCircle size={20} color="#F59E0B" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Transfer Process</Text>
              <Text style={styles.infoText}>
                All transfer requests require admin approval. You'll be notified once your request is processed.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'black',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  balanceSection: {
    marginTop: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  balanceCards: {
    flexDirection: 'row',
    gap: 10,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 28,
    height: 28,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1F2937',
  },
  transferSection: {
    marginBottom: 20,
  },
  transferCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  transferFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  transferPoint: {
    alignItems: 'center',
    flex: 1,
  },
  transferLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  amountSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  maxAmount: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'right',
  },
  transferButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  transferButtonDisabled: {
    opacity: 0.6,
  },
  transferButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  transferButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  infoSection: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    flex: 1,
    marginLeft: 10,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 14,
  },
});