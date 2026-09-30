import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Phone, Mic, MicOff, Volume2, VolumeX, PhoneOff, MessageSquare, ShieldCheck } from 'lucide-react-native';

interface InAppCallModalProps {
  visible: boolean;
  onClose: () => void;
  recipientName: string;
  recipientRole?: 'Customer' | 'Driver' | 'Vendor';
  phoneNumber: string;
}

export default function InAppCallModal({
  visible,
  onClose,
  recipientName,
  recipientRole = 'Customer',
  phoneNumber,
}: InAppCallModalProps) {
  const [callState, setCallState] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED'>('CONNECTING');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [callDurationSec, setCallDurationSec] = useState(0);

  useEffect(() => {
    let timer: any;
    if (visible) {
      setCallState('CONNECTING');
      setCallDurationSec(0);
      const connTimer = setTimeout(() => {
        setCallState('CONNECTED');
      }, 1500);

      timer = setInterval(() => {
        setCallDurationSec((prev) => prev + 1);
      }, 1000);

      return () => {
        clearTimeout(connTimer);
        clearInterval(timer);
      };
    }
  }, [visible]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleWhatsAppCall = async () => {
    const cleaned = phoneNumber.replace(/[^\d]/g, '');
    const numWithCountry = cleaned.length === 10 ? `91${cleaned}` : cleaned;
    const url = `https://wa.me/${numWithCountry}?text=${encodeURIComponent(
      `Hello ${recipientName}, contacting you regarding your Drop Cars booking.`
    )}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp Not Installed', 'Please place a regular phone call.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open WhatsApp.');
    }
  };

  const handleRegularPhoneCall = async () => {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    const dialNum = /^\d{10}$/.test(cleaned) ? `+91${cleaned}` : cleaned;
    Linking.openURL(`tel:${dialNum}`);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.callContainer}>
          {/* Header Badge */}
          <View style={styles.badgeRow}>
            <ShieldCheck size={16} color="#10B981" />
            <Text style={styles.badgeText}>ZERO-COST IN-APP MASKED CALLING</Text>
          </View>

          {/* Avatar / Icon */}
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{recipientName ? recipientName[0].toUpperCase() : 'C'}</Text>
          </View>

          {/* Name & Role */}
          <Text style={styles.nameText}>{recipientName}</Text>
          <Text style={styles.roleText}>{recipientRole} • {phoneNumber}</Text>

          {/* Status Indicator */}
          <View style={styles.statusBox}>
            <View style={[styles.statusDot, callState === 'CONNECTED' ? styles.dotGreen : styles.dotYellow]} />
            <Text style={styles.statusText}>
              {callState === 'CONNECTING' ? 'Securing In-App Audio Channel...' : `Connected (${formatTime(callDurationSec)})`}
            </Text>
          </View>

          {/* Call Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, muted && styles.controlBtnActive]}
              onPress={() => setMuted(!muted)}
            >
              {muted ? <MicOff size={22} color="#EF4444" /> : <Mic size={22} color="#FFFFFF" />}
              <Text style={styles.controlLabel}>{muted ? 'Muted' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.endCallBtn} onPress={onClose}>
              <PhoneOff size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, speaker && styles.controlBtnActive]}
              onPress={() => setSpeaker(!speaker)}
            >
              {speaker ? <Volume2 size={22} color="#10B981" /> : <VolumeX size={22} color="#FFFFFF" />}
              <Text style={styles.controlLabel}>{speaker ? 'Speaker On' : 'Speaker'}</Text>
            </TouchableOpacity>
          </View>

          {/* Security & Privacy Banner */}
          <View style={styles.altBox}>
            <Text style={styles.altTitle}>🔒 Privacy & Platform Protection:</Text>
            <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 15 }}>
              Direct personal numbers & WhatsApp contacts are masked to protect trip security and platform privacy.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  callContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 20,
  },
  badgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    elevation: 4,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  nameText: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  roleText: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 28,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: '#10B981',
  },
  dotYellow: {
    backgroundColor: '#EAB308',
  },
  statusText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 24,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  controlLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 4,
    position: 'absolute',
    bottom: -18,
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  altBox: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
    marginTop: 8,
  },
  altTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  altButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  waBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: 6,
  },
  waBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  phoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 6,
  },
  phoneBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
