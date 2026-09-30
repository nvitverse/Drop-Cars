import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Lock, User, ShieldCheck, Eye, EyeOff, Sparkles, ShieldAlert } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Track only the keyboard height - deliberately NOT which field is focused. Re-rendering the inputs' ancestors on focus, or wrapping the form
  // in a KeyboardAvoidingView, made the Android (new architecture, edge-to-edge) view tree re-parent while the keyboard opened, which closed the
  // keyboard (and on some phones the whole app). The form itself never changes on focus; the scroll area just gets bottom padding while typing.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e?.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      await apiService.login({ username: username.trim(), password });
      router.replace('/(tabs)');
    } catch (error: any) {
      const errorMessage = error?.message || 'Invalid credentials. Please try again.';
      Alert.alert('Login Failed', errorMessage);
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0F172A', '#1E1B4B', '#312E81']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Decorative Ambient Glow Orbs */}
      <View style={styles.topGlow} pointerEvents="none" />
      <View style={styles.bottomGlow} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: keyboardHeight }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.cardContainer}>
              {/* Brand Header */}
              <View style={styles.header}>
                <View style={styles.badgeRow}>
                  <View style={styles.pillBadge}>
                    <Sparkles size={12} color="#A5B4FC" />
                    <Text style={styles.pillBadgeText}>ADMIN PORTAL</Text>
                  </View>
                </View>

                <View style={styles.brandBadgeOuter}>
                  <LinearGradient
                    colors={['rgba(99, 102, 241, 0.4)', 'rgba(165, 180, 252, 0.1)']}
                    style={styles.brandBadge}
                  >
                    <ShieldCheck size={32} color="#A5B4FC" />
                  </LinearGradient>
                </View>

                <Text style={styles.title}>Drop Cars</Text>
                <Text style={styles.subtitle}>Sign in to the admin control panel</Text>
              </View>

              {/* Main Login Card */}
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Username</Text>
                  <View
                    style={styles.inputContainer}
                  >
                    <User
                      size={20}
                      color={colors.textSecondary}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter your username"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View
                    style={styles.inputContainer}
                  >
                    <Lock
                      size={20}
                      color={colors.textSecondary}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter your password"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#94A3B8"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff
                          size={20}
                          color={colors.textSecondary}
                        />
                      ) : (
                        <Eye
                          size={20}
                          color={colors.textSecondary}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={loading ? ['#6366F1', '#4F46E5'] : ['#4F46E5', '#3730A3']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.loginButtonText}>Authenticating...</Text>
                      </View>
                    ) : (
                      <Text style={styles.loginButtonText}>Sign In</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Security Footer */}
              <View style={styles.footer}>
                <View style={styles.securityRow}>
                  <ShieldAlert size={14} color="rgba(255,255,255,0.65)" />
                  <Text style={styles.footerText}>Protected by 256-bit SSL Encryption</Text>
                </View>
                <Text style={styles.subFooterText}>
                  Contact system administrator if you need access
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: -80,
    left: '25%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -80,
    right: '25%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 440,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  badgeRow: {
    marginBottom: 16,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(165, 180, 252, 0.3)',
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E0E7FF',
    letterSpacing: 1.1,
  },
  brandBadgeOuter: {
    padding: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
  },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  // Only colours change on focus. Adding shadow/elevation here made Android
  // (new architecture) un-flatten and re-parent the input's ancestor views on
  // every focus change, which stole focus and closed the keyboard.
  inputContainerFocused: {
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
  },

  textInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loginButtonDisabled: {
    opacity: 0.8,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    marginTop: 26,
    alignItems: 'center',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  subFooterText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});
