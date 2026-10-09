import { Linking, Platform } from 'react-native';

/**
 * One way to open WhatsApp from every screen.
 *
 * Why this exists: an https link (wa.me / api.whatsapp.com) is claimed by the regular WhatsApp on Android, so a phone that has WhatsApp Business
 * (or both) always landed in WhatsApp and Business never opened. The `whatsapp://send` link is handled by BOTH apps, so Android shows its own
 * "Open with" chooser (WhatsApp / WhatsApp Business) when both are installed and opens the app directly when only one is.
 * We do not use canOpenURL first: on Android 11+ it answers "false" for apps the manifest did not list, which is what sent people to the https link.
 */
export interface WhatsAppShareOptions {
  phone?: string | null;
  message: string;
}

const cleanPhone = (phone?: string | null): string => {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
};

/** Takes any wa.me / api.whatsapp.com / whatsapp:// link and opens it so that WhatsApp AND WhatsApp Business can both answer. */
export const openWaUrl = async (url: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    try { window.open(url, '_blank'); return true; } catch { window.location.href = url; return true; }
  }
  let deep = url;
  try {
    const m = url.match(/^https?:\/\/(?:wa\.me\/(\d*)|api\.whatsapp\.com\/send)(?:\?(.*))?$/i);
    if (m) {
      const query = m[2] || '';
      const phone = m[1] || (query.match(/(?:^|&)phone=(\d+)/)?.[1] ?? '');
      const text = query.match(/(?:^|&)text=([^&]*)/)?.[1];
      deep = `whatsapp://send?${phone ? `phone=${phone}` : ''}${phone && text ? '&' : ''}${text ? `text=${text}` : ''}`;
    }
  } catch { deep = url; }
  if (deep.startsWith('whatsapp://')) {
    try { await Linking.openURL(deep); return true; } catch { /* no WhatsApp app answered - fall back to the web link below */ }
  }
  try { await Linking.openURL(url.startsWith('whatsapp://') ? url.replace('whatsapp://send', 'https://api.whatsapp.com/send') : url); return true; }
  catch (err) { console.error('Failed to launch WhatsApp:', err); return false; }
};

export const openWhatsApp = async ({ phone, message }: WhatsAppShareOptions): Promise<boolean> => {
  const p = cleanPhone(phone);
  const text = encodeURIComponent(message || '');
  return openWaUrl(p ? `https://wa.me/${p}?text=${text}` : `https://wa.me/?text=${text}`);
};
