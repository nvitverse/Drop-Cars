import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X, RotateCw, ZoomIn, ZoomOut, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

// Shared free-crop modal (rotate / zoom / drag-corner-resize crop box),
// extracted from the Signup flow's crop editor so Add Car (and any future
// document-photo screen) gets the exact same, already-fixed crop
// interaction instead of a second hand-rolled copy. See SignupSinglePage's
// git history for the bugs this design already worked through:
// - the OS's own `allowsEditing` crop ran first and left nothing for this
//   modal's own Zoom to do - never pass allowsEditing to the picker that
//   feeds this modal.
// - a single PanResponder decides corner-resize vs whole-box-move from
//   where the touch actually started, instead of nested per-corner
//   PanResponders (which fought the parent for gesture ownership).
// - crop math must run BEFORE rotate in the manipulateAsync actions array,
//   since the crop rect is computed in the image's PRE-rotation pixel
//   space.
// - the preview <Image> must be pointer-transparent (and non-draggable on
//   web), or starting a drag on top of it also kicks off the browser's
//   native "drag this image" behavior.

export interface DocumentCropModalProps {
  visible: boolean;
  rawUri: string;
  label: string;
  imgWidth: number;
  imgHeight: number;
  onCancel: () => void;
  onConfirm: (finalUri: string) => void;
}

const normalizeLocalUri = (uri: string): string => uri;

export default function DocumentCropModal({
  visible,
  rawUri,
  label,
  imgWidth,
  imgHeight,
  onCancel,
  onConfirm,
}: DocumentCropModalProps) {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const [frameLayout, setFrameLayout] = useState({ width: 0, height: 240 });
  const frameLayoutRef = useRef(frameLayout);
  frameLayoutRef.current = frameLayout;

  const [cropBox, setCropBox] = useState({ x: 16, y: 16, width: 0, height: 0 });
  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;

  useEffect(() => {
    if (visible && frameLayout.width > 0) {
      const margin = Math.min(24, frameLayout.width * 0.08, frameLayout.height * 0.08);
      setCropBox({
        x: margin,
        y: margin,
        width: frameLayout.width - margin * 2,
        height: frameLayout.height - margin * 2,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rawUri, frameLayout.width, frameLayout.height]);

  useEffect(() => {
    if (visible) {
      setRotation(0);
      setZoom(1);
    }
  }, [visible, rawUri]);

  const CROP_MIN_BOX = 40;
  const CORNER_HIT_RADIUS = 32;

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
          if (dist < nearestDist) { nearestDist = dist; nearest = id; }
        }

        if (nearest && nearestDist <= CORNER_HIT_RADIUS) {
          dragModeRef.current = nearest;
        } else if (
          locationX >= box.x && locationX <= box.x + box.width &&
          locationY >= box.y && locationY <= box.y + box.height
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

        if (x < 0) { if (mode !== 'move') width += x; x = 0; }
        if (y < 0) { if (mode !== 'move') height += y; y = 0; }
        if (x + width > frame.width) {
          if (mode === 'move') x = Math.max(0, frame.width - width);
          else width = frame.width - x;
        }
        if (y + height > frame.height) {
          if (mode === 'move') y = Math.max(0, frame.height - height);
          else height = frame.height - y;
        }

        setCropBox({ x, y, width: Math.max(CROP_MIN_BOX, width), height: Math.max(CROP_MIN_BOX, height) });
      },
    })
  ).current;

  const frameToImagePoint = (
    px: number,
    py: number,
    frame: { width: number; height: number },
    imgW: number,
    imgH: number,
    zoomVal: number,
    rotationDeg: number,
  ) => {
    const cx = frame.width / 2;
    const cy = frame.height / 2;
    const baseScale = Math.min(frame.width / imgW, frame.height / imgH);
    const containedW = imgW * baseScale;
    const containedH = imgH * baseScale;
    const offsetX = (frame.width - containedW) / 2;
    const offsetY = (frame.height - containedH) / 2;

    let dx = (px - cx) / zoomVal;
    let dy = (py - cy) / zoomVal;
    const rad = (-rotationDeg * Math.PI) / 180;
    const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);

    return {
      x: (cx + rdx - offsetX) / baseScale,
      y: (cy + rdy - offsetY) / baseScale,
    };
  };

  const handleConfirmCrop = async () => {
    if (!rawUri) return;
    setIsProcessing(true);
    try {
      let finalUri = rawUri;
      const actions: ImageManipulator.Action[] = [];
      const normalizedRotation = (rotation % 360 + 360) % 360;
      const w = imgWidth || 1200;
      const h = imgHeight || 800;
      const frame = frameLayoutRef.current;
      const box = cropBoxRef.current;

      if (frame.width > 0 && box.width > 0 && box.height > 0) {
        const corners = [
          frameToImagePoint(box.x, box.y, frame, w, h, zoom, normalizedRotation),
          frameToImagePoint(box.x + box.width, box.y, frame, w, h, zoom, normalizedRotation),
          frameToImagePoint(box.x, box.y + box.height, frame, w, h, zoom, normalizedRotation),
          frameToImagePoint(box.x + box.width, box.y + box.height, frame, w, h, zoom, normalizedRotation),
        ];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const minX = Math.max(0, Math.min(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxX = Math.min(w, Math.max(...xs));
        const maxY = Math.min(h, Math.max(...ys));
        const cropW = Math.max(10, Math.floor(maxX - minX));
        const cropH = Math.max(10, Math.floor(maxY - minY));

        if (cropW < w - 2 || cropH < h - 2 || minX > 2 || minY > 2) {
          actions.push({
            crop: {
              originX: Math.floor(minX),
              originY: Math.floor(minY),
              width: cropW,
              height: cropH,
            },
          });
        }
      }

      if (normalizedRotation !== 0) {
        actions.push({ rotate: normalizedRotation });
      }

      if (actions.length > 0) {
        const manipResult = await ImageManipulator.manipulateAsync(
          rawUri,
          actions,
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        finalUri = normalizeLocalUri(manipResult.uri);
      }

      setIsProcessing(false);
      onConfirm(finalUri);
    } catch (cropErr) {
      console.error('Cropping failed, uploading original:', cropErr);
      setIsProcessing(false);
      onConfirm(rawUri);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.cropModalOverlay}>
        <View style={[styles.cropModalCard, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', paddingBottom: 18 + insets.bottom, marginTop: insets.top + 8 }]}>
          <View style={styles.cropModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cropModalTitle, { color: colors.text }]}>Crop & Adjust Document</Text>
              <Text style={[styles.cropModalSubtitle, { color: colors.textSecondary }]}>
                {label} • Drag a corner to resize, drag inside to move
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeCropBtn} activeOpacity={0.7}>
              <X color={colors.text} size={20} />
            </TouchableOpacity>
          </View>

          <View
            style={[styles.cropFrameContainer, { backgroundColor: '#000000' }]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) setFrameLayout({ width, height });
            }}
          >
            {rawUri ? (
              <View style={[styles.cropInnerImageWrap, { overflow: 'hidden' }]}>
                <Image
                  source={{ uri: rawUri }}
                  style={[
                    styles.cropImagePreview,
                    { transform: [{ rotate: `${rotation}deg` }, { scale: zoom }] },
                  ]}
                  resizeMode="contain"
                  {...({ pointerEvents: 'none', draggable: false } as any)}
                />

                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: cropBox.y, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                  <View style={{ position: 'absolute', left: 0, right: 0, top: cropBox.y + cropBox.height, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                  <View style={{ position: 'absolute', left: 0, top: cropBox.y, width: cropBox.x, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                  <View style={{ position: 'absolute', left: cropBox.x + cropBox.width, right: 0, top: cropBox.y, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                </View>

                <View
                  pointerEvents="none"
                  style={[styles.cropGuideFrame, { left: cropBox.x, top: cropBox.y, width: cropBox.width, height: cropBox.height }]}
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

                <View {...cropPanResponder.panHandlers} style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
          </View>

          <View style={[styles.cropToolbar, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC' }]}>
            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setRotation((r) => (r + 90) % 360)}
              activeOpacity={0.7}
            >
              <RotateCw color={colors.primary} size={18} />
              <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Rotate</Text>
            </TouchableOpacity>

            <View style={styles.cropDivider} />

            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(1)))}
              disabled={zoom <= 1}
              activeOpacity={0.7}
            >
              <ZoomOut color={zoom <= 1 ? colors.textSecondary : colors.primary} size={18} />
              <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Zoom -</Text>
            </TouchableOpacity>

            <View style={styles.cropDivider} />

            <TouchableOpacity
              style={styles.cropToolBtn}
              onPress={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}
              disabled={zoom >= 2.5}
              activeOpacity={0.7}
            >
              <ZoomIn color={zoom >= 2.5 ? colors.textSecondary : colors.primary} size={18} />
              <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Zoom +</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cropActionButtonsRow}>
            <TouchableOpacity
              style={styles.skipCropBtn}
              onPress={() => onConfirm(rawUri)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipCropBtnText, { color: colors.textSecondary }]}>Upload Original</Text>
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
                    <Text style={styles.confirmCropBtnText}>Crop & Upload</Text>
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
  cropModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  cropModalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: '90%' },
  cropModalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cropModalTitle: { fontSize: 17, fontFamily: 'Inter-Bold' },
  cropModalSubtitle: { fontSize: 12, fontFamily: 'Inter-Medium', marginTop: 2 },
  closeCropBtn: { padding: 6 },
  cropFrameContainer: {
    width: '100%',
    height: 240,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 12,
  },
  cropInnerImageWrap: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cropImagePreview: { width: '100%', height: '100%' },
  cropGuideFrame: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 6 },
  cropCorner: { position: 'absolute', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  cropCornerTL: { top: -16, left: -16 },
  cropCornerTR: { top: -16, right: -16 },
  cropCornerBL: { bottom: -16, left: -16 },
  cropCornerBR: { bottom: -16, right: -16 },
  cropCornerMark: { width: 18, height: 18, borderColor: '#818CF8' },
  cropCornerMarkTL: { borderTopWidth: 3, borderLeftWidth: 3, alignSelf: 'flex-end' },
  cropCornerMarkTR: { borderTopWidth: 3, borderRightWidth: 3, alignSelf: 'flex-start' },
  cropCornerMarkBL: { borderBottomWidth: 3, borderLeftWidth: 3, alignSelf: 'flex-end' },
  cropCornerMarkBR: { borderBottomWidth: 3, borderRightWidth: 3, alignSelf: 'flex-start' },
  cropGridLineH: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  cropGridLineV: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  cropToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 8, paddingVertical: 10, marginBottom: 14 },
  cropToolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  cropToolBtnText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  cropDivider: { width: 1, height: 20, backgroundColor: 'rgba(100, 116, 139, 0.2)' },
  cropActionButtonsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skipCropBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  skipCropBtnText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  confirmCropBtn: { flex: 1.6, borderRadius: 8, overflow: 'hidden' },
  confirmCropBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  confirmCropBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' },
});
