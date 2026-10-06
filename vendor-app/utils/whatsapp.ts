import { Linking, Platform } from 'react-native';

/**
 * Universal WhatsApp Helper for Vendor App
 * Supports both WhatsApp Regular and WhatsApp Business across Android, iOS, and Web.
 */

export interface WhatsAppShareOptions {
  phone?: string | null;
  message: string;
}

export const openWhatsApp = async ({ phone, message }: WhatsAppShareOptions): Promise<boolean> => {
  const encodedText = encodeURIComponent(message);
  
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

  const waMeUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
  const apiWaUrl = formattedPhone ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`;
  const deepLink = formattedPhone ? `whatsapp://send?phone=${formattedPhone}&text=${encodedText}` : `whatsapp://send?text=${encodedText}`;

  if (Platform.OS === 'web') {
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
  } catch {}

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
