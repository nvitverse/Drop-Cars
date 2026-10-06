export const validatePhoneNumber = (phone: string): boolean => {
  // Indian mobile number format: +919876543210 or 9876543210
  const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

export const validateAadharNumber = (aadhar: string): boolean => {
  // Exactly 12 digits
  const aadharRegex = /^\d{12}$/;
  return aadharRegex.test(aadhar);
};

export const validatePassword = (password: string): boolean => {
  // Minimum 6 characters
  return password.length >= 6;
};

export const validateFullName = (name: string): boolean => {
  // 3-100 characters
  return name.trim().length >= 3 && name.trim().length <= 100;
};

export const validateAddress = (address: string): boolean => {
  // Minimum 10 characters
  return address.trim().length >= 10;
};

export const validateFormData = (data: {
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  password: string;
  address: string;
  aadhar_number: string;
  gpay_number: string;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Validate full name
  if (!validateFullName(data.full_name)) {
    errors.push('Full name must be between 3 and 100 characters');
  }

  // Validate primary number
  if (!validatePhoneNumber(data.primary_number)) {
    errors.push('Primary number must be a valid Indian mobile number');
  }

  // Validate secondary number (optional)
  if (data.secondary_number && !validatePhoneNumber(data.secondary_number)) {
    errors.push('Secondary number must be a valid Indian mobile number');
  }

  // Validate password
  if (!validatePassword(data.password)) {
    errors.push('Password must be at least 6 characters long');
  }

  // Validate address
  if (!validateAddress(data.address)) {
    errors.push('Address must be at least 10 characters long');
  }

  // Validate aadhar number
  if (!validateAadharNumber(data.aadhar_number)) {
    errors.push('Aadhar number must be exactly 12 digits');
  }

  // Validate GPay number
  if (!validatePhoneNumber(data.gpay_number)) {
    errors.push('GPay number must be a valid Indian mobile number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
