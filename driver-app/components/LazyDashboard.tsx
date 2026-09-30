import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';

interface LazyDashboardProps {
  children: React.ReactNode;
  autoLoad?: boolean;
  delay?: number;
}

export default function LazyDashboard({ 
  children, 
  autoLoad = false, 
  delay = 100 
}: LazyDashboardProps) {
  const { colors } = useTheme();
  const { fetchData, loading } = useDashboard();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (autoLoad) {
      // Add small delay to prevent blocking UI
      const timer = setTimeout(async () => {
        try {
          await fetchData();
        } catch (error) {
          console.error('Lazy dashboard load failed:', error);
        } finally {
          setIsReady(true);
        }
      }, delay);

      return () => clearTimeout(timer);
    } else {
      setIsReady(true);
    }
  }, [autoLoad, delay, fetchData]);

  if (!isReady || loading) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: colors.background 
      }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ 
          marginTop: 12, 
          color: colors.textSecondary,
          fontSize: 16 
        }}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
