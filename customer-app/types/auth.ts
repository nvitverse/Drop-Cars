export interface User {
  id: string;
  phone: string;
  email?: string;
  name: string;
  type: 'customer' | 'vendor' | 'driver';
  isVerified: boolean;
  createdAt: string;
}

export interface AuthContextType {
  user: User | null;
  login: (phone: string, mpin: string, userType?: 'customer' | 'vendor' | 'driver') => Promise<boolean>;
  signup: (phone: string, name: string, mpin: string, userType?: 'customer' | 'vendor' | 'driver') => Promise<boolean>;
  loginWithEmail: (email: string, password?: string) => Promise<{ success: boolean; message: string }>;
  sendEmailOtp: (email: string, name?: string) => Promise<{ success: boolean; message: string }>;
  verifyEmailOtp: (otp: string) => Promise<{ success: boolean; message: string }>;
  registerWithEmail: (password: string, name: string, phone: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: (googleEmail?: string, googleName?: string) => Promise<{ success: boolean; message: string }>;
  // Real Firebase-backed login (POST /api/auth/firebase/verify) - both
  // Google Sign-In and Phone OTP (see utils/firebaseClient.ts,
  // utils/phoneAuth.ts) call this with the resulting Firebase ID token.
  loginWithFirebaseToken: (idToken: string) => Promise<{ success: boolean; message: string }>;
  // Real backend-backed mobile auth (POST /api/customer/signin|signup).
  // Second param is the account password, not an OTP code.
  loginWithMobile: (phone: string, password?: string) => Promise<{ success: boolean; message: string }>;
  signupWithMobile: (phone: string, fullName: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  isLoading: boolean;
}