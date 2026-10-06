import { validateFormData } from '../utils/validation';
import { getVendorSignupUrl, getVendorSigninUrl } from '../config/api';

// Test data
const validVendorData = {
  full_name: "Test Vendor",
  primary_number: "+919876543210",
  secondary_number: "+919876543211",
  password: "test123",
  address: "Test Address, Test City, Test State 123456",
  aadhar_number: "123456789012",
  gpay_number: "+919876543212",
};

const invalidVendorData = {
  full_name: "T", // Too short
  primary_number: "123", // Invalid phone
  secondary_number: "456", // Invalid phone
  password: "123", // Too short
  address: "Short", // Too short
  aadhar_number: "123", // Too short
  gpay_number: "789", // Invalid phone
};

describe('Vendor API Integration Tests', () => {
  describe('API Configuration', () => {
    test('should generate correct signup URL', () => {
      const signupUrl = getVendorSignupUrl();
      expect(signupUrl).toContain('/api/users/vendor/signup');
    });

    test('should generate correct signin URL', () => {
      const signinUrl = getVendorSigninUrl();
      expect(signinUrl).toContain('/api/users/vendor/signin');
    });
  });

  describe('Form Validation', () => {
    test('should validate correct vendor data', () => {
      const result = validateFormData(validVendorData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid vendor data', () => {
      const result = validateFormData(invalidVendorData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate full name length', () => {
      const dataWithShortName = { ...validVendorData, full_name: "AB" };
      const result = validateFormData(dataWithShortName);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Full name'))).toBe(true);
    });

    test('should validate phone number format', () => {
      const dataWithInvalidPhone = { ...validVendorData, primary_number: "1234567890" };
      const result = validateFormData(dataWithInvalidPhone);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Primary number'))).toBe(true);
    });

    test('should validate aadhar number length', () => {
      const dataWithInvalidAadhar = { ...validVendorData, aadhar_number: "123456789" };
      const result = validateFormData(dataWithInvalidAadhar);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Aadhar number'))).toBe(true);
    });

    test('should validate address length', () => {
      const dataWithShortAddress = { ...validVendorData, address: "Short" };
      const result = validateFormData(dataWithShortAddress);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Address'))).toBe(true);
    });

    test('should validate password length', () => {
      const dataWithShortPassword = { ...validVendorData, password: "123" };
      const result = validateFormData(dataWithShortPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Password'))).toBe(true);
    });
  });

  describe('Phone Number Validation', () => {
    test('should accept valid Indian mobile numbers', () => {
      const validNumbers = [
        "+919876543210",
        "9876543210",
        "+918765432109",
        "8765432109"
      ];
      
      validNumbers.forEach(number => {
        const data = { ...validVendorData, primary_number: number };
        const result = validateFormData(data);
        expect(result.isValid).toBe(true);
      });
    });

    test('should reject invalid phone numbers', () => {
      const invalidNumbers = [
        "1234567890", // Doesn't start with 6-9
        "123456789", // Too short
        "12345678901", // Too long
        "abcdefghij", // Non-numeric
        "+91123456789" // Invalid format
      ];
      
      invalidNumbers.forEach(number => {
        const data = { ...validVendorData, primary_number: number };
        const result = validateFormData(data);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Aadhar Number Validation', () => {
    test('should accept valid 12-digit aadhar numbers', () => {
      const validAadhar = "123456789012";
      const data = { ...validVendorData, aadhar_number: validAadhar };
      const result = validateFormData(data);
      expect(result.isValid).toBe(true);
    });

    test('should reject invalid aadhar numbers', () => {
      const invalidAadharNumbers = [
        "12345678901", // 11 digits
        "1234567890123", // 13 digits
        "12345678901a", // Contains letter
        "12345678901 ", // Contains space
        "" // Empty
      ];
      
      invalidAadharNumbers.forEach(aadhar => {
        const data = { ...validVendorData, aadhar_number: aadhar };
        const result = validateFormData(data);
        expect(result.isValid).toBe(false);
      });
    });
  });
});
