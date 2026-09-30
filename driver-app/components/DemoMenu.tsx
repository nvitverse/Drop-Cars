import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { 
  Bell, 
  User, 
  Package, 
  DollarSign, 
  Settings, 
  Info,
  X,
  CheckCircle,
  ArrowRight
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface DemoMenuProps {
  isVisible: boolean;
  onClose: () => void;
  onFeatureHighlight: (feature: string) => void;
}

const { width } = Dimensions.get('window');

export default function DemoMenu({ isVisible, onClose, onFeatureHighlight }: DemoMenuProps) {
  const [highlightedFeature, setHighlightedFeature] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

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

  const menuItems = [
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notifications',
      description: 'Stay updated with real-time alerts',
      color: '#3B82F6',
      demoText: 'Tap to see how notifications work!'
    },
    {
      id: 'profile',
      icon: User,
      title: 'Profile',
      description: 'Manage your personal information',
      color: '#10B981',
      demoText: 'View and edit your profile details'
    },
    {
      id: 'orders',
      icon: Package,
      title: 'Bookings',
      description: 'Track your trips and bookings',
      color: '#F59E0B',
      demoText: 'See all your active and completed trips'
    },
    {
      id: 'wallet',
      icon: DollarSign,
      title: 'Wallet',
      description: 'Manage your earnings and payments',
      color: '#8B5CF6',
      demoText: 'Check your balance and transaction history'
    },
    {
      id: 'settings',
      icon: Settings,
      title: 'Settings',
      description: 'Customize your app experience',
      color: '#6B7280',
      demoText: 'Adjust preferences and app settings'
    },
    {
      id: 'about',
      icon: Info,
      title: 'About',
      description: 'App information and support',
      color: '#EF4444',
      demoText: 'Get help and learn more about the app'
    }
  ];

  const handleFeaturePress = (feature: any) => {
    setHighlightedFeature(feature.id);
    onFeatureHighlight(feature.id);
    
    // Auto-clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedFeature(null);
    }, 3000);
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
            <Text style={styles.headerTitle}>🎭 Demo Mode</Text>
            <Text style={styles.headerSubtitle}>Explore App Features</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X color="#FFFFFF" size={24} />
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={styles.instructionText}>
            Tap on any feature below to see how it works:
          </Text>

          <View style={styles.menuGrid}>
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isHighlighted = highlightedFeature === item.id;
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.menuItem,
                    isHighlighted && styles.highlightedItem
                  ]}
                  onPress={() => handleFeaturePress(item)}
                >
                  <View style={[styles.iconContainer, { backgroundColor: `${item.color}15` }]}>
                    <IconComponent color={item.color} size={24} />
                  </View>
                  
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDescription}>{item.description}</Text>
                    
                    {isHighlighted && (
                      <View style={styles.demoIndicator}>
                        <CheckCircle color="#10B981" size={16} />
                        <Text style={styles.demoText}>{item.demoText}</Text>
                      </View>
                    )}
                  </View>
                  
                  <ArrowRight color="#9CA3AF" size={20} />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💡 This is a demo. In the real app, these features will be fully functional!
            </Text>
          </View>
        </View>
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
  menuGrid: {
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  highlightedItem: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
    borderWidth: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemDescription: {
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
