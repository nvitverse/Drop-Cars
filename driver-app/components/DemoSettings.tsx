import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Switch,
  ScrollView,
} from 'react-native';
import { 
  Bell, 
  Shield, 
  User, 
  Moon, 
  Globe, 
  HelpCircle,
  CheckCircle,
  ArrowRight,
  X
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface DemoSettingsProps {
  isVisible: boolean;
  onClose: () => void;
  onFeatureHighlight: (feature: string) => void;
}

export default function DemoSettings({ isVisible, onClose, onFeatureHighlight }: DemoSettingsProps) {
  const [highlightedFeature, setHighlightedFeature] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [demoSettings, setDemoSettings] = useState({
    notifications: true,
    darkMode: false,
    location: true,
  });

  useEffect(() => {
    if (isVisible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  const settingsSections = [
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      color: '#3B82F6',
      items: [
        {
          id: 'push_notifications',
          title: 'Push Notifications',
          description: 'Receive real-time updates',
          type: 'switch',
          value: demoSettings.notifications,
          demoText: 'Toggle this to enable/disable notifications'
        },
        {
          id: 'booking_alerts',
          title: 'Booking Alerts',
          description: 'Get notified about new trips',
          type: 'switch',
          value: true,
          demoText: 'Stay updated with new booking opportunities'
        }
      ]
    },
    {
      id: 'privacy',
      title: 'Privacy & Security',
      icon: Shield,
      color: '#10B981',
      items: [
        {
          id: 'location_access',
          title: 'Location Access',
          description: 'Allow app to access your location',
          type: 'switch',
          value: demoSettings.location,
          demoText: 'Required for trip tracking and navigation'
        },
        {
          id: 'data_sharing',
          title: 'Data Sharing',
          description: 'Share anonymous usage data',
          type: 'switch',
          value: false,
          demoText: 'Help improve the app experience'
        }
      ]
    },
    {
      id: 'appearance',
      title: 'Appearance',
      icon: Moon,
      color: '#8B5CF6',
      items: [
        {
          id: 'dark_mode',
          title: 'Dark Mode',
          description: 'Switch to dark theme',
          type: 'switch',
          value: demoSettings.darkMode,
          demoText: 'Easier on the eyes in low light'
        },
        {
          id: 'language',
          title: 'Language',
          description: 'App language preference',
          type: 'select',
          value: (demoSettings as any).language || 'English',
          demoText: 'Choose your preferred language'
        }
      ]
    },
    {
      id: 'support',
      title: 'Support & Help',
      icon: HelpCircle,
      color: '#F59E0B',
      items: [
        {
          id: 'help_center',
          title: 'Help Center',
          description: 'Get help and support',
          type: 'button',
          demoText: 'Access FAQs and contact support'
        },
        {
          id: 'about_app',
          title: 'About App',
          description: 'App version and info',
          type: 'button',
          demoText: 'View app version and details'
        }
      ]
    }
  ];

  const handleFeaturePress = (sectionId: string, itemId: string) => {
    const feature = `${sectionId}_${itemId}`;
    setHighlightedFeature(feature);
    onFeatureHighlight(feature);
    
    // Auto-clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedFeature(null);
    }, 3000);
  };

  const handleSwitchToggle = (key: string, value: boolean) => {
    setDemoSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.container}>
        <LinearGradient
          colors={['#3B82F6', '#1E40AF']}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>⚙️ Demo Settings</Text>
            <Text style={styles.headerSubtitle}>Explore App Configuration</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X color="#FFFFFF" size={24} />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.instructionText}>
            Tap on any setting to see how it works:
          </Text>

          {settingsSections.map((section) => {
            const IconComponent = section.icon;
            
            return (
              <View key={section.id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: `${section.color}15` }]}>
                    <IconComponent color={section.color} size={20} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>

                {section.items.map((item) => {
                  const isHighlighted = highlightedFeature === `${section.id}_${item.id}`;
                  
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.settingItem,
                        isHighlighted && styles.highlightedItem
                      ]}
                      onPress={() => handleFeaturePress(section.id, item.id)}
                    >
                      <View style={styles.settingContent}>
                        <Text style={styles.settingTitle}>{item.title}</Text>
                        <Text style={styles.settingDescription}>{item.description}</Text>
                        
                        {isHighlighted && (
                          <View style={styles.demoIndicator}>
                            <CheckCircle color="#10B981" size={16} />
                            <Text style={styles.demoText}>{item.demoText}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.settingControl}>
                        {item.type === 'switch' && (
                          <Switch
                            value={(item as any).value}
                            onValueChange={(value) => handleSwitchToggle(item.id, value)}
                            trackColor={{ false: '#E5E7EB', true: section.color }}
                            thumbColor={(item as any).value ? '#FFFFFF' : '#9CA3AF'}
                          />
                        )}
                        {item.type === 'select' && (
                          <View style={styles.selectControl}>
                            <Text style={styles.selectText}>{(item as any).value}</Text>
                            <ArrowRight color="#9CA3AF" size={16} />
                          </View>
                        )}
                        {item.type === 'button' && (
                          <ArrowRight color="#9CA3AF" size={20} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💡 These are demo settings. In the real app, changes will be saved and applied!
            </Text>
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E0F2FE',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  instructionText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  highlightedItem: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
    borderWidth: 2,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  demoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  demoText: {
    fontSize: 12,
    color: '#065F46',
    marginLeft: 4,
    fontWeight: '500',
  },
  settingControl: {
    marginLeft: 12,
  },
  selectControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  footer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F0F7FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  footerText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
