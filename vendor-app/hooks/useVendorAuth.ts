import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getVendorSignupUrl, getVendorSigninUrl, API_CONFIG } from '../config/api';
import { appendFileToFormData } from '../utils/formDataFile';

// Types based on the API documentation
export interface VendorSignUpData {
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  password: string;
  address: string;
  pincode: string; // Changed back to string
  city: string;
  aadhar_number: string;
  gpay_number: string;
  organization_id?: string;
  aadhar_image?: string;
}

export interface VendorSignInData {
  primary_number: string;
  password: string;
}

export interface Vendor {
  id: string;
  organization_id?: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  gpay_number: string;
  wallet_balance: number;
  aadhar_number: string;
  aadhar_front_img?: string;
  address: string;
  pincode: string; // Changed back to string
  city: string;
  account_status: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  vendor: Vendor;
}

export const useVendorAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = async (data: VendorSignUpData): Promise<AuthResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      // Create FormData for multipart/form-data
      const formData = new FormData();
      
      // Add all text fields
      formData.append('full_name', data.full_name);
      formData.append('primary_number', data.primary_number);
      if (data.secondary_number) {
        formData.append('secondary_number', data.secondary_number);
      }
      formData.append('password', data.password);
      formData.append('address', data.address);
      formData.append('pincode', data.pincode); // No conversion needed since it's string
      formData.append('city', data.city);
      formData.append('aadhar_number', data.aadhar_number);
      formData.append('gpay_number', data.gpay_number);
      if (data.organization_id) {
        formData.append('organization_id', data.organization_id);
      }
      if (data.aadhar_image) {
        // Uses appendFileToFormData so this actually uploads a real file on
        // web instead of the literal string "[object Object]" (see that
        // function's comment for why).
        await appendFileToFormData(formData, 'aadhar_image', data.aadhar_image, `aadhar_${Date.now()}.jpg`, 'image/jpeg');
      }

      // Don't set Content-Type manually - fetch() must generate its own
      // multipart boundary from the FormData body, or the upload fails with
      // a 400 "Missing boundary in multipart" error.
      const response = await fetch(getVendorSignupUrl(), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        Alert.alert('Sign up Failed', errorData.detail || 'Please check your details and try again.');
        throw new Error(errorData.detail || 'Signup failed');
      }

      const result: AuthResponse = await response.json();
      
      // Store the token and user data
      await AsyncStorage.setItem('accessToken', result.access_token);
      await AsyncStorage.setItem('vendorData', JSON.stringify(result.vendor));
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (data: VendorSignInData, roleMode: string = 'VENDOR'): Promise<AuthResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getVendorSigninUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Not registered yet - offer a one-tap way to create the account
        // instead of a dead-end "invalid credentials" message.
        if (response.status === 404 && errorData.detail === 'NOT_REGISTERED') {
          Alert.alert(
            'Account Not Found',
            `This phone number isn't registered yet as a ${roleMode === 'B2B' ? 'B2B Partner' : 'vendor'}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: roleMode === 'B2B' ? 'Register as B2B Partner' : 'Create Account', onPress: () => router.push({ pathname: '/sign-up', params: { role: roleMode } }) },
            ]
          );
          throw new Error('NOT_REGISTERED');
        }

        Alert.alert(
          'Sign in Failed',
          response.status === 401
            ? 'Incorrect password. Please try again.'
            : (errorData.detail || 'Please check your credentials and try again.')
        );
        throw new Error(errorData.detail || 'Signin failed');
      }

      const result: AuthResponse = await response.json();
      
      // Store the token and user data
      await AsyncStorage.setItem('accessToken', result.access_token);
      await AsyncStorage.setItem('vendorData', JSON.stringify(result.vendor));
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signin failed';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('vendorData');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const getStoredToken = async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem('accessToken');
    } catch (err) {
      return null;
    }
  };

  const getStoredVendorData = async (): Promise<Vendor | null> => {
    try {
      const data = await AsyncStorage.getItem('vendorData');
      return data ? JSON.parse(data) : null;
    } catch (err) {
      return null;
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    signUp,
    signIn,
    signOut,
    getStoredToken,
    getStoredVendorData,
    loading,
    error,
    clearError,
  };
};