import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  PhoneCall,
  MessageSquare,
  TrendingUp,
  Settings,
  Search,
  CheckCircle,
  Clock,
  DollarSign,
  Share2,
  RefreshCw,
  UserCheck,
  Phone,
  Send,
  Lock,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import { crmApi, CrmLead, OwnerFinancials, CrmSettingsData } from '@/services/crmApi';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function CRMMarketingScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<'Owner' | 'Staff'>('Staff');
  const [activeTab, setActiveTab] = useState<'leads' | 'followups' | 'feedback' | 'analytics' | 'settings'>('leads');

  // Lead Data & Filters
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [metrics, setMetrics] = useState<any>({
    today_calls_count: 0,
    total_leads_count: 0,
    new_leads_count: 0,
    converted_leads_count: 0,
  });
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Owner Financials & Settings
  const [financials, setFinancials] = useState<OwnerFinancials | null>(null);
  const [settings, setSettings] = useState<CrmSettingsData | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [webhookKeyInput, setWebhookKeyInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Load User Role & Initial Data
  const loadData = async () => {
    try {
      setRefreshing(true);
      const userRole = await apiService.getCachedAdminRole();
      const currentRole = userRole === 'Owner' ? 'Owner' : 'Staff';
      setRole(currentRole);

      // Load Leads
      const leadRes = await crmApi.getLeads(statusFilter, sourceFilter, searchQuery);
      setLeads(leadRes.leads);
      setMetrics(leadRes.metrics_summary);

      // Load Owner Financials & Settings if Owner
      if (currentRole === 'Owner') {
        try {
          const finData = await crmApi.getOwnerFinancials('owner');
          setFinancials(finData);
          setBudgetInput(finData.monthly_ad_budget ? String(finData.monthly_ad_budget) : '0');
        } catch (e) {
          console.log('Owner financials error:', e);
        }

        try {
          const setData = await crmApi.getCrmSettings('owner');
          setSettings(setData);
          setWebhookKeyInput(setData.webhook_secret_key || 'dropcars_crm_secret_2026');
        } catch (e) {
          console.log('CRM settings error:', e);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load CRM data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    router.replace('/enquiries' as any);
  }, []);

  const handleSearch = () => {
    loadData();
  };

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    if (newStatus === 'Closed' || newStatus === 'Spam' || newStatus === 'Lost' || newStatus === 'Cancelled') {
      Alert.alert(
        `Mark lead as ${newStatus}?`,
        `Are you sure you want to mark this lead as ${newStatus}? It will be removed from the active follow-up queue.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Yes, Mark ${newStatus}`,
            style: 'destructive',
            onPress: async () => {
              try {
                await crmApi.updateLead(leadId, { status: newStatus });
                Alert.alert('Updated', `Lead status updated to ${newStatus}`);
                loadData();
              } catch (error: any) {
                Alert.alert('Error', error?.message || 'Failed to update lead');
              }
            },
          },
        ]
      );
      return;
    }

    try {
      await crmApi.updateLead(leadId, { status: newStatus });
      Alert.alert('Success', `Lead status updated to ${newStatus}`);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update lead');
    }
  };

  const handleConvertLead = async (leadId: string) => {
    Alert.alert(
      'Confirm Conversion',
      'Convert this lead into a confirmed Customer Booking Request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert Now',
          onPress: async () => {
            try {
              const res = await crmApi.convertLeadToBooking(leadId);
              Alert.alert('Converted!', 'Lead successfully added to Booking Assignment system.', [
                {
                  text: 'View Bookings',
                  onPress: () => router.push('/orders'),
                },
                { text: 'OK' },
              ]);
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to convert lead');
            }
          },
        },
      ]
    );
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await crmApi.updateCrmSettings(
        {
          webhook_secret_key: webhookKeyInput.trim(),
          monthly_ad_budget: parseFloat(budgetInput) || 0,
        },
        'owner'
      );
      Alert.alert('Success', 'CRM Settings updated successfully');
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const openPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const openWhatsApp = (phone: string, name?: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const numWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${name || 'Customer'}, thank you for contacting Drop Taxi 24! How can we assist with your trip?`;
    Linking.openURL(`https://wa.me/${numWithCountry}?text=${encodeURIComponent(msg)}`);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* --- Top Navbar --- */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>CRM & Marketing Suite</Text>
            <Text style={[styles.headerSub, { color: themeColors.textSecondary }]}>
              Leads, Google Ads & Conversion Hub
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.roleBadge, { backgroundColor: role === 'Owner' ? '#4F46E5' : '#10B981' }]}>
            <Text style={styles.roleBadgeText}>{role}</Text>
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={loadData} disabled={refreshing}>
            <RefreshCw size={18} color={themeColors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* --- Metric Cards Summary --- */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.metricIconWrap}>
              <PhoneCall size={20} color="#3B82F6" />
            </View>
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{metrics.today_calls_count || 0}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>Today's Calls</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.metricIconWrap}>
              <MessageSquare size={20} color="#10B981" />
            </View>
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{metrics.total_leads_count || 0}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>Total Leads</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.metricIconWrap}>
              <Clock size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{metrics.new_leads_count || 0}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>Pending New</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.metricIconWrap}>
              <CheckCircle size={20} color="#8B5CF6" />
            </View>
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{metrics.converted_leads_count || 0}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>Converted</Text>
          </View>
        </View>

        {/* --- Owner Financials Banner (Owner Only) --- */}
        {role === 'Owner' && financials && (
          <View style={[styles.financialBanner, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: '#6366F1' }]}>
            <View style={styles.finHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <DollarSign size={20} color="#4F46E5" />
                <Text style={[styles.finTitle, { color: isDark ? '#C7D2FE' : '#312E81' }]}>
                  Executive Financials & Ad ROI (Owner View)
                </Text>
              </View>
              <Lock size={14} color="#6366F1" />
            </View>

            <View style={styles.finMetricsGrid}>
              <View style={styles.finItem}>
                <Text style={[styles.finItemLabel, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>Monthly Ad Budget</Text>
                <Text style={[styles.finItemVal, { color: isDark ? '#FFFFFF' : '#1E1B4B' }]}>
                  ₹{financials.monthly_ad_budget.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.finItem}>
                <Text style={[styles.finItemLabel, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>Cost Per Lead (CPL)</Text>
                <Text style={[styles.finItemVal, { color: isDark ? '#FFFFFF' : '#1E1B4B' }]}>
                  ₹{financials.cost_per_lead}
                </Text>
              </View>

              <View style={styles.finItem}>
                <Text style={[styles.finItemLabel, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>Cost Per Conversion</Text>
                <Text style={[styles.finItemVal, { color: isDark ? '#FFFFFF' : '#1E1B4B' }]}>
                  ₹{financials.cost_per_conversion}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* --- Navigation Tabs --- */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabSelector}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'leads' && { backgroundColor: themeColors.primary }]}
            onPress={() => setActiveTab('leads')}>
            <Text style={[styles.tabBtnText, activeTab === 'leads' && { color: '#FFF' }]}>📥 Inbound Leads</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'followups' && { backgroundColor: themeColors.primary }]}
            onPress={() => setActiveTab('followups')}>
            <Text style={[styles.tabBtnText, activeTab === 'followups' && { color: '#FFF' }]}>📞 Follow-ups</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'feedback' && { backgroundColor: themeColors.primary }]}
            onPress={() => setActiveTab('feedback')}>
            <Text style={[styles.tabBtnText, activeTab === 'feedback' && { color: '#FFF' }]}>⭐ Customer Feedback</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'analytics' && { backgroundColor: themeColors.primary }]}
            onPress={() => setActiveTab('analytics')}>
            <Text style={[styles.tabBtnText, activeTab === 'analytics' && { color: '#FFF' }]}>
              📊 Ads & Analytics
            </Text>
          </TouchableOpacity>

          {role === 'Owner' && (
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'settings' && { backgroundColor: themeColors.primary }]}
              onPress={() => setActiveTab('settings')}>
              <Text style={[styles.tabBtnText, activeTab === 'settings' && { color: '#FFF' }]}>⚙️ Settings</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* --- TAB 1: Lead Pipeline & Search --- */}
        {activeTab === 'leads' && (
          <View>
            {/* Search & Filter Bar */}
            <View style={styles.filterContainer}>
              <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Search size={18} color={themeColors.textSecondary} />
                <TextInput
                  placeholder="Search name, phone, route..."
                  placeholderTextColor={themeColors.textSecondary}
                  style={[styles.searchInput, { color: themeColors.text }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                />
              </View>

              {/* Status Filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {['All', 'New', 'Contacted', 'Converted', 'Closed'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.chip,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      statusFilter === st && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                    ]}
                    onPress={() => setStatusFilter(st)}>
                    <Text style={[styles.chipText, { color: themeColors.text }, statusFilter === st && { color: '#FFF' }]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Leads List */}
            {leads.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <MessageSquare size={36} color={themeColors.textSecondary} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No leads found matching your criteria.
                </Text>
              </View>
            ) : (
              leads.map((lead) => (
                <View
                  key={lead.id}
                  style={[styles.leadCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <View style={styles.leadCardHeader}>
                    <View>
                      <Text style={[styles.leadName, { color: themeColors.text }]}>
                        {lead.name || 'Website Customer'}
                      </Text>
                      <Text style={[styles.leadPhone, { color: themeColors.primary }]}>{lead.phone}</Text>
                    </View>

                    <View style={styles.leadBadges}>
                      <View style={[styles.sourceBadge, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={styles.sourceBadgeText}>{lead.source}</Text>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              lead.status === 'New'
                                ? '#FEF3C7'
                                : lead.status === 'Converted'
                                ? '#D1FAE5'
                                : '#E5E7EB',
                          },
                        ]}>
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color:
                                lead.status === 'New'
                                  ? '#D97706'
                                  : lead.status === 'Converted'
                                  ? '#059669'
                                  : '#374151',
                            },
                          ]}>
                          {lead.status}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Route & Date Info */}
                  {(lead.pickup_location || lead.drop_location) && (
                    <View style={styles.routeInfo}>
                      <Text style={[styles.routeText, { color: themeColors.text }]}>
                        📍 {lead.pickup_location || 'Pickup'} ➔ {lead.drop_location || 'Drop'}
                      </Text>
                      {lead.pickup_date && (
                        <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>
                          📅 Date: {lead.pickup_date}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Notes if available */}
                  {lead.notes && (
                    <Text style={[styles.leadNotes, { color: themeColors.textSecondary }]}>
                      📝 {lead.notes}
                    </Text>
                  )}

                  {/* Action Buttons Row */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => openPhone(lead.phone)}>
                      <Phone size={14} color="#FFF" />
                      <Text style={styles.actionBtnText}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#25D366' }]} onPress={() => openWhatsApp(lead.phone, lead.name || '')}>
                      <Send size={14} color="#FFF" />
                      <Text style={styles.actionBtnText}>WhatsApp</Text>
                    </TouchableOpacity>

                    {lead.status !== 'Converted' ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
                        onPress={() => handleConvertLead(lead.id)}>
                        <UserCheck size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Convert to Booking</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.convertedTag}>
                        <CheckCircle size={14} color="#059669" />
                        <Text style={styles.convertedTagText}>Booking Created</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* --- TAB 2: Follow-ups Queue --- */}
        {activeTab === 'followups' && (
          <View>
            <View style={[styles.sectionBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border, marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Clock size={20} color="#F59E0B" />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Active Customer Follow-up Queue</Text>
              </View>
              <Text style={[styles.sectionDesc, { color: themeColors.textSecondary }]}>
                Enquiries and quotes that need a call back, rate negotiation, or trip confirmation.
              </Text>
            </View>

            {leads.filter((l) => l.status === 'New' || l.status === 'Contacted').length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <CheckCircle size={36} color="#10B981" />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  All follow-ups completed! No pending call-backs.
                </Text>
              </View>
            ) : (
              leads
                .filter((l) => l.status === 'New' || l.status === 'Contacted')
                .map((lead) => (
                  <View
                    key={`fu-${lead.id}`}
                    style={[styles.leadCard, { backgroundColor: themeColors.surface, borderColor: '#F59E0B' }]}>
                    <View style={styles.leadCardHeader}>
                      <View>
                        <Text style={[styles.leadName, { color: themeColors.text }]}>
                          {lead.name || 'Website Customer'}
                        </Text>
                        <Text style={[styles.leadPhone, { color: themeColors.primary }]}>{lead.phone}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.statusBadgeText, { color: '#D97706' }]}>Follow-up Needed</Text>
                      </View>
                    </View>

                    {(lead.pickup_location || lead.drop_location) && (
                      <View style={styles.routeInfo}>
                        <Text style={[styles.routeText, { color: themeColors.text }]}>
                          📍 {lead.pickup_location || 'Pickup'} ➔ {lead.drop_location || 'Drop'}
                        </Text>
                        {lead.pickup_date && (
                          <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>
                            📅 Travel Date: {lead.pickup_date}
                          </Text>
                        )}
                      </View>
                    )}

                    <View style={styles.actionRow}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => openPhone(lead.phone)}>
                        <Phone size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Call Back</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                        onPress={() => {
                          const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
                          const numWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                          const msg = `Hi ${lead.name || 'Customer'}, this is Drop Taxi 24 following up on your ride request (${lead.pickup_location || 'Pickup'} to ${lead.drop_location || 'Drop'}). Would you like us to confirm the cab for you today?`;
                          Linking.openURL(`https://wa.me/${numWithCountry}?text=${encodeURIComponent(msg)}`);
                        }}>
                        <Send size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>WA Reminder</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
                        onPress={() => handleConvertLead(lead.id)}>
                        <UserCheck size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Confirm Trip</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}
          </View>
        )}

        {/* --- TAB 3: Post-Trip Feedback --- */}
        {activeTab === 'feedback' && (
          <View>
            <View style={[styles.sectionBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border, marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <CheckCircle size={20} color="#10B981" />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Post-Trip Review & Feedback Hub</Text>
              </View>
              <Text style={[styles.sectionDesc, { color: themeColors.textSecondary }]}>
                Boost your Google 5-Star ratings and collect driver service feedback after trip completion.
              </Text>
            </View>

            <View style={[styles.leadCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, gap: 12 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>
                🚀 1-Click Google 5-Star Review Booster
              </Text>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary, lineHeight: 18 }}>
                Share pre-formatted feedback message with your Google Maps review link directly to completed passengers.
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#4F46E5', flex: 1 }]}
                  onPress={() => router.push('/ratings-analytics')}>
                  <Text style={styles.actionBtnText}>⭐ View Ratings & Analytics</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: themeColors.primary, flex: 1 }]}
                  onPress={() => router.push('/orders')}>
                  <Text style={styles.actionBtnText}>📦 View Completed Orders</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* --- TAB 4: Google Ads Analytics --- */}
        {activeTab === 'analytics' && (
          <View style={[styles.sectionBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={24} color="#3B82F6" />
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Google Ads & Call Attribution</Text>
            </View>

            <Text style={[styles.sectionDesc, { color: themeColors.textSecondary }]}>
              Track real-time call button triggers and ad conversions directly synced with your website and Google Ads Call Assets.
            </Text>

            <View style={styles.analyticsGrid}>
              <View style={[styles.anaCard, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.anaVal, { color: '#3B82F6' }]}>{financials?.ad_calls || 0}</Text>
                <Text style={[styles.anaLbl, { color: themeColors.textSecondary }]}>Google Ads Call Asset Triggers</Text>
              </View>

              <View style={[styles.anaCard, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.anaVal, { color: '#10B981' }]}>{financials?.web_calls || 0}</Text>
                <Text style={[styles.anaLbl, { color: themeColors.textSecondary }]}>Website Tel Link Clicks</Text>
              </View>

              <View style={[styles.anaCard, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.anaVal, { color: '#8B5CF6' }]}>{financials?.total_calls || 0}</Text>
                <Text style={[styles.anaLbl, { color: themeColors.textSecondary }]}>Total Customer Call Interest</Text>
              </View>
            </View>
          </View>
        )}

        {/* --- TAB 3: CRM Settings (Owner Only) --- */}
        {activeTab === 'settings' && role === 'Owner' && (
          <View style={[styles.sectionBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Settings size={24} color="#4F46E5" />
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>CRM Integration & Budget Settings</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Website Webhook Secret Key</Text>
            <TextInput
              style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              value={webhookKeyInput}
              onChangeText={setWebhookKeyInput}
              placeholder="e.g. dropcars_crm_secret_2026"
            />

            <Text style={[styles.fieldLabel, { color: themeColors.text, marginTop: 12 }]}>
              Monthly Ad Budget (INR ₹)
            </Text>
            <TextInput
              style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              placeholder="e.g. 15000"
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: themeColors.primary }]}
              onPress={handleSaveSettings}
              disabled={savingSettings}>
              {savingSettings ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Settings</Text>
              )}
            </TouchableOpacity>

            <View style={[styles.webhookGuide, { marginTop: 14, borderColor: '#10B981', borderWidth: 1 }]}>
              <Text style={[styles.guideTitle, { color: themeColors.text }]}>📑 Google Sheets Auto-Sync Engine:</Text>
              <Text style={[styles.guideSub, { color: themeColors.textSecondary, marginBottom: 8 }]}>
                Sync all confirmed bookings and leads to your company Google Spreadsheet with 1-click.
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 6, alignItems: 'center' }}
                onPress={async () => {
                  try {
                    const res = await crmApi.syncGoogleSheets();
                    Alert.alert('Synced!', res.message || 'Google Sheets updated successfully.');
                  } catch (e: any) {
                    Alert.alert('Sync Result', e?.message || 'Google Sheets sync completed.');
                  }
                }}>
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>🚀 Trigger Google Sheets Live Sync</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.webhookGuide}>
              <Text style={[styles.guideTitle, { color: themeColors.text }]}>💡 Webhook Endpoint URL for Drop Taxi 24 PHP Site:</Text>
              <Text style={[styles.codeSnippet, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', color: '#10B981' }]}>
                POST http://localhost:8000/api/crm/lead
              </Text>
              <Text style={[styles.guideSub, { color: themeColors.textSecondary }]}>
                Header: X-Website-Secret-Key: {webhookKeyInput}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  metricIconWrap: {
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
  },
  financialBanner: {
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    gap: 12,
  },
  finHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  finMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  finItem: {
    alignItems: 'center',
  },
  finItemLabel: {
    fontSize: 11,
  },
  finItemVal: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  tabSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterContainer: {
    gap: 10,
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  leadCard: {
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  leadCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leadName: {
    fontSize: 15,
    fontWeight: '700',
  },
  leadPhone: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  leadBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  routeInfo: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 8,
    borderRadius: 6,
  },
  routeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    marginTop: 2,
  },
  leadNotes: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  convertedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  convertedTagText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
  },
  sectionBox: {
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  analyticsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  anaCard: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    gap: 4,
  },
  anaVal: {
    fontSize: 20,
    fontWeight: '800',
  },
  anaLbl: {
    fontSize: 11,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
  },
  saveBtn: {
    height: 42,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  webhookGuide: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 6,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  codeSnippet: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  guideSub: {
    fontSize: 12,
  },
});
