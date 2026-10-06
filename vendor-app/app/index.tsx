import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Car } from 'lucide-react-native';
import LanguageSelectScreen, { HAS_SEEN_LANGUAGE_SELECT_KEY } from '@/components/LanguageSelectScreen';

export default function Index() {
  // Shown once, on the very first launch, before the normal auth-check
  // redirect below runs. Skippable - either path (pick a language or Skip)
  // marks HAS_SEEN_LANGUAGE_SELECT_KEY and falls through to checkAuthStatus.
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);

  useEffect(() => {
    checkLanguageSelection();
  }, []);

  const checkLanguageSelection = async () => {
    try {
      const seen = await AsyncStorage.getItem(HAS_SEEN_LANGUAGE_SELECT_KEY);
      if (seen) {
        checkAuthStatus();
      } else {
        setShowLanguageSelect(true);
      }
    } catch {
      checkAuthStatus();
    }
  };

  const handleLanguageSelectDone = () => {
    setShowLanguageSelect(false);
    checkAuthStatus();
  };

  const checkAuthStatus = async () => {
    try {
      const userSession = await AsyncStorage.getItem('accessToken');
      if (userSession) {
        const session = true;
        console.log("Session:", session);
        if (session) {
          console.log("Check Login")
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/sign-in');
        }
      } else {
        router.replace('/(auth)/sign-in');
      }
    } catch (error) {
      router.replace('/(auth)/sign-in');
    }
  };

  if (showLanguageSelect) {
    return <LanguageSelectScreen onDone={handleLanguageSelectDone} />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#3B82F6', '#1D4ED8']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Car size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>Drop Cars</Text>
            <Text style={styles.appSubtitle}>Vendor Portal</Text>
          </View>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 18,
    color: '#E5E7EB',
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 16,
    color: '#E5E7EB',
    fontWeight: '500',
  },
});