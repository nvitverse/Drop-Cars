import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchUserDetails, resetUserPassword } from '../../services/api';
import { User, Phone, Lock, Search, RefreshCw, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Shield, Eye, EyeOff } from 'lucide-react-native';
// import BASE_URL from '../services/api';
interface UserDetails {
  id: string;
  full_name: string;
  role: string;
  account_status: string;
  primary_number: string;
  created_at: string;
  current_password?: string;
}

interface ApiResponse {
  role: string;
  message: string;
}

// const API_BASE_URL = 'http://10.115.254.247:8000'; // Replace with your actual API URL

export default function AdminPanel() {
  const [selectedRole, setSelectedRole] = useState<string>('Driver');
  const [primaryNumber, setPrimaryNumber] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const roles = ['Driver', 'VehicleOwner', 'Vendor'];

  const clearMessages = () => {
    setSuccessMessage('');
    setErrorMessage('');
  };
  const fetchUserDetails = async () => {
  if (!primaryNumber.trim()) {
    setErrorMessage('Please enter a primary number');
    return;
  }

  clearMessages();
  setIsLoading(true);
  setUserDetails(null);

  try {
    const data: UserDetails = await searchUserDetails(
      selectedRole,
      primaryNumber.trim()
    );

    setUserDetails(data);
    setSuccessMessage('User details fetched successfully');
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    setErrorMessage(
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      'Failed to fetch user details. Please check the number and try again.'
    );
  } finally {
    setIsLoading(false);
  }
};
const resetPassword = async () => {
  if (!userDetails) {
    setErrorMessage('Please fetch user details first');
    return;
  }

  if (!newPassword.trim()) {
    setErrorMessage('Please enter a new password');
    return;
  }

  if (newPassword.length < 6) {
    setErrorMessage('Password must be at least 6 characters long');
    return;
  }

  clearMessages();
  setIsResetting(true);

  try {
    const data = await resetUserPassword(
      userDetails.role,
      userDetails.id,
      newPassword.trim()
    );

    if (data.message === 'Password reset successfully') {
      setSuccessMessage('Password reset successfully!');
      setNewPassword('');
    } else {
      setErrorMessage(data.message || 'Failed to reset password');
    }
  } catch (error: any) {
    console.error('Error resetting password:', error);
    setErrorMessage(
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      'Failed to reset password. Please try again.'
    );
  } finally {
    setIsResetting(false);
  }
};


  const resetForm = () => {
    setSelectedRole('Driver');
    setPrimaryNumber('');
    setNewPassword('');
    setUserDetails(null);
    clearMessages();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Shield size={32} color="#3B82F6" />
          <Text style={styles.headerTitle}>Password Manager</Text>
        </View>

        {/* Search User Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search User</Text>
          
{/* Role Selector */}
        <View style={styles.roleContainer}>
        {roles.map((role) => (
            <TouchableOpacity
            key={role}
            style={[
                styles.roleButton,
                selectedRole === role && styles.roleButtonActive,
            ]}
            onPress={() => setSelectedRole(role)}
            >
            <Text
                style={[
                styles.roleButtonText,
                selectedRole === role && styles.roleButtonTextActive,
                ]}
            >
                {role === 'VehicleOwner' ? 'Driver' : role === 'Driver' ? 'Duty Driver' : role}
            </Text>
            </TouchableOpacity>
        ))}
        </View>



          {/* Primary Number Input */}
          <View style={styles.inputContainer}>
            <Phone size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter primary number"
              value={primaryNumber}
              onChangeText={setPrimaryNumber}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          {/* Search Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={fetchUserDetails}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Search size={20} color="#FFFFFF" />
            )}
            <Text style={styles.buttonText}>
              {isLoading ? 'Searching...' : 'Search User'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* User Details Section */}
        {userDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Details</Text>
            <View style={styles.userDetailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Name:</Text>
                <Text style={styles.detailValue}>{userDetails.full_name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Role:</Text>
                <Text style={styles.detailValue}>{userDetails.role}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <View style={[
                  styles.statusBadge, 
                  userDetails.account_status === 'PROCESSING' && styles.processingBadge
                ]}>
                  <Text style={styles.statusText}>{userDetails.account_status}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone:</Text>
                <Text style={styles.detailValue}>{userDetails.primary_number}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created:</Text>
                <Text style={styles.detailValue}>
                  {new Date(userDetails.created_at).toLocaleDateString()}
                </Text>
              </View>
              {(() => {
                const phoneDigits = (userDetails.primary_number || '').replace(/\D/g, '');
                const defaultLast6 = phoneDigits.length >= 6 ? phoneDigits.slice(-6) : 'N/A';
                const passDisplay = userDetails.current_password || `Default: ${defaultLast6}`;
                return (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Password Status:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.detailValue, { fontWeight: '700', color: userDetails.current_password ? '#111827' : '#059669' }]}>
                          {showCurrentPassword ? passDisplay : '••••••••'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {showCurrentPassword ? <EyeOff size={16} color="#6B7280" /> : <Eye size={16} color="#6B7280" />}
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' }}>
                      <Text style={{ fontSize: 11, color: '#1E40AF', lineHeight: 15 }}>
                        💡 <Text style={{ fontWeight: '700' }}>Default Login:</Text> Last 6 digits of primary number (<Text style={{ fontWeight: '700' }}>{defaultLast6}</Text>). Users who added an email or changed password in their app use their own custom secure password.
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* Reset Password Section */}
        {userDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reset Password</Text>
            
            {/* New Password Input */}
            <View style={styles.inputContainer}>
              <Lock size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter new password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ paddingRight: 12 }}
              >
                {showNewPassword ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
              </TouchableOpacity>
            </View>

            {/* Reset Password Button */}
            <TouchableOpacity
              style={[styles.button, styles.warningButton]}
              onPress={resetPassword}
              disabled={isResetting}
            >
              {isResetting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <RefreshCw size={20} color="#FFFFFF" />
              )}
              <Text style={styles.buttonText}>
                {isResetting ? 'Resetting...' : 'Reset Password'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Messages */}
        {successMessage ? (
          <View style={styles.messageContainer}>
            <View style={styles.successMessage}>
              <CheckCircle size={20} color="#059669" />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.messageContainer}>
            <View style={styles.errorMessage}>
              <AlertCircle size={20} color="#DC2626" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          </View>
        ) : null}

        {/* Reset Form Button */}
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={resetForm}
        >
          <RefreshCw size={20} color="#6B7280" />
          <Text style={styles.secondaryButtonText}>Clear Form</Text>
        </TouchableOpacity>

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
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
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 6,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  inputIcon: {
    marginLeft: 12,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  pickerContainer: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  picker: {
    flex: 1,
    height: 48,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 6,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  warningButton: {
    backgroundColor: '#EF4444',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    margin: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  userDetailsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    width: 80,
  },
  detailValue: {
    fontSize: 16,
    color: '#1F2937',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  processingBadge: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  messageContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 6,
    padding: 16,
    gap: 8,
  },
  successText: {
    color: '#059669',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    padding: 16,
    gap: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    height: 20,
  },
  roleContainer: {
  flexDirection: 'row',
  gap: 8,
  marginBottom: 16,
  flexWrap: 'wrap',
},

roleButton: {
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  backgroundColor: '#FFFFFF',
},

roleButtonActive: {
  backgroundColor: '#3B82F6',
  borderColor: '#3B82F6',
},

roleButtonText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#374151',
},

roleButtonTextActive: {
  color: '#FFFFFF',
},

});