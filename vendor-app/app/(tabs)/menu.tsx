import React, { useState, useEffect } from 'react';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import { Platform } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import api from '../../app/api/api'; // Adjust the path as necessary
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Package, DollarSign, TrendingUp, Calendar,ArrowRight, Settings, CircleHelp as HelpCircle, Info, LogOut, Bell, Shield, Star, Phone, Mail, Globe, FileText, CreditCard, Clock, Award, ChevronRight, Wallet, RefreshCw, MapPin } from 'lucide-react-native';
import { gradients, colors } from '../../constants/theme';

interface VendorData {
  id: string;
  full_name: string;
  primary_number: string;
  secondary_number: string;
  gpay_number: string;
  wallet_balance: number;
  bank_balance: number;
  aadhar_number: string;
  aadhar_front_img: string;
  address: string;
  account_status: string;
  created_at: string;
}

export default function MenuScreen() {
  const [vendorData, setVendorData] = useState<VendorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchVendorData = async () => {
    try {
      const response = await api.get('/users/vendor-details/me');
      setVendorData(response.data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching vendor data:", err);
      setError('Failed to fetch vendor data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVendorData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVendorData();
  };

  const handleWalletRefresh = () => {
    setRefreshing(true);
    fetchVendorData();
  };

  const handleCall = () => {
    const phoneNumber = '+918300448959';
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      Alert.alert('Error', 'Unable to open dial pad');
    });
  };

  const handleEmail = () => {
    const email = 'dropcars.in@gmail.com';
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Error', 'Unable to open the Gmail');
    });
  };

  const handleWebSite = () => {
    const weblink = 'www.dropcars.in';
    Linking.openURL(`https://${weblink}`).catch(() => {
      Alert.alert('Error', 'Unable to open the Gmail');
    });
  };

  const removeAccessToken = async () => {
    try {
      await AsyncStorage.removeItem('accessToken');
      console.log('Access token removed successfully');
    } catch (error) {
      console.error('Error removing access token:', error);
    }
  };

  const handleLogout = () => {
    console.log('Logging out...');
    removeAccessToken();
    router.replace('/(auth)/sign-in');
  };

  const menuItems = [
    {
      id: 'profile',
      title: 'Profile',
      subtitle: 'View your profile',
      icon: User,
      iconColor: '#1E40AF',
      action: () => router.push('/(menu)/profile'),
    },
    {
      id: 'orders',
      title: 'Bookings',
      subtitle: 'Manage your Bookings',
      icon: Package,
      iconColor: '#3B82F6',
      action: () => router.push('/(menu)/orders'),
    },
    {
      id: 'Statement',
      title: 'Statement',
      subtitle: 'Track your income',
      icon: DollarSign,
      iconColor: '#60A5FA',
      action: () => router.push('/(menu)/wallet'),
    },
    {
      id: 'settings',
      title: 'Settings',
      subtitle: 'Notification Preferences',
      icon: Settings,
      iconColor: '#6B7280',
      action: () => router.push('/(menu)/notification'),
    },
    {
      id: 'vacant-cities',
      title: 'Vacant Drivers',
      subtitle: 'See where drivers are waiting for a trip',
      icon: MapPin,
      iconColor: '#10B981',
      action: () => router.push('/(menu)/vacant-cities'),
    },
    {
      id: 'about',
      title: 'About',
      subtitle: 'App information',
      icon: Info,
      iconColor: '#8B5CF6',
      action: () => router.push('/(menu)/about'),
    },
  ];

  const formatJoinedDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
      >
        {/* Enhanced Header Section */}
        <LinearGradient
          colors={gradients.primary}
          style={styles.headerSection}
        >
          <View style={styles.headerContent}>
            <View style={styles.profileSection}>
              <View style={styles.profileImageContainer}>
                <View style={styles.profileImage}>
                  <Text style={styles.profileInitials}>
                    {vendorData?.full_name.split(' ').map(n => n[0]).join('')}
                  </Text>
                </View>
                <View style={[
                  styles.statusIndicator, 
                  { backgroundColor: vendorData?.account_status === 'Active' ? '#10B981' : '#F59E0B' }
                ]} />
              </View>
              
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{vendorData?.full_name}</Text>
                <View style={styles.statusContainer}>
                  <View style={styles.statusBadge}>
                    <Shield size={12} color="#FFFFFF" />
                    <Text style={styles.statusText}>{vendorData?.account_status}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Wallet Balance Card */}
          <View style={styles.walletSection}>
            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View style={styles.walletTitleContainer}>
                  <Wallet size={24} color="#FFFFFF" />
                  <Text style={styles.walletLabel}>Wallet Balance</Text>
                </View>
                <TouchableOpacity 
                  style={styles.refreshButton}
                  onPress={handleWalletRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw 
                    size={20} 
                    color="#FFFFFF" 
                    style={refreshing ? styles.refreshingIcon : null}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.walletAmount}>
                ₹{vendorData?.wallet_balance.toLocaleString('en-IN')}
              </Text>
              {refreshing && (
                <Text style={styles.refreshingText}>Updating...</Text>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Content Section */}
        <View style={styles.contentSection}>
          {/* Menu Items */}
          <View style={styles.menuContainer}>
            <Text style={styles.sectionTitle}>Main Menu</Text>
            
            <View style={styles.menuGrid}>
              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={item.action}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuIcon, { backgroundColor: `${item.iconColor}15` }]}>
                      <item.icon size={24} color={item.iconColor} />
                    </View>
                    <View style={styles.menuTextContainer}>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                      <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                 <ArrowRight size={20} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.supportSection}>
            <Text style={styles.sectionTitle}>Support & Help</Text>
            
            <View style={styles.supportCard}>
              <TouchableOpacity style={styles.supportItem} onPress={handleCall}>
                <View style={styles.supportIcon}>
                  <Phone size={20} color="#1E40AF" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>Call Support</Text>
                  <Text style={styles.supportValue}>+91 83004 48959</Text>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>
              
              <View style={styles.divider} />
              
              <TouchableOpacity style={styles.supportItem} onPress={handleEmail}>
                <View style={styles.supportIcon}>
                  <Mail size={20} color="#3B82F6" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>Email Support</Text>
                  <Text style={styles.supportValue}>dropcars.in@gmail.com</Text>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>
              
              <View style={styles.divider} />
              
              <TouchableOpacity style={styles.supportItem} onPress={handleWebSite}>
                <View style={styles.supportIcon}>
                  <Globe size={20} color="#10B981" />
                </View>
                <View style={styles.supportContent}>
                  <Text style={styles.supportLabel}>Website</Text>
                  <Text style={styles.supportValue}>www.dropcars.in</Text>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* App Information */}
          <View style={styles.appSection}>
            <Text style={styles.sectionTitle}>App Information</Text>
            
            <View style={styles.appCard}>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>Drop Cars Vendor</Text>
                <Text style={styles.appVersion}>Version 1.0.0</Text>
                <Text style={styles.appDescription}>
                  Professional Travel management app for vendors. Manage your bookings, track Statement, and grow your business.
                </Text>
              </View>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
          <View style={{ height: Platform.OS === 'ios' ? 40 : 20 }} />
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
  scrollView: {
    flex: 1,
  },
  headerSection: {
    paddingTop: Platform.OS === 'ios' ? 44 : ANDROID_STATUS_BAR + 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  profileSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 3,
  },
  walletSection: {
    marginTop: 16,
  },
  walletCard: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  walletTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 14,
    color: '#E2E8F0',
    marginLeft: 6,
    fontWeight: '500',
  },
  walletAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  refreshButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  refreshingIcon: {
    transform: [{ rotate: '360deg' }],
  },
  refreshingText: {
    fontSize: 11,
    color: '#E2E8F0',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
  contentSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  menuContainer: {
    marginBottom: 20,
  },
  menuGrid: {
    gap: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  supportSection: {
    marginBottom: 24,
  },
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  supportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  supportIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportContent: {
    flex: 1,
  },
  supportLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 1,
  },
  supportValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 62,
  },
  appSection: {
    marginBottom: 24,
  },
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  appInfo: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: Platform.OS === 'ios' ? 50 : 30,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
});