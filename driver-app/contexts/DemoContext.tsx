import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as SecureStore from '@/utils/secureStore';
import { Alert } from 'react-native';

interface DemoContextType {
  isDemoMode: boolean;
  isNewUser: boolean;
  showWelcomeScreen: boolean;
  startDemo: () => void;
  stopDemo: () => void;
  showWelcome: () => void;
  hideWelcome: () => void;
  simulateNotification: () => void;
  simulateMenuInteraction: () => void;
  simulateSettingsInteraction: () => void;
  showDemoAlert: (title: string, message: string) => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);

  // Check if user is new on app start
  useEffect(() => {
    checkIfNewUser();
  }, []);

  const checkIfNewUser = async () => {
    try {
      const hasSeenDemo = await SecureStore.getItemAsync('hasSeenDemo');
      const isFirstTime = !hasSeenDemo;
      setIsNewUser(isFirstTime);
      
      if (isFirstTime) {
        // Show welcome screen for new users
        setTimeout(() => {
          setShowWelcomeScreen(true);
        }, 1000); // Show welcome after 1 second
      }
    } catch (error) {
      console.error('❌ Error checking new user status:', error);
    }
  };

  const showWelcome = () => {
    setShowWelcomeScreen(true);
  };

  const hideWelcome = () => {
    setShowWelcomeScreen(false);
  };

  const startDemo = async () => {
    try {
      setIsDemoMode(true);
      setShowWelcomeScreen(false);
      await SecureStore.setItemAsync('hasSeenDemo', 'true');
      
      // Show welcome message
      showDemoAlert(
        '🎉 Welcome to Drop Cars!',
        'Let me show you around the app features...'
      );

      // Start demo sequence
      setTimeout(() => {
        simulateNotification();
      }, 3000);

      setTimeout(() => {
        simulateMenuInteraction();
      }, 6000);

      setTimeout(() => {
        simulateSettingsInteraction();
      }, 9000);

      // Auto-stop demo after 15 seconds
      setTimeout(() => {
        stopDemo();
      }, 15000);

    } catch (error) {
      console.error('❌ Error starting demo:', error);
    }
  };

  const stopDemo = () => {
    setIsDemoMode(false);
    showDemoAlert(
      '✅ Demo Complete!',
      'You\'re all set! Explore the app and enjoy using Drop Cars.'
    );
  };

  const simulateNotification = () => {
    if (!isDemoMode) return;
    
    showDemoAlert(
      '🔔 Notifications Demo',
      'This is how you\'ll receive important updates about your bookings, payments, and account status. You can toggle notifications in settings anytime!'
    );
  };

  const simulateMenuInteraction = () => {
    if (!isDemoMode) return;
    
    showDemoAlert(
      '📱 Menu Features Demo',
      'Here you can access your profile, view bookings, check your wallet balance, and manage settings. Everything you need is just a tap away!'
    );
  };

  const simulateSettingsInteraction = () => {
    if (!isDemoMode) return;
    
    showDemoAlert(
      '⚙️ Settings Demo',
      'In settings, you can manage notifications, update your profile, change preferences, and get help. Customize your experience!'
    );
  };

  const showDemoAlert = (title: string, message: string) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Got it!',
          style: 'default'
        }
      ],
      { cancelable: false }
    );
  };

  return (
    <DemoContext.Provider value={{
      isDemoMode,
      isNewUser,
      showWelcomeScreen,
      startDemo,
      stopDemo,
      showWelcome,
      hideWelcome,
      simulateNotification,
      simulateMenuInteraction,
      simulateSettingsInteraction,
      showDemoAlert,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}
