import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { Camera, Image as ImageIcon, X, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PhotoPickerModalProps {
  visible: boolean;
  title?: string;
  onSelectCamera: () => void;
  onSelectGallery: () => void;
  onClose: () => void;
}

export default function PhotoPickerModal({
  visible,
  title = 'Select Photo Source',
  onSelectCamera,
  onSelectGallery,
  onClose,
}: PhotoPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <Sparkles color="#6366F1" size={13} />
                <Text style={styles.badgeText}>DOCUMENT CAPTURE</Text>
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color="#94A3B8" size={18} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={onSelectCamera}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(99, 102, 241, 0.15)', 'rgba(79, 70, 229, 0.05)']}
                style={styles.optionGradient}
              >
                <View style={styles.iconCircleCamera}>
                  <Camera color="#FFFFFF" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Take Photo with Camera</Text>
                  <Text style={styles.optionDesc}>Capture document instantly using device camera</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={onSelectGallery}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(16, 185, 129, 0.15)', 'rgba(5, 150, 105, 0.05)']}
                style={styles.optionGradient}
              >
                <View style={styles.iconCircleGallery}>
                  <ImageIcon color="#FFFFFF" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Choose from Files / Gallery</Text>
                  <Text style={styles.optionDesc}>Upload scanned image or document file</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  badgeText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  optionCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  optionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  iconCircleCamera: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGallery: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  optionDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
