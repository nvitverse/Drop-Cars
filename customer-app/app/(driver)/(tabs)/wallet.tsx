import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { Menu, Wallet, Plus, CircleArrowUp as ArrowUpCircle, CircleArrowDown as ArrowDownCircle, CreditCard, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

export default function WalletScreen() {
  const { user } = useAuth();
  const { wallet, transactions, addFunds } = useWallet();
  const navigation = useNavigation();
  
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const handleAddFunds = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    
    try {
      // In a real app, this would integrate with Razorpay
      const options = {
        description: 'Wallet Top-up',
        image: 'https://your-logo-url',
        currency: 'INR',
        key: 'rzp_test_1DP5mmOlF5G5ag', // Replace with your Razorpay key
        amount: (parseFloat(amount) * 100).toString(), // Amount in paise
        name: 'Drop Cars',
        order_id: '', // Replace with actual order ID from backend
        prefill: {
          email: `${user?.phone}@dropcars.com`,
          contact: user?.phone,
          name: user?.name,
        },
        theme: { color: '#10B981' }
      };

      // Simulate Razorpay success for demo
      setTimeout(async () => {
        const success = await addFunds(parseFloat(amount));
        if (success) {
          Alert.alert('Success', 'Funds added successfully!');
          setAmount('');
          setShowAddFunds(false);
        } else {
          Alert.alert('Error', 'Failed to add funds');
        }
        setLoading(false);
      }, 2000);

    } catch (error) {
      Alert.alert('Error', 'Payment failed');
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={openDrawer} style={styles.menuButton}>
            <Menu color="#FFFFFF" size={24} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Wallet Card */}
        <View style={styles.walletCard}>
          <View style={styles.walletContent}>
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>₹{wallet?.balance || 0}</Text>
            </View>
            
            <View style={styles.walletActions}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddFunds(true)}
              >
                <Plus color="#10B981" size={20} strokeWidth={2} />
                <Text style={styles.addButtonText}>Add Money</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Minimum Balance Warning */}
          {wallet && wallet.balance < wallet.minBalance && (
            <View style={styles.warningSection}>
              <AlertCircle color="#F59E0B" size={16} />
              <Text style={styles.warningText}>
                Maintain minimum ₹{wallet.minBalance} to accept bookings
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Wallet color="#9CA3AF" size={48} strokeWidth={1} />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Your transaction history will appear here</Text>
            </View>
          ) : (
            transactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionIcon}>
                  {transaction.type === 'credit' ? (
                    <ArrowUpCircle color="#10B981" size={24} strokeWidth={2} />
                  ) : (
                    <ArrowDownCircle color="#EF4444" size={24} strokeWidth={2} />
                  )}
                </View>
                
                <View style={styles.transactionDetails}>
                  <Text style={styles.transactionDescription}>
                    {transaction.description}
                  </Text>
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.createdAt)}
                  </Text>
                </View>
                
                <View style={styles.transactionAmount}>
                  <Text style={[
                    styles.amountText,
                    { color: transaction.type === 'credit' ? '#10B981' : '#EF4444' }
                  ]}>
                    {transaction.type === 'credit' ? '+' : '-'}₹{transaction.amount}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: transaction.status === 'completed' ? '#10B981' : '#F59E0B' }
                  ]}>
                    <Text style={styles.statusText}>
                      {transaction.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Wallet Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Wallet Information</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Minimum Balance Required</Text>
            <Text style={styles.infoValue}>₹{wallet?.minBalance || 100}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Wallet Status</Text>
            <View style={styles.statusContainer}>
              <CheckCircle 
                color={wallet?.isActive ? '#10B981' : '#EF4444'} 
                size={16} 
              />
              <Text style={[
                styles.infoValue,
                { color: wallet?.isActive ? '#10B981' : '#EF4444' }
              ]}>
                {wallet?.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
          
          <View style={styles.infoNote}>
            <Text style={styles.noteText}>
              • 10% of booking fare is deducted when you accept a booking
            </Text>
            <Text style={styles.noteText}>
              • Funds are processed instantly via Razorpay
            </Text>
            <Text style={styles.noteText}>
              • Maintain minimum balance to keep receiving bookings
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Add Funds Modal */}
      <Modal
        visible={showAddFunds}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddFunds(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Money to Wallet</Text>
            
            <View style={styles.amountInput}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.amountField}
                placeholder="Enter amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Quick Amount Buttons */}
            <View style={styles.quickAmounts}>
              {['100', '500', '1000', '2000'].map((quickAmount) => (
                <TouchableOpacity
                  key={quickAmount}
                  style={styles.quickAmountButton}
                  onPress={() => setAmount(quickAmount)}
                >
                  <Text style={styles.quickAmountText}>₹{quickAmount}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.paymentInfo}>
              <CreditCard color="#6B7280" size={20} />
              <Text style={styles.paymentText}>Secure payment via Razorpay</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddFunds(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.payButton}
                onPress={handleAddFunds}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.payGradient}
                >
                  <Text style={styles.payButtonText}>
                    {loading ? 'Processing...' : 'Pay Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  walletCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  walletContent: {
    alignItems: 'center',
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1F2937',
  },
  walletActions: {
    width: '100%',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  warningSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: -16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionIcon: {
    marginRight: 16,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoNote: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  noteText: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 24,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 8,
  },
  amountField: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 16,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  paymentText: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  payButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  payGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});