import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Linking,
  ScrollView,
} from 'react-native';
import { AlertOctagon, RefreshCw, PhoneCall, MessageCircle } from 'lucide-react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Unhandled UI Crash (Vendor App):', error, errorInfo);
  }

  private handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleCall = () => {
    Linking.openURL('tel:+917200217986').catch(() => {});
  };

  private handleWhatsApp = () => {
    const errCode = this.state.error?.name || 'UI_CRASH';
    const text = encodeURIComponent(
      `Hello Drop Cars Support,\n\nVendor App encountered an issue.\n- Reference: ${errCode}\n- Please assist.`
    );
    Linking.openURL(`https://wa.me/917200217986?text=${text}`).catch(() => {});
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.iconCircle}>
              <AlertOctagon size={40} color="#DC2626" />
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The fleet console encountered an unexpected issue. Your orders and partner ledger are safe.
            </Text>

            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>ERROR CODE</Text>
              <Text style={styles.codeValue}>
                {this.state.error?.name || 'ERR-VENDOR-UI'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.restartBtn}
              onPress={this.handleRestart}
              activeOpacity={0.8}
            >
              <RefreshCw size={17} color="#FFFFFF" />
              <Text style={styles.restartBtnText}>Reload Console</Text>
            </TouchableOpacity>

            <View style={styles.supportRow}>
              <TouchableOpacity
                style={styles.supportBtn}
                onPress={this.handleCall}
                activeOpacity={0.7}
              >
                <PhoneCall size={15} color="#10B981" />
                <Text style={styles.supportCallText}>Call Desk</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.supportBtn}
                onPress={this.handleWhatsApp}
                activeOpacity={0.7}
              >
                <MessageCircle size={15} color="#25D366" />
                <Text style={styles.supportWaText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 20,
  },
  codeBox: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  codeValue: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#E2E8F0',
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 10,
    width: '100%',
    maxWidth: 280,
    marginBottom: 16,
  },
  restartBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  supportRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  supportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  supportCallText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
  },
  supportWaText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
    color: '#25D366',
  },
});

export default GlobalErrorBoundary;
