import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Plus,
  CheckCircle2,
  Lock,
  UserCheck,
  Edit,
  Trash2,
  X,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';

// KNOWN-ORPHANED SCREEN - do not link to this from anywhere. This is an old
// mock-data prototype: all roles/permissions here are local useState, and
// handleCreateRole() never calls any API - "Save Role" just pushes into
// local state and vanishes on navigation. The real, backend-wired
// equivalent is app/staff-management.tsx (creates real Staff accounts via
// apiService.createStaff/getAdminsList/updateStaffPermissions), linked from
// Settings > Staff & Roles. No screen in the app links to app/staff-roles
// (confirmed via search) so it is unreachable except by typing the URL
// directly - same precedent as app/(tabs)/profile-reviews.tsx, which is
// hidden from the tab bar for the same "orphaned mock-data prototype"
// reason. Left in place (not deleted) in case any external QA bookmark or
// deep link references it; just don't add a nav link to it. Found 2026-09-15.
interface StaffRole {
  id: string;
  roleName: string;
  description: string;
  permissions: {
    canHandleEnquiries: boolean;
    canHandleBookings: boolean;
    canManageFleet: boolean;
    canAccessFinance: boolean;
    canVerifyDocuments: boolean;
    canAuditCash: boolean;
  };
}

export default function StaffRolesScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [roles, setRoles] = useState<StaffRole[]>([
    {
      id: 'r0',
      roleName: 'Naveen (Founder / Lead)',
      description: 'Master system access: Full P&L access, Tariff Sandbox, Global Settings & Audit Logs',
      permissions: {
        canHandleEnquiries: true,
        canHandleBookings: true,
        canManageFleet: true,
        canAccessFinance: true,
        canVerifyDocuments: true,
        canAuditCash: true,
      },
    },
    {
      id: 'r1',
      roleName: 'Sales & Enquiry Specialist',
      description: 'Handles incoming website leads, quotes, calls, and WhatsApp enquiries',
      permissions: {
        canHandleEnquiries: true,
        canHandleBookings: true,
        canManageFleet: false,
        canAccessFinance: false,
        canVerifyDocuments: false,
        canAuditCash: false,
      },
    },
    {
      id: 'r2',
      roleName: 'Drivers & bookings',
      description: 'Assigns drivers, manages Our Fleet reservations, and controls duty starts',
      permissions: {
        canHandleEnquiries: true,
        canHandleBookings: true,
        canManageFleet: true,
        canAccessFinance: false,
        canVerifyDocuments: true,
        canAuditCash: false,
      },
    },
    {
      id: 'r3',
      roleName: 'Document Verification Officer',
      description: 'Verifies Aadhar, License, PAN, RC, Insurance, and Permits for Fleet Drivers & Drivers',
      permissions: {
        canHandleEnquiries: false,
        canHandleBookings: false,
        canManageFleet: true,
        canAccessFinance: false,
        canVerifyDocuments: true,
        canAuditCash: false,
      },
    },
    {
      id: 'r4',
      roleName: 'Finance & Accounts Manager',
      description: 'Controls wallet ledgers, Razorpay settlements, billing, and payouts',
      permissions: {
        canHandleEnquiries: false,
        canHandleBookings: true,
        canManageFleet: false,
        canAccessFinance: true,
        canVerifyDocuments: false,
        canAuditCash: true,
      },
    },
    {
      id: 'r5',
      roleName: 'Operations Manager (Unblock Privileges)',
      description: 'Full operational control including Unblocking Blocked Cars/Drivers and System Security',
      permissions: {
        canHandleEnquiries: true,
        canHandleBookings: true,
        canManageFleet: true,
        canAccessFinance: true,
        canVerifyDocuments: true,
        canAuditCash: true,
      },
    },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [permEnquiries, setPermEnquiries] = useState(true);
  const [permBookings, setPermBookings] = useState(true);
  const [permFleet, setPermFleet] = useState(false);
  const [permFinance, setPermFinance] = useState(false);
  const [permDocs, setPermDocs] = useState(false);

  const handleCreateRole = () => {
    if (!roleName.trim()) {
      Alert.alert('Required', 'Enter a role title');
      return;
    }
    const newRole: StaffRole = {
      id: `r_${Date.now()}`,
      roleName: roleName.trim(),
      description: roleDesc.trim() || 'Custom staff role',
      permissions: {
        canHandleEnquiries: permEnquiries,
        canHandleBookings: permBookings,
        canManageFleet: permFleet,
        canAccessFinance: permFinance,
        canVerifyDocuments: permDocs,
        canAuditCash: false,
      },
    };
    setRoles([...roles, newRole]);
    setShowModal(false);
    setRoleName('');
    setRoleDesc('');
    showToast('New Staff Role created successfully!', 'success');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Staff Roles & Permissions</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Create New Staff Role</Text>
        </TouchableOpacity>

        {roles.map((role) => (
          <View key={role.id} style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Shield size={20} color="#3B82F6" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleTitle, { color: themeColors.text }]}>{role.roleName}</Text>
                <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginTop: 2 }}>{role.description}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textMuted, marginBottom: 6 }}>PERMISSIONS:</Text>
            <View style={styles.permGrid}>
              <View style={[styles.permPill, { backgroundColor: role.permissions.canHandleEnquiries ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: role.permissions.canHandleEnquiries ? '#10B981' : '#6B7280' }}>
                  Enquiries: {role.permissions.canHandleEnquiries ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={[styles.permPill, { backgroundColor: role.permissions.canHandleBookings ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: role.permissions.canHandleBookings ? '#10B981' : '#6B7280' }}>
                  Bookings: {role.permissions.canHandleBookings ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={[styles.permPill, { backgroundColor: role.permissions.canManageFleet ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: role.permissions.canManageFleet ? '#10B981' : '#6B7280' }}>
                  Fleet: {role.permissions.canManageFleet ? 'YES' : 'NO'}
                </Text>
              </View>

              <View style={[styles.permPill, { backgroundColor: role.permissions.canAccessFinance ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: role.permissions.canAccessFinance ? '#10B981' : '#6B7280' }}>
                  Finance: {role.permissions.canAccessFinance ? 'YES' : 'NO'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add Role Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Create Custom Staff Role</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Role Title (e.g. Lead Manager)"
              value={roleName}
              onChangeText={setRoleName}
              placeholderTextColor={themeColors.textMuted}
            />

            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginTop: 10 }]}
              placeholder="Role Description"
              value={roleDesc}
              onChangeText={setRoleDesc}
              placeholderTextColor={themeColors.textMuted}
            />

            <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text, marginTop: 14, marginBottom: 8 }}>
              Permissions Settings:
            </Text>

            <View style={styles.switchRow}>
              <Text style={{ fontSize: 13, color: themeColors.text }}>Can Handle Website Enquiries</Text>
              <Switch value={permEnquiries} onValueChange={setPermEnquiries} />
            </View>

            <View style={styles.switchRow}>
              <Text style={{ fontSize: 13, color: themeColors.text }}>Can Manage Bookings</Text>
              <Switch value={permBookings} onValueChange={setPermBookings} />
            </View>

            <View style={styles.switchRow}>
              <Text style={{ fontSize: 13, color: themeColors.text }}>Can Manage Fleet & Drivers</Text>
              <Switch value={permFleet} onValueChange={setPermFleet} />
            </View>

            <View style={styles.switchRow}>
              <Text style={{ fontSize: 13, color: themeColors.text }}>Can Access Finance & Wallet</Text>
              <Switch value={permFinance} onValueChange={setPermFinance} />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleCreateRole}>
              <Text style={styles.submitBtnText}>Save Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
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
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 1 },
  addBtn: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 8, padding: 16, borderWidth: 1, marginBottom: 12 },
  roleTitle: { fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: 'rgba(156, 163, 175, 0.2)', marginVertical: 10 },
  permGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  permPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 8, padding: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  submitBtn: { backgroundColor: '#3B82F6', borderRadius: 6, alignItems: 'center', paddingVertical: 14, marginTop: 16 },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
