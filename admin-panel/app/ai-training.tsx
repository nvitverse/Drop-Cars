import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Brain,
  MessageSquare,
  Settings,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  AlertCircle,
  Send,
  Zap,
  Bot,
  UserCheck,
  RefreshCw,
  Key,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  aiTrainingApi,
  TrainingRule,
  ChatLogItem,
  AISettings,
} from '@/services/aiTrainingApi';

export default function AITrainingScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();

  // Active Tab: 'RULES' | 'LOGS' | 'SETTINGS' | 'SIMULATOR'
  const [activeTab, setActiveTab] = useState<'RULES' | 'LOGS' | 'SETTINGS' | 'SIMULATOR'>('RULES');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [rules, setRules] = useState<TrainingRule[]>([]);
  const [logs, setLogs] = useState<ChatLogItem[]>([]);
  const [settings, setSettings] = useState<AISettings>({
    ai_mode: 'RULE_BASED',
    has_api_key: false,
    operator_name: 'Priya (Dispatch Lead)',
    is_enabled: true,
  });

  // Filter / Search
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState<TrainingRule | null>(null);
  const [correctingLog, setCorrectingLog] = useState<ChatLogItem | null>(null);

  // Form states for Add / Edit Rule
  const [questionInput, setQuestionInput] = useState('');
  const [triggersInput, setTriggersInput] = useState('');
  const [responseEnInput, setResponseEnInput] = useState('');
  const [responseTaInput, setResponseTaInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('CUSTOM_TRAINING');
  const [suggestionsInput, setSuggestionsInput] = useState('');
  const [followUpInput, setFollowUpInput] = useState('');

  // Settings form
  const [operatorNameInput, setOperatorNameInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<'RULE_BASED' | 'HYBRID_LLM'>('RULE_BASED');

  // Simulator states
  const [testQuery, setTestQuery] = useState('');
  const [testLang, setTestLang] = useState<'ta' | 'en'>('ta');
  const [simResults, setSimResults] = useState<Array<{ role: 'user' | 'bot'; text: string; meta?: any }>>([
    {
      role: 'bot',
      text: 'வணக்கம்! நான் Drop Cars டெஸ்க் ஆபரேட்டர் பிரியா. உங்களுக்கு உதவ காத்திருக்கிறேன். உங்கள் சந்தேகங்களை அல்லது பயண வழியை (e.g. "Chennai to Salem", "Ooty package") தட்டச்சு செய்து பரிசோதிக்கலாம்!',
      meta: {
        engine: 'CONVERSATIONAL_CLARIFICATION_ENGINE',
        suggestions: ['Chennai to Trichy', 'Ooty package', 'Luggage in sedan', 'Pet allowed ah?'],
      },
    },
  ]);
  const [simulating, setSimulating] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rulesRes, logsRes, settingsRes] = await Promise.all([
        aiTrainingApi.getRules().catch(() => ({ count: 0, rules: [] })),
        aiTrainingApi.getLogs().catch(() => ({ count: 0, logs: [] })),
        aiTrainingApi.getSettings().catch(() => ({
          ai_mode: 'RULE_BASED' as const,
          has_api_key: false,
          operator_name: 'Priya (Dispatch Lead)',
          is_enabled: true,
        })),
      ]);
      setRules(rulesRes.rules || []);
      setLogs(logsRes.logs || []);
      setSettings(settingsRes);
      setOperatorNameInput(settingsRes.operator_name || 'Priya (Dispatch Lead)');
      setSelectedMode(settingsRes.ai_mode || 'RULE_BASED');
    } catch (e: any) {
      console.error('Failed to load AI training data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules;
    const q = searchQuery.toLowerCase().trim();
    return rules.filter(
      (r) =>
        (r.question && r.question.toLowerCase().includes(q)) ||
        r.triggers.some((t) => t.toLowerCase().includes(q)) ||
        r.category.toLowerCase().includes(q) ||
        r.response_ta.toLowerCase().includes(q) ||
        r.response_en.toLowerCase().includes(q)
    );
  }, [rules, searchQuery]);

  const handleOpenAddModal = (rule?: TrainingRule) => {
    if (rule) {
      setEditingRule(rule);
      setQuestionInput(rule.question || '');
      setTriggersInput(rule.triggers.join(', '));
      setResponseEnInput(rule.response_en || '');
      setResponseTaInput(rule.response_ta || '');
      setCategoryInput(rule.category || 'CUSTOM_TRAINING');
      setSuggestionsInput((rule.suggestions || []).join(', '));
      setFollowUpInput(rule.follow_up_prompt || '');
    } else {
      setEditingRule(null);
      setQuestionInput('');
      setTriggersInput('');
      setResponseEnInput('');
      setResponseTaInput('');
      setCategoryInput('CUSTOM_TRAINING');
      setSuggestionsInput('');
      setFollowUpInput('');
    }
    setShowAddModal(true);
  };

  const handleSaveRule = async () => {
    const rawTriggers = triggersInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!rawTriggers.length && !questionInput.trim()) {
      Alert.alert('Missing Question / Triggers', 'Please provide a question or at least one trigger keyword.');
      return;
    }
    const finalTriggers = rawTriggers.length ? rawTriggers : [questionInput.trim()];

    if (!responseEnInput.trim() && !responseTaInput.trim()) {
      Alert.alert('Missing Response', 'Please provide an answer in Tamil or English.');
      return;
    }

    const suggestions = suggestionsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editingRule) {
        await aiTrainingApi.updateRule(editingRule.id, {
          question: questionInput.trim() || undefined,
          triggers: finalTriggers,
          response_en: responseEnInput.trim() || responseTaInput.trim(),
          response_ta: responseTaInput.trim() || responseEnInput.trim(),
          category: categoryInput.trim().toUpperCase(),
          suggestions,
          follow_up_prompt: followUpInput.trim() || undefined,
        });
        Alert.alert('Success', 'Rule updated successfully!');
      } else {
        await aiTrainingApi.createRule({
          question: questionInput.trim() || finalTriggers[0],
          triggers: finalTriggers,
          response_en: responseEnInput.trim() || responseTaInput.trim(),
          response_ta: responseTaInput.trim() || responseEnInput.trim(),
          category: categoryInput.trim().toUpperCase(),
          suggestions,
          follow_up_prompt: followUpInput.trim() || undefined,
        });
        Alert.alert('Success', 'New knowledge rule trained successfully!');
      }
      setShowAddModal(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save rule');
    }
  };

  const handleSeedFaqs = async () => {
    try {
      setLoading(true);
      const res = await aiTrainingApi.seedFaqs();
      Alert.alert('Standard FAQs Loaded', res.message || '20+ Standard Outstation FAQs seeded!');
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to seed FAQs');
      setLoading(false);
    }
  };

  const handleDeleteRule = (ruleId: string) => {
    Alert.alert('Delete Rule', 'Are you sure you want to remove this training rule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await aiTrainingApi.deleteRule(ruleId);
            setRules((prev) => prev.filter((r) => r.id !== ruleId));
          } catch (e: any) {
            Alert.alert('Error', 'Failed to delete rule');
          }
        },
      },
    ]);
  };

  const handleStartCorrection = (log: ChatLogItem) => {
    setCorrectingLog(log);
    setQuestionInput(log.query);
    setTriggersInput(log.query);
    setResponseTaInput(log.response || '');
    setResponseEnInput(log.response || '');
    setCategoryInput(log.category || 'ADMIN_CORRECTION');
    setSuggestionsInput('🚗 Continue Booking, 📞 Call Support Desk');
    setFollowUpInput('');
    setShowAddModal(true);
  };

  const handleSaveSettings = async () => {
    try {
      await aiTrainingApi.updateSettings({
        ai_mode: selectedMode,
        operator_name: operatorNameInput.trim(),
        api_key: apiKeyInput.trim() || undefined,
      });
      Alert.alert('Settings Saved', 'AI Assistant configuration updated successfully!');
      setApiKeyInput('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update settings');
    }
  };

  const handleResetSession = async () => {
    try {
      await aiTrainingApi.resetSession('admin_simulator');
      setSimResults([
        {
          role: 'bot',
          text: `🔄 Multi-turn session reset! வணக்கம்! நான் Drop Cars டெஸ்க் ஆபரேட்டர் ${settings.operator_name}.\n\nநீங்கள் எங்கிருந்து எங்கு செல்ல வேண்டும்? (e.g. 'Chennai to Salem' அல்லது 'Ooty package' என்று தட்டச்சு செய்து பரிசோதிக்கலாம்)`,
          meta: {
            engine: 'CONVERSATIONAL_CLARIFICATION_ENGINE',
            suggestions: ['Chennai to Trichy', 'Chennai to Salem', 'Ooty package', 'Luggage in Swift'],
          },
        },
      ]);
    } catch (e) {
      // Non-fatal
    }
  };

  const handleSendSimulator = async (textOverride?: string) => {
    const q = (textOverride || testQuery).trim();
    if (!q || simulating) return;
    if (!textOverride) setTestQuery('');
    setSimResults((prev) => [...prev, { role: 'user', text: q }]);
    setSimulating(true);

    try {
      const res = await aiTrainingApi.testChat(q, testLang, 'admin_simulator');
      setSimResults((prev) => [
        ...prev,
        {
          role: 'bot',
          text: res.reply,
          meta: {
            engine: res.engine,
            category: res.category,
            suggestions: res.suggestions,
            matched_trigger: res.matched_trigger,
          },
        },
      ]);
    } catch (e: any) {
      setSimResults((prev) => [
        ...prev,
        {
          role: 'bot',
          text: 'Error getting simulation response: ' + (e?.message || 'Network error'),
        },
      ]);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/chats');
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Brain size={20} color={themeColors.primary} />
            <Text style={[styles.title, { color: themeColors.text }]}>AI Knowledge & Training Hub</Text>
          </View>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Human-Grade Chat Assistant & Self-Learning Engine
          </Text>
        </View>
        <View
          style={[
            styles.modePill,
            {
              backgroundColor: settings.ai_mode === 'HYBRID_LLM' ? (isDark ? '#065F46' : '#ECFDF5') : isDark ? '#1E293B' : '#F1F5F9',
              borderColor: settings.ai_mode === 'HYBRID_LLM' ? '#10B981' : themeColors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.modePillText,
              { color: settings.ai_mode === 'HYBRID_LLM' ? (isDark ? '#6EE7B7' : '#047857') : themeColors.textSecondary },
            ]}
          >
            {settings.ai_mode === 'HYBRID_LLM' ? '✨ LLM Bridge Active' : '🟢 Human Rule Engine'}
          </Text>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={[styles.tabBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'RULES' && { borderBottomColor: themeColors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('RULES')}
        >
          <Brain size={16} color={activeTab === 'RULES' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'RULES' ? themeColors.primary : themeColors.textSecondary }]}>
            Knowledge Rules ({rules.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'LOGS' && { borderBottomColor: themeColors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('LOGS')}
        >
          <MessageSquare size={16} color={activeTab === 'LOGS' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'LOGS' ? themeColors.primary : themeColors.textSecondary }]}>
            Logs & Fixes ({logs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'SIMULATOR' && { borderBottomColor: themeColors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('SIMULATOR')}
        >
          <Sparkles size={16} color={activeTab === 'SIMULATOR' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'SIMULATOR' ? themeColors.primary : themeColors.textSecondary }]}>
            Simulator
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'SETTINGS' && { borderBottomColor: themeColors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('SETTINGS')}
        >
          <Settings size={16} color={activeTab === 'SETTINGS' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'SETTINGS' ? themeColors.primary : themeColors.textSecondary }]}>
            Persona & Bridge
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ marginTop: 10, color: themeColors.textSecondary, fontSize: 13 }}>Loading Knowledge Base...</Text>
        </View>
      ) : activeTab === 'RULES' ? (
        <View style={{ flex: 1 }}>
          {/* Search & Actions bar */}
          <View style={[styles.searchBarWrap, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <View style={[styles.searchInputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Search size={16} color={themeColors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search questions, triggers, or answers..."
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.searchInput, { color: themeColors.text }]}
              />
            </View>
            <TouchableOpacity
              style={[styles.seedBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.primary }]}
              onPress={handleSeedFaqs}
            >
              <Sparkles size={14} color={themeColors.primary} />
              <Text style={[styles.seedBtnText, { color: themeColors.primary }]}>Seed FAQs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: themeColors.primary }]}
              onPress={() => handleOpenAddModal()}
            >
              <Plus size={16} color="#FFF" />
              <Text style={styles.addBtnText}>+ Train Q&A</Text>
            </TouchableOpacity>
          </View>

          {/* Rules List */}
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
            {filteredRules.map((rule) => (
              <View
                key={rule.id}
                style={[
                  styles.ruleCard,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                ]}
              >
                <View style={styles.ruleHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                    <View style={[styles.categoryBadge, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF' }]}>
                      <Text style={[styles.categoryText, { color: themeColors.primary }]}>{rule.category}</Text>
                    </View>
                    {rule.question ? (
                      <Text style={[styles.ruleQuestionHeading, { color: themeColors.text }]} numberOfLines={1}>
                        ❓ {rule.question}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => handleOpenAddModal(rule)} style={styles.iconBtn}>
                      <Edit3 size={15} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteRule(rule.id)} style={styles.iconBtn}>
                      <Trash2 size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Triggers */}
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Triggers / Alternate Questions:</Text>
                <View style={styles.chipsRow}>
                  {rule.triggers.map((t, idx) => (
                    <View key={idx} style={[styles.triggerChip, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                      <Text style={[styles.triggerText, { color: themeColors.text }]}>"{t}"</Text>
                    </View>
                  ))}
                </View>

                {/* Follow-up Question if configured */}
                {rule.follow_up_prompt ? (
                  <View style={{ marginTop: 8, padding: 8, borderRadius: 6, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF' }}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#6366F1' }}>
                      👉 Clarifying Follow-up Question: "{rule.follow_up_prompt}"
                    </Text>
                  </View>
                ) : null}

                {/* Responses */}
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 8 }]}>Tamil / Tanglish Response:</Text>
                <Text style={[styles.responseBox, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  {rule.response_ta}
                </Text>

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 6 }]}>English Response:</Text>
                <Text style={[styles.responseBox, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  {rule.response_en}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : activeTab === 'LOGS' ? (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
          <View style={[styles.noticeBar, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: '#818CF8' }]}>
            <Zap size={18} color="#6366F1" />
            <Text style={[styles.noticeText, { color: isDark ? '#C7D2FE' : '#312E81' }]}>
              Here are real questions asked by users. If the bot gave a wrong answer or didn't understand, click "💡 Correct & Train" to teach it the right answer instantly!
            </Text>
          </View>

          {logs.map((log) => (
            <View
              key={log.id}
              style={[
                styles.logCard,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: themeColors.textSecondary }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : 'Recent'} · Category: {log.category}
                </Text>
                <TouchableOpacity
                  style={[styles.correctBtn, { backgroundColor: isDark ? '#065F46' : '#ECFDF5', borderColor: '#10B981' }]}
                  onPress={() => handleStartCorrection(log)}
                >
                  <Sparkles size={12} color="#10B981" />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: isDark ? '#6EE7B7' : '#065F46' }}>
                    💡 Correct & Train
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: themeColors.text, marginTop: 6 }}>
                User Query: "{log.query}"
              </Text>
              <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Regular', color: themeColors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                Bot Replied: {log.response || '(No automated response)'}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : activeTab === 'SIMULATOR' ? (
        <View style={{ flex: 1 }}>
          {/* Language selector & Multi-turn Session Reset */}
          <View style={[styles.simTop, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setTestLang('ta')}
                style={[
                  styles.langPill,
                  testLang === 'ta' ? { backgroundColor: themeColors.primary } : { backgroundColor: themeColors.background, borderColor: themeColors.border, borderWidth: 1 },
                ]}
              >
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: testLang === 'ta' ? '#FFF' : themeColors.text }}>Tamil / Tanglish</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTestLang('en')}
                style={[
                  styles.langPill,
                  testLang === 'en' ? { backgroundColor: themeColors.primary } : { backgroundColor: themeColors.background, borderColor: themeColors.border, borderWidth: 1 },
                ]}
              >
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: testLang === 'en' ? '#FFF' : themeColors.text }}>English</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleResetSession}
              style={[styles.resetBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
            >
              <RefreshCw size={12} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: themeColors.textSecondary }}>Reset Turn Session</Text>
            </TouchableOpacity>
          </View>

          {/* Banner: Typo Tolerance & Multi-Turn Clarification */}
          <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: isDark ? '#131B2E' : '#F0F9FF', borderBottomWidth: 1, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Zap size={14} color="#0284C7" />
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: isDark ? '#7DD3FC' : '#0369A1', flex: 1 }}>
              💡 Spelling-mistake tolerance & multi-turn questions active! Tap suggestion chips or type with typos (e.g. "chenai to slm fare").
            </Text>
          </View>

          {/* Chat Messages */}
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10, flexGrow: 1 }}>
            {simResults.map((msg, idx) => (
              <View key={idx}>
                <View
                  style={[
                    styles.chatBubble,
                    msg.role === 'user' ? styles.userBubble : styles.botBubble,
                    {
                      backgroundColor: msg.role === 'user' ? themeColors.primary : themeColors.surface,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  {msg.role === 'bot' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Bot size={13} color={themeColors.primary} />
                      <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: themeColors.primary }}>
                        {settings.operator_name} {msg.meta?.engine ? `(${msg.meta.engine})` : ''}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 13.5, lineHeight: 19, color: msg.role === 'user' ? '#FFF' : themeColors.text }}>
                    {msg.text}
                  </Text>
                </View>

                {/* Clickable Quick Action Suggestion Chips under Bot Bubble */}
                {msg.role === 'bot' && msg.meta?.suggestions && msg.meta.suggestions.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 4 }}>
                    {msg.meta.suggestions.map((sug: string, sIdx: number) => (
                      <TouchableOpacity
                        key={sIdx}
                        onPress={() => handleSendSimulator(sug)}
                        style={[
                          styles.simChip,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                            borderColor: isDark ? '#3B82F6' : '#BFDBFE',
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: isDark ? '#93C5FD' : '#1D4ED8' }}>
                          {sug}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {simulating && (
              <View style={[styles.chatBubble, styles.botBubble, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            )}
          </ScrollView>

          {/* Test Input bar */}
          <View style={[styles.simInputBar, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
            <TextInput
              value={testQuery}
              onChangeText={setTestQuery}
              placeholder="Type test query (e.g. 'Chennai to Trichy fare', 'Ooty package', 'Luggage in swift')..."
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.simInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
            />
            <TouchableOpacity
              onPress={() => handleSendSimulator()}
              disabled={simulating || !testQuery.trim()}
              style={[styles.sendBtn, { backgroundColor: themeColors.primary, opacity: simulating || !testQuery.trim() ? 0.6 : 1 }]}
            >
              <Send size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Settings Tab */
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={[styles.settingCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Operator Personality & Name</Text>
            <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>
              The assistant greets customers with this human dispatcher persona.
            </Text>
            <TextInput
              value={operatorNameInput}
              onChangeText={setOperatorNameInput}
              placeholder="e.g. Priya (Dispatch Lead)"
              placeholderTextColor={themeColors.textSecondary}
              style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
            />
          </View>

          <View style={[styles.settingCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Intelligence Engine Mode</Text>
            <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>
              Choose whether the assistant operates on deterministic human rules (free, instant) or connects to an LLM bridge.
            </Text>

            <TouchableOpacity
              style={[
                styles.modeOption,
                selectedMode === 'RULE_BASED' && { borderColor: themeColors.primary, backgroundColor: isDark ? '#1E293B' : '#EEF2FF' },
                { borderColor: themeColors.border },
              ]}
              onPress={() => setSelectedMode('RULE_BASED')}
            >
              <UserCheck size={20} color={selectedMode === 'RULE_BASED' ? themeColors.primary : themeColors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: themeColors.text }]}>🟢 Deterministic Human Rule Engine</Text>
                <Text style={[styles.modeSub, { color: themeColors.textSecondary }]}>
                  100% Free, Zero external dependency, Instant 0ms response, strictly follows your exact tariffs and trained rules.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeOption,
                selectedMode === 'HYBRID_LLM' && { borderColor: themeColors.primary, backgroundColor: isDark ? '#1E293B' : '#EEF2FF' },
                { borderColor: themeColors.border },
              ]}
              onPress={() => setSelectedMode('HYBRID_LLM')}
            >
              <Sparkles size={20} color={selectedMode === 'HYBRID_LLM' ? themeColors.primary : themeColors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: themeColors.text }]}>✨ Hybrid LLM Mode (Gemini / OpenAI API Key)</Text>
                <Text style={[styles.modeSub, { color: themeColors.textSecondary }]}>
                  Enhances natural conversational fluidity using your API Key while automatically falling back to human rules if API fails.
                </Text>
              </View>
            </TouchableOpacity>

            {selectedMode === 'HYBRID_LLM' && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                  Gemini / OpenAI API Key: {settings.has_api_key ? `(Configured: ${settings.masked_api_key})` : '(Not configured yet)'}
                </Text>
                <TextInput
                  value={apiKeyInput}
                  onChangeText={setApiKeyInput}
                  placeholder="Enter API Key to activate LLM bridge..."
                  secureTextEntry
                  placeholderTextColor={themeColors.textSecondary}
                  style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background, marginTop: 4 }]}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveSettingsBtn, { backgroundColor: themeColors.primary }]}
              onPress={handleSaveSettings}
            >
              <CheckCircle2 size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>Save AI Configuration</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Add / Edit Knowledge Rule Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
              {editingRule ? 'Edit Knowledge Rule' : correctingLog ? '💡 Teach Correct Response' : 'Train New Knowledge Rule'}
            </Text>

            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 4 }]}>
                Primary Question / தலைப்பு கேள்வி (Optional):
              </Text>
              <TextInput
                value={questionInput}
                onChangeText={setQuestionInput}
                placeholder="e.g. Can I travel with dog/pets? or Ooty tour package rate?"
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>
                Trigger Keywords / Alternate Phrasings (comma-separated):
              </Text>
              <TextInput
                value={triggersInput}
                onChangeText={setTriggersInput}
                placeholder="e.g. pet allowed, dog in car, pet charges, நாய்க்குட்டி"
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>Category:</Text>
              <TextInput
                value={categoryInput}
                onChangeText={setCategoryInput}
                placeholder="e.g. TOUR_PACKAGE, POLICY, TARIFF, VEHICLE_FIT, FAQS"
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>Tamil / Tanglish Response:</Text>
              <TextInput
                value={responseTaInput}
                onChangeText={setResponseTaInput}
                placeholder="Type response in Tamil/Tanglish..."
                multiline
                numberOfLines={4}
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textArea, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>English Response:</Text>
              <TextInput
                value={responseEnInput}
                onChangeText={setResponseEnInput}
                placeholder="Type response in English..."
                multiline
                numberOfLines={4}
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textArea, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>
                Clarifying Follow-up Question (Optional / அடுத்த கேள்வி):
              </Text>
              <TextInput
                value={followUpInput}
                onChangeText={setFollowUpInput}
                placeholder="e.g. எந்த ஊரிலிருந்து எங்கு செல்ல திட்டமிட்டுள்ளீர்கள் sir?"
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginTop: 10 }]}>
                Quick Action Suggestion Chips (comma-separated):
              </Text>
              <TextInput
                value={suggestionsInput}
                onChangeText={setSuggestionsInput}
                placeholder="e.g. 🚗 Book Sedan, 🚙 Book SUV 7S, 📞 Call Support Desk"
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: themeColors.border }]} onPress={() => setShowAddModal(false)}>
                <Text style={{ color: themeColors.text, fontFamily: 'Inter-Medium' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary }]} onPress={handleSaveRule}>
                <Text style={{ color: '#FFF', fontFamily: 'Inter-Bold' }}>Save Rule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  title: { fontSize: 16, fontFamily: 'Inter-Bold' },
  subtitle: { fontSize: 11.5, fontFamily: 'Inter-Regular', marginTop: 1 },
  modePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  modePillText: { fontSize: 11, fontFamily: 'Inter-Bold' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  tabText: { fontSize: 12, fontFamily: 'Inter-Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBarWrap: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, alignItems: 'center' },
  searchInputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  searchInput: { flex: 1, height: 38, fontSize: 13 },
  seedBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 38, borderRadius: 8, borderWidth: 1, justifyContent: 'center' },
  seedBtnText: { fontSize: 12, fontFamily: 'Inter-Bold' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, justifyContent: 'center' },
  addBtnText: { color: '#FFF', fontSize: 12.5, fontFamily: 'Inter-Bold' },
  ruleCard: { padding: 14, borderRadius: 10, borderWidth: 1 },
  ruleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ruleQuestionHeading: { fontSize: 13, fontFamily: 'Inter-Bold', flex: 1 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  categoryText: { fontSize: 11, fontFamily: 'Inter-Bold' },
  iconBtn: { padding: 4 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter-Bold', marginBottom: 3 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  triggerChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  triggerText: { fontSize: 11.5, fontFamily: 'Inter-Medium' },
  responseBox: { padding: 8, borderRadius: 6, borderWidth: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Regular' },
  logCard: { padding: 12, borderRadius: 10, borderWidth: 1 },
  correctBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  noticeBar: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Medium' },
  simTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  langPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chatBubble: { maxWidth: '85%', padding: 12, borderRadius: 12, borderWidth: 1 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  botBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  simChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  simInputBar: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, alignItems: 'center' },
  simInput: { flex: 1, height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 13 },
  sendBtn: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingCard: { padding: 16, borderRadius: 12, borderWidth: 1 },
  sectionTitle: { fontSize: 14.5, fontFamily: 'Inter-Bold', marginBottom: 4 },
  settingDesc: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Regular', marginBottom: 12 },
  textInput: { height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 13 },
  textArea: { height: 80, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, textAlignVertical: 'top' },
  modeOption: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  modeTitle: { fontSize: 13.5, fontFamily: 'Inter-Bold' },
  modeSub: { fontSize: 11.5, fontFamily: 'Inter-Regular', marginTop: 3, lineHeight: 16 },
  saveSettingsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 8, marginTop: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox: { borderRadius: 14, padding: 18 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter-Bold', marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
});
