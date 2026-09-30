import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContextType, User } from '@/types/auth';
import axiosInstance from '../app/api/axiosInstance';
import { LoadingScreen } from '@/components/LoadingScreen';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Real backend (FastAPI, app/api/routes/customer.py) only supports
// primary_number + password signup/signin - no email login, no OTP, no
// Google. Those other auth modes are UI-only placeholders until the backend
// grows those flows; they intentionally always return success:false here
// instead of faking a session, since a fake session used to let you "log in"
// as a customer that doesn't exist and then silently fail on every real
// screen (My Trips, ratings, etc) that needs a genuine backend-issued token.
const UNAVAILABLE_MESSAGE = 'This login method isn’t connected yet. Please use Mobile Number login with your password.';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks only the one-time initial session lookup on app start (reading
  // AsyncStorage for a saved user), as distinct from `isLoading`, which also
  // toggles during every subsequent login/signup call and drives per-form
  // spinners. Only this initial resolution should block the whole app behind
  // the splash-style LoadingScreen.
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string>('');

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const [userData, token] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('token'),
      ]);
      // Only restore the session if we have BOTH the cached profile and a
      // real token - a leftover 'user' entry with no token would mean every
      // authenticated API call silently 401s.
      if (userData && token) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsLoading(false);
      setIsInitializing(false);
    }
  };

  const saveUserSession = async (userObj: User) => {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(userObj));
      setUser(userObj);
    } catch (e) {
      console.error('Error saving user session:', e);
    }
  };

  // Persists the real JWT issued by /api/customer/signin|signup so
  // axiosInstance's request interceptor can attach it as `Authorization:
  // Bearer <token>` on every subsequent call (My Trips, ratings, etc).
  const saveSession = async (accessToken: string, userObj: User) => {
    try {
      await AsyncStorage.setItem('token', accessToken);
      await AsyncStorage.setItem('user', JSON.stringify(userObj));
      setUser(userObj);
    } catch (e) {
      console.error('Error saving session:', e);
    }
  };

  const customerFromApi = (c: { id: string; full_name: string; primary_number: string; email?: string | null; created_at: string }): User => ({
    id: c.id,
    phone: c.primary_number,
    email: c.email || undefined,
    name: c.full_name,
    type: 'customer',
    isVerified: true,
    createdAt: c.created_at,
  });

  // Pulls a readable message out of a FastAPI error response, whether it's a
  // plain `{detail: "..."}` string or a Pydantic validation array.
  const extractApiError = (error: any, fallback: string): string => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') {
      if (detail === 'NOT_REGISTERED') return 'No account found for this mobile number. Please create an account first.';
      return detail;
    }
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    if (error?.message === 'Network Error') return 'Could not reach the server. Check your connection and try again.';
    return fallback;
  };

  // --- Real Mobile Number + Password Login (backend: POST /api/customer/signin) ---
  const loginWithMobile = async (phone: string, password?: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.post('/api/customer/signin', {
        primary_number: phone,
        password: password || '',
      });
      const { access_token, customer } = response.data;
      await saveSession(access_token, customerFromApi(customer));
      return { success: true, message: 'Logged in successfully' };
    } catch (error: any) {
      return { success: false, message: extractApiError(error, 'Login failed. Please try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  // --- Real Mobile Number Signup (backend: POST /api/customer/signup) ---
  const signupWithMobile = async (phone: string, fullName: string, password: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.post('/api/customer/signup', {
        full_name: fullName,
        primary_number: phone,
        password,
      });
      const { access_token, customer } = response.data;
      await saveSession(access_token, customerFromApi(customer));
      return { success: true, message: 'Account created successfully' };
    } catch (error: any) {
      return { success: false, message: extractApiError(error, 'Registration failed. Please try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  // Email, OTP, and Google login are not wired to any real backend endpoint
  // (the backend only has phone+password signin/signup). These used to fake
  // a successful login with a made-up user, which meant "My Trips" and
  // ratings would silently fail for anyone who used them. They now report
  // honestly instead so the UI can point people at Mobile Number login.
  const loginWithEmail = async (_email: string, _password?: string): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  };

  const sendEmailOtp = async (email: string, _name?: string): Promise<{ success: boolean; message: string }> => {
    setPendingEmail(email);
    return { success: false, message: UNAVAILABLE_MESSAGE };
  };

  const verifyEmailOtp = async (_otp: string): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  };

  const registerWithEmail = async (_password: string, _name: string, _phone: string): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  };

  const loginWithGoogle = async (_googleEmail?: string, _googleName?: string): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  };

  // --- Real Firebase-backed login (Google Sign-In + Phone OTP both land
  // here, since both mint a Firebase ID token - see utils/firebaseClient.ts
  // and utils/phoneAuth.ts). Posts to the backend's
  // POST /api/auth/firebase/verify, which verifies the token server-side
  // via firebase_admin and returns the same {access_token, customer} shape
  // /api/customer/signin already does - so this reuses saveSession/
  // customerFromApi exactly like the real mobile+password flow above,
  // rather than duplicating session-handling logic. ---
  const loginWithFirebaseToken = async (idToken: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.post('/api/auth/firebase/verify', { id_token: idToken });
      const { access_token, customer } = response.data;
      await saveSession(access_token, customerFromApi(customer));
      return { success: true, message: 'Logged in successfully' };
    } catch (error: any) {
      return { success: false, message: extractApiError(error, 'Sign-in failed. Please try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  // Legacy MPIN / Phone login
  const login = async (phone: string, mpin: string, userType: 'customer' | 'vendor' | 'driver' = 'customer'): Promise<boolean> => {
    setIsLoading(true);
    try {
      const testUser: User = {
        id: Date.now().toString(),
        phone,
        name: userType === 'driver' ? 'Mike Driver' : 'Customer User',
        type: userType,
        isVerified: true,
        createdAt: new Date().toISOString()
      };
      await saveUserSession(testUser);
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (phone: string, name: string, mpin: string, userType: 'customer' | 'vendor' | 'driver' = 'customer'): Promise<boolean> => {
    setIsLoading(true);
    try {
      const newUser: User = {
        id: Date.now().toString(),
        phone,
        name,
        type: userType,
        isVerified: true,
        createdAt: new Date().toISOString()
      };
      await saveUserSession(newUser);
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['user', 'token']);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        loginWithEmail,
        sendEmailOtp,
        verifyEmailOtp,
        registerWithEmail,
        loginWithGoogle,
        loginWithFirebaseToken,
        loginWithMobile,
        signupWithMobile,
        logout,
        isLoading
      }}
    >
      {isInitializing ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}