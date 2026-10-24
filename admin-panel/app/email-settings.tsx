import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail, Save, Send, UserPlus, Shield } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

type UserRole = 'vehicle_owner' | 'driver' | 'vendor';

export default function EmailSettingsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isOwnerUser, setIsOwnerUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [smtpUser, setSmtpUser] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [configured, setConfigured] = useState(false);

  // the BACKUP mail server (used automatically when the main one fails) and the health check result
  const [bHost, setBHost] = useState('');
  const [bPort, setBPort] = useState('587');
  const [bUser, setBUser] = useState('');
  const [bPass, setBPass] = useState('');
  const [bFrom, setBFrom] = useState('');
  const [health, setHealth] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);

  const [linkRole, setLinkRole] = useState<UserRole>('vehicle_owner');
  const [linkNumber, setLinkNumber] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const role = await apiService.getCachedAdminRole();
        if (role !== 'Owner') {
          setIsOwnerUser(false);
          setLoading(false);
          return;
        }
        const s = await apiService.getEmailSettings();
        setSmtpUser(s.smtp_user || '');
        setSmtpAppPassword(s.smtp_app_password || '');
        setSmtpHost(s.smtp_host || 'smtp.gmail.com');
        setSmtpPort(String(s.smtp_port || '587'));
        setConfigured(!!s.configured);
        const b = s.backup || {};
        setBHost(b.smtp2_host || '');
        setBPort(String(b.smtp2_port || '587'));
        setBUser(b.smtp2_user || '');
        setBPass(b.smtp2_app_password || '');
        setBFrom(b.smtp2_from || '');
        setHealth(s.health && s.health.providers ? s.health : null);
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to load email settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!smtpUser.trim()) {
      Alert.alert('Error', 'Enter the sending email address (e.g. your Gmail)');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateEmailSettings({
        smtp_user: smtpUser.trim(),
        smtp_app_password: smtpAppPassword.trim(),
        smtp_host: smtpHost.trim() || 'smtp.gmail.com',
        smtp_port: smtpPort.trim() || '587',
      });
      setConfigured(true);
      showToast('Email (SMTP) settings saved!', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBackup = async () => {
    if (!bHost.trim() || !bUser.trim()) {
      Alert.alert('Error', 'Enter the backup mail server host and the sending address');
      return;
    }
    setSavingBackup(true);
    try {
      await apiService.updateEmailSettings({
        smtp2_host: bHost.trim(), smtp2_port: bPort.trim() || '587', smtp2_user: bUser.trim(),
        smtp2_app_password: bPass.trim(), smtp2_from: bFrom.trim() || bUser.trim(),
      });
      showToast('Backup mail server saved!', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save the backup server');
    } finally {
      setSavingBackup(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const h = await apiService.makeRequest('/admin/email/health/check', { method: 'POST', body: JSON.stringify({}) });
      setHealth(h);
      showToast(h?.all_down ? 'Mail is DOWN - see below' : 'Check done', h?.all_down ? 'error' : 'success');
    } catch (error: any) {
      Alert.alert('Check failed', error?.message || 'Try again');
    } finally {
      setChecking(false);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const res = await apiService.sendTestEmail();
      showToast(res?.message || 'Test email sent successfully!', 'success');
    } catch (error: any) {
      Alert.alert('Test Failed', error?.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const handleLinkEmail = async () => {
    if (!linkNumber.trim() || !linkEmail.trim()) {
      Alert.alert('Error', 'Enter both phone number and email address');
      return;
    }
    setLinking(true);
    try {
      await apiService.setUserEmail({
        role: linkRole,
        primary_number: linkNumber.trim(),
        email: linkEmail.trim(),
      });
      showToast(`Updated email for ${linkRole} ${linkNumber.trim()}`, 'success');
      setLinkNumber('');
      setLinkEmail('');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update user email');
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isOwnerUser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: themeColors.text }]}>Email Infrastructure</Text>
          <View style={{ flex: 1 }} />
          <ThemeToggle size={20} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Shield size={44} color="#EF4444" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: themeColors.text, marginBottom: 10, textAlign: 'center' }}>
            Owner Access Only
          </Text>
          <Text style={{ fontSize: 14, color: themeColors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Google Workspace SMTP credentials, email infrastructure, and secret passwords can only be viewed and managed by the Organization Owner.
          </Text>
          <TouchableOpacity
            style={[styles.saveButton, { width: 160, alignSelf: 'center' }]}
            onPress={() => router.back()}
          >
            <Text style={styles.saveButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Email Notifications</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Mail health: the server is logged in to every couple of hours (nothing is sent) and the owner is told BEFORE signups fail */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: health ? (health.all_down ? '#EF4444' : (Object.values(health.providers || {}).some((p: any) => !p.ok) ? '#F59E0B' : '#10B981')) : themeColors.border, borderWidth: 1.5 }]}>
          <View style={styles.cardTitleRow}>
            <Shield size={20} color={health && health.all_down ? '#EF4444' : '#10B981'} />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Email health</Text>
          </View>
          {!health ? (
            <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>Not checked yet. It is checked automatically every 2 hours; press the button to check now.</Text>
          ) : (
            <>
              {health.all_down && (
                <Text style={{ color: '#DC2626', fontWeight: '700', marginBottom: 6 }}>Email is DOWN - new drivers cannot verify their email until this is fixed.</Text>
              )}
              {Object.entries(health.providers || {}).map(([name, p]: any) => (
                <View key={name} style={{ marginBottom: 8 }}>
                  <Text style={{ color: themeColors.text, fontWeight: '700' }}>{name === 'primary' ? 'Main server' : 'Backup server'} ({p.user || '-'}): {p.ok ? 'working' : 'FAILING'}</Text>
                  {!p.ok && !!p.diagnosis && <Text style={{ color: themeColors.textSecondary, fontSize: 13, lineHeight: 19 }}>{p.diagnosis}</Text>}
                </View>
              ))}
              {!health.backup_configured && (
                <Text style={{ color: '#B45309', fontSize: 13, lineHeight: 19 }}>No backup mail server is set. Add one below so a single blocked account cannot stop signups.</Text>
              )}
              {!!health.checked_at && <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 4 }}>Checked {new Date(health.checked_at * 1000).toLocaleString('en-IN')}</Text>}
            </>
          )}
          <TouchableOpacity style={[styles.testButton, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]} onPress={handleCheckNow} disabled={checking}>
            {checking ? <LoadingSpinner size="small" color="#3B82F6" /> : <Text style={[styles.testButtonText, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>Check now (logs in, sends nothing)</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <View style={styles.cardTitleRow}>
            <Mail size={20} color="#3B82F6" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>SMTP Credentials</Text>
          </View>
          <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>
            Used to send PDF booking receipts to customers, drivers, vehicle owners, and vendors.
          </Text>

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Sender Gmail Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={smtpUser}
            onChangeText={setSmtpUser}
            placeholder="e.g. dropcars.tn@gmail.com"
            placeholderTextColor={themeColors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Gmail App Password (16 letters)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={smtpAppPassword}
            onChangeText={setSmtpAppPassword}
            placeholder="xxxx xxxx xxxx xxxx"
            placeholderTextColor={themeColors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>SMTP Host</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={smtpHost}
            onChangeText={setSmtpHost}
            placeholder="smtp.gmail.com"
            placeholderTextColor={themeColors.textMuted}
            autoCapitalize="none"
          />

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>SMTP Port</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={smtpPort}
            onChangeText={setSmtpPort}
            placeholder="587"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="number-pad"
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? <LoadingSpinner size="small" color="white" /> : (
              <>
                <Save size={18} color="white" />
                <Text style={styles.saveButtonText}>Save SMTP Settings</Text>
              </>
            )}
          </TouchableOpacity>

          {configured && (
            <TouchableOpacity style={[styles.testButton, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]} onPress={handleTestEmail} disabled={testing}>
              {testing ? <LoadingSpinner size="small" color="#3B82F6" /> : (
                <>
                  <Send size={16} color={isDark ? '#93C5FD' : '#3B82F6'} />
                  <Text style={[styles.testButtonText, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>Send Test Email</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <View style={styles.cardTitleRow}>
            <Mail size={20} color="#F59E0B" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Backup mail server</Text>
          </View>
          <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>
            Used automatically when the main server (above) fails, so email verification keeps working. Any SMTP works, for example a mailbox on your website host (like noreply@dropcars.in) or a mail service.
          </Text>
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Backup SMTP Host</Text>
          <TextInput style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]} value={bHost} onChangeText={setBHost} placeholder="e.g. smtp.hostinger.com" placeholderTextColor={themeColors.textMuted} autoCapitalize="none" />
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Backup SMTP Port</Text>
          <TextInput style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]} value={bPort} onChangeText={setBPort} placeholder="587" placeholderTextColor={themeColors.textMuted} keyboardType="number-pad" />
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Backup user (login)</Text>
          <TextInput style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]} value={bUser} onChangeText={setBUser} placeholder="noreply@dropcars.in" placeholderTextColor={themeColors.textMuted} autoCapitalize="none" keyboardType="email-address" />
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Backup password</Text>
          <TextInput style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]} value={bPass} onChangeText={setBPass} placeholder="mailbox password" placeholderTextColor={themeColors.textMuted} secureTextEntry autoCapitalize="none" />
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Send from (optional)</Text>
          <TextInput style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]} value={bFrom} onChangeText={setBFrom} placeholder="same as the user" placeholderTextColor={themeColors.textMuted} autoCapitalize="none" keyboardType="email-address" />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveBackup} disabled={savingBackup}>
            {savingBackup ? <LoadingSpinner size="small" color="white" /> : (
              <>
                <Save size={18} color="white" />
                <Text style={styles.saveButtonText}>Save Backup Server</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <View style={styles.cardTitleRow}>
            <UserPlus size={20} color="#10B981" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Set User Email Address</Text>
          </View>
          <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>
            Link an email address to a driver, vehicle owner, or vendor to receive PDF booking receipts.
          </Text>

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>User Type</Text>
          <View style={styles.roleRow}>
            {(['vehicle_owner', 'driver', 'vendor'] as UserRole[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleTab, linkRole === r && styles.roleTabActive, { backgroundColor: linkRole === r ? '#10B981' : (isDark ? '#334155' : '#F3F4F6'), borderColor: themeColors.border }]}
                onPress={() => setLinkRole(r)}
              >
                <Text style={[styles.roleTabText, linkRole === r ? styles.roleTabTextActive : { color: themeColors.textSecondary }]}>
                  {r === 'vehicle_owner' ? 'Owner' : r === 'driver' ? 'Driver' : 'Vendor'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Mobile Number</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={linkNumber}
            onChangeText={setLinkNumber}
            placeholder="10-digit phone number"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Email Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            value={linkEmail}
            onChangeText={setLinkEmail}
            placeholder="their.email@gmail.com"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TouchableOpacity style={styles.linkButton} onPress={handleLinkEmail} disabled={linking}>
            {linking ? <LoadingSpinner size="small" color="white" /> : (
              <Text style={styles.saveButtonText}>Save User Email</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  card: {
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardHint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 14,
    marginTop: 16,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 14,
    marginTop: 10,
  },
  testButtonText: { fontSize: 14, fontWeight: '600' },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  roleTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleTabActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  roleTabText: { fontSize: 12, fontWeight: '600' },
  roleTabTextActive: { color: '#FFFFFF' },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 14,
    marginTop: 16,
  },
});
