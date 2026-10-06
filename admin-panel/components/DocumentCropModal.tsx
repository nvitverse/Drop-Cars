import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native';
import { X, RotateCw, ZoomIn, ZoomOut, Check, Crop as CropIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface DocumentCropModalProps {
  visible: boolean;
  rawUri: string;
  label: string;
  onCancel: () => void;
  onConfirm: (croppedUriOrBlob: string | File | Blob) => void;
}

// Crop using HTML5 Canvas on web, or dataURL representation
async function cropImageOnWeb(
  imageUri: string,
  cropBox: { x: number; y: number; width: number; height: number },
  frameLayout: { width: number; height: number },
  rotation: number,
  zoom: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUri);
          return;
        }

        // Calculate aspect fit scale of image inside frame
        const scale = Math.min(frameLayout.width / naturalW, frameLayout.height / naturalH) * zoom;
        const displayedW = naturalW * scale;
        const displayedH = naturalH * scale;

        const offsetX = (frameLayout.width - displayedW) / 2;
        const offsetY = (frameLayout.height - displayedH) / 2;

        // Crop box in natural image coordinates
        const cropXInDisplayed = cropBox.x - offsetX;
        const cropYInDisplayed = cropBox.y - offsetY;

        const naturalCropX = Math.max(0, cropXInDisplayed / scale);
        const naturalCropY = Math.max(0, cropYInDisplayed / scale);
        const naturalCropW = Math.min(naturalW - naturalCropX, cropBox.width / scale);
        const naturalCropH = Math.min(naturalH - naturalCropY, cropBox.height / scale);

        // Normalize rotation
        const normRot = (rotation % 360 + 360) % 360;

        if (normRot === 90 || normRot === 270) {
          canvas.width = Math.max(20, naturalCropH);
          canvas.height = Math.max(20, naturalCropW);
        } else {
          canvas.width = Math.max(20, naturalCropW);
          canvas.height = Math.max(20, naturalCropH);
        }

        ctx.save();
        if (normRot === 90) {
          ctx.translate(canvas.width, 0);
          ctx.rotate((90 * Math.PI) / 180);
        } else if (normRot === 180) {
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate((180 * Math.PI) / 180);
        } else if (normRot === 270) {
          ctx.translate(0, canvas.height);
          ctx.rotate((270 * Math.PI) / 180);
        }

        ctx.drawImage(
          img,
          naturalCropX,
          naturalCropY,
          naturalCropW,
          naturalCropH,
          0,
          0,
          naturalCropW,
          naturalCropH
        );
        ctx.restore();

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve(croppedDataUrl);
      } catch (err) {
        console.warn('Web crop failed, falling back to original:', err);
        resolve(imageUri);
      }
    };
    img.onerror = () => resolve(imageUri);
    img.src = imageUri;
  });
}

export default function DocumentCropModal({
  visible,
  rawUri,
  label,
  onCancel,
  onConfirm,
}: DocumentCropModalProps) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const [frameLayout, setFrameLayout] = useState({ width: 340, height: 260 });
  const frameLayoutRef = useRef(frameLayout);
  frameLayoutRef.current = frameLayout;

  const [cropBox, setCropBox] = useState({ x: 20, y: 20, width: 300, height: 220 });
  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;

  useEffect(() => {
    if (visible && frameLayout.width > 0) {
      const margin = Math.min(24, frameLayout.width * 0.08, frameLayout.height * 0.08);
      setCropBox({
        x: margin,
        y: margin,
        width: Math.max(100, frameLayout.width - margin * 2),
        height: Math.max(100, frameLayout.height - margin * 2),
      });
      setRotation(0);
      setZoom(1);
    }
  }, [visible, rawUri, frameLayout.width, frameLayout.height]);

  const CROP_MIN_BOX = 60;
  const CORNER_HIT_RADIUS = 36;

  const dragModeRef = useRef<'tl' | 'tr' | 'bl' | 'br' | 'move' | 'none'>('none');
  const dragStartBoxRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const cropPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const box = cropBoxRef.current;
        dragStartBoxRef.current = { ...box };

        const corners: Array<['tl' | 'tr' | 'bl' | 'br', number, number]> = [
          ['tl', box.x, box.y],
          ['tr', box.x + box.width, box.y],
          ['bl', box.x, box.y + box.height],
          ['br', box.x + box.width, box.y + box.height],
        ];
        let nearest: 'tl' | 'tr' | 'bl' | 'br' | null = null;
        let nearestDist = Infinity;
        for (const [id, cx, cy] of corners) {
          const dist = Math.hypot(locationX - cx, locationY - cy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = id;
          }
        }

        if (nearest && nearestDist <= CORNER_HIT_RADIUS) {
          dragModeRef.current = nearest;
        } else if (
          locationX >= box.x &&
          locationX <= box.x + box.width &&
          locationY >= box.y &&
          locationY <= box.y + box.height
        ) {
          dragModeRef.current = 'move';
        } else {
          dragModeRef.current = 'none';
        }
      },
      onPanResponderMove: (_evt, gesture) => {
        const mode = dragModeRef.current;
        if (mode === 'none') return;
        const frame = frameLayoutRef.current;
        const start = dragStartBoxRef.current;
        const { dx, dy } = gesture;
        let { x, y, width, height } = start;

        if (mode === 'move') {
          x = start.x + dx;
          y = start.y + dy;
        } else {
          if (mode === 'tl' || mode === 'tr') {
            y = start.y + dy;
            height = start.height - dy;
          }
          if (mode === 'bl' || mode === 'br') {
            height = start.height + dy;
          }
          if (mode === 'tl' || mode === 'bl') {
            x = start.x + dx;
            width = start.width - dx;
          }
          if (mode === 'tr' || mode === 'br') {
            width = start.width + dx;
          }

          if (width < CROP_MIN_BOX) {
            if (mode === 'tl' || mode === 'bl') x = start.x + start.width - CROP_MIN_BOX;
            width = CROP_MIN_BOX;
          }
          if (height < CROP_MIN_BOX) {
            if (mode === 'tl' || mode === 'tr') y = start.y + start.height - CROP_MIN_BOX;
            height = CROP_MIN_BOX;
          }
        }

        if (x < 0) {
          if (mode !== 'move') width += x;
          x = 0;
        }
        if (y < 0) {
          if (mode !== 'move') height += y;
          y = 0;
        }
        if (x + width > frame.width) {
          if (mode === 'move') x = Math.max(0, frame.width - width);
          else width = frame.width - x;
        }
        if (y + height > frame.height) {
          if (mode === 'move') y = Math.max(0, frame.height - height);
          else height = frame.height - y;
        }

        setCropBox({
          x,
          y,
          width: Math.max(CROP_MIN_BOX, width),
          height: Math.max(CROP_MIN_BOX, height),
        });
      },
    })
  ).current;

  const handleConfirmCrop = async () => {
    if (!rawUri) return;
    setIsProcessing(true);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const croppedResult = await cropImageOnWeb(
          rawUri,
          cropBoxRef.current,
          frameLayoutRef.current,
          rotation,
          zoom
        );
        setIsProcessing(false);
        onConfirm(croppedResult);
      } else {
        setIsProcessing(false);
        onConfirm(rawUri);
      }
    } catch (err) {
      console.error('Crop processing failed:', err);
      setIsProcessing(false);
      onConfirm(rawUri);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.cropModalOverlay}>
        <View style={styles.cropModalCard}>
          {/* Header */}
          <View style={styles.cropModalHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <CropIcon color="#6366F1" size={14} />
                <Text style={styles.badgeText}>DOCUMENT SCANNER & CROP</Text>
              </View>
              <Text style={styles.cropModalTitle}>Crop & Align Photo</Text>
              <Text style={styles.cropModalSubtitle}>
                {label} • Drag corner handles to fit document borders
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeCropBtn}>
              <X color="#94A3B8" size={20} />
            </TouchableOpacity>
          </View>

          {/* Frame Container */}
          <View
            style={styles.cropFrameContainer}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) setFrameLayout({ width, height });
            }}
          >
            {rawUri ? (
              <View style={styles.cropInnerImageWrap}>
                <Image
                  source={{ uri: rawUri }}
                  style={[
                    styles.cropImagePreview,
                    { transform: [{ rotate: `${rotation}deg` }, { scale: zoom }] },
                  ]}
                  resizeMode="contain"
                />

                {/* Dark Mask around crop box */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: cropBox.y, backgroundColor: 'rgba(0,0,0,0.65)' }} />
                  <View style={{ position: 'absolute', left: 0, right: 0, top: cropBox.y + cropBox.height, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }} />
                  <View style={{ position: 'absolute', left: 0, top: cropBox.y, width: cropBox.x, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.65)' }} />
                  <View style={{ position: 'absolute', left: cropBox.x + cropBox.width, right: 0, top: cropBox.y, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.65)' }} />
                </View>

                {/* Crop Guide Box */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.cropGuideFrame,
                    { left: cropBox.x, top: cropBox.y, width: cropBox.width, height: cropBox.height },
                  ]}
                >
                  <View style={styles.cropGridLineH} />
                  <View style={styles.cropGridLineV} />
                  <View style={[styles.cropCorner, styles.cropCornerTL]}>
                    <View style={[styles.cropCornerMark, styles.cropCornerMarkTL]} />
                  </View>
                  <View style={[styles.cropCorner, styles.cropCornerTR]}>
                    <View style={[styles.cropCornerMark, styles.cropCornerMarkTR]} />
                  </View>
                  <View style={[styles.cropCorner, styles.cropCornerBL]}>
                    <View style={[styles.cropCornerMark, styles.cropCornerMarkBL]} />
                  </View>
                  <View style={[styles.cropCorner, styles.cropCornerBR]}>
                    <View style={[styles.cropCornerMark, styles.cropCornerMarkBR]} />
                  </View>
                </View>

                {/* Pan Handler Area */}
                <View {...cropPanResponder.panHandlers} style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
          </View>

          {/* Action Toolbar */}
          <View style={styles.cropToolbar}>
            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setRotation((r) => (r + 90) % 360)}
              activeOpacity={0.7}
            >
              <RotateCw color="#6366F1" size={16} />
              <Text style={styles.cropToolBtnText}>Rotate</Text>
            </TouchableOpacity>

            <View style={styles.cropDivider} />

            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(1)))}
              disabled={zoom <= 1}
              activeOpacity={0.7}
            >
              <ZoomOut color={zoom <= 1 ? '#64748B' : '#6366F1'} size={16} />
              <Text style={[styles.cropToolBtnText, zoom <= 1 && { color: '#64748B' }]}>Zoom -</Text>
            </TouchableOpacity>

            <View style={styles.cropDivider} />

            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}
              disabled={zoom >= 2.5}
              activeOpacity={0.7}
            >
              <ZoomIn color={zoom >= 2.5 ? '#64748B' : '#6366F1'} size={16} />
              <Text style={[styles.cropToolBtnText, zoom >= 2.5 && { color: '#64748B' }]}>Zoom +</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Action Buttons */}
          <View style={styles.cropActionButtonsRow}>
            <TouchableOpacity
              style={styles.skipCropBtn}
              onPress={() => onConfirm(rawUri)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <Text style={styles.skipCropBtnText}>Upload Original</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmCropBtn, isProcessing && { opacity: 0.7 }]}
              onPress={handleConfirmCrop}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#4F46E5', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmCropBtnGradient}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check color="#FFFFFF" size={16} />
                    <Text style={styles.confirmCropBtnText}>Crop & Save</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cropModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cropModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  cropModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  badgeText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cropModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  cropModalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeCropBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  cropFrameContainer: {
    width: '100%',
    height: 280,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cropInnerImageWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cropImagePreview: {
    width: '100%',
    height: '100%',
  },
  cropGuideFrame: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#818CF8',
    borderRadius: 6,
  },
  cropCorner: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCornerTL: { top: -16, left: -16 },
  cropCornerTR: { top: -16, right: -16 },
  cropCornerBL: { bottom: -16, left: -16 },
  cropCornerBR: { bottom: -16, right: -16 },
  cropCornerMark: { width: 16, height: 16, borderColor: '#6366F1' },
  cropCornerMarkTL: { borderTopWidth: 3, borderLeftWidth: 3, alignSelf: 'flex-end' },
  cropCornerMarkTR: { borderTopWidth: 3, borderRightWidth: 3, alignSelf: 'flex-start' },
  cropCornerMarkBL: { borderBottomWidth: 3, borderLeftWidth: 3, alignSelf: 'flex-end' },
  cropCornerMarkBR: { borderBottomWidth: 3, borderRightWidth: 3, alignSelf: 'flex-start' },
  cropGridLineH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  cropGridLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  cropToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  cropToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  cropToolBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  cropDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#334155',
  },
  cropActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skipCropBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  skipCropBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  confirmCropBtn: {
    flex: 1.5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  confirmCropBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  confirmCropBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
