import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import {
  UserCog,
  Plus,
  Search,
  UserCheck,
  Shield,
  Briefcase,
  Sliders,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react-native';
import { ScreenShell, useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  monthlyLimit: number;
  usedAmount: number;
  approvalRequired: boolean;
}

const INITIAL_EMPLOYEES: Employee[] = [
  { id: 'EMP-01', name: 'Rahul Sharma', email: 'rahul.s@acmecorp.com', role: 'Senior Director', department: 'Executive', monthlyLimit: 30000, usedAmount: 18400, approvalRequired: false },
  { id: 'EMP-02', name: 'Priya Patel', email: 'priya.p@acmecorp.com', role: 'Sales Lead', department: 'Sales', monthlyLimit: 15000, usedAmount: 6200, approvalRequired: true },
  { id: 'EMP-03', name: 'Anand V', email: 'anand.v@acmecorp.com', role: 'Tech Lead', department: 'Engineering', monthlyLimit: 10000, usedAmount: 2100, approvalRequired: true },
  { id: 'EMP-04', name: 'Meera Nair', email: 'meera.n@acmecorp.com', role: 'HR Manager', department: 'Operations', monthlyLimit: 12000, usedAmount: 0, approvalRequired: false },
];

export default function B2BEmployeesScreen() {
  const { isDark } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = getStyles(isDark, palette);

  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newLimit, setNewLimit] = useState('10000');

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddEmployee = () => {
    if (!newName.trim() || !newEmail.trim()) {
      const msg = 'Please fill in the employee name and email address.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Missing Fields', msg);
      return;
    }

    const newEmp: Employee = {
      id: `EMP-0${employees.length + 1}`,
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole.trim() || 'Team Member',
      department: 'General',
      monthlyLimit: parseInt(newLimit) || 10000,
      usedAmount: 0,
      approvalRequired: true,
    };

    setEmployees([...employees, newEmp]);
    setShowAddModal(false);
    setNewName('');
    setNewEmail('');
    setNewRole('');
    setNewLimit('10000');
  };

  return (
    <ScreenShell title="Manage Employees" subtitle="Corporate travellers, ride allowances and approvals">
      <View style={s.container}>
        {/* HEADER SUMMARY BAR */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Users color="#0EA5E9" size={18} />
            <Text style={s.summaryVal}>{employees.length} Travellers</Text>
            <Text style={s.summarySub}>Active Accounts</Text>
          </View>

          <View style={s.summaryBox}>
            <Shield color="#10B981" size={18} />
            <Text style={s.summaryVal}>₹67,000</Text>
            <Text style={s.summarySub}>Total Pool Limit</Text>
          </View>
        </View>

        {/* SEARCH & ADD EMPLOYEE CONTROL ROW */}
        <View style={s.controlRow}>
          <View style={s.searchBar}>
            <Search color={palette.textMuted} size={16} />
            <TextInput
              style={s.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name or email..."
              placeholderTextColor={palette.placeholder}
            />
          </View>

          <TouchableOpacity
            style={s.addBtn}
            activeOpacity={0.8}
            onPress={() => setShowAddModal(true)}
          >
            <Plus color="#FFFFFF" size={18} />
            <Text style={s.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* EMPLOYEE ROSTER CARDS */}
        <View style={s.rosterList}>
          {filteredEmployees.map((emp) => {
            const usagePercent = Math.min(100, Math.round((emp.usedAmount / emp.monthlyLimit) * 100));
            return (
              <View key={emp.id} style={s.employeeCard}>
                <View style={s.empTopRow}>
                  <View style={s.empAvatar}>
                    <UserCheck color="#0EA5E9" size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.empName}>{emp.name}</Text>
                    <Text style={s.empSub}>{emp.role} • {emp.department}</Text>
                    <Text style={s.empEmail}>{emp.email}</Text>
                  </View>

                  <View style={emp.approvalRequired ? s.approvalBadge : s.directBadge}>
                    <Text style={emp.approvalRequired ? s.approvalBadgeText : s.directBadgeText}>
                      {emp.approvalRequired ? 'Approval Req.' : 'Auto-Approve'}
                    </Text>
                  </View>
                </View>

                <View style={s.empDivider} />

                {/* LIMIT PROGRESS METER */}
                <View style={s.limitSection}>
                  <View style={s.limitMetaRow}>
                    <Text style={s.limitLabel}>Monthly Limit Usage</Text>
                    <Text style={s.limitVal}>
                      ₹{emp.usedAmount.toLocaleString('en-IN')} / ₹{emp.monthlyLimit.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View
                      style={[
                        s.progressBar,
                        {
                          width: `${usagePercent}%`,
                          backgroundColor: usagePercent > 80 ? '#EF4444' : '#0EA5E9',
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ADD EMPLOYEE MODAL */}
        <Modal visible={showAddModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalContainer}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add Corporate Traveller</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <X color={palette.textMuted} size={20} />
                </TouchableOpacity>
              </View>

              <View style={s.formGroup}>
                <Text style={s.formLabel}>Full Name</Text>
                <TextInput
                  style={s.formInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Vikram Seth"
                  placeholderTextColor={palette.placeholder}
                />

                <Text style={s.formLabel}>Corporate Email</Text>
                <TextInput
                  style={s.formInput}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="e.g. vikram@acmecorp.com"
                  placeholderTextColor={palette.placeholder}
                  keyboardType="email-address"
                />

                <Text style={s.formLabel}>Designation / Role</Text>
                <TextInput
                  style={s.formInput}
                  value={newRole}
                  onChangeText={setNewRole}
                  placeholder="e.g. Regional Manager"
                  placeholderTextColor={palette.placeholder}
                />

                <Text style={s.formLabel}>Monthly Ride Allowance (₹)</Text>
                <TextInput
                  style={s.formInput}
                  value={newLimit}
                  onChangeText={setNewLimit}
                  placeholder="10000"
                  placeholderTextColor={palette.placeholder}
                  keyboardType="numeric"
                />
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddModal(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.saveBtn} onPress={handleAddEmployee}>
                  <Text style={s.saveBtnText}>Add Traveller</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenShell>
  );
}

function getStyles(isDark: boolean, palette: ReturnType<typeof getPalette>) {
  const displayFont = Platform.OS === 'web' ? "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" : undefined;
  const bodyFont = Platform.OS === 'web' ? "'Plus Jakarta Sans', system-ui, sans-serif" : undefined;

  return StyleSheet.create({
    container: { gap: 14 },

    summaryRow: { flexDirection: 'row', gap: 12 },
    summaryBox: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    summaryVal: { fontSize: 16, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    summarySub: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },

    controlRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
      borderWidth: 1,
      borderColor: palette.border,
    },
    searchInput: { flex: 1, color: palette.textPrimary, fontSize: 12.5, fontFamily: bodyFont },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#0EA5E9',
      paddingHorizontal: 16,
      height: 42,
      borderRadius: 12,
    },
    addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', fontFamily: bodyFont },

    rosterList: { gap: 12 },
    employeeCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
    },
    empTopRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    empAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(14, 165, 233, 0.14)', justifyContent: 'center', alignItems: 'center' },
    empName: { fontSize: 14.5, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    empSub: { fontSize: 11, color: palette.textMuted, marginTop: 1, fontFamily: bodyFont },
    empEmail: { fontSize: 10.5, color: '#0EA5E9', marginTop: 2, fontFamily: bodyFont },

    approvalBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    approvalBadgeText: { color: '#D97706', fontSize: 9.5, fontWeight: '800', fontFamily: bodyFont },
    directBadge: { backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    directBadgeText: { color: '#10B981', fontSize: 9.5, fontWeight: '800', fontFamily: bodyFont },

    empDivider: { height: 1, backgroundColor: palette.divider },

    limitSection: { gap: 6 },
    limitMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    limitLabel: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },
    limitVal: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    progressTrack: { height: 6, backgroundColor: palette.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
    progressBar: { height: '100%', borderRadius: 3 },

    // MODAL
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContainer: { width: '100%', maxWidth: 460, backgroundColor: palette.surface, borderRadius: 20, padding: 20, gap: 16, borderWidth: 1, borderColor: palette.border },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 17, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    formGroup: { gap: 8 },
    formLabel: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont, marginTop: 4 },
    formInput: { backgroundColor: palette.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, height: 40, color: palette.textPrimary, fontSize: 12.5, borderWidth: 1, borderColor: palette.border, fontFamily: bodyFont },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { paddingHorizontal: 16, height: 40, justifyContent: 'center', borderRadius: 10 },
    cancelBtnText: { color: palette.textMuted, fontSize: 12.5, fontWeight: '800', fontFamily: bodyFont },
    saveBtn: { backgroundColor: '#0EA5E9', paddingHorizontal: 18, height: 40, justifyContent: 'center', borderRadius: 10 },
    saveBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', fontFamily: bodyFont },
  });
}
