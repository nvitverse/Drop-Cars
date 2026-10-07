import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BookOpen, Send, Sparkles, HelpCircle } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

// "Helper" (Rules & Operations Assistant) for staff: ask how anything works and get the rule at once.
// Answers are the rules as they are built into the system; Command Centre is for DOING actions, Helper is for KNOWING rules.

interface Topic { id: string; title: string; words: string[]; answer: string }

const TOPICS: Topic[] = [
  {
    id: 'autopost', title: 'Website booking eppo post aagum?',
    words: ['auto post', 'autopost', 'eppo post', 'post aagum', 'schedule', 'timer', '15 hr', 'advance', 'when post', 'எப்போது'],
    answer: 'Customer booking-ai website-la confirm panna appo Website Approvals-ku varum.\n\n• 15 hrs-ku mela advance booking: pickup-ku 15 hrs munnadi thaanaaga post aagum (staff earlier-ah post pannalaam).\n• 2 - 15 hrs: staff on duty-na staff-kku wait, max pickup-ku 2 hrs munnadi varai. Off duty-na 5 min-la post.\n• 1 - 2 hrs: staff on duty 10 min, off duty 1 min.\n• 1 hr-kulla / urgent: 2 min (off duty 30 sec).\n\nOvvoru card-layum "Auto-posts <date, time>" and kaaranam theriyum.',
  },
  {
    id: 'changetime', title: 'Post time-ai maatrunadhu / Hold',
    words: ['change time', 'time maatru', 'reschedule', 'hold', 'pause', 'select', 'maatra', 'மாற்ற'],
    answer: 'Website Approvals-la:\n• Card-la "Change time": "X hours before pickup" illa exact date & time kudunga. Latest = pickup-ku 2 hrs munnadi.\n• Card-oda checkbox-ai thottu select pannunga (N selected varum). Bottom bar-la:\n   - Post now = udane post\n   - Hold = pickup-ku 2 hrs munnadi varai auto-post nirkum; appo alarm adichu rule padi post aagum\n   - Release = hold-ai edukkum\n• "Use the rule\'s time again" = nammaa set panna time-ai nikki rule time-ku pogum.',
  },
  {
    id: 'driverfare', title: 'Driver fare (driver | extra) eppadi?',
    words: ['driver fare', 'driver | extra', 'extra', 'tariff', 'customize', 'bata', 'permit', 'km rate', 'tarriff', 'ஃபேர்'],
    answer: 'Booking driver-kku "driver | extra" ah post aagum. Customer evlo kudutharo adhula driver tariff-padi driver paguthi driver-ku, meedhi extra-ku.\n\nDefault driver tariff (one-way / round km):\n• Sedan 15 / 13, bata 300\n• SUV 20 / 18, bata 300\n• Innova 20 / 19, bata 400\n• Crysta 24 / 22, bata 400\n\nPermit: Sedan 400; SUV/Innova/Crysta 1000 (Pondicherry 800); 7+1 Andhra 2000.\n\nMaatrunum-na: Tariffs > Driver (Owner mattum save). Oru booking-ku mattum: Website Approvals card > Customize.',
  },
  {
    id: 'hold500', title: 'Wallet hold ₹500 / commission',
    words: ['hold', '500', 'commission', 'refund', 'wallet hold', 'security'],
    answer: 'Booking accept pannumbodhu driver wallet-la kurainthadhu ₹500 hold aagum (commission 301 aanaalum 500). Commission + extras 500-ku mela irundha andha amount hold.\n\nTrip mudinjadhum commission kazhichu meedhi wallet-ku refund. Booking cancel aanaa full refund. Trip nadathala-na mattum penalty.',
  },
  {
    id: 'subscription', title: 'Driver ₹199 subscription',
    words: ['199', 'subscription', 'subs', 'monthly', 'renew', 'plan', 'trusted'],
    answer: '₹199 Monthly plan: pay panna udane activate (wallet-ku ₹199 add aagi plan edukkum). 30 naal Trusted / Preferred.\n\nAdutha month wallet-la ₹199 irundha thaanaaga renew; illa-na plan nikkum. 3 naal-ku mela lapse aana plan-ai thaanaaga edukkaadhu.\n\nPay pannitu activate aagala-na: 3 manineram-la recovery sweep thaanaaga seyyum; illa-na owner-kitta sollunga.',
  },
  {
    id: 'bookingtabs', title: 'Bookings tabs: Unassigned / Assigned / Running',
    words: ['running', 'assigned', 'unassigned', 'tab', 'live', 'started', 'ஓடுது'],
    answer: '• Unassigned: yaarum accept pannala.\n• Assigned: accept aagi driver/car add aagiduchu, aana trip innum start aagala.\n• Running: driver Start OTP potu trip nijamaave start aanadhukku apram mattum.\n• Completed / Cancelled: mudinjadhu / ratthu.',
  },
  {
    id: 'support', title: 'Support chat: auto reply, language, quick replies',
    words: ['support', 'password reset', 'reset', 'language', 'auto reply', 'quick reply', 'chat', 'otp', 'driver chat'],
    answer: 'Driver / owner help request vandha: mudhalla language kekkum (1 English, 2 Tamil, 3 Telugu, 4 Hindi, 5 Kannada), apuram avar mozhi-la reason-ku ethaar reply thaanaaga pogum. "MENU" anuppinaa topics varum.\n\nStaff pesinaal bot 1 mani neram amaidhiya irukkum. Mail anuppa maatom (SMTP limit) - push mattum.\n\nReply box mela quick-reply chips (Checking, Need details, Send photo ...) thottaa text fill aagum.',
  },
  {
    id: 'ticks', title: 'Chat ticks / voice',
    words: ['tick', 'read', 'voice', 'seen', 'delivered'],
    answer: '1 tick = anuppiyaachu. 2 tick = avar padithuvitaar. Voice message-la mins:secs kaattum; play aagala-na refresh pannunga (voice server vazhiyaa play aagum).',
  },
  {
    id: 'duty', title: 'Duty on/off and alarm',
    words: ['duty', 'alarm', 'on duty', 'off duty', 'acknowledge', 'handle manually'],
    answer: 'Alarm On Duty-la irukkum bodhu mattum adikkum. Website booking-ku 1 minute alarm + ACKNOWLEDGE button; apuram rule padi auto-post.\n"Handle manually" max 2 hrs. Held booking, hold mudiyum 15 min munnadi oru thadavai alarm adikkum.\nApp use pannaama 5 min aanaa duty "present" illa-nu eduthukkum (booking-ai thaanaaga post pannum).',
  },
  {
    id: 'priority', title: 'Trusted Partner priority',
    words: ['trusted', 'preferred', 'priority', 'reserve', 'cutoff'],
    answer: 'Website-la irundhu post aagura booking, cutoff varai Trusted (Preferred) partner-kku mattum reserve. Cutoff = Assignment & Priority Rules-la set panna hours (illa-na pickup-ku nadu + 2 hrs buffer, iravu protection). Cutoff-ukku apuram ellarukkum.',
  },
  {
    id: 'editfare', title: 'Posted booking-oda fare maatrunadhu',
    words: ['edit fare', 'edit', 'fare maatru', 'posted booking'],
    answer: 'Post aana booking-ku: Operations > Bookings > card > Edit (Edit Fare). Post aagaadha booking-ku: Website Approvals > Customize. Customer total, driver paguthi + extra ellaam serndhu thaan.',
  },
];

function answerFor(q: string): { text: string; topic?: Topic } {
  const t = q.toLowerCase();
  let best: { topic: Topic; score: number } | null = null;
  for (const topic of TOPICS) {
    let score = 0;
    for (const w of topic.words) if (t.includes(w)) score += w.length;
    if (topic.title.toLowerCase().includes(t) && t.length > 2) score += 5;
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  if (best) return { text: best.topic.answer, topic: best.topic };
  return { text: 'Idhukku ennidam answer illa. Keezha irukkura topics-la ondrai thottunga, illa vera maadhiri kelunga. Seiya vendiya velaiyaa (post, cancel, create) irundha Command Centre-la sollunga.' };
}

export default function InfoChatScreen() {
  const router = useRouter();
  const { themeColors: c } = useTheme();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ id: number; mine: boolean; text: string }>>([
    { id: 1, mine: false, text: 'Vanakkam! Idhu DropCars Helper. Enna doubt-aanaalum kelunga: booking eppo post aagum, driver fare, hold, subscription, support chat... Keezha topic-ai thottaalum podhum.' },
  ]);
  const listRef = useRef<FlatList>(null);
  const idRef = useRef(2);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const reply = answerFor(text);
    setMessages((m) => [...m, { id: idRef.current++, mine: true, text }, { id: idRef.current++, mine: false, text: reply.text }]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const chips = useMemo(() => TOPICS, []);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} style={{ padding: 6, marginRight: 8 }} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={c.text} />
        </TouchableOpacity>
        <View style={[s.avatar, { backgroundColor: c.successLight }]}>
          <BookOpen size={18} color={c.success} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.title, { color: c.text }]}>Helper</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>DropCars Rules & Operations Assistant</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 14, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.mine ? { alignSelf: 'flex-end', backgroundColor: c.primary } : { alignSelf: 'flex-start', backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
              <Text style={{ color: item.mine ? '#fff' : c.text, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
            </View>
          )}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, backgroundColor: c.surface }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
          {chips.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => ask(t.title)} style={[s.chip, { borderColor: c.border, backgroundColor: c.background }]} activeOpacity={0.7}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>{t.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[s.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <TextInput
            style={[s.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
            placeholder="Ask a doubt or rule..."
            placeholderTextColor={c.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => ask(input)}
            returnKeyType="send"
          />
          <TouchableOpacity onPress={() => ask(input)} disabled={!input.trim()} style={[s.send, { backgroundColor: c.primary, opacity: input.trim() ? 1 : 0.5 }]}>
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  bubble: { maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, height: 40, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  send: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
