import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import {
  Receipt,
  Download,
  FileText,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  Building2,
  Calendar,
  ChevronRight,
  Filter,
  DollarSign,
  ShieldCheck,
} from 'lucide-react-native';
import { ScreenShell, useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';

interface MonthlyInvoice {
  id: string;
  month: string;
  year: string;
  totalBilled: number;
  gstAmount: number;
  tripCount: number;
  status: 'PAID' | 'PENDING' | 'PROCESSING';
  dueDate: string;
}

interface LedgerTrip {
  id: string;
  date: string;
  employeeName: string;
  purpose: string;
  route: string;
  fare: number;
  gst: number;
  invoiceNo: string;
}

const SAMPLE_INVOICES: MonthlyInvoice[] = [
  { id: 'INV-2026-07', month: 'July', year: '2026', totalBilled: 42100, gstAmount: 6422, tripCount: 14, status: 'PAID', dueDate: '05 Aug 2026' },
  { id: 'INV-2026-06', month: 'June', year: '2026', totalBilled: 51300, gstAmount: 7825, tripCount: 18, status: 'PAID', dueDate: '05 Jul 2026' },
  { id: 'INV-2026-05', month: 'May', year: '2026', totalBilled: 49450, gstAmount: 7543, tripCount: 16, status: 'PAID', dueDate: '05 Jun 2026' },
];

const SAMPLE_LEDGER: LedgerTrip[] = [
  { id: 'TRIP-9041', date: '24 Aug 2026', employeeName: 'Rahul Sharma', purpose: 'Client Visit', route: 'Chennai Airport ➔ OMR Tech Park', fare: 1240, gst: 189, invoiceNo: 'INV-2026-08' },
  { id: 'TRIP-8982', date: '20 Aug 2026', employeeName: 'Priya Patel', purpose: 'Site Inspection', route: 'Coimbatore ➔ Tiruppur Textile Hub', fare: 2850, gst: 435, invoiceNo: 'INV-2026-08' },
  { id: 'TRIP-8910', date: '18 Aug 2026', employeeName: 'Anand V', purpose: 'Airport Transfer', route: 'Madurai City ➔ Airport', fare: 950, gst: 145, invoiceNo: 'INV-2026-08' },
];

export default function B2BBillingScreen() {
  const { isDark } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = getStyles(isDark, palette);

  const [activeTab, setActiveTab] = useState<'STATEMENTS' | 'LEDGER'>('STATEMENTS');

  const handleDownloadInvoice = (inv: MonthlyInvoice) => {
    const msg = `Downloading GST Tax Invoice ${inv.id} (${inv.month} ${inv.year}) · Total ₹${inv.totalBilled.toLocaleString('en-IN')}`;
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Download GST Invoice', msg);
  };

  return (
    <ScreenShell title="Billing & GST Invoices" subtitle="Company account statements, tax credits and ledger">
      <View style={s.container}>
        {/* CORPORATE SUMMARY METRIC CARDS */}
        <View style={s.metricsGrid}>
          <View style={s.metricCard}>
            <View style={[s.metricIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
              <TrendingUp color="#0EA5E9" size={20} />
            </View>
            <Text style={s.metricValue}>₹1,42,850</Text>
            <Text style={s.metricLabel}>YTD Corporate Spend</Text>
          </View>

          <View style={s.metricCard}>
            <View style={[s.metricIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <ShieldCheck color="#10B981" size={20} />
            </View>
            <Text style={s.metricValue}>₹21,790</Text>
            <Text style={s.metricLabel}>18% GST Credit Saved</Text>
          </View>
        </View>

        {/* GST ACCOUNT INFO CARD */}
        <View style={s.gstCard}>
          <View style={s.gstCardHeader}>
            <Building2 color="#0EA5E9" size={22} />
            <View style={{ flex: 1 }}>
              <Text style={s.companyName}>Acme Corp Technologies Pvt Ltd</Text>
              <Text style={s.gstinText}>GSTIN: 33AAAAA0000A1Z5 · Verified Corporate Account</Text>
            </View>
            <View style={s.activeBadge}>
              <CheckCircle2 color="#10B981" size={12} />
              <Text style={s.activeBadgeText}>Active</Text>
            </View>
          </View>
          <View style={s.autoDebitRow}>
            <CreditCard color={palette.textMuted} size={15} />
            <Text style={s.autoDebitText}>Auto-Debit: HDFC Bank Corp Account (**** 9081)</Text>
          </View>
        </View>

        {/* TAB SWITCHER: MONTHLY STATEMENTS VS ITEMIZE LEDGER */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabItem, activeTab === 'STATEMENTS' && s.tabItemActive]}
            onPress={() => setActiveTab('STATEMENTS')}
          >
            <Text style={[s.tabText, activeTab === 'STATEMENTS' && s.tabTextActive]}>
              Monthly Tax Invoices
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'LEDGER' && s.tabItemActive]}
            onPress={() => setActiveTab('LEDGER')}
          >
            <Text style={[s.tabText, activeTab === 'LEDGER' && s.tabTextActive]}>
              Trip Ledger Log
            </Text>
          </TouchableOpacity>
        </View>

        {/* CONTENT AREA 1: MONTHLY STATEMENTS */}
        {activeTab === 'STATEMENTS' ? (
          <View style={s.section}>
            {SAMPLE_INVOICES.map((inv) => (
              <View key={inv.id} style={s.invoiceCard}>
                <View style={s.invoiceTopRow}>
                  <View style={s.invoiceIconBox}>
                    <FileText color="#0EA5E9" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.invoiceMonth}>{inv.month} {inv.year} Tax Statement</Text>
                    <Text style={s.invoiceId}>{inv.id} • {inv.tripCount} Trips Billed</Text>
                  </View>
                  <View style={s.paidBadge}>
                    <Text style={s.paidBadgeText}>PAID</Text>
                  </View>
                </View>

                <View style={s.invoiceDivider} />

                <View style={s.invoiceFooter}>
                  <View>
                    <Text style={s.invoiceAmountText}>₹{inv.totalBilled.toLocaleString('en-IN')}</Text>
                    <Text style={s.gstSubText}>Includes ₹{inv.gstAmount.toLocaleString('en-IN')} GST (18%)</Text>
                  </View>

                  <TouchableOpacity
                    style={s.downloadBtn}
                    activeOpacity={0.8}
                    onPress={() => handleDownloadInvoice(inv)}
                  >
                    <Download color="#0EA5E9" size={14} />
                    <Text style={s.downloadBtnText}>PDF Invoice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (

          /* CONTENT AREA 2: TRIP LEDGER LOG */
          <View style={s.section}>
            {SAMPLE_LEDGER.map((trip) => (
              <View key={trip.id} style={s.ledgerCard}>
                <View style={s.ledgerTop}>
                  <Text style={s.ledgerEmployee}>{trip.employeeName}</Text>
                  <Text style={s.ledgerFare}>₹{trip.fare.toLocaleString('en-IN')}</Text>
                </View>
                <Text style={s.ledgerRoute}>{trip.route}</Text>
                <View style={s.ledgerBottom}>
                  <Text style={s.ledgerMeta}>{trip.purpose} • {trip.date}</Text>
                  <Text style={s.ledgerGst}>GST: ₹{trip.gst}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}

function getStyles(isDark: boolean, palette: ReturnType<typeof getPalette>) {
  const displayFont = Platform.OS === 'web' ? "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" : undefined;
  const bodyFont = Platform.OS === 'web' ? "'Plus Jakarta Sans', system-ui, sans-serif" : undefined;

  return StyleSheet.create({
    container: { gap: 14 },

    metricsGrid: { flexDirection: 'row', gap: 12 },
    metricCard: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    metricIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    metricValue: { fontSize: 18, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    metricLabel: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },

    gstCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1.5,
      borderColor: '#0EA5E9',
      gap: 12,
    },
    gstCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    companyName: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    gstinText: { fontSize: 10.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },
    activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    activeBadgeText: { color: '#10B981', fontSize: 10, fontWeight: '800', fontFamily: bodyFont },
    autoDebitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.divider },
    autoDebitText: { fontSize: 11, color: palette.textMuted, fontFamily: bodyFont },

    tabBar: { flexDirection: 'row', backgroundColor: palette.surfaceAlt, borderRadius: 12, padding: 4 },
    tabItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
    tabItemActive: { backgroundColor: '#0EA5E9' },
    tabText: { fontSize: 12, fontWeight: '800', color: palette.textMuted, fontFamily: bodyFont },
    tabTextActive: { color: '#FFFFFF' },

    section: { gap: 10 },
    invoiceCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
    },
    invoiceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    invoiceIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(14, 165, 233, 0.14)', justifyContent: 'center', alignItems: 'center' },
    invoiceMonth: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    invoiceId: { fontSize: 11, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },
    paidBadge: { backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    paidBadgeText: { color: '#10B981', fontSize: 10, fontWeight: '900', fontFamily: bodyFont },
    invoiceDivider: { height: 1, backgroundColor: palette.divider },
    invoiceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    invoiceAmountText: { fontSize: 17, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    gstSubText: { fontSize: 10.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },

    downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14, 165, 233, 0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    downloadBtnText: { color: '#0EA5E9', fontSize: 11.5, fontWeight: '800', fontFamily: bodyFont },

    ledgerCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    ledgerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ledgerEmployee: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    ledgerFare: { fontSize: 14, fontWeight: '900', color: '#0EA5E9', fontFamily: displayFont },
    ledgerRoute: { fontSize: 11.5, color: palette.textMuted, fontFamily: bodyFont },
    ledgerBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.divider },
    ledgerMeta: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },
    ledgerGst: { fontSize: 10.5, fontWeight: '700', color: '#10B981', fontFamily: bodyFont },
  });
}
