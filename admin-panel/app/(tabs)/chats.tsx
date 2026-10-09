import React, { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ReplySuggestions, { ReplyTemplate } from '@/components/ReplySuggestions';
import ChatCategories, { MainCategory } from '@/components/ChatCategories';
import { PARTNER_TOPICS, VENDOR_TOPICS, CUSTOMER_TOPICS, TRIP_TOPICS, classifyTopic } from '@/utils/chatTopics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  MessageSquare,
  Search,
  Phone,
  Send,
  X,
  User,
  Headphones,
  ArrowLeft,
  ChevronRight,
  Package,
  Mic,
  Square,
  Play,
  Pause,
  Check,
  CheckCheck,
  Sparkles,
  BookOpen,
  ChevronDown,
  Building2,
  KeyRound,
  Users,
  Brain,
  Store,
  Compass,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCommandCenter } from '@/context/CommandCenterContext';
import ThemeToggle from '@/components/ThemeToggle';
import { apiService } from '@/services/api';
import * as supportApi from '@/services/supportApi';
import { useTheme } from '@/context/ThemeContext';
import { Card, KpiStrip, EmptyState, SkeletonRow } from '@/components/ui';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

interface Msg {
  id: string | number;
  mine: boolean;
  sender_name?: string;
  text: string;
  voice_url?: string;
  created_at: string;
  read?: boolean;
}

function WebVoicePlayer({ uri, mine, tint }: { uri: string; mine: boolean; tint: string }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && uri) {
      try {
        const audio = new window.Audio(uri);
        audioRef.current = audio;
        const onLoaded = () => setDuration(audio.duration || 0);
        const onTime = () => setCurrentTime(audio.currentTime || 0);
        const onEnded = () => { setPlaying(false); setCurrentTime(0); };
        const onError = () => { setPlaying(false); };

        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
          audio.pause();
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('timeupdate', onTime);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          audio.src = '';
          audioRef.current = null;
        };
      } catch (e) {
        console.warn('Web audio init error:', e);
      }
    }
  }, [uri]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      if (audioRef.current.ended || audioRef.current.currentTime >= (duration || 0)) {
        audioRef.current.currentTime = 0;
      }
      audioRef.current.play().then(() => setPlaying(true)).catch((e: any) => {
        console.warn('Audio play failed:', e);
        setPlaying(false);
      });
    }
  };

  const total = duration || 0;
  const pos = Math.min(currentTime || 0, total);
  const pct = total > 0 ? pos / total : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.75} style={voiceStyles.row}>
      <View style={[voiceStyles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : tint + '22' }]}>
        {playing ? (
          <Pause size={14} color={mine ? '#FFFFFF' : tint} fill={mine ? '#FFFFFF' : tint} />
        ) : (
          <Play size={14} color={mine ? '#FFFFFF' : tint} fill={mine ? '#FFFFFF' : tint} />
        )}
      </View>
      <View style={[voiceStyles.track, { backgroundColor: mine ? 'rgba(255,255,255,0.3)' : '#E2E8F0' }]}>
        <View style={[voiceStyles.trackFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: mine ? '#FFFFFF' : tint }]} />
      </View>
      <Text style={[voiceStyles.time, { color: mine ? 'rgba(255,255,255,0.85)' : '#64748B' }]}>
        {fmt(playing || pos > 0 ? pos : total)}
      </Text>
    </TouchableOpacity>
  );
}

function NativeVoicePlayer({ uri, mine, tint }: { uri: string; mine: boolean; tint: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        if (status.didJustFinish || status.currentTime >= (status.duration || 0)) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch (e) {
      console.warn('Native audio play error:', e);
    }
  };

  const total = status.duration || 0;
  const pos = Math.min(status.currentTime || 0, total);
  const pct = total > 0 ? pos / total : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.75} style={voiceStyles.row}>
      <View style={[voiceStyles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : tint + '22' }]}>
        {status.playing ? (
          <Pause size={14} color={mine ? '#FFFFFF' : tint} fill={mine ? '#FFFFFF' : tint} />
        ) : (
          <Play size={14} color={mine ? '#FFFFFF' : tint} fill={mine ? '#FFFFFF' : tint} />
        )}
      </View>
      <View style={[voiceStyles.track, { backgroundColor: mine ? 'rgba(255,255,255,0.3)' : '#E2E8F0' }]}>
        <View style={[voiceStyles.trackFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: mine ? '#FFFFFF' : tint }]} />
      </View>
      <Text style={[voiceStyles.time, { color: mine ? 'rgba(255,255,255,0.85)' : '#64748B' }]}>
        {fmt(status.playing || pos > 0 ? pos : total)}
      </Text>
    </TouchableOpacity>
  );
}

function VoiceMessageBubble(props: { uri: string; mine: boolean; tint: string }) {
  if (Platform.OS === 'web') {
    return <WebVoicePlayer {...props} />;
  }
  return <NativeVoicePlayer {...props} />;
}

const voiceStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160, paddingVertical: 2 },
  playBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  time: { fontSize: 10.5, fontWeight: '500', minWidth: 32 },
});

interface Row {
  key: string;
  kind: 'SUPPORT' | 'BOOKING';
  order_id?: number;
  title: string;
  subtitle: string;
  last_text: string | null;
  last_at: string | null;
  unread: number;
  role?: string;               // SUPPORT rows: OWNER | VEHICLE_OWNER | DRIVER | VENDOR | CUSTOMER
  help?: boolean;              // asked for help from the forgot-password screen (could not log in)
  stage?: string;              // BOOKING rows: the assignment status (COMPLETED = finished trip)
  trashed_at?: string | null;  // in Trash since (solved problem / finished booking) - deleted for good after the retention
  trash_days_left?: number | null;
}

const timeLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const isMsgRead = (m: any) => Boolean(m?.read || m?.read_at || m?.is_read || m?.seen || m?.status === 'READ');

// Ready replies for the Chats inbox (support threads and booking chats)
const TRASH_DAYS = 30;   // matches the server setting chat_trash_days (default 30)

const QUICK_REPLIES: ReplyTemplate[] = [
  { label: 'Checking', group: 'General', keywords: ['check', 'status', 'update', 'any news', 'sollunga', 'enna aachu'], text: 'We are checking this now. We will update you here shortly.' },
  { label: 'Need details', group: 'Account', keywords: ['login', 'account', 'register', 'signup', 'sign up', 'password', 'number'], text: 'Please send your full name, vehicle number and registered mobile number so we can verify you.' },
  { label: 'Send photo', group: 'Documents', keywords: ['document', 'licence', 'license', 'dl', 'aadhaar', 'aadhar', 'rc', 'insurance', 'permit', 'upload', 'invalid', 'verify', 'verified'], text: 'Please send a clear COLOUR photo of the ORIGINAL document here (or a voice note if easier). Make sure all four corners and the date are visible.' },
  { label: 'Date not matching', group: 'Documents', keywords: ['date', 'expiry', 'expire', 'expired', 'invalid', 'reject'], text: 'The date you entered does not match the date printed on the document. Please open the document in My Cars, upload the original again and pick the date shown on it.' },
  { label: 'Try OTP again', group: 'Account', keywords: ['otp', 'code', 'forgot', 'reset'], text: 'Please tap Forgot password once and use the code sent to your email. Check the Spam / Promotions folder too.' },
  { label: 'Payment received?', group: 'Payment', keywords: ['payment', 'paid', 'pay', 'money', 'wallet', 'recharge', 'upi', 'gpay', 'phonepe', 'amount'], text: 'Please send the payment screenshot with the UTR / transaction ID. Once we see it in our account your wallet is credited and you get a message here.' },
  { label: 'Payout steps', group: 'Payment', keywords: ['payout', 'withdraw', 'redeem', 'settlement', 'balance'], text: 'You can request a payout from Wallet > Request Payout. The minimum balance that must stay in your wallet is kept as a security hold; everything above it can be redeemed.' },
  { label: 'Trip code', group: 'Trip', keywords: ['otp', 'start code', 'end code', 'trip code', 'start trip', 'end trip', 'customer code'], text: 'The start and end codes are with the customer / the person who posted the booking. Please ask the customer for the code - we cannot give it to the driver.' },
  { label: 'Close trip', group: 'Trip', keywords: ['close', 'end trip', 'cannot end', "can't end", 'stuck', 'not closing', 'complete'], text: 'Please send the booking ID and the end km shown on the meter. If you cannot close it in the app we will close it from our side and settle it.' },
  { label: 'Toll / extras', group: 'Trip', keywords: ['toll', 'parking', 'permit', 'tax', 'extra', 'bata', 'waiting'], text: 'Charges marked Excluded in the booking are collected from the customer directly - enter what you collected when you close the trip. Charges marked Included are already in the fare.' },
  { label: 'Upcoming booking', group: 'Booking', keywords: ['booking', 'trip', 'ride', 'pickup', 'drop'], text: 'Your upcoming booking details are in the app under My Trips. Tell us which booking you need help with.' },
  { label: 'Update app', group: 'App', keywords: ['crash', 'not working', "not opening", 'error', 'bug', 'hang', 'slow', 'old app', 'update'], text: 'Please close the app fully and open it again - a new update downloads automatically and asks you to restart. If it still fails, send us a screenshot.' },
  { label: 'Fixed', group: 'General', keywords: ['fix', 'solved'], text: 'Your account is updated. Please log in again and tell us if you still face any problem.' },
  { label: 'Call you', group: 'General', keywords: ['call', 'phone', 'talk'], text: 'We will call you on your registered number shortly.' },
  { label: 'Thanks', group: 'General', keywords: ['thank', 'thanks', 'nandri', 'ok'], text: 'Thank you for contacting Drop Cars. Message us here any time if you need anything else.' },
];

type TabType = 'ASSISTANTS' | 'SUPPORT' | 'TRIPS' | 'ALL';

export default function AdminChatsScreen() {
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openCommandCenter } = useCommandCenter();
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['reply', 'main:driver']));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [onDuty, setOnDuty] = useState<boolean | null>(null);

  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [threadSummary, setThreadSummary] = useState<{ summary?: string; topic?: string; urgency?: string; mood?: string } | null>(null);
  const [draftingReply, setDraftingReply] = useState(false);
  const [suggestedAiDrafts, setSuggestedAiDrafts] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);

  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voiceRecorderState = useAudioRecorderState(voiceRecorder);
  const [isRecordingWeb, setIsRecordingWeb] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const webMediaRecorderRef = useRef<any>(null);
  const webAudioChunksRef = useRef<Blob[]>([]);

  const lastSupport = useRef<any[] | null>(null);
  const lastBooking = useRef<any[] | null>(null);
  const loadingNow = useRef(false);

  const load = useCallback(async () => {
    if (loadingNow.current) return;
    loadingNow.current = true;
    try {
      const [sup, bk] = await Promise.all([
        supportApi.getSupportThreads().then((r: any) => (Array.isArray(r) ? r : null)).catch(() => null),
        apiService.getBookingChatThreads().then((r: any) => (Array.isArray(r) ? r : null)).catch(() => null),
      ]);
      if (sup) lastSupport.current = sup;
      if (bk) lastBooking.current = bk;
      const support = lastSupport.current || [];
      const booking = lastBooking.current || [];
      const supportRows: Row[] = (support || []).map((t: any) => ({
        key: t.thread_key,
        kind: 'SUPPORT',
        title: t.thread_name || 'Driver/Owner',
        subtitle: (t.thread_role === 'OWNER' || t.thread_role === 'VEHICLE_OWNER') ? 'Fleet Driver' : t.thread_role === 'VENDOR' ? 'Vendor' : 'Duty Driver',
        last_text: t.last_text,
        last_at: t.last_at,
        unread: t.unread || 0,
        role: String(t.thread_role || '').toUpperCase(),
        help: !!t.help_request,
        trashed_at: t.trashed_at || null,
        trash_days_left: typeof t.trash_days_left === 'number' ? t.trash_days_left : null,
      }));
      const bookingRows: Row[] = (booking || []).map((t: any) => ({
        key: `order-${t.order_id}`,
        kind: 'BOOKING',
        order_id: t.order_id,
        title: `#${t.order_id} • ${t.title || 'Booking'}`,
        subtitle: t.other_party || 'Driver',
        last_text: t.last_text,
        last_at: t.last_at,
        unread: t.unread || 0,
        stage: String(t.assignment_status || '').toUpperCase(),
        trashed_at: t.trashed_at || null,
        trash_days_left: t.trashed_at ? Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(t.trashed_at).getTime()) / 86400000)) : null,
      }));

      // Unread / Needs-Reply chats ALWAYS sorted to the very top with priority
      const all = [...supportRows, ...bookingRows].sort((a, b) => {
        const aUrgent = (a.unread > 0 || a.help) ? 1 : 0;
        const bUrgent = (b.unread > 0 || b.help) ? 1 : 0;
        if (aUrgent !== bUrgent) return bUrgent - aUrgent;
        if (a.unread !== b.unread) return b.unread - a.unread;
        return new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime();
      });
      setRows(all);
    } catch {
    } finally {
      loadingNow.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      apiService.getAdminProfile().then((p: any) => setOnDuty(Boolean(p?.is_on_duty))).catch(() => {});
      const interval = setInterval(load, 10000);
      return () => clearInterval(interval);
    }, [load])
  );

  useEffect(() => {
    if (!openRow) return;
    const interval = setInterval(async () => {
      try {
        if (openRow.kind === 'SUPPORT') {
          const res = await supportApi.getSupportThread(openRow.key);
          const fresh = (res.messages || []).map((m: any) => ({ ...m, id: `s-${m.id}`, read: isMsgRead(m) }));
          setMessages((prev) => {
            const known = new Set(prev.map((p) => String(p.id)));
            const add = fresh.filter((m: Msg) => !known.has(String(m.id)));
            const readNow = new Map(fresh.map((m: Msg) => [String(m.id), !!m.read]));
            const merged = prev.map((p) => (p.mine && !p.read && readNow.get(String(p.id)) ? { ...p, read: true } : p));
            return add.length || merged.some((m, i) => m !== prev[i]) ? [...merged, ...add] : prev;
          });
        } else if (openRow.order_id) {
          const res = await apiService.getBookingChat(openRow.order_id);
          const fresh = (res.messages || []).map((m: any) => ({ ...m, id: `b-${m.id}`, read: isMsgRead(m) }));
          setMessages((prev) => {
            const known = new Set(prev.map((p) => String(p.id)));
            const add = fresh.filter((m: Msg) => !known.has(String(m.id)));
            const readNow = new Map(fresh.map((m: Msg) => [String(m.id), !!m.read]));
            const merged = prev.map((p) => (p.mine && !p.read && readNow.get(String(p.id)) ? { ...p, read: true } : p));
            return add.length || merged.some((m, i) => m !== prev[i]) ? [...merged, ...add] : prev;
          });
        }
      } catch {}
    }, 6000);
    return () => clearInterval(interval);
  }, [openRow?.key]);

  const openThread = async (row: Row) => {
    setOpenRow(row);
    setMessages([]);
    setThreadSummary(null);
    setSuggestedAiDrafts([]);
    try {
      if (row.kind === 'SUPPORT') {
        const res = await supportApi.getSupportThread(row.key);
        setMessages((res.messages || []).map((m: any) => ({ ...m, id: `s-${m.id}`, read: isMsgRead(m) })));
        supportApi.summarizeSupportThread(row.key).then(setThreadSummary).catch(() => {});
      } else if (row.order_id) {
        const res = await apiService.getBookingChat(row.order_id);
        setMessages((res.messages || []).map((m: any) => ({ ...m, id: `b-${m.id}`, read: isMsgRead(m) })));
        supportApi.summarizeBookingThread(row.order_id).then(setThreadSummary).catch(() => {});
      }
    } catch {}
  };

  const handleDraftWithAi = async () => {
    if (!openRow || draftingReply) return;
    setDraftingReply(true);
    try {
      const res = openRow.kind === 'SUPPORT'
        ? await supportApi.draftReplySupportThread(openRow.key)
        : await supportApi.draftReplyBookingThread(openRow.order_id!);
      if (res && res.drafts && res.drafts.length > 0) {
        if (res.drafts.length === 1) {
          setInput(res.drafts[0]);
        } else {
          setSuggestedAiDrafts(res.drafts);
        }
      }
    } catch (e: any) {
      Alert.alert('AI Drafting', e?.message || 'Could not generate reply draft');
    } finally {
      setDraftingReply(false);
    }
  };

  // Problem solved / booking finished -> Trash (kept 30 days, then deleted for good); a new message from the driver brings it back
  const trashOpenRow = async () => {
    if (!openRow || openRow.key === 'owner_office_desk') return;
    try {
      const type = openRow.kind === 'SUPPORT' ? 'SUPPORT' : 'BOOKING';
      const key = openRow.kind === 'SUPPORT' ? openRow.key : String(openRow.order_id);
      await supportApi.moveChatToTrash(type, key, 'SOLVED');
      setOpenRow(null);
      load();
    } catch (e: any) {
      Alert.alert('Could not move to Trash', e?.message || 'Try again');
    }
  };

  const restoreOpenRow = async () => {
    if (!openRow) return;
    try {
      const type = openRow.kind === 'SUPPORT' ? 'SUPPORT' : 'BOOKING';
      const key = openRow.kind === 'SUPPORT' ? openRow.key : String(openRow.order_id);
      await supportApi.restoreChatFromTrash(type, key);
      // a finished trip's chat is Trash by definition (until it is deleted), a support / manually trashed chat leaves Trash
      setOpenRow(null);
      load();
    } catch (e: any) {
      Alert.alert('Could not restore', e?.message || 'Try again');
    }
  };

  const openOwnerOfficeChat = () => {
    const ownerRow: Row = {
      key: 'owner_office_desk',
      kind: 'SUPPORT',
      title: 'Naveen / Head Office Desk',
      subtitle: 'Drop Cars Owner & Management Line',
      last_text: 'Direct communication with Owner & HQ',
      last_at: new Date().toISOString(),
      unread: 0,
      role: 'OWNER',
    };
    openThread(ownerRow);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !openRow || sending) return;
    setSending(true);
    setInput('');
    const optimistic: Msg = { id: `tmp-${Date.now()}`, mine: true, sender_name: 'You', text, created_at: new Date().toISOString(), read: false };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      if (openRow.kind === 'SUPPORT') {
        await supportApi.replySupportThread(openRow.key, text);
      } else if (openRow.order_id) {
        await apiService.sendBookingChatMessage(openRow.order_id, text);
      }
      load();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        if (navigator?.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new (window as any).MediaRecorder(stream);
          webMediaRecorderRef.current = mediaRecorder;
          webAudioChunksRef.current = [];
          mediaRecorder.ondataavailable = (e: any) => {
            if (e.data.size > 0) webAudioChunksRef.current.push(e.data);
          };
          mediaRecorder.start();
          setIsRecordingWeb(true);
        }
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await voiceRecorder.prepareToRecordAsync();
      voiceRecorder.record();
    } catch (e) {
      console.warn('Start voice recording error:', e);
    }
  };

  const stopAndSendVoiceRecording = async () => {
    if (!openRow) return;
    try {
      let uri = '';
      if (Platform.OS === 'web') {
        setIsRecordingWeb(false);
        if (webMediaRecorderRef.current) {
          const mr = webMediaRecorderRef.current;
          await new Promise<void>((resolve) => {
            mr.onstop = () => resolve();
            mr.stop();
          });
          if (mr.stream) mr.stream.getTracks().forEach((t: any) => t.stop());
          const blob = new Blob(webAudioChunksRef.current, { type: 'audio/webm' });
          uri = URL.createObjectURL(blob);
        }
      } else {
        await voiceRecorder.stop();
        uri = voiceRecorder.uri || '';
      }
      if (!uri) return;
      setUploadingVoice(true);
      const upload = await apiService.uploadChatVoiceNote(uri, Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a');
      const voiceUrl = upload.voice_url || uri;
      const optimistic: Msg = { id: `tmp-${Date.now()}`, mine: true, sender_name: 'You', text: '🎤 Voice message', voice_url: voiceUrl, created_at: new Date().toISOString(), read: false };
      setMessages((prev) => [...prev, optimistic]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      if (openRow.kind === 'SUPPORT') {
        await supportApi.replySupportThread(openRow.key, undefined, voiceUrl);
      } else if (openRow.order_id) {
        await apiService.sendBookingChatMessage(openRow.order_id, undefined, voiceUrl);
      }
      load();
    } catch (e) {
      console.warn('Send voice recording error:', e);
    } finally {
      setUploadingVoice(false);
    }
  };

  const isRecordingActive = Platform.OS === 'web' ? isRecordingWeb : voiceRecorderState.isRecording;

  const toggleOnDuty = async () => {
    const next = !(onDuty ?? false);
    setOnDuty(next);
    AsyncStorage.setItem('@admin_staff_on_duty_shift', String(next)).catch(() => {});
    try {
      const res = await apiService.setOnDuty(next);
      setOnDuty(res.is_on_duty);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', String(res.is_on_duty)).catch(() => {});
    } catch {
      setOnDuty(!next);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', String(!next)).catch(() => {});
    }
  };

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          (r.last_text || '').toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const totalUnread = rows.reduce((acc, r) => acc + (r.unread || 0), 0);
  const supportUnread = rows.filter((r) => r.kind === 'SUPPORT').reduce((acc, r) => acc + (r.unread || 0), 0);
  const bookingUnread = rows.filter((r) => r.kind === 'BOOKING').reduce((acc, r) => acc + (r.unread || 0), 0);

  const needsReplyCount = rows.filter((r) => r.unread > 0).length;
  const loginHelpCount = rows.filter((r) => r.kind === 'SUPPORT' && (r.help || classifyTopic(r, PARTNER_TOPICS) === 'login') && r.role !== 'CUSTOMER' && r.role !== 'VENDOR').length;
  const activeTripsCount = rows.filter((r) => r.kind === 'BOOKING' && r.stage !== 'COMPLETED').length;

  // "Needs a reply" stays pinned on top; everything else is sorted  who > what it is about  (utils/chatTopics.ts)
  const PINNED_GROUPS: Array<{ id: string; label: string; icon: any; hint?: string; match: (r: Row) => boolean; color?: string }> = [
    { id: 'reply', label: 'Needs a reply', icon: AlertCircle, color: '#EF4444', hint: 'Unread messages awaiting staff response', match: (r) => r.unread > 0 && !r.trashed_at },
  ];

  const SUPPORT_MAINS: MainCategory<Row>[] = [
    { id: 'owner', label: 'Fleet owners & Partners', icon: Building2, color: '#3B82F6', topics: PARTNER_TOPICS, hint: 'No chats from fleet owners right now', match: (r) => !r.trashed_at && r.kind === 'SUPPORT' && (r.role === 'OWNER' || r.role === 'VEHICLE_OWNER') },
    { id: 'driver', label: 'Duty & Attached Drivers', icon: Users, color: '#10B981', topics: PARTNER_TOPICS, hint: 'No chats from drivers right now', match: (r) => !r.trashed_at && r.kind === 'SUPPORT' && r.role === 'DRIVER' },
    { id: 'vendor', label: 'Vendors & B2B Partners', icon: Store, color: '#8B5CF6', topics: VENDOR_TOPICS, hint: 'No chats from vendors right now', match: (r) => !r.trashed_at && r.kind === 'SUPPORT' && r.role === 'VENDOR' },
    { id: 'customer', label: 'Customers', icon: User, color: '#06B6D4', topics: CUSTOMER_TOPICS, hint: 'Customer messages from the Customer App', match: (r) => !r.trashed_at && r.kind === 'SUPPORT' && r.role === 'CUSTOMER' },
  ];

  const TRIP_MAINS: MainCategory<Row>[] = [
    { id: 'live', label: 'Booking chats - Live & Upcoming', icon: Compass, color: '#10B981', topics: TRIP_TOPICS, hint: 'No ongoing or scheduled booking chats', match: (r) => !r.trashed_at && r.kind === 'BOOKING' && r.stage !== 'COMPLETED' },
  ];

  // Trash: finished booking chats and solved problems, sorted the same way (who > what), kept TRASH_DAYS days and then deleted for good
  const TRASH_MAINS: MainCategory<Row>[] = [
    { id: 'trash-booking', label: 'Trash - Booking chats', icon: Package, color: '#64748B', topics: TRIP_TOPICS, hint: 'No finished booking chats', match: (r) => !!r.trashed_at && r.kind === 'BOOKING' },
    { id: 'trash-support', label: 'Trash - Solved problems', icon: CheckCheck, color: '#64748B', topics: PARTNER_TOPICS, hint: 'No solved problems yet. Open a chat and tap "Solved".', match: (r) => !!r.trashed_at && r.kind === 'SUPPORT' },
  ];
  const trashCount = rows.filter((r) => !!r.trashed_at).length;

  const chatColors = {
    surface: themeColors.surface, surfaceAlt: themeColors.surfaceAlt, border: themeColors.border,
    text: themeColors.text, textMuted: themeColors.textMuted, primary: themeColors.primary,
  };

  const toggleGroup = (id: string) => setOpenGroups((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderRow = (item: Row) => (
    <Card
      style={styles.chatCard}
      onPress={() => openThread(item)}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: item.kind === 'SUPPORT' ? themeColors.primaryLight : themeColors.successLight }]}>
          {item.kind === 'SUPPORT' ? <Headphones size={17} color={themeColors.primary} /> : <Package size={17} color={themeColors.success} />}
        </View>
        <View style={styles.rowMid}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: themeColors.text, flex: 1 }]}>{item.title}</Text>
            {item.help && !item.trashed_at && (
              <View style={[styles.miniTag, { backgroundColor: '#FEF3C7' }]}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#B45309' }}>LOGIN HELP</Text>
              </View>
            )}
            {!!item.trashed_at && (
              <View style={[styles.miniTag, { backgroundColor: '#E2E8F0' }]}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#475569' }}>
                  {item.trash_days_left === 0 ? 'CLEARS TODAY' : `CLEARS IN ${item.trash_days_left ?? TRASH_DAYS}d`}
                </Text>
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={[styles.rowSub, { color: themeColors.textSecondary }]}>
            {item.last_text || item.subtitle}
          </Text>
        </View>
        <View style={styles.rightColumn}>
          <Text style={{ fontSize: 10.5, color: themeColors.textMuted }}>{timeLabel(item.last_at)}</Text>
          {item.unread > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: themeColors.primary }]}>
              <Text style={styles.unreadText}>{item.unread}</Text>
            </View>
          ) : (
            <ChevronRight size={14} color={themeColors.textMuted} />
          )}
        </View>
      </View>
    </Card>
  );

  const renderAssistantsSection = () => (
    <View style={styles.assistantsContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Smart Desk & Office HQ</Text>
        <View style={[styles.badgePill, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, borderWidth: 1 }]}>
          <Text style={[styles.badgePillText, { color: themeColors.textSecondary }]}>3 Direct Desks</Text>
        </View>
      </View>

      {/* 1. Command Centre */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={openCommandCenter}
        style={[styles.assistantCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      >
        <View style={[styles.assistantIconWrap, { backgroundColor: '#EDE9FE' }]}>
          <Sparkles size={18} color="#7C3AED" />
        </View>
        <View style={styles.assistantTextWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.assistantTitle, { color: themeColors.text }]}>Command Centre</Text>
            <View style={[styles.miniTag, { backgroundColor: '#F3E8FF' }]}>
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#7C3AED' }}>AI Copilot</Text>
            </View>
          </View>
          <Text style={[styles.assistantSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
            Tell it what to do: post, approve, notify, create booking or handle exceptions
          </Text>
        </View>
        <ChevronRight size={15} color={themeColors.textMuted} />
      </TouchableOpacity>

      {/* 2. Helper (Renamed from Information) */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => router.push('/info-chat' as any)}
        style={[styles.assistantCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      >
        <View style={[styles.assistantIconWrap, { backgroundColor: '#DCFCE7' }]}>
          <BookOpen size={18} color="#16A34A" />
        </View>
        <View style={styles.assistantTextWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.assistantTitle, { color: themeColors.text }]}>Helper</Text>
            <View style={[styles.miniTag, { backgroundColor: '#DCFCE7' }]}>
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#15803D' }}>Rules & System AI</Text>
            </View>
          </View>
          <Text style={[styles.assistantSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
            Any doubt? Ask how rules, tariffs, cutoffs, hold & screens work
          </Text>
        </View>
        <ChevronRight size={15} color={themeColors.textMuted} />
      </TouchableOpacity>

      {/* 3. Naveen / Office (Owner Desk) */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={openOwnerOfficeChat}
        style={[styles.assistantCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      >
        <View style={[styles.assistantIconWrap, { backgroundColor: '#DBEAFE' }]}>
          <Building2 size={18} color="#2563EB" />
        </View>
        <View style={styles.assistantTextWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.assistantTitle, { color: themeColors.text }]}>Naveen / Office (HQ)</Text>
            <View style={[styles.miniTag, { backgroundColor: '#DBEAFE' }]}>
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#1E40AF' }}>Owner Desk</Text>
            </View>
          </View>
          <Text style={[styles.assistantSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
            Direct line to Owner & Head Office • Urgent escalations, approvals & notes
          </Text>
        </View>
        <ChevronRight size={15} color={themeColors.textMuted} />
      </TouchableOpacity>

      {/* 4. AI Knowledge & Self-Training Hub */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => router.push('/ai-training' as any)}
        style={[styles.assistantCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      >
        <View style={[styles.assistantIconWrap, { backgroundColor: '#FDF2F8' }]}>
          <Brain size={18} color="#DB2777" />
        </View>
        <View style={styles.assistantTextWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.assistantTitle, { color: themeColors.text }]}>AI Knowledge & Training Hub</Text>
            <View style={[styles.miniTag, { backgroundColor: '#FDF2F8' }]}>
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#BE185D' }}>Self-Learning</Text>
            </View>
          </View>
          <Text style={[styles.assistantSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
            Teach custom replies, fix misunderstandings & configure LLM bridge
          </Text>
        </View>
        <ChevronRight size={15} color={themeColors.textMuted} />
      </TouchableOpacity>
    </View>
  );

  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style="light" />

      {/* 1. Executive Hero Gradient Header with Edge-Attached Wide Dock & Curved Bottom */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B'] : ['#1E1B4B', '#2E1065']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroBanner, { paddingTop: topPadding + 4 }]}
      >
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.heroTitle}>Chats</Text>
              <TouchableOpacity
                onPress={toggleOnDuty}
                activeOpacity={0.8}
                style={[
                  styles.onDutyBadge,
                  {
                    backgroundColor: onDuty ? 'rgba(16, 185, 129, 0.25)' : 'rgba(100, 116, 139, 0.35)',
                    borderColor: onDuty ? '#10B981' : '#64748B',
                  },
                ]}
              >
                <View style={[styles.onDutyDot, { backgroundColor: onDuty ? '#10B981' : '#94A3B8' }]} />
                <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                  {onDuty ? 'Online' : 'Offline'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle size={18} />
            <TouchableOpacity
              onPress={() => load()}
              style={styles.heroRefreshBtn}
              activeOpacity={0.7}
            >
              <RefreshCw size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wide Header-Attached Tabs Dock (Curved to Match Header Bottom) */}
        <View style={styles.heroDock}>
          {/* Tab 1: HQ & AI */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('ASSISTANTS')}
            style={[
              styles.dockSegment,
              activeTab === 'ASSISTANTS' && styles.dockSegmentActive,
            ]}
          >
            <Sparkles size={13} color={activeTab === 'ASSISTANTS' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)'} />
            <Text
              style={[
                styles.dockLabel,
                {
                  color: activeTab === 'ASSISTANTS' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                  fontWeight: activeTab === 'ASSISTANTS' ? '800' : '600',
                },
              ]}
              numberOfLines={1}
            >
              HQ & AI
            </Text>
          </TouchableOpacity>

          {/* Tab 2: Support */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('SUPPORT')}
            style={[
              styles.dockSegment,
              activeTab === 'SUPPORT' && styles.dockSegmentActive,
            ]}
          >
            <View style={styles.dockInnerRow}>
              <Text
                style={[
                  styles.dockLabel,
                  {
                    color: activeTab === 'SUPPORT' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                    fontWeight: activeTab === 'SUPPORT' ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                Support
              </Text>
              {supportUnread > 0 && (
                <View
                  style={[
                    styles.dockBadge,
                    { backgroundColor: activeTab === 'SUPPORT' ? '#FFFFFF' : '#EF4444' },
                  ]}
                >
                  <Text
                    style={[
                      styles.dockBadgeText,
                      { color: activeTab === 'SUPPORT' ? '#4F46E5' : '#FFFFFF' },
                    ]}
                  >
                    {supportUnread}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Tab 3: Trips */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('TRIPS')}
            style={[
              styles.dockSegment,
              activeTab === 'TRIPS' && styles.dockSegmentActive,
            ]}
          >
            <View style={styles.dockInnerRow}>
              <Text
                style={[
                  styles.dockLabel,
                  {
                    color: activeTab === 'TRIPS' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                    fontWeight: activeTab === 'TRIPS' ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                Trips
              </Text>
              {bookingUnread > 0 && (
                <View
                  style={[
                    styles.dockBadge,
                    { backgroundColor: activeTab === 'TRIPS' ? '#FFFFFF' : '#10B981' },
                  ]}
                >
                  <Text
                    style={[
                      styles.dockBadgeText,
                      { color: activeTab === 'TRIPS' ? '#4F46E5' : '#FFFFFF' },
                    ]}
                  >
                    {bookingUnread}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Tab 4: All (At the Last Position) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('ALL')}
            style={[
              styles.dockSegment,
              activeTab === 'ALL' && styles.dockSegmentActive,
            ]}
          >
            <Text
              style={[
                styles.dockLabel,
                {
                  color: activeTab === 'ALL' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                  fontWeight: activeTab === 'ALL' ? '800' : '600',
                },
              ]}
              numberOfLines={1}
            >
              All
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* 2. Main Scrollable Container (Snapshot, Search, & Categorized Feeds) */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={search.trim() ? filtered : []}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={true}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 8 }}>
              {/* 1. CHATS & SUPPORT LIVE SNAPSHOT (Single Line) */}
              <View style={{ marginTop: 2 }}>
                <View style={{ paddingHorizontal: 16, marginBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textSecondary }}>
                      Chats & Support Live Snapshot
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => load()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.primary }}>
                      Live ⚡
                    </Text>
                  </TouchableOpacity>
                </View>

                <KpiStrip
                  items={[
                    {
                      label: 'Needs Reply',
                      value: needsReplyCount,
                      tone: needsReplyCount > 0 ? '#EF4444' : '#10B981',
                      delta: needsReplyCount > 0 ? 'Urgent' : 'Clear',
                      isPositive: needsReplyCount === 0,
                      onPress: () => {
                        setActiveTab('SUPPORT');
                        setOpenGroups((prev) => new Set([...prev, 'reply']));
                      },
                    },
                    {
                      label: 'Login Help',
                      value: loginHelpCount,
                      tone: loginHelpCount > 0 ? '#F59E0B' : '#64748B',
                      delta: loginHelpCount > 0 ? 'OTP' : 'Clear',
                      isPositive: loginHelpCount === 0,
                      onPress: () => {
                        setActiveTab('SUPPORT');
                        setOpenGroups((prev) => new Set([...prev, 'main:driver', 'sub:driver:login', 'main:owner', 'sub:owner:login']));
                      },
                    },
                    {
                      label: 'Trip Chats',
                      value: activeTripsCount,
                      tone: activeTripsCount > 0 ? '#10B981' : '#64748B',
                      delta: activeTripsCount > 0 ? 'Live' : 'Standby',
                      isPositive: true,
                      onPress: () => {
                        setActiveTab('TRIPS');
                        setOpenGroups((prev) => new Set([...prev, 'main:live']));
                      },
                    },
                    {
                      label: 'Total Active',
                      value: rows.length,
                      tone: '#8B5CF6',
                      delta: 'Active',
                      isPositive: true,
                      onPress: () => {
                        setActiveTab('ALL');
                      },
                    },
                  ]}
                />
              </View>

              {/* 2. Search Bar with Action Button */}
              <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0' }]}>
                <Search size={15} color={themeColors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text }]}
                  placeholder="Search by name, trip ID, or keyword..."
                  placeholderTextColor={themeColors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
                    <X size={14} color={themeColors.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.searchActionBtn, { backgroundColor: themeColors.primary }]}
                >
                  <Text style={styles.searchActionBtnText}>Search</Text>
                </TouchableOpacity>
              </View>

              {/* 3. Non-search sections */}
              {!search.trim() && (
                <View style={{ gap: 14 }}>
                  {/* Assistants Section (Visible in 'ALL' and 'ASSISTANTS' tabs) */}
                  {(activeTab === 'ALL' || activeTab === 'ASSISTANTS') && renderAssistantsSection()}

                  {/* Support & Driver Groups (Visible in 'ALL' and 'SUPPORT' tabs) */}
                  {(activeTab === 'ALL' || activeTab === 'SUPPORT') && (
                    <View style={styles.sectionGroup}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Support & Partner Inbox</Text>
                        {supportUnread > 0 && (
                          <View style={[styles.badgePill, { backgroundColor: '#FEE2E2', borderColor: '#FECACA', borderWidth: 1 }]}>
                            <Text style={[styles.badgePillText, { color: '#DC2626' }]}>{supportUnread} Pending</Text>
                          </View>
                        )}
                      </View>

                      {PINNED_GROUPS.map((g) => {
                        const list = rows.filter(g.match);
                        const unread = list.reduce((n, r) => n + (r.unread || 0), 0);
                        const open = openGroups.has(g.id);
                        const IconComponent = g.icon;

                        return (
                          <View key={g.id} style={{ marginBottom: 4 }}>
                            <TouchableOpacity
                              activeOpacity={0.75}
                              onPress={() => toggleGroup(g.id)}
                              style={[
                                styles.foldRow,
                                {
                                  borderColor: unread > 0 ? themeColors.primary + '55' : themeColors.border,
                                  backgroundColor: themeColors.surface,
                                },
                              ]}
                            >
                              <View style={[styles.foldIconWrap, { backgroundColor: (g.color || themeColors.primary) + '18' }]}>
                                <IconComponent size={15} color={g.color || themeColors.primary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>
                                  {g.label}
                                </Text>
                                <Text style={{ color: themeColors.textMuted, fontSize: 11 }}>
                                  {list.length} {list.length === 1 ? 'chat' : 'chats'}
                                </Text>
                              </View>
                              {unread > 0 && (
                                <View style={[styles.unreadBadge, { backgroundColor: g.color || themeColors.primary }]}>
                                  <Text style={styles.unreadText}>{unread}</Text>
                                </View>
                              )}
                              {open ? <ChevronDown size={15} color={themeColors.textMuted} /> : <ChevronRight size={15} color={themeColors.textMuted} />}
                            </TouchableOpacity>
                            {open && (
                              <View style={{ gap: 6, marginTop: 6, paddingLeft: 4 }}>
                                {list.length === 0 ? (
                                  <View style={[styles.emptyGroupHint, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border }]}>
                                    <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>
                                      {g.hint || 'No active conversations in this category'}
                                    </Text>
                                  </View>
                                ) : (
                                  list.map((r) => <View key={r.key}>{renderRow(r)}</View>)
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}

                      <ChatCategories
                        categories={SUPPORT_MAINS}
                        rows={rows}
                        open={openGroups}
                        onToggle={toggleGroup}
                        renderRow={renderRow}
                        colors={chatColors}
                      />
                    </View>
                  )}

                  {/* Booking & Trip Chats (Visible in 'ALL' and 'TRIPS' tabs) */}
                  {(activeTab === 'ALL' || activeTab === 'TRIPS') && (
                    <View style={styles.sectionGroup}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Trip & Booking Communications</Text>
                        {bookingUnread > 0 && (
                          <View style={[styles.badgePill, { backgroundColor: themeColors.primaryLight, borderColor: themeColors.border, borderWidth: 1 }]}>
                            <Text style={[styles.badgePillText, { color: themeColors.primary }]}>{bookingUnread} Unread</Text>
                          </View>
                        )}
                      </View>

                      <ChatCategories
                        categories={TRIP_MAINS}
                        rows={rows}
                        open={openGroups}
                        onToggle={toggleGroup}
                        renderRow={renderRow}
                        colors={chatColors}
                        noun="trip chat"
                      />
                    </View>
                  )}
                  {/* Trash (All tab): kept 30 days, then deleted for good */}
                  {activeTab === 'ALL' && (
                    <View style={styles.sectionGroup}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Trash</Text>
                        <View style={[styles.badgePill, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border, borderWidth: 1 }]}>
                          <Text style={[styles.badgePillText, { color: themeColors.textSecondary }]}>{trashCount} kept {TRASH_DAYS} days</Text>
                        </View>
                      </View>
                      <ChatCategories
                        categories={TRASH_MAINS}
                        rows={rows}
                        open={openGroups}
                        onToggle={toggleGroup}
                        renderRow={renderRow}
                        colors={chatColors}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={themeColors.primary} />}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            !search.trim() ? null : (
              <EmptyState
                icon={<MessageSquare size={36} color={themeColors.textMuted} />}
                title="No matching chats"
                message={`No conversations matched "${search}". Try searching another name or ID.`}
              />
            )
          }
        />
      )}

      {/* Thread Chat Modal */}
      <Modal visible={Boolean(openRow)} animationType="slide" onRequestClose={() => setOpenRow(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
          >
            <View style={[styles.chatHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
              <TouchableOpacity onPress={() => setOpenRow(null)} style={{ padding: 6, marginRight: 6 }}>
                <ArrowLeft size={20} color={themeColors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: themeColors.text }]}>{openRow?.title}</Text>
                <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>
                  {openRow?.subtitle}{openRow?.trashed_at ? `  ·  in Trash, clears in ${openRow.trash_days_left ?? TRASH_DAYS} days` : ''}
                </Text>
                {threadSummary?.summary && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Sparkles size={11} color={themeColors.primary} />
                    <Text numberOfLines={1} style={{ fontSize: 11, color: themeColors.textSecondary, fontStyle: 'italic', flex: 1 }}>
                      {threadSummary.summary}
                    </Text>
                    {threadSummary.mood && threadSummary.mood !== 'NEUTRAL' && (
                      <View style={{ backgroundColor: threadSummary.mood === 'ANGRY' || threadSummary.mood === 'URGENT' ? '#FEF2F2' : '#EFF6FF', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: threadSummary.mood === 'ANGRY' || threadSummary.mood === 'URGENT' ? '#DC2626' : themeColors.primary }}>
                          {threadSummary.mood}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleDraftWithAi}
                  disabled={draftingReply}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
                    borderColor: '#6366F1',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                  }}
                >
                  {draftingReply ? (
                    <ActivityIndicator size="small" color="#6366F1" />
                  ) : (
                    <>
                      <Sparkles size={12} color="#6366F1" />
                      <Text style={{ color: '#4F46E5', fontWeight: '800', fontSize: 11.5 }}>Draft AI</Text>
                    </>
                  )}
                </TouchableOpacity>

                {openRow && openRow.key !== 'owner_office_desk' && (
                  openRow.trashed_at && openRow.kind === 'SUPPORT' ? (
                    <TouchableOpacity onPress={restoreOpenRow} style={{ borderWidth: 1, borderColor: themeColors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: themeColors.primary, fontWeight: '800', fontSize: 12 }}>Restore</Text>
                    </TouchableOpacity>
                  ) : !openRow.trashed_at ? (
                    <TouchableOpacity onPress={trashOpenRow} style={{ borderWidth: 1, borderColor: '#10B981', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
                      <Text style={{ color: '#059669', fontWeight: '800', fontSize: 11.5 }}>Solved ✓</Text>
                    </TouchableOpacity>
                  ) : null
                )}
              </View>
              {openRow && openRow.key !== 'owner_office_desk' && (
                openRow.trashed_at && openRow.kind === 'SUPPORT' ? (
                  <TouchableOpacity onPress={restoreOpenRow} style={{ borderWidth: 1, borderColor: themeColors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: themeColors.primary, fontWeight: '800', fontSize: 12 }}>Restore</Text>
                  </TouchableOpacity>
                ) : !openRow.trashed_at ? (
                  <TouchableOpacity onPress={trashOpenRow} style={{ borderWidth: 1, borderColor: '#10B981', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#059669', fontWeight: '800', fontSize: 12 }}>Solved ✓ Trash</Text>
                  </TouchableOpacity>
                ) : null
              )}
            </View>

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14, gap: 10 }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => (
                <View style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                  <View
                    style={[
                      styles.bubble,
                      item.mine
                        ? { backgroundColor: themeColors.primary }
                        : { backgroundColor: themeColors.surface, borderWidth: 1, borderColor: themeColors.border },
                    ]}
                  >
                    {!item.mine && item.sender_name ? (
                      <Text style={[styles.senderLabel, { color: themeColors.primary }]}>{item.sender_name}</Text>
                    ) : null}
                    {item.voice_url ? (
                      <VoiceMessageBubble uri={item.voice_url} mine={item.mine} tint={item.mine ? '#FFFFFF' : themeColors.primary} />
                    ) : (
                      <Text style={{ color: item.mine ? '#FFFFFF' : themeColors.text, fontSize: 13.5, lineHeight: 19 }}>
                        {item.text}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                      <Text style={{ color: item.mine ? 'rgba(255,255,255,0.7)' : themeColors.textMuted, fontSize: 10 }}>
                        {timeLabel(item.created_at)}
                      </Text>
                      {item.mine ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 2 }}>
                          {item.read ? (
                            <CheckCheck size={14} color="#38BDF8" strokeWidth={2.4} />
                          ) : (
                            <CheckCheck size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                          )}
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
            />
            {/* AI Draft Suggestions Popover/Row if multiple drafts generated */}
            {suggestedAiDrafts.length > 0 && (
              <View style={{ backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', padding: 8, borderTopWidth: 1, borderTopColor: '#C7D2FE' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={12} color="#6366F1" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Choose AI Draft:</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSuggestedAiDrafts([])}>
                    <X size={14} color="#6366F1" />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {suggestedAiDrafts.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        setInput(d);
                        setSuggestedAiDrafts([]);
                      }}
                      style={{ backgroundColor: themeColors.surface, borderColor: '#6366F1', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 280 }}
                    >
                      <Text numberOfLines={2} style={{ fontSize: 12, color: themeColors.text }}>
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}


            {/* Suggested replies: fixed-height, never overlaps the list or the box; the last incoming message picks the best fits */}
            <ReplySuggestions
              templates={QUICK_REPLIES}
              lastIncoming={[...messages].reverse().find((m: any) => !m.mine && m.text)?.text}
              onPick={(text) => setInput(text)}
              colors={{ surface: themeColors.surface, background: themeColors.background, border: themeColors.border, text: themeColors.text, textMuted: themeColors.textMuted, primary: themeColors.primary }}
            />

            {/* Input Bar */}
            <View style={[styles.inputBar, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
              <TextInput
                style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                placeholder="Type a reply..."
                placeholderTextColor={themeColors.textMuted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={send}
              />
              <TouchableOpacity
                onPress={isRecordingActive ? stopAndSendVoiceRecording : startVoiceRecording}
                style={[styles.actionBtn, { backgroundColor: isRecordingActive ? themeColors.error : themeColors.surfaceAlt }]}
              >
                {isRecordingActive ? (
                  <Square size={16} color="#FFFFFF" />
                ) : (
                  <Mic size={16} color={uploadingVoice ? themeColors.textMuted : themeColors.primary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={send}
                disabled={sending || !input.trim()}
                style={[styles.sendBtn, { backgroundColor: themeColors.primary, opacity: sending || !input.trim() ? 0.5 : 1 }]}
              >
                <Send size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalContainer: { flex: 1 },
  heroBanner: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 21,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  onDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  onDutyDot: { width: 6, height: 6, borderRadius: 3 },
  dutyToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  heroRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 4,
    width: '100%',
  },
  dockSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 4,
    borderRadius: 6,
    gap: 4,
  },
  dockSegmentActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  dockInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dockLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.1,
  },
  dockBadge: {
    paddingHorizontal: 4.5,
    paddingVertical: 1,
    borderRadius: 4,
    minWidth: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBadgeText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapshotCard: {
    width: '48.4%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  snapshotCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  snapshotIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  snapshotBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  snapshotStatValue: {
    fontSize: 18,
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  snapshotTitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  snapshotSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 4,
    paddingLeft: 12,
    paddingRight: 4,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  searchActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  loadingContainer: { padding: 16, gap: 8 },
  listContainer: { paddingHorizontal: 0, paddingTop: 6, paddingBottom: 40 },
  assistantsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectionGroup: {
    paddingHorizontal: 16,
    gap: 6,
  },
  assistantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  assistantIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantTextWrap: {
    flex: 1,
    gap: 2,
  },
  assistantTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  assistantSubtitle: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  miniTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  chatCard: {
    marginBottom: 3,
    padding: 10,
    borderRadius: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowMid: { flex: 1, marginRight: 8, gap: 1.5 },
  rowTitle: { fontSize: 13.5, fontFamily: 'Inter-Bold', fontWeight: '700' },
  rowSub: { fontSize: 11.5, fontWeight: '500' },
  rightColumn: { alignItems: 'flex-end', gap: 3 },
  unreadBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  foldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  foldIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGroupHint: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  senderLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  quickRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { flex: 1, height: 38, borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, fontSize: 13 },
  actionBtn: { width: 38, height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 38, height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
