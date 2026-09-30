import { Linking, Platform } from 'react-native';

/**
 * Universal WhatsApp Helper
 * 
 * Supports both WhatsApp Regular and WhatsApp Business across Android, iOS, and Web.
 * Uses direct universal api.whatsapp.com and wa.me schemes with multi-app fallback.
 */

export interface WhatsAppShareOptions {
  phone?: string | null;
  message: string;
}

export const openWhatsApp = async ({ phone, message }: WhatsAppShareOptions): Promise<boolean> => {
  const encodedText = encodeURIComponent(message);
  
  // Format phone number with country code (defaults to 91 for India if 10 digits)
  let formattedPhone = '';
  if (phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length === 10) {
      formattedPhone = `91${digits}`;
    } else if (digits.startsWith('0') && digits.length === 11) {
      formattedPhone = `91${digits.slice(1)}`;
    } else {
      formattedPhone = digits;
    }
  }

  // URL variants:
  // 1. Direct phone chat if number provided
  // 2. Broadcast / Share picker if phone is not provided (for sharing to driver groups)
  const waMeUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
  const apiWaUrl = formattedPhone ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`;
  const deepLink = formattedPhone ? `whatsapp://send?phone=${formattedPhone}&text=${encodedText}` : `whatsapp://send?text=${encodedText}`;

  if (Platform.OS === 'web') {
    // On web, api.whatsapp.com works universally and offers web/desktop/app chooser
    try {
      window.open(apiWaUrl, '_blank');
      return true;
    } catch {
      window.location.href = waMeUrl;
      return true;
    }
  }

  try {
    const canOpenDeep = await Linking.canOpenURL(deepLink);
    if (canOpenDeep) {
      await Linking.openURL(deepLink);
      return true;
    }
  } catch {
    // Fallback to web intents
  }

  try {
    const canOpenApi = await Linking.canOpenURL(apiWaUrl);
    if (canOpenApi) {
      await Linking.openURL(apiWaUrl);
      return true;
    }
  } catch {}

  try {
    await Linking.openURL(waMeUrl);
    return true;
  } catch (err) {
    console.error('Failed to launch WhatsApp:', err);
    return false;
  }
};
