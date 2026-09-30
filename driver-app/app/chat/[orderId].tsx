import { setForegroundInterval } from '@/utils/foregroundInterval';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Send, Zap, CheckCircle, Clock, X, MessageCircle, ArrowRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import axiosDriver from '@/app/api/axiosDriver';
import { formatBookingId } from '@/utils/format';
import { vehicleRequestService, useVehicleRequest } from '@/services/vehicle/vehicleRequestService';

interface Msg {
  id: number;
  side: string;
  mine: boolean;
  sender_name?: string;
  text: string;
  created_at: string;
  quick_key?: string | null;
}

interface Chip {
  key: string;
  label: string;
  text?: string;
}

export default function ChatScreen() {
  const { orderId, type, carType, carName } = useLocalSearchParams<{
    orderId: string;
    type?: string;
    carType?: string;
    carName?: string;
  }>();

  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const vehicleReq = useVehicleRequest(orderId);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [menu, setMenu] = useState<Chip[]>([]);
  const [suggestions, setSuggestions] = useState<Chip[]>([]);
  const [text, setText] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(true);

  const lastId = useRef(0);
  const listRef = useRef<FlatList<Msg>>(null);

  const chatStorageKey = `@chat_messages_order_${orderId}`;

  // Load saved local messages for this order
  const loadLocalMessages = async (): Promise<Msg[]> => {
    try {
      const stored = await AsyncStorage.getItem(chatStorageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [];
  };

  const saveLocalMessages = async (msgs: Msg[]) => {
    try {
      await AsyncStorage.setItem(chatStorageKey, JSON.stringify(msgs));
    } catch {}
  };

  const load = useCallback(async () => {
    let localMsgs = await loadLocalMessages();

    try {
      const res = await axiosDriver.get(`/api/booking-chat/orders/${orderId}`, {
        params: { after_id: lastId.current },
      });
      const d = res.data;
      setMeta(d);
      setMenu(d.quick_menu || []);
      setSuggestions(d.suggestions || []);

      if (Array.isArray(d.messages) && d.messages.length) {
        lastId.current = Math.max(lastId.current, ...d.messages.map((m: Msg) => m.id));
        const combined = [...localMsgs];
        d.messages.forEach((m: Msg) => {
          if (!combined.some((x) => x.id === m.id)) combined.push(m);
        });
        setMessages(combined);
        saveLocalMessages(combined);
      } else if (localMsgs.length > 0) {
        setMessages(localMsgs);
      }
    } catch (e: any) {
      // If backend chat doesn't exist (e.g. pre-assignment or offline), fallback to vehicle request chat
      const req = vehicleRequestService.getRequest(orderId);
      const vehicleCategory = carType || req?.carType || 'SUV';
      const vehicleModel = carName || req?.carName || vehicleCategory;

      setMeta({
        title: `Vehicle Request Discussion`,
        trip_type: 'ONE WAY',
        car_type: vehicleCategory,
        my_side: 'DRIVER',
        read_only: false,
      });

      if (localMsgs.length === 0) {
        const initialDriverMsg: Msg = {
          id: Date.now(),
          side: 'DRIVER',
          mine: true,
          sender_name: 'You (Driver)',
          text: `Hi, I would like to request Booking #DC${orderId} with my ${vehicleModel} (${vehicleCategory}). Please approve if suitable.`,
          created_at: new Date().toISOString(),
        };
        localMsgs = [initialDriverMsg];
        await saveLocalMessages(localMsgs);
      }
      setMessages(localMsgs);
    } finally {
      setLoading(false);
    }
  }, [orderId, carType, carName]);

  useFocusEffect(
    useCallback(() => {
      load();
      const stop = setForegroundInterval(load, 5000);
      return stop;
    }, [load])
  );

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async (override?: { text?: string; quick_key?: string }) => {
    const messageText = (override?.text ?? text).trim();
    if (!messageText) return;

    setSending(true);
    const newMsg: Msg = {
      id: Date.now(),
      side: 'DRIVER',
      mine: true,
      sender_name: 'You (Driver)',
      text: messageText,
      created_at: new Date().toISOString(),
      quick_key: override?.quick_key ?? pendingKey ?? undefined,
    };

    const updated = [...messages, newMsg];
    setMessages(updated);
    await saveLocalMessages(updated);
    setText('');
    setPendingKey(null);

    // Try posting to backend API in background
    try {
      await axiosDriver.post(`/api/booking-chat/orders/${orderId}`, {
        text: messageText,
        quick_key: override?.quick_key ?? pendingKey ?? undefined,
      });
    } catch {}

    setSending(false);
  };

  const handleApproveByVendor = async () => {
    const vehicleCategory = carType || vehicleReq?.carType || 'SUV';
    const approvedMsg: Msg = {
      id: Date.now(),
      side: 'POSTER',
      mine: false,
      sender_name: 'Vendor (Booking Poster)',
      text: `✅ Vehicle request approved for Booking #DC${orderId}! You can proceed with your ${vehicleCategory}. Please accept the booking now.`,
      created_at: new Date().toISOString(),
    };

    const updated = [...messages, approvedMsg];
    setMessages(updated);
    await saveLocalMessages(updated);

    // Set status to APPROVED in vehicleRequestService
    await vehicleRequestService.approveRequest(orderId, 'Approved by Vendor');

    Alert.alert(
      'Vehicle Approved! 🎉',
      `Vendor has approved your ${vehicleCategory} for Booking #DC${orderId}. You are now eligible to accept this booking!`,
      [
        {
          text: 'Go to Booking & Accept',
          onPress: () => {
            router.replace('/(tabs)?tab=new_bookings' as any);
          },
        },
      ]
    );
  };

  const handleDeclineByVendor = async () => {
    const declineMsg: Msg = {
      id: Date.now(),
      side: 'POSTER',
      mine: false,
      sender_name: 'Vendor (Booking Poster)',
      text: `❌ Sorry, the customer strictly requested a full 7-seater vehicle with luggage space for this booking.`,
      created_at: new Date().toISOString(),
    };

    const updated = [...messages, declineMsg];
    setMessages(updated);
    await saveLocalMessages(updated);

    await vehicleRequestService.rejectRequest(orderId, 'Declined by Vendor');
  };

  const isApproved = vehicleReq?.status === 'APPROVED';
  const readOnly = !!meta?.read_only;
  const isDriverSide = meta?.my_side === 'DRIVER' || !meta?.my_side;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => safeBack(router)} style={{ padding: 6, marginRight: 6 }}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontFamily: 'Inter-Bold' }}>
            #{formatBookingId(Number(orderId), meta?.start_date_time)} · Vendor Chat
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium' }}>
            {type === 'vehicle_request' || vehicleReq
              ? `Vehicle Request: ${vehicleReq?.carType || carType || 'SUV'}`
              : meta ? `${meta.trip_type} · ${meta.car_type}` : ''}
          </Text>
        </View>

        {isApproved && (
          <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#059669' }}>
              Approved ✅
            </Text>
          </View>
        )}
      </View>

      {/* Persistent Approval Banner */}
      {isApproved && (
        <View style={{
          backgroundColor: isDarkMode ? '#064E3B' : '#ECFDF5',
          borderColor: isDarkMode ? '#059669' : '#A7F3D0',
          borderWidth: 1,
          padding: 12,
          marginHorizontal: 12,
          marginTop: 10,
          borderRadius: 6,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
            <CheckCircle size={20} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: isDarkMode ? '#6EE7B7' : '#065F46' }}>
                Vehicle Request Approved!
              </Text>
              <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: isDarkMode ? '#A7F3D0' : '#047857' }}>
                You can now accept Booking #{formatBookingId(Number(orderId))}.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: '#10B981',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
            onPress={() => router.replace('/(tabs)?tab=new_bookings' as any)}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold' }}>Accept</Text>
            <ArrowRight size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <MessageCircle size={40} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
                  Chat directly with the vendor regarding this booking and vehicle suitability.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.mine ? styles.mine : styles.theirs,
                  {
                    backgroundColor: item.mine ? colors.primary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {!item.mine && !!item.sender_name && (
                  <Text style={{ color: colors.primary, fontSize: 11, fontFamily: 'Inter-Bold', marginBottom: 2 }}>
                    {item.sender_name}
                  </Text>
                )}
                <Text style={{ color: item.mine ? '#FFFFFF' : colors.text, fontSize: 14.5, lineHeight: 20 }}>
                  {item.text}
                </Text>
                <Text
                  style={{
                    color: item.mine ? 'rgba(255,255,255,0.75)' : colors.textSecondary,
                    fontSize: 10,
                    alignSelf: 'flex-end',
                    marginTop: 3,
                  }}
                >
                  {new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          />

          {readOnly ? (
            <View style={[styles.closed, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                This trip is completed - chat is closed.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
              {/* Vendor Suggested Replies / Actions Panel */}
              <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Zap size={13} color={colors.primary} />
                  <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: colors.textSecondary }}>
                    Vendor Quick Replies & Actions
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: isDarkMode ? '#064E3B' : '#ECFDF5',
                      borderColor: '#10B981',
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onPress={handleApproveByVendor}
                  >
                    <CheckCircle size={13} color="#10B981" />
                    <Text style={{ color: isDarkMode ? '#6EE7B7' : '#065F46', fontSize: 12, fontFamily: 'Inter-Bold' }}>
                      Approve Vehicle Request
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: isDarkMode ? '#7F1D1D' : '#FEF2F2',
                      borderColor: '#EF4444',
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onPress={handleDeclineByVendor}
                  >
                    <X size={13} color="#EF4444" />
                    <Text style={{ color: isDarkMode ? '#FCA5A5' : '#991B1B', fontSize: 12, fontFamily: 'Inter-Bold' }}>
                      Decline (Need 7 Seater)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}
                    onPress={() => send({ text: 'Can you please share photos of your vehicle boot space?' })}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Inter-Medium' }}>
                      Ask for boot space photos
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}
                    onPress={() => send({ text: 'Standard tariff per KM applies without extra charges.' })}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Inter-Medium' }}>
                      Confirm tariff
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Message Composer */}
              <View style={styles.composer}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setText(v)}
                  placeholder="Type message to vendor..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  maxLength={1000}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <TouchableOpacity
                  disabled={sending || !text.trim()}
                  onPress={() => send()}
                  style={[
                    styles.sendBtn,
                    { backgroundColor: colors.primary, opacity: sending || !text.trim() ? 0.5 : 1 },
                  ]}
                >
                  {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chips: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: { flex: 1, maxHeight: 110, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14.5 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  closed: { padding: 14, borderTopWidth: 1, alignItems: 'center' },
});
