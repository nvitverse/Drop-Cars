import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentApiBaseUrl } from '@/config/environment';

// The office phone / e-mail come from ONE place: the platform settings `support_phone` / `support_email` (Admin editable), served by
// GET /api/public/support-contact. The last answer is remembered on the phone; the built-in value below is only the office's real number
// for the very first launch with no internet - never a placeholder.
export interface SupportContact {
  phone: string;       // as written, e.g. "+91 72002 17986"
  phone_dial: string;  // "+917200217986"
  email: string;
  whatsapp: string;    // digits only, "" when unknown
}

const CACHE_KEY = 'support_contact_v1';
const BUILT_IN: SupportContact = { phone: '+91 72002 17986', phone_dial: '+917200217986', email: 'support@dropcars.com', whatsapp: '917200217986' };

export async function loadSupportContact(): Promise<SupportContact> {
  try {
    const res = await fetch(`${getCurrentApiBaseUrl()}/api/public/support-contact`);
    if (res.ok) {
      const d = await res.json();
      if (d && d.phone) {
        const c: SupportContact = { phone: String(d.phone), phone_dial: String(d.phone_dial || ''), email: String(d.email || ''), whatsapp: String(d.whatsapp || '') };
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(c)).catch(() => {});
        return c;
      }
    }
  } catch {
    // offline: fall through to the remembered value
  }
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) return { ...BUILT_IN, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return BUILT_IN;
}

export function useSupportContact() {
  const [contact, setContact] = useState<SupportContact>(BUILT_IN);
  useEffect(() => {
    let alive = true;
    loadSupportContact().then((c) => { if (alive) setContact(c); });
    return () => { alive = false; };
  }, []);

  const call = useCallback(() => { if (contact.phone_dial) Linking.openURL(`tel:${contact.phone_dial}`).catch(() => {}); }, [contact]);
  const whatsapp = useCallback((text?: string) => {
    const n = contact.whatsapp || contact.phone_dial.replace(/\D/g, '');
    if (!n) return;
    Linking.openURL(`https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`).catch(() => {});
  }, [contact]);
  const mail = useCallback((subject?: string) => {
    if (contact.email) Linking.openURL(`mailto:${contact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`).catch(() => {});
  }, [contact]);

  return { contact, call, whatsapp, mail, isWeb: Platform.OS === 'web' };
}
