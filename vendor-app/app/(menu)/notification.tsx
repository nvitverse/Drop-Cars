import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Bell, Shield, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, RefreshCw } from 'lucide-react-native';
import api from '../api/api';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationSettings {
  sub: string;
  permission1: boolean;
  permission2: boolean;
  token: string;
}

export default function NotificationSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [permission1, setPermission1] = useState(false);
  const [permission2, setPermission2] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register for push notifications and get token
  async function registerForPushNotificationsAsync(): Promise<string | null> {
    // Push notifications aren't supported on web - Device.isDevice/permission
    // prompts behave inconsistently there, causing this to fire (and alert)
    // repeatedly instead of just no-opping.
    if (Platform.OS === 'web') return null;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      if (!Device.isDevice) {
        Alert.alert('Error', 'Push notifications only work on physical devices');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Push notification permission is required for this feature.');
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync();

      return token.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      Alert.alert('Error', 'Failed to get push notification token');
      return null;
    }
  }

  // Fetch current notification settings
  const fetchSettings = async () => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await api.get('/notifications/');
      
      const data: NotificationSettings = response.data;
      setSettings(data);
      setPermission1(data.permission1);
      setPermission2(data.permission2);
      setExpoPushToken(data.token);
      setMasterEnabled(!!data.token); // Master is enabled if token exists
      
    } catch (error: any) {
      console.error('Fetch error:', error);
      
      if (error.response?.status === 404) {
        // No settings exist yet
        setSettings(null);
        setMasterEnabled(false);
        setPermission1(false);
        setPermission2(false);
      } else if (error.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to fetch notification settings';
        setError(errorMessage);
      }
      setMasterEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  // Update permissions only
  const updatePermissions = async (perm1: boolean, perm2: boolean) => {
    try {
      setUpdating(true);
      setError(null);

      const response = await api.patch('/notifications/permissions', {
        permission1: perm1,
        permission2: perm2,
      });

      const data: NotificationSettings = response.data;
      setSettings(data);
      setPermission1(data.permission1);
      setPermission2(data.permission2);
      
    } catch (error: any) {
      console.error('Update error:', error);
      
      if (error.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (error.response?.status === 404) {
        setError('No notification record found. Please enable master notifications first.');
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to update permissions';
        setError(errorMessage);
      }
      
      // Revert switches on error
      setPermission1(settings?.permission1 || false);
      setPermission2(settings?.permission2 || false);
    } finally {
      setUpdating(false);
    }
  };

  // Create or update full notification record
  const updateFullSettings = async (token: string, perm1: boolean, perm2: boolean) => {
    try {
      setUpdating(true);
      setError(null);

      const response = await api.post('/notifications/', {
        token: token,
        permission1: perm1,
        permission2: perm2,
      });

      const data: NotificationSettings = response.data;
      setSettings(data);
      setPermission1(data.permission1);
      setPermission2(data.permission2);
      setExpoPushToken(data.token);
      setMasterEnabled(true);
      
    } catch (error: any) {
      console.error('Update error:', error);
      
      if (error.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to update notification settings';
        setError(errorMessage);
      }
      setMasterEnabled(false);
    } finally {
      setUpdating(false);
    }
  };

  // Handle master notification toggle
  const handleMasterToggle = async (enabled: boolean) => {
    if (enabled) {
      // Enable master notifications
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await updateFullSettings(token, permission1, permission2);
      }
    } else {
      // Disable master notifications
      if (settings) {
        await updateFullSettings('', false, false);
        setPermission1(false);
        setPermission2(false);
        setMasterEnabled(false);
      }
    }
  };

  // Handle individual permission toggles
  const handlePermissionToggle = async (permissionType: 'permission1' | 'permission2', enabled: boolean) => {
    if (!masterEnabled) {
      Alert.alert('Master Notifications Required', 'Please enable master notifications first.');
      return;
    }

    const newPerm1 = permissionType === 'permission1' ? enabled : permission1;
    const newPerm2 = permissionType === 'permission2' ? enabled : permission2;

    if (permissionType === 'permission1') {
      setPermission1(enabled);
    } else {
      setPermission2(enabled);
    }

    await updatePermissions(newPerm1, newPerm2);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading notification settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Bell size={32} color="#3B82F6" />
          <Text style={styles.headerTitle}>Notification Preferences</Text>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchSettings} style={styles.retryButton}>
              <RefreshCw size={16} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Master Notification Toggle */}
        <View style={styles.settingCard}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Bell size={24} color={masterEnabled ? "#10B981" : "#9CA3AF"} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Master Notifications</Text>
              <Text style={styles.settingDescription}>
                Enable push notifications on this device
              </Text>
            </View>
            <Switch
              value={masterEnabled}
              onValueChange={handleMasterToggle}
              disabled={updating}
              trackColor={{ false: "#E5E7EB", true: "#34D399" }}
              thumbColor={masterEnabled ? "#10B981" : "#9CA3AF"}
            />
          </View>
          {masterEnabled && expoPushToken && (
            <View style={styles.tokenContainer}>
              <CheckCircle2 size={16} color="#10B981" />
              <Text style={styles.tokenText}>Device registered for notifications</Text>
            </View>
          )}
        </View>

        {/* Permission 1 Toggle */}
        <View style={[styles.settingCard, !masterEnabled && styles.disabledCard]}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Shield size={24} color={permission1 && masterEnabled ? "#3B82F6" : "#9CA3AF"} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !masterEnabled && styles.disabledText]}>
                Important Alerts
              </Text>
              <Text style={[styles.settingDescription, !masterEnabled && styles.disabledText]}>
                Receive important app notifications
              </Text>
            </View>
            <Switch
              value={permission1}
              onValueChange={(value) => handlePermissionToggle('permission1', value)}
              disabled={!masterEnabled || updating}
              trackColor={{ false: "#E5E7EB", true: "#93C5FD" }}
              thumbColor={permission1 ? "#3B82F6" : "#9CA3AF"}
            />
          </View>
        </View>

        {/* Permission 2 Toggle */}
        <View style={[styles.settingCard, !masterEnabled && styles.disabledCard]}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIcon}>
              <Shield size={24} color={permission2 && masterEnabled ? "#8B5CF6" : "#9CA3AF"} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !masterEnabled && styles.disabledText]}>
                Promotional Updates
              </Text>
              <Text style={[styles.settingDescription, !masterEnabled && styles.disabledText]}>
                Receive promotional and update notifications
              </Text>
            </View>
            <Switch
              value={permission2}
              onValueChange={(value) => handlePermissionToggle('permission2', value)}
              disabled={!masterEnabled || updating}
              trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }}
              thumbColor={permission2 ? "#8B5CF6" : "#9CA3AF"}
            />
          </View>
        </View>

        {/* Status Information */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Current Status</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Master</Text>
              <Text style={[styles.statusValue, masterEnabled ? styles.statusEnabled : styles.statusDisabled]}>
                {masterEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Important Alerts</Text>
              <Text style={[styles.statusValue, permission1 && masterEnabled ? styles.statusEnabled : styles.statusDisabled]}>
                {permission1 && masterEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Promotional</Text>
              <Text style={[styles.statusValue, permission2 && masterEnabled ? styles.statusEnabled : styles.statusDisabled]}>
                {permission2 && masterEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>
        </View>

        {/* Refresh Button
        <TouchableOpacity 
          style={styles.refreshButton} 
          onPress={fetchSettings}
          disabled={updating}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <RefreshCw size={20} color="#FFFFFF" />
          )}
          <Text style={styles.refreshButtonText}>
            {updating ? 'Updating...' : 'Refresh Settings'}
          </Text>
        </TouchableOpacity> */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    marginTop:20
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
  },
  retryButton: {
    padding: 4,
  },
  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  disabledCard: {
    opacity: 0.6,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  settingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  tokenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    gap: 8,
  },
  tokenText: {
    fontSize: 14,
    color: '#065F46',
    fontWeight: '500',
  },
  statusContainer: {
    marginTop: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusEnabled: {
    color: '#10B981',
  },
  statusDisabled: {
    color: '#EF4444',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});