import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { ShieldCheck, X, Check, FileText, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Scale, Car, IndianRupee, Lock, Phone, Users, Clock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

const { height } = Dimensions.get('window');

interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
  title?: string;
  body?: string;
  agreeButtonText?: string;
  /** small line under the title (defaults to "Official Platform Agreement") */
  subtitle?: string;
  /** Short key points, one per line as "Title: sentence" - shown first, the long text is behind "Read full text" */
  summary?: string;
  /** Web page with the full Terms & Conditions */
  fullUrl?: string;
}

export default function TermsModal({
  visible,
  onClose,
  onAccept,
  title = 'Terms & Policies',
  body = '',
  agreeButtonText = 'I Understand & Accept',
  summary,
  fullUrl,
  subtitle = 'Official Platform Agreement',
}: TermsModalProps) {
  const { colors, isDarkMode: isDark } = useTheme();
  const [showFull, setShowFull] = useState(false);

  const KEY_ICONS = [Scale, Car, FileText, ShieldCheck, Lock, IndianRupee, AlertTriangle, Users, Phone];
  const points = (summary || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 && i < 60 ? { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { title: '', text: l };
    });
  const hasSummary = points.length > 0;

  const renderSummary = () => (
    <View style={{ gap: 10 }}>
      <Text style={[styles.summaryIntro, { color: colors.textSecondary }]}>The main points you agree to. The full Terms & Conditions are one tap away.</Text>
      {points.map((p, i) => {
        const Icon = KEY_ICONS[i % KEY_ICONS.length];
        return (
          <View key={i} style={[styles.pointCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
            <View style={styles.pointIcon}><Icon size={18} color="#4F46E5" /></View>
            <View style={{ flex: 1 }}>
              {!!p.title && <Text style={[styles.pointTitle, { color: colors.text }]}>{p.title}</Text>}
              <Text style={[styles.pointText, { color: colors.textSecondary }]}>{p.text}</Text>
            </View>
          </View>
        );
      })}
      {!!fullUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(fullUrl).catch(() => {})} activeOpacity={0.8} style={styles.linkRow}>
          <ExternalLink size={16} color="#4F46E5" />
          <Text style={styles.linkText}>Read the full Terms & Conditions</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => setShowFull((v) => !v)} activeOpacity={0.8} style={styles.linkRow}>
        {showFull ? <ChevronUp size={16} color="#4F46E5" /> : <ChevronDown size={16} color="#4F46E5" />}
        <Text style={styles.linkText}>{showFull ? 'Hide the full text' : 'View the full text here'}</Text>
      </TouchableOpacity>
    </View>
  );

  // Helper to parse terms text into structured blocks
  const renderFormattedContent = () => {
    if (!body || typeof body !== 'string') return null;

    // Split text into paragraphs by double line breaks or major section headers
    const paragraphs = body.split('\n\n').filter((p) => p.trim().length > 0);

    return paragraphs.map((paragraph, index) => {
      const trimmed = paragraph.trim();

      // Check if this paragraph is a major header or section title
      const isSectionHeader = /^\d+\.\s+/.test(trimmed);
      const isContactOrNote = trimmed.startsWith('->') || trimmed.includes('support@dropcars.com');
      const isMainTitle = index === 0 && (trimmed.toLowerCase().includes('drop cars') || trimmed.toLowerCase().includes('விதிமுறைகள்') || trimmed.toLowerCase().includes('नियम') || trimmed.toLowerCase().includes('నిబంధనలు'));

      if (isMainTitle) {
        return (
          <View key={index} style={[styles.heroCard, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)', borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)' }]}>
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroIconBadge}>
                <ShieldCheck size={22} color="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitleText, { color: colors.text }]}>
                  Drop Cars Partner Platform
                </Text>
                <Text style={styles.heroSubText}>
                  Legal Agreement & Security Policy
                </Text>
              </View>
            </View>
            <Text style={[styles.heroBodyText, { color: colors.textSecondary }]}>
              {trimmed}
            </Text>
          </View>
        );
      }

      if (isSectionHeader) {
        // Extract section title and section body
        const lines = trimmed.split('\n');
        const sectionTitle = lines[0];
        const sectionContent = lines.slice(1).join('\n');

        const isZeroLiability = sectionTitle.toLowerCase().includes('zero liability') || sectionTitle.toLowerCase().includes('நடுநிலைமை') || sectionTitle.toLowerCase().includes('తటస్థత');
        const isAbsoluteLiability = sectionTitle.toLowerCase().includes('absolute') || sectionTitle.toLowerCase().includes('பொறுப்பு') || sectionTitle.toLowerCase().includes('బాధ్యత') || sectionTitle.toLowerCase().includes('ज़िम्मेदारी');

        return (
          <View
            key={index}
            style={[
              styles.sectionCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(243, 244, 246, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(229, 231, 235, 1)',
                borderLeftColor: isZeroLiability ? '#EF4444' : isAbsoluteLiability ? '#F59E0B' : '#6366F1',
              },
            ]}
          >
            <View style={styles.sectionTitleRow}>
              {isZeroLiability ? (
                <AlertTriangle size={18} color="#EF4444" style={{ marginRight: 8 }} />
              ) : (
                <FileText size={18} color={isDark ? '#818CF8' : '#4F46E5'} style={{ marginRight: 8 }} />
              )}
              <Text style={[styles.sectionTitleText, { color: colors.text }]}>
                {sectionTitle}
              </Text>
            </View>
            {sectionContent ? (
              <Text style={[styles.sectionContentText, { color: colors.textSecondary }]}>
                {sectionContent}
              </Text>
            ) : null}
          </View>
        );
      }

      if (isContactOrNote) {
        return (
          <View
            key={index}
            style={[
              styles.contactCard,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.06)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
              },
            ]}
          >
            <Text style={[styles.contactCardText, { color: colors.text }]}>
              {trimmed}
            </Text>
          </View>
        );
      }

      // Default paragraph styling
      return (
        <View key={index} style={styles.paragraphContainer}>
          <Text style={[styles.paragraphText, { color: colors.textSecondary }]}>
            {trimmed}
          </Text>
        </View>
      );
    });
  };

  const handleAcceptPress = () => {
    if (onAccept) {
      onAccept();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            },
          ]}
        >
          {/* Top Grab Handle */}
          <View style={styles.grabHandleContainer}>
            <View style={[styles.grabHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.headerLeft}>
              <View style={styles.badgeIconContainer}>
                <ShieldCheck size={22} color="#FFFFFF" />
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {title}
                </Text>
                <Text style={styles.subtitleTag}>
                  {subtitle}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              activeOpacity={0.7}
            >
              <X color={colors.text} size={20} />
            </TouchableOpacity>
          </View>

          {/* Body Content - Scrollbar Completely Hidden */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {hasSummary ? renderSummary() : null}
            {!hasSummary || showFull ? renderFormattedContent() : null}
          </ScrollView>

          {/* Sticky Bottom Footer */}
          <View
            style={[
              styles.footer,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              },
            ]}
          >
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAcceptPress}
              activeOpacity={0.85}
            >
              <Check size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.acceptButtonText}>{agreeButtonText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    height: height * 0.85,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  grabHandleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  grabHandle: {
    width: 38,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badgeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextGroup: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.2,
  },
  subtitleTag: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6366F1',
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  heroCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  heroTitleText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  heroSubText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6366F1',
  },
  heroBodyText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitleText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    flex: 1,
    lineHeight: 20,
  },
  sectionContentText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  contactCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  contactCardText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  paragraphContainer: {
    paddingVertical: 2,
  },
  paragraphText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  summaryIntro: { fontSize: 13, lineHeight: 19 },
  pointCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 8, borderWidth: 1 },
  pointIcon: { width: 34, height: 34, borderRadius: 6, backgroundColor: 'rgba(99, 102, 241, 0.12)', alignItems: 'center', justifyContent: 'center' },
  pointTitle: { fontSize: 14.5, fontFamily: 'Inter-Bold', marginBottom: 2 },
  pointText: { fontSize: 13.5, fontFamily: 'Inter-Regular', lineHeight: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  linkText: { color: '#4F46E5', fontSize: 14, fontFamily: 'Inter-SemiBold', textDecorationLine: 'underline', flexShrink: 1 },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  acceptButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
});
