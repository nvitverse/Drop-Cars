import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Megaphone, Plus, Trash2 } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  active: boolean;
  created_at: string;
  expires_at: string | null;
}

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const load = async () => {
    try {
      const data = await apiService.getAnnouncements();
      setItems(data || []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Error', 'Title and message are both required');
      return;
    }
    setCreating(true);
    try {
      await apiService.createAnnouncement({ title: title.trim(), body: body.trim(), active: true });
      setTitle('');
      setBody('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create announcement');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (item: AnnouncementRow) => {
    setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, active: !a.active } : a)));
    try {
      await apiService.updateAnnouncement(item.id, { active: !item.active });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update announcement');
      load();
    }
  };

  const handleDelete = (item: AnnouncementRow) => {
    Alert.alert('Delete announcement?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.deleteAnnouncement(item.id);
            setItems((prev) => prev.filter((a) => a.id !== item.id));
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete announcement');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Announcements ({items.length})</Text>
        <ThemeToggle size={20} />
      </View>

      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
        Shown to every driver when they open the Driver App. Turn one off instead of deleting it if
        you might reuse it.
      </Text>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="Title"
          placeholderTextColor={themeColors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="Message"
          placeholderTextColor={themeColors.textMuted}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={3}
        />
        <TouchableOpacity
          style={[styles.createBtn, creating && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? <ActivityIndicator size="small" color="white" /> : (
            <>
              <Plus size={16} color="white" />
              <Text style={styles.createBtnText}>Post Announcement</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Megaphone size={18} color={item.active ? '#10B981' : themeColors.textMuted} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: themeColors.text }]}>{item.title}</Text>
              <Text style={[styles.rowBody, { color: themeColors.textSecondary }]}>{item.body}</Text>
              <Text style={[styles.rowDate, { color: themeColors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <Switch
              value={item.active}
              onValueChange={() => toggleActive(item)}
              trackColor={{ false: isDark ? '#334155' : '#E5E7EB', true: '#3B82F6' }}
            />
            <TouchableOpacity onPress={() => handleDelete(item)} style={{ padding: 6 }} accessibilityLabel="Delete announcement">
              <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No announcements yet</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingTop: 12, lineHeight: 17 },
  form: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { textAlignVertical: 'top', minHeight: 70 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 12,
  },
  createBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowDate: { fontSize: 11, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 13 },
});
