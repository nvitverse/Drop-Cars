import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Megaphone, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';

const DISMISSED_KEY = 'dismissed_announcement_ids';

interface Announcement {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

// Admin -> driver broadcast, shown once per announcement when the driver
// opens the app (dashboard mount). Dismissed IDs are remembered locally so
// the same announcement doesn't keep popping up every open.
export default function AnnouncementModal() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [queue, setQueue] = useState<Announcement[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [res, dismissedRaw] = await Promise.all([
          axiosInstance.get('/api/announcements/active'),
          AsyncStorage.getItem(DISMISSED_KEY),
        ]);
        const dismissed: number[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
        const pending = (res.data || []).filter((a: Announcement) => !dismissed.includes(a.id));
        setQueue(pending);
      } catch {
        // Silent - announcements are non-critical, never block the dashboard
      }
    })();
  }, []);

  const dismissCurrent = async () => {
    const current = queue[0];
    if (!current) return;
    setQueue((prev) => prev.slice(1));
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      const dismissed: number[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, current.id]));
    } catch {
      // Non-critical - worst case it shows again next open
    }
  };

  const current = queue[0];
  if (!current) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissCurrent}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 20, maxHeight: '70%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Megaphone color={colors.primary} size={22} />
            <Text style={{ flex: 1, fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text }}>
              {current.title}
            </Text>
            <TouchableOpacity onPress={dismissCurrent} style={{ padding: 4 }}>
              <X color={colors.textSecondary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }}>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>{current.body}</Text>
          </ScrollView>
          <TouchableOpacity
            onPress={dismissCurrent}
            style={{ backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
              {queue.length > 1 ? t('announcementModal.gotItMore', { count: queue.length - 1 }) : t('announcementModal.gotIt')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
