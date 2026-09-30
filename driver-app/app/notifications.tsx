import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useCallback } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowLeft, Bell, Check, Trash2, CheckCheck } from 'lucide-react-native';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';

interface NotificationItem {
  id: number;
  title: string;
  body: string;
  event_key: string | null;
  action_required: boolean;
  is_read: boolean;
  related_order_id: number | null;
  created_at: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const FILTERS: { key: 'all' | 'unread' | 'action_required'; label: string }[] = [
    { key: 'all', label: t('notifications.filterAll') },
    { key: 'unread', label: t('notifications.filterUnread') },
    { key: 'action_required', label: t('notifications.filterActionRequired') },
  ];
  const [filter, setFilter] = useState<'all' | 'unread' | 'action_required'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fetchNotifications = useCallback(async (f: string) => {
    try {
      const response = await axiosInstance.get(`/api/notifications/log?filter=${f}`);
      setItems(response.data || []);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNotifications(filter);
    }, [filter, fetchNotifications])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(filter);
  };

  const markRead = async (id: number) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await axiosInstance.patch(`/api/notifications/log/${id}/read`);
    } catch (error) {
      console.error('Failed to mark notification read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await axiosInstance.patch('/api/notifications/log/mark-all-read');
      fetchNotifications(filter);
    } catch (error) {
      console.error('Failed to mark all read:', error);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    Alert.alert(
      t('notifications.deleteNotificationsTitle'),
      t('notifications.deleteNotificationsBody', { count: selectedIds.length }),
      [
        { text: t('notifications.cancel'), style: 'cancel' },
        {
          text: t('notifications.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await axiosInstance.post('/api/notifications/log/bulk-delete', { ids: selectedIds });
              setSelectMode(false);
              setSelectedIds([]);
              fetchNotifications(filter);
            } catch (error) {
              console.error('Failed to bulk delete:', error);
            }
          },
        },
      ]
    );
  };

  const deleteOne = async (id: number) => {
    try {
      await axiosInstance.delete(`/api/notifications/log/${id}`);
      setItems(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
      });
    } catch {
      return '';
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { fontSize: 19, fontFamily: 'Inter-Bold', color: colors.text, flex: 1 },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.border },
    filterTabActive: { backgroundColor: colors.primary },
    filterText: { fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: colors.textSecondary },
    filterTextActive: { color: '#fff' },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
    actionText: { fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: colors.primary },
    card: {
      backgroundColor: colors.surface, borderRadius: 6, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 10,
    },
    cardUnread: { borderColor: colors.primary },
    cardTitle: { fontSize: 14.5, fontFamily: 'Inter-SemiBold', color: colors.text },
    cardBody: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
    cardTime: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FEE2E2', marginTop: 6 },
    badgeText: { fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: '#DC2626' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 60, fontSize: 13 },
    checkbox: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', marginRight: 2,
    },
    checkboxChecked: { backgroundColor: colors.primary },
  });

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[styles.card, !item.is_read && styles.cardUnread]}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
        } else if (!item.is_read) {
          markRead(item.id);
        }
      }}
      onLongPress={() => {
        setSelectMode(true);
        toggleSelect(item.id);
      }}
    >
      {selectMode && (
        <View style={[styles.checkbox, selectedIds.includes(item.id) && styles.checkboxChecked]}>
          {selectedIds.includes(item.id) && <Check size={13} color="#fff" />}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardBody}>{item.body}</Text>
        {item.action_required && (
          <View style={styles.badge}><Text style={styles.badgeText}>{t('notifications.filterActionRequired')}</Text></View>
        )}
        <Text style={styles.cardTime}>{formatTime(item.created_at)}</Text>
      </View>
      {!selectMode && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          {!item.is_read && <View style={styles.unreadDot} />}
          <TouchableOpacity onPress={() => deleteOne(item.id)} style={{ padding: 4 }}>
            <Trash2 size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={{ padding: 4 }}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Bell size={18} color={colors.primary} />
        <Text style={styles.title}>{t('notifications.headerTitle')}</Text>
        {selectMode ? (
          <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedIds([]); }}>
            <Text style={styles.actionText}>{t('notifications.cancel')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={markAllRead}>
            <CheckCheck size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectMode && selectedIds.length > 0 && (
        <View style={styles.actionsRow}>
          <Text style={styles.actionText}>{t('notifications.selected', { count: selectedIds.length })}</Text>
          <TouchableOpacity onPress={deleteSelected}>
            <Text style={[styles.actionText, { color: '#DC2626' }]}>{t('notifications.deleteSelected')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('notifications.empty')}</Text>}
        />
      )}
    </SafeAreaView>
  );
}
