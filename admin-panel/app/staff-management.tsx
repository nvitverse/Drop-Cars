import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, UserPlus, Shield, Trash2, Package, UserCheck, Users, Wallet, X, History, ChevronRight, ClipboardCheck, FileCheck, UserCog, ShieldCheck, MessageSquare, Target, Megaphone, Mic, Square, Send, Radio, Trash, Pencil } from 'lucide-react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import VoiceNoteButton from '@/components/VoiceNoteButton';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Owner-only staff management: create Staff accounts and control exactly
// which sections (Leads/CRM, Bookings/Customers/Fleet/Finance) each one can reach.
// Settings is deliberately not a grantable permission anywhere in this
// screen or the backend - only an Owner ever reaches staff management, so
// a Staff account can never create more staff or grant itself more access.
const PERMISSION_OPTIONS: { key: string; label: string; icon: any }[] = [
  { key: 'enquiries', label: 'Leads/CRM', icon: MessageSquare },
  { key: 'bookings', label: 'Bookings', icon: Package },
  { key: 'customers', label: 'Customers', icon: UserCheck },
  { key: 'fleet', label: 'Fleet', icon: Users },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'chats', label: 'Chats', icon: MessageSquare },
  { key: 'tasks', label: 'Tasks', icon: ClipboardCheck },
];

// Keys the server allows that this screen has no built-in label for (owner adds them in Settings -> `staff_permission_keys`).
const KNOWN_PERMISSION_KEYS = new Set<string>([
  'enquiries', 'bookings', 'customers', 'fleet', 'finance', 'chats', 'tasks',
  'approvals', 'verifications', 'account_activations', 'payment_release',
  'tax_accounts', 'trusted_partner_management', 'support', 'accounts',
]);

// Finer-grained action permissions, anticipating a future "Accounts
// Manager" role that needs some-but-not-all of a section's actions.
// "Payment Release" is the only one actually enforced server-side today
// (gates wallet-adjust and payout-pay); the other three are grantable and
// shown here as documented intent, same not-yet-enforced state the four
// section permissions above are already in.
const ACTION_PERMISSION_OPTIONS: { key: string; label: string; icon: any; enforced?: boolean }[] = [
  { key: 'approvals', label: 'Booking Approvals', icon: ClipboardCheck },
  { key: 'verifications', label: 'Document Verifications', icon: FileCheck },
  { key: 'account_activations', label: 'Account Activations', icon: UserCog },
  { key: 'payment_release', label: 'Payment Release', icon: ShieldCheck, enforced: true },
];

type StaffMember = {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  permissions: string[];
};

type StaffTargetRow = {
  admin_id: string;
  username: string;
  calls_target: number;
  approvals_target: number;
  checkins_target: number;
  updated_at: string;
};

type StaffDirective = {
  id: string;
  message: string | null;
  voice_note_url: string | null;
  target_admin_ids: string[] | null;
  created_by_username: string;
  created_at: string;
};

export default function StaffManagementScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraPermKeys, setExtraPermKeys] = useState<string[]>([]);
  const [pendingPermKey, setPendingPermKey] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>([]);

  const [dailyTarget, setDailyTarget] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  // Edit an existing staff member's own details - previously there was no
  // way to fix a wrong/outdated phone number once the account was created.
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditStaff = (member: StaffMember) => {
    setEditingMember(member);
    setEditUsername(member.username || '');
    setEditEmail(member.email || '');
    setEditPhone(member.phone || '');
  };

  const handleSaveStaffEdit = async () => {
    if (!editingMember) return;
    if (editPhone && !/^[6-9]\d{9}$/.test(editPhone)) {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit mobile number.');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await apiService.updateStaffDetails(editingMember.id, {
        username: editUsername.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
      });
      setStaff((prev) => prev.map((s) => (s.id === editingMember.id ? { ...s, ...updated } : s)));
      setEditingMember(null);
      showToast('Staff details updated.', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update staff details');
    } finally {
      setSavingEdit(false);
    }
  };

  // Per-staff daily numeric targets (Calls / Approvals / Check-ins) -
  // separate from the shared "actions/day" dailyTarget above.
  const [staffTargets, setStaffTargets] = useState<Record<string, StaffTargetRow>>({});
  const [targetModalMember, setTargetModalMember] = useState<StaffMember | null>(null);
  const [targetCallsInput, setTargetCallsInput] = useState('');
  const [targetApprovalsInput, setTargetApprovalsInput] = useState('');
  const [targetCheckinsInput, setTargetCheckinsInput] = useState('');
  const [savingStaffTarget, setSavingStaffTarget] = useState(false);

  // Publish Directive - text/voice broadcast to Staff.
  const [directives, setDirectives] = useState<StaffDirective[]>([]);
  const [loadingDirectives, setLoadingDirectives] = useState(true);
  const [directiveModalVisible, setDirectiveModalVisible] = useState(false);
  const [directiveMessage, setDirectiveMessage] = useState('');
  const [directiveTargetMode, setDirectiveTargetMode] = useState<'all' | 'specific'>('all');
  const [directiveTargetIds, setDirectiveTargetIds] = useState<string[]>([]);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deletingDirectiveId, setDeletingDirectiveId] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await apiService.getAdminsList();
      setStaff(Array.isArray(list) ? list : []);
      try {
        const targetData = await apiService.getStaffTodayTarget();
        setDailyTarget(String(targetData.target));
      } catch (e) {
        // the daily-target box is optional - never block the staff list on it
      }
      try {
        const rbac: any = await apiService.getRbacRoles();
        const keys: string[] = Array.isArray(rbac?.available_permissions) ? rbac.available_permissions : [];
        setExtraPermKeys(keys.filter((k) => !KNOWN_PERMISSION_KEYS.has(k)));
      } catch (e) {
        // older backend without the list - built-in options still work
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load staff list');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStaffTargets = useCallback(async () => {
    try {
      const rows = await apiService.getStaffTargets();
      const byId: Record<string, StaffTargetRow> = {};
      (rows || []).forEach((r) => { byId[r.admin_id] = r; });
      setStaffTargets(byId);
    } catch (error) {
      // Non-fatal - target chips just stay blank if this fails
    }
  }, []);

  const loadDirectives = useCallback(async () => {
    try {
      setLoadingDirectives(true);
      const rows = await apiService.getStaffDirectives(20);
      setDirectives(Array.isArray(rows) ? rows : []);
    } catch (error) {
      // Non-fatal - the directives list just stays empty if this fails
    } finally {
      setLoadingDirectives(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadStaffTargets();
    loadDirectives();
  }, [load, loadStaffTargets, loadDirectives]);

  const openTargetModal = (member: StaffMember) => {
    const existing = staffTargets[member.id];
    setTargetCallsInput(existing ? String(existing.calls_target) : '0');
    setTargetApprovalsInput(existing ? String(existing.approvals_target) : '0');
    setTargetCheckinsInput(existing ? String(existing.checkins_target) : '0');
    setTargetModalMember(member);
  };

  const handleSaveStaffTarget = async () => {
    if (!targetModalMember) return;
    const calls = parseInt(targetCallsInput, 10);
    const approvals = parseInt(targetApprovalsInput, 10);
    const checkins = parseInt(targetCheckinsInput, 10);
    if ([calls, approvals, checkins].some((n) => isNaN(n) || n < 0)) {
      Alert.alert('Invalid target', 'Enter non-negative whole numbers for all three targets.');
      return;
    }
    setSavingStaffTarget(true);
    try {
      const updated = await apiService.setStaffDailyTarget(targetModalMember.id, {
        calls_target: calls,
        approvals_target: approvals,
        checkins_target: checkins,
      });
      setStaffTargets((prev) => ({ ...prev, [targetModalMember.id]: updated }));
      showToast(`Daily targets saved for ${targetModalMember.username}.`, 'success');
      setTargetModalMember(null);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save daily targets');
    } finally {
      setSavingStaffTarget(false);
    }
  };

  const toggleDirectiveTarget = (adminId: string) => {
    setDirectiveTargetIds((prev) => (prev.includes(adminId) ? prev.filter((id) => id !== adminId) : [...prev, adminId]));
  };

  const resetDirectiveComposer = () => {
    setDirectiveMessage('');
    setDirectiveTargetMode('all');
    setDirectiveTargetIds([]);
    setRecordedUri(null);
  };

  const handleStartRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      setRecordedUri(recorder.uri);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to stop recording');
    }
  };

  const handlePublishDirective = async () => {
    if (!directiveMessage.trim() && !recordedUri) {
      Alert.alert('Nothing to publish', 'Type a message and/or record a voice note first.');
      return;
    }
    if (directiveTargetMode === 'specific' && directiveTargetIds.length === 0) {
      Alert.alert('Choose staff', 'Select at least one staff member, or switch to "All Staff".');
      return;
    }
    setPublishing(true);
    try {
      let voiceNoteUrl: string | undefined;
      if (recordedUri) {
        const upload = await apiService.uploadDirectiveVoiceNote(recordedUri, 'audio/m4a');
        voiceNoteUrl = upload.voice_note_url;
      }
      await apiService.createStaffDirective({
        message: directiveMessage.trim() || undefined,
        voice_note_url: voiceNoteUrl,
        target_admin_ids: directiveTargetMode === 'all' ? null : directiveTargetIds,
      });
      showToast('Directive published to staff.', 'success');
      resetDirectiveComposer();
      setDirectiveModalVisible(false);
      loadDirectives();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to publish directive');
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteDirective = (directive: StaffDirective) => {
    Alert.alert('Retract directive?', 'Staff will no longer see this instruction.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Retract',
        style: 'destructive',
        onPress: async () => {
          setDeletingDirectiveId(directive.id);
          try {
            await apiService.deleteStaffDirective(directive.id);
            setDirectives((prev) => prev.filter((d) => d.id !== directive.id));
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to retract directive');
          } finally {
            setDeletingDirectiveId(null);
          }
        },
      },
    ]);
  };

  const formatDirectiveTargets = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'All Staff';
    const names = ids.map((id) => staff.find((s) => s.id === id)?.username || id);
    return names.join(', ');
  };

  const handleSaveTarget = async () => {
    const value = parseInt(dailyTarget, 10);
    if (isNaN(value) || value < 0) {
      Alert.alert('Invalid target', 'Enter a non-negative whole number.');
      return;
    }
    setSavingTarget(true);
    try {
      await apiService.setStaffTarget(value);
      showToast(`Staff daily target set to ${value} actions.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save target');
    } finally {
      setSavingTarget(false);
    }
  };

  const togglePermission = (key: string) => {
    setNewPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const resetForm = () => {
    setNewUsername('');
    setNewEmail('');
    setNewPhone('');
    setNewPassword('');
    setNewPermissions([]);
  };

  const handleAddStaff = async () => {
    if (!newUsername.trim() || !newEmail.trim() || !newPhone.trim() || !newPassword.trim()) {
      Alert.alert('Missing details', 'Fill in username, email, phone and password.');
      return;
    }
    // Backend wants exactly 10 digits starting 6-9: strip spaces, +91 / 91 / 0 prefix the owner may type.
    let phoneDigits = newPhone.replace(/\D/g, '');
    if (phoneDigits.length > 10 && phoneDigits.startsWith('91')) phoneDigits = phoneDigits.slice(-10);
    if (phoneDigits.length === 11 && phoneDigits.startsWith('0')) phoneDigits = phoneDigits.slice(1);
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
      Alert.alert('Check phone', 'Phone must be a 10-digit Indian mobile number (starts with 6, 7, 8 or 9).');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Check password', 'Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await apiService.createStaff({
        username: newUsername.trim(),
        email: newEmail.trim().toLowerCase(),
        phone: phoneDigits,
        password: newPassword,
        permissions: newPermissions,
      });
      setAddModalVisible(false);
      resetForm();
      await load();
      Alert.alert('Staff added', `${newUsername.trim()} can now sign in with the sections you granted.`);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to create staff account');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermissionLive = async (member: StaffMember, key: string) => {
    const pendingKey = `${member.id}:${key}`;
    if (pendingPermKey === pendingKey) return;
    setPendingPermKey(pendingKey);
    const next = member.permissions.includes(key)
      ? member.permissions.filter((p) => p !== key)
      : [...member.permissions, key];
    setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, permissions: next } : s)));
    try {
      await apiService.updateStaffPermissions(member.id, next);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update permissions');
      load();
    } finally {
      setPendingPermKey((cur) => (cur === pendingKey ? null : cur));
    }
  };

  const handleRemove = (member: StaffMember) => {
    Alert.alert(
      'Remove staff account?',
      `${member.username} will no longer be able to sign in. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.removeStaff(member.id);
              setStaff((prev) => prev.filter((s) => s.id !== member.id));
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to remove staff account');
            }
          },
        },
      ]
    );
  };

  const owners = staff.filter((s) => s.role === 'Owner');
  const staffMembers = staff.filter((s) => s.role !== 'Owner');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Staff & Roles</Text>
        <ThemeToggle size={20} />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: isDark ? '#334155' : '#EEF2FF' }]}
          onPress={() => setDirectiveModalVisible(true)}
          accessibilityLabel="Publish Directive"
        >
          <Megaphone size={16} color={isDark ? '#818CF8' : colors.primary} />
          <Text style={[styles.addBtnText, { color: isDark ? '#818CF8' : colors.primary }]}>Directive</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
          <UserPlus size={16} color="white" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          
          <TouchableOpacity style={[styles.activityLogLink, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={() => router.push('/staff-activity' as any)}>
            <History size={18} color={colors.primary} />
            <Text style={[styles.activityLogLinkText, { color: isDark ? '#60A5FA' : colors.primary }]}>View Staff Activity Log</Text>
            <ChevronRight size={16} color={themeColors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.activityLogLink, { backgroundColor: themeColors.surface, borderColor: themeColors.border, marginTop: 10 }]} onPress={() => router.push('/staff-daily-records' as any)}>
            <ClipboardCheck size={18} color={colors.primary} />
            <Text style={[styles.activityLogLinkText, { color: isDark ? '#60A5FA' : colors.primary }]}>View Staff Daily Records</Text>
            <ChevronRight size={16} color={themeColors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.targetCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.targetLabel, { color: themeColors.text }]}>Staff Daily Target (actions/day, shared by all staff)</Text>
            <View style={styles.targetRow}>
              <TextInput
                style={[styles.targetInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={dailyTarget}
                onChangeText={setDailyTarget}
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={themeColors.textMuted}
              />
              <TouchableOpacity style={styles.targetSaveBtn} onPress={handleSaveTarget} disabled={savingTarget}>
                {savingTarget ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.targetSaveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
            <Text style={[styles.targetHint, { color: themeColors.textSecondary }]}>Shown on every staff member's Dashboard as "Today's Target" against their own activity-log actions.</Text>
          </View>

          <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>Naveen (Founder & Lead)</Text>
          {owners.map((o) => (
            <View key={o.id} style={[styles.ownerCard, { backgroundColor: isDark ? '#451A03' : '#FFF7ED', borderColor: isDark ? '#78350F' : '#FFEDD5' }]}>
              <View style={styles.ownerIconWrap}>
                <Shield size={18} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ownerName, { color: isDark ? '#FDBA74' : '#1F2937' }]}>{o.username}</Text>
                <Text style={[styles.ownerHint, { color: isDark ? '#FED7AA' : '#9A3412' }]}>Full access to every section, including Staff & Roles</Text>
              </View>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Staff ({staffMembers.length})</Text>
          {staffMembers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Users size={28} color="#CBD5E1" />
              <Text style={styles.emptyText}>No staff accounts yet. Tap "Add" to create one.</Text>
            </View>
          ) : (
            staffMembers.map((member) => (
              <View key={member.id} style={[styles.staffCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.staffHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.staffName, { color: themeColors.text }]}>{member.username}</Text>
                    <Text style={[styles.staffMeta, { color: themeColors.textSecondary }]}>{member.phone}{member.email ? `  ·  ${member.email}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openEditStaff(member)} style={styles.removeBtn} accessibilityLabel="Edit staff details">
                    <Pencil size={16} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemove(member)} style={styles.removeBtn} accessibilityLabel="Remove staff member">
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.permLabel, { color: themeColors.textSecondary }]}>Can access:</Text>
                <View style={styles.permRow}>
                  {[...PERMISSION_OPTIONS, ...extraPermKeys.map((k) => ({ key: k, label: k.replace(/_/g, ' '), icon: Shield }))].map((opt) => {
                    const active = member.permissions.includes(opt.key);
                    const Icon = opt.icon;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.permChip, active && styles.permChipActive, pendingPermKey === `${member.id}:${opt.key}` && { opacity: 0.5 }]}
                        onPress={() => handleTogglePermissionLive(member, opt.key)}
                        disabled={pendingPermKey === `${member.id}:${opt.key}`}
                      >
                        <Icon size={13} color={active ? 'white' : '#6B7280'} />
                        <Text style={[styles.permChipText, active && styles.permChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.permLabel}>Specific actions:</Text>
                <View style={styles.permRow}>
                  {ACTION_PERMISSION_OPTIONS.map((opt) => {
                    const active = member.permissions.includes(opt.key);
                    const Icon = opt.icon;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.permChip, styles.actionPermChip, active && styles.permChipActive, pendingPermKey === `${member.id}:${opt.key}` && { opacity: 0.5 }]}
                        onPress={() => handleTogglePermissionLive(member, opt.key)}
                        disabled={pendingPermKey === `${member.id}:${opt.key}`}
                      >
                        <Icon size={13} color={active ? 'white' : '#6B7280'} />
                        <Text style={[styles.permChipText, active && styles.permChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.permLabel, { color: themeColors.textSecondary }]}>Daily targets:</Text>
                <TouchableOpacity
                  style={[styles.dailyTargetsRow, { backgroundColor: isDark ? '#0F172A' : '#F9FAFB', borderColor: themeColors.border }]}
                  onPress={() => openTargetModal(member)}
                >
                  <View style={styles.dailyTargetsStat}>
                    <Text style={[styles.dailyTargetsStatValue, { color: themeColors.text }]}>{staffTargets[member.id]?.calls_target ?? '—'}</Text>
                    <Text style={[styles.dailyTargetsStatLabel, { color: themeColors.textMuted }]}>Calls</Text>
                  </View>
                  <View style={styles.dailyTargetsStat}>
                    <Text style={[styles.dailyTargetsStatValue, { color: themeColors.text }]}>{staffTargets[member.id]?.approvals_target ?? '—'}</Text>
                    <Text style={[styles.dailyTargetsStatLabel, { color: themeColors.textMuted }]}>Approvals</Text>
                  </View>
                  <View style={styles.dailyTargetsStat}>
                    <Text style={[styles.dailyTargetsStatValue, { color: themeColors.text }]}>{staffTargets[member.id]?.checkins_target ?? '—'}</Text>
                    <Text style={[styles.dailyTargetsStatLabel, { color: themeColors.textMuted }]}>Check-ins</Text>
                  </View>
                  <View style={[styles.dailyTargetsEditBtn, { backgroundColor: colors.primary }]}>
                    <Target size={13} color="white" />
                    <Text style={styles.dailyTargetsEditBtnText}>Set</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Staff Directives - recent broadcasts, newest first. Publishing
              happens via the "Directive" header button / modal below. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 }}>
            <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Recent messages from NV</Text>
            <TouchableOpacity onPress={() => setDirectiveModalVisible(true)}>
              <Text style={[styles.activityLogLinkText, { color: isDark ? '#60A5FA' : colors.primary, fontSize: 13 }]}>+ New</Text>
            </TouchableOpacity>
          </View>
          {loadingDirectives ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : directives.length === 0 ? (
            <View style={styles.emptyBox}>
              <Radio size={26} color="#CBD5E1" />
              <Text style={styles.emptyText}>No directives published yet.</Text>
            </View>
          ) : (
            directives.map((d) => (
              <View key={d.id} style={[styles.directiveCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  {!!d.message && <Text style={[styles.directiveMessage, { color: themeColors.text }]}>{d.message}</Text>}
                  <Text style={[styles.directiveMeta, { color: themeColors.textMuted }]}>
                    {formatDirectiveTargets(d.target_admin_ids)} · {d.created_by_username} · {new Date(d.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {!!d.voice_note_url && <VoiceNoteButton url={d.voice_note_url} />}
                <TouchableOpacity
                  onPress={() => handleDeleteDirective(d)}
                  disabled={deletingDirectiveId === d.id}
                  style={[styles.removeBtn, { marginLeft: 8, opacity: deletingDirectiveId === d.id ? 0.5 : 1 }]}
                  accessibilityLabel="Retract directive"
                >
                  <Trash size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Staff Modal */}
      <Modal visible={addModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddModalVisible(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
          <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.title, { color: themeColors.text }]}>Add Staff</Text>
            <TouchableOpacity onPress={() => { setAddModalVisible(false); resetForm(); }} style={{ padding: 4 }} accessibilityLabel="Close">
              <X size={22} color={themeColors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Username</Text>
            <TextInput style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" placeholder="e.g. ops_ramesh" placeholderTextColor={themeColors.textMuted} />

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email</Text>
            <TextInput style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="staff@dropcars.in" placeholderTextColor={themeColors.textMuted} />

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Phone (10 digits)</Text>
            <TextInput style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]} value={newPhone} onChangeText={setNewPhone} keyboardType="number-pad" maxLength={10} placeholder="9876543210" placeholderTextColor={themeColors.textMuted} />

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Password</Text>
            <TextInput style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={themeColors.textMuted} />

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginTop: 8 }]}>Sections this staff member can access</Text>
            <View style={styles.permRow}>
              {[...PERMISSION_OPTIONS, ...extraPermKeys.map((k) => ({ key: k, label: k.replace(/_/g, ' '), icon: Shield }))].map((opt) => {
                const active = newPermissions.includes(opt.key);
                const Icon = opt.icon;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.permChip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, active && styles.permChipActive]}
                    onPress={() => togglePermission(opt.key)}
                  >
                    <Icon size={13} color={active ? 'white' : themeColors.textSecondary} />
                    <Text style={[styles.permChipText, { color: themeColors.textSecondary }, active && styles.permChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginTop: 8 }]}>Specific actions (for a narrower role, e.g. Accounts Manager)</Text>
            <View style={styles.permRow}>
              {ACTION_PERMISSION_OPTIONS.map((opt) => {
                const active = newPermissions.includes(opt.key);
                const Icon = opt.icon;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.permChip, styles.actionPermChip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, active && styles.permChipActive]}
                    onPress={() => togglePermission(opt.key)}
                  >
                    <Icon size={13} color={active ? 'white' : themeColors.textSecondary} />
                    <Text style={[styles.permChipText, { color: themeColors.textSecondary }, active && styles.permChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleAddStaff} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Create Staff Account</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Daily Targets Modal - per-staff Calls / Approvals / Check-ins */}
      <Modal visible={!!targetModalMember} transparent animationType="fade" onRequestClose={() => setTargetModalMember(null)}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.card, { backgroundColor: themeColors.surface }]}>
            <View style={modalStyles.headerRow}>
              <Text style={[modalStyles.title, { color: themeColors.text }]}>Daily Targets{targetModalMember ? ` — ${targetModalMember.username}` : ''}</Text>
              <TouchableOpacity onPress={() => setTargetModalMember(null)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginTop: 4 }]}>Calls Target</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={targetCallsInput}
              onChangeText={setTargetCallsInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Approvals Target</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={targetApprovalsInput}
              onChangeText={setTargetApprovalsInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Check-ins Target</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={targetCheckinsInput}
              onChangeText={setTargetCheckinsInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={themeColors.textMuted}
            />

            <TouchableOpacity style={[styles.saveBtn, { marginBottom: 0 }, savingStaffTarget && { opacity: 0.6 }]} onPress={handleSaveStaffTarget} disabled={savingStaffTarget}>
              {savingStaffTarget ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save Targets</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Staff Details Modal - fixes a wrong/outdated phone or email on
          an existing staff account (previously only possible at creation). */}
      <Modal visible={!!editingMember} transparent animationType="fade" onRequestClose={() => setEditingMember(null)}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.card, { backgroundColor: themeColors.surface }]}>
            <View style={modalStyles.headerRow}>
              <Text style={[modalStyles.title, { color: themeColors.text }]}>Edit Staff{editingMember ? ` — ${editingMember.username}` : ''}</Text>
              <TouchableOpacity onPress={() => setEditingMember(null)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginTop: 4 }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="Staff name"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Phone</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="9876543210"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={editEmail}
              onChangeText={setEditEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="staff@example.com"
              placeholderTextColor={themeColors.textMuted}
            />

            <TouchableOpacity style={[styles.saveBtn, { marginBottom: 0 }, savingEdit && { opacity: 0.6 }]} onPress={handleSaveStaffEdit} disabled={savingEdit}>
              {savingEdit ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Publish Directive Modal - text and/or voice-note broadcast, to All
          Staff or a specific selection. */}
      <Modal visible={directiveModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setDirectiveModalVisible(false); resetDirectiveComposer(); }}>
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
          <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.title, { color: themeColors.text }]}>Send a message to staff</Text>
            <TouchableOpacity onPress={() => { setDirectiveModalVisible(false); resetDirectiveComposer(); }} style={{ padding: 4 }} accessibilityLabel="Close">
              <X size={22} color={themeColors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginTop: 0 }]}>Message</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text, minHeight: 80, textAlignVertical: 'top' }]}
              value={directiveMessage}
              onChangeText={setDirectiveMessage}
              multiline
              placeholder="e.g. Prioritise Chennai leads today, follow up every unresponded call within 5 mins."
              placeholderTextColor={themeColors.textMuted}
            />

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Voice Note (optional)</Text>
            <View style={[modalStyles.recorderBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              {recorderState.isRecording ? (
                <TouchableOpacity style={[modalStyles.recorderBtn, { backgroundColor: '#EF4444' }]} onPress={handleStopRecording}>
                  <Square size={16} color="white" fill="white" />
                  <Text style={modalStyles.recorderBtnText}>Stop ({Math.round((recorderState.durationMillis || 0) / 1000)}s)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[modalStyles.recorderBtn, { backgroundColor: colors.primary }]} onPress={handleStartRecording}>
                  <Mic size={16} color="white" />
                  <Text style={modalStyles.recorderBtnText}>{recordedUri ? 'Re-record' : 'Record'}</Text>
                </TouchableOpacity>
              )}
              {!!recordedUri && !recorderState.isRecording && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <VoiceNoteButton url={recordedUri} size={14} />
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Preview</Text>
                  <TouchableOpacity onPress={() => setRecordedUri(null)} accessibilityLabel="Discard recording">
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Send to</Text>
            <View style={styles.permRow}>
              <TouchableOpacity
                style={[styles.permChip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, directiveTargetMode === 'all' && styles.permChipActive]}
                onPress={() => setDirectiveTargetMode('all')}
              >
                <Radio size={13} color={directiveTargetMode === 'all' ? 'white' : themeColors.textSecondary} />
                <Text style={[styles.permChipText, { color: themeColors.textSecondary }, directiveTargetMode === 'all' && styles.permChipTextActive]}>All Staff</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.permChip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, directiveTargetMode === 'specific' && styles.permChipActive]}
                onPress={() => setDirectiveTargetMode('specific')}
              >
                <UserCheck size={13} color={directiveTargetMode === 'specific' ? 'white' : themeColors.textSecondary} />
                <Text style={[styles.permChipText, { color: themeColors.textSecondary }, directiveTargetMode === 'specific' && styles.permChipTextActive]}>Choose Staff</Text>
              </TouchableOpacity>
            </View>

            {directiveTargetMode === 'specific' && (
              <View style={[styles.permRow, { marginTop: 8 }]}>
                {staffMembers.length === 0 ? (
                  <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>No staff accounts yet.</Text>
                ) : (
                  staffMembers.map((m) => {
                    const active = directiveTargetIds.includes(m.id);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.permChip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, active && styles.permChipActive]}
                        onPress={() => toggleDirectiveTarget(m.id)}
                      >
                        <Text style={[styles.permChipText, { color: themeColors.textSecondary }, active && styles.permChipTextActive]}>{m.username}</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, publishing && { opacity: 0.6 }]} onPress={handlePublishDirective} disabled={publishing}>
              {publishing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Send size={16} color="white" />
                  <Text style={styles.saveBtnText}>Publish Directive</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937', flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  activityLogLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryTint,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 20,
  },
  activityLogLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  targetCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 20,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  targetInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  targetSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetSaveBtnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
  },
  targetHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 15,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 6,
    padding: 14,
  },
  ownerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center',
  },
  ownerName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  ownerHint: { fontSize: 12, color: '#78350F', marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  staffCard: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  staffHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  staffName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  staffMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  removeBtn: {
    width: 32, height: 32, borderRadius: 6,
    backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center',
  },
  permLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase' },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  permChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionPermChip: { backgroundColor: '#FAFAFA', borderStyle: 'dashed' },
  permChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  permChipTextActive: { color: 'white' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  dailyTargetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dailyTargetsStat: { alignItems: 'center', minWidth: 44 },
  dailyTargetsStatValue: { fontSize: 15, fontWeight: '800' },
  dailyTargetsStatLabel: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', marginTop: 1 },
  dailyTargetsEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dailyTargetsEditBtnText: { color: 'white', fontWeight: '700', fontSize: 11.5 },
  directiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  directiveMessage: { fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  directiveMeta: { fontSize: 11, marginTop: 4 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 8,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '800' },
  recorderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 10,
  },
  recorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
  },
  recorderBtnText: { color: 'white', fontWeight: '700', fontSize: 12.5 },
});
