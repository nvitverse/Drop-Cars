import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Linking,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Phone,
  MapPin,
  Lock,
  Hash,
  Upload,
  CheckCircle2,
  FileText,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
  Mail,
  UserPlus,
  CreditCard,
  ArrowRight,
  X,
  RefreshCw,
  Sparkles,
  Car,
  MessageCircle,
  ExternalLink,
  Trash2,
  Send,
  MessageSquare,
  Headphones,
  Bot,
  Camera as CameraIcon,
  Image as ImageIcon,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  Crop as CropIcon,
} from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { signupAndLogin, uploadSignupDoc, SignupDocType, SignupSucceededLoginFailedError, sendEmailOtp, verifyEmailOtp } from '@/services/auth/signupService';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import * as SecureStore from '@/utils/secureStore';

const DRAFT_KEY = 'dropcars_signup_draft_v1';
const CHAT_HISTORY_KEY = 'dropcars_signup_chat_history_v1';

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'ADMIN';
  text: string;
  timestamp: string;
}

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    sender: 'ADMIN',
    text: '👋 Welcome to Drop Cars Partner Attachment Desk! How can we assist you with your registration today?',
    timestamp: 'Just now',
  },
];

const normalizeLocalUri = (uri: string) => (uri ? uri.replace('/useer/', '/user/') : uri);

interface SignupSinglePageProps {
  onSignupSuccess: (response: any) => void;
}

type DocUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

interface DocState {
  uri: string | null;
  url: string | null;
  status: DocUploadStatus;
  error: string | null;
}

const emptyDocState = (): DocState => ({ uri: null, url: null, status: 'idle', error: null });

export default function SignupSinglePage({ onSignupSuccess }: SignupSinglePageProps) {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { login } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [targetOtp, setTargetOtp] = useState('');

  const [primaryMobile, setPrimaryMobile] = useState('');
  const [secondaryMobile, setSecondaryMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');

  const [aadharFront, setAadharFront] = useState<DocState>(emptyDocState());
  const [aadharBack, setAadharBack] = useState<DocState>(emptyDocState());
  const [pan, setPan] = useState<DocState>(emptyDocState());

  const [loading, setLoading] = useState(false);
  const submitInProgress = useRef(false);

  // Popup modal preview state for uploaded document images
  const [previewImage, setPreviewImage] = useState<{ visible: boolean; title: string; uri: string }>({
    visible: false,
    title: '',
    uri: '',
  });

  // Auto-restore draft from SecureStore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreDraft = async () => {
      try {
        const saved = await SecureStore.getItemAsync(DRAFT_KEY);
        if (saved && isMounted) {
          const d = JSON.parse(saved);
          if (d.fullName) setFullName(d.fullName);
          if (d.email) setEmail(d.email);
          if (d.isEmailVerified) setIsEmailVerified(d.isEmailVerified);
          if (d.primaryMobile) setPrimaryMobile(d.primaryMobile);
          if (d.secondaryMobile) setSecondaryMobile(d.secondaryMobile);
          if (d.password) setPassword(d.password);
          if (d.confirmPassword) setConfirmPassword(d.confirmPassword);
          if (d.address) setAddress(d.address);
          if (d.city) setCity(d.city);
          if (d.pincode) setPincode(d.pincode);
          if (d.aadharNumber) setAadharNumber(d.aadharNumber);
          if (d.panNumber) setPanNumber(d.panNumber);
          if (d.aadharFront && d.aadharFront.uri) setAadharFront(d.aadharFront);
          if (d.aadharBack && d.aadharBack.uri) setAadharBack(d.aadharBack);
          if (d.pan && d.pan.uri) setPan(d.pan);
        }
      } catch (err) {
        console.warn('Could not restore signup draft:', err);
      }
    };
    restoreDraft();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-save draft locally on form state changes
  useEffect(() => {
    const draftData = {
      fullName,
      email,
      isEmailVerified,
      primaryMobile,
      secondaryMobile,
      password,
      confirmPassword,
      address,
      city,
      pincode,
      aadharNumber,
      panNumber,
      aadharFront,
      aadharBack,
      pan,
    };
    SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draftData)).catch(() => {});
  }, [
    fullName,
    email,
    isEmailVerified,
    primaryMobile,
    secondaryMobile,
    password,
    confirmPassword,
    address,
    city,
    pincode,
    aadharNumber,
    panNumber,
    aadharFront,
    aadharBack,
    pan,
  ]);

  // In-App Attachment Desk Chat State
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [chatInputText, setChatInputText] = useState('');
  const chatScrollViewRef = useRef<ScrollView>(null);

  // Restore local chat history from SecureStore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreChat = async () => {
      try {
        const savedChat = await SecureStore.getItemAsync(CHAT_HISTORY_KEY);
        if (savedChat && isMounted) {
          const parsed = JSON.parse(savedChat);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChatMessages(parsed);
          }
        }
      } catch (e) {
        console.warn('Could not restore chat history:', e);
      }
    };
    restoreChat();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save chat history to SecureStore on change
  useEffect(() => {
    if (chatMessages.length > 0) {
      SecureStore.setItemAsync(CHAT_HISTORY_KEY, JSON.stringify(chatMessages)).catch(() => {});
    }
  }, [chatMessages]);

  const handleSendChatMessage = (textToSend?: string) => {
    const text = (textToSend || chatInputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'USER',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInputText('');

    setTimeout(() => {
      chatScrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Auto-response simulation from Attachment Desk
    setTimeout(() => {
      const adminReply: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ADMIN',
        text: 'Thank you for reaching out! Drop Cars Attachment Desk has logged your message. An executive will assist you shortly.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, adminReply]);
      setTimeout(() => {
        chatScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, 1000);
  };

  const handleSendEmailOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterValidEmail'));
      return;
    }
    setOtpSending(true);
    try {
      await sendEmailOtp(trimmedEmail);
      setOtpSent(true);
      Alert.alert(
        'Verification Code Sent! 📧',
        `A 6-digit code has been sent to ${trimmedEmail}. Please check your inbox (and spam folder). It expires in 10 minutes.`,
      );
    } catch (err: any) {
      Alert.alert('Could Not Send Code', err?.message || 'Failed to send verification email. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!otpCode.trim()) {
      Alert.alert(t('signupSinglePage.errorTitle'), 'Please enter the 6-digit verification code sent to your email.');
      return;
    }
    try {
      const res = await verifyEmailOtp(email.trim().toLowerCase(), otpCode.trim());
      if (res.verified) {
        setIsEmailVerified(true);
        setOtpSent(false);
        Alert.alert('Email Verified! ✓', 'Your email address has been successfully verified.');
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'The code is invalid or expired. Please try again.');
    }
  };

  const handleClearDraft = () => {
    Alert.alert(
      'Clear Saved Draft?',
      'Are you sure you want to clear your entered details and chat history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Draft',
          style: 'destructive',
          onPress: async () => {
            setFullName('');
            setEmail('');
            setIsEmailVerified(false);
            setOtpSent(false);
            setOtpCode('');
            setPrimaryMobile('');
            setSecondaryMobile('');
            setPassword('');
            setConfirmPassword('');
            setAddress('');
            setCity('');
            setPincode('');
            setAadharNumber('');
            setPanNumber('');
            setAadharFront(emptyDocState());
            setAadharBack(emptyDocState());
            setPan(emptyDocState());
            setChatMessages(INITIAL_CHAT_MESSAGES);
            await SecureStore.deleteItemAsync(DRAFT_KEY);
            await SecureStore.deleteItemAsync(CHAT_HISTORY_KEY);
          },
        },
      ],
    );
  };

  const isAnyDocUploading = aadharFront.status === 'uploading' || aadharBack.status === 'uploading' || pan.status === 'uploading';

  const [uploadModal, setUploadModal] = useState<{
    visible: boolean;
    docType: SignupDocType;
    setState: React.Dispatch<React.SetStateAction<DocState>> | null;
    isAadhaarFront: boolean;
    label: string;
  }>({
    visible: false,
    docType: 'aadhar_front',
    setState: null,
    isAadhaarFront: false,
    label: '',
  });

  const promptImageSource = (
    docType: SignupDocType,
    setState: React.Dispatch<React.SetStateAction<DocState>>,
    isAadhaarFront = false,
    label = 'Document',
  ) => {
    setUploadModal({
      visible: true,
      docType,
      setState,
      isAadhaarFront,
      label,
    });
  };

  const [cropModal, setCropModal] = useState<{
    visible: boolean;
    rawUri: string;
    docType: SignupDocType;
    setState: React.Dispatch<React.SetStateAction<DocState>> | null;
    isAadhaarFront: boolean;
    label: string;
    rotation: number;
    zoom: number;
    imgWidth: number;
    imgHeight: number;
    isProcessing: boolean;
  }>({
    visible: false,
    rawUri: '',
    docType: 'aadhar_front',
    setState: null,
    isAadhaarFront: false,
    label: '',
    rotation: 0,
    zoom: 1,
    imgWidth: 1200,
    imgHeight: 800,
    isProcessing: false,
  });

  // Interactive free-crop box: drag any of the 4 corners to resize/reposition
  // the crop region. Coordinates are in on-screen pixels relative to the
  // crop frame (measured via onLayout, since the frame's width is dynamic).
  const [frameLayout, setFrameLayout] = useState({ width: 0, height: 240 });
  const frameLayoutRef = useRef(frameLayout);
  frameLayoutRef.current = frameLayout;

  const [cropBox, setCropBox] = useState({ x: 16, y: 16, width: 0, height: 0 });
  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;

  // Reset the crop box to a centered default whenever a new image is loaded
  // into the modal and we know the frame's real pixel size.
  useEffect(() => {
    if (cropModal.visible && frameLayout.width > 0) {
      const margin = Math.min(24, frameLayout.width * 0.08, frameLayout.height * 0.08);
      setCropBox({
        x: margin,
        y: margin,
        width: frameLayout.width - margin * 2,
        height: frameLayout.height - margin * 2,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropModal.visible, cropModal.rawUri, frameLayout.width, frameLayout.height]);

  const CROP_MIN_BOX = 40;
  const CORNER_HIT_RADIUS = 32;

  // A SINGLE PanResponder for the whole crop box, attached to one full-frame
  // overlay - not one PanResponder per corner nested inside a parent "move"
  // responder. Nested PanResponders fight over which one becomes the
  // gesture responder (the outer one kept winning, so every drag - even one
  // that started on a corner - just translated the whole box). Instead,
  // onPanResponderGrant looks at exactly where the touch started (relative
  // to the current box) to decide corner-resize vs whole-box-move, then
  // onPanResponderMove replays that same single decision for the rest of
  // the gesture. Found 2026-09-23.
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

        // Clamp the box fully inside the frame
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

  const executeUpload = async (
    uri: string,
    docType: SignupDocType,
    setState: React.Dispatch<React.SetStateAction<DocState>>,
    isAadhaarFront = false,
  ) => {
    setState({ uri, url: null, status: 'uploading', error: null });
    try {
      const uploaded = await uploadSignupDoc(uri, docType);
      setState({ uri, url: uploaded.url, status: 'uploaded', error: null });

      // Aadhaar autofill: populate form fields from OCR-extracted data
      if (isAadhaarFront && uploaded.extracted) {
        const ex = uploaded.extracted;
        if (ex.name) setFullName(ex.name);
        if (ex.aadhaar_number) setAadharNumber(ex.aadhaar_number);
        if (ex.address) setAddress(ex.address);
        if (ex.pincode) setPincode(ex.pincode);

        const autofilled = [
          ex.name ? 'Name' : null,
          ex.aadhaar_number ? 'Aadhaar Number' : null,
          ex.address ? 'Address' : null,
          ex.pincode ? 'Pincode' : null,
        ].filter(Boolean);

        if (autofilled.length > 0) {
          Alert.alert(
            '✨ Details Auto-filled from Aadhaar',
            `We extracted: ${autofilled.join(', ')}.\n\nAll fields are fully editable below. Please review and make any needed corrections.`,
          );
        }
      }
    } catch (uploadError: any) {
      setState({ uri, url: null, status: 'error', error: uploadError?.message || t('signupSinglePage.uploadFailedRetry') });
    }
  };

  // Maps a point in on-screen frame coordinates back to a point in the
  // ORIGINAL (un-rotated, un-zoomed) image's own pixel coordinates, by
  // inverting exactly the transform the preview <Image> is rendered with:
  // resizeMode="contain" against the frame, centered, then CSS
  // rotate(rotation) + scale(zoom) around that same center point.
  const frameToImagePoint = (
    px: number,
    py: number,
    frame: { width: number; height: number },
    imgW: number,
    imgH: number,
    zoom: number,
    rotationDeg: number,
  ) => {
    const cx = frame.width / 2;
    const cy = frame.height / 2;
    const baseScale = Math.min(frame.width / imgW, frame.height / imgH);
    const containedW = imgW * baseScale;
    const containedH = imgH * baseScale;
    const offsetX = (frame.width - containedW) / 2;
    const offsetY = (frame.height - containedH) / 2;

    let dx = (px - cx) / zoom;
    let dy = (py - cy) / zoom;
    const rad = (-rotationDeg * Math.PI) / 180;
    const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);

    return {
      x: (cx + rdx - offsetX) / baseScale,
      y: (cy + rdy - offsetY) / baseScale,
    };
  };

  const handleConfirmCrop = async () => {
    const { rawUri, docType, setState, isAadhaarFront, rotation, zoom, imgWidth, imgHeight } = cropModal;
    if (!setState || !rawUri) return;

    setCropModal((prev) => ({ ...prev, isProcessing: true }));
    try {
      let finalUri = rawUri;
      const actions: ImageManipulator.Action[] = [];
      const normalizedRotation = (rotation % 360 + 360) % 360;
      const w = imgWidth || 1200;
      const h = imgHeight || 800;
      const frame = frameLayoutRef.current;
      const box = cropBoxRef.current;

      // Free crop: map the 4 corners of the on-screen, draggable crop box
      // through the inverse of the preview's own rotate+zoom+contain
      // transform to get their true position in the original image's
      // pixels, then take the axis-aligned bounding box of those 4 points
      // (ImageManipulator's crop only supports an axis-aligned rect - a
      // rotated selection is approximated by its bounding box). The crop
      // is computed against the ORIGINAL (pre-rotation) image, so it must
      // run BEFORE the rotate action below, not after.
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

        // Skip a no-op crop (box covers ~the whole image already)
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

      setCropModal((prev) => ({ ...prev, visible: false, isProcessing: false }));
      await executeUpload(finalUri, docType, setState, isAadhaarFront);
    } catch (cropErr) {
      console.error('Cropping failed, uploading original:', cropErr);
      setCropModal((prev) => ({ ...prev, visible: false, isProcessing: false }));
      await executeUpload(rawUri, docType, setState, isAadhaarFront);
    }
  };

  const handleSkipCrop = async () => {
    const { rawUri, docType, setState, isAadhaarFront } = cropModal;
    if (!setState || !rawUri) return;
    setCropModal((prev) => ({ ...prev, visible: false }));
    await executeUpload(rawUri, docType, setState, isAadhaarFront);
  };

  const handlePickAndUpload = async (
    docType: SignupDocType,
    setState: React.Dispatch<React.SetStateAction<DocState>>,
    isAadhaarFront = false,
    source: 'camera' | 'gallery' = 'gallery',
  ) => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
          return;
        }
        // allowsEditing left off on purpose: the OS's own crop step used to
        // run first and hand our custom "Crop & Adjust Document" modal an
        // already-cropped image, so its own Zoom/Rotate had nothing left to
        // work with (looked broken - "scale doesn't work"). The modal below
        // is now the only crop step, on the full original photo.
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Photo library permission is required to select photos.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const rawUri = normalizeLocalUri(result.assets[0].uri);
      const imgWidth = result.assets[0].width || 1200;
      const imgHeight = result.assets[0].height || 800;

      // Open Crop Editor Modal so user can adjust, rotate, crop before upload
      setCropModal({
        visible: true,
        rawUri,
        docType,
        setState,
        isAadhaarFront,
        label: isAadhaarFront ? 'Aadhaar Front Side' : (docType === 'aadhar_back' ? 'Aadhaar Back Side' : 'PAN Card'),
        rotation: 0,
        zoom: 1,
        imgWidth,
        imgHeight,
        isProcessing: false,
      });
    } catch (pickError) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.pickImageFailed'));
    }
  };

  const handleCreateAccount = async () => {
    if (submitInProgress.current) return;
    if (loading) return;

    const personalData = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      primaryMobile: primaryMobile.trim(),
      secondaryMobile: secondaryMobile.trim(),
      password: password.trim(),
      address: address.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      aadharNumber: aadharNumber.trim(),
      panNumber: panNumber.trim().toUpperCase(),
    };

    if (!personalData.fullName) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterFullName'));
      return;
    }
    if (!personalData.primaryMobile) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterPrimaryNumber'));
      return;
    }
    if (personalData.primaryMobile.length !== 10) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.mobileMustBe10Digits'));
      return;
    }
    if (!/^[6-9]/.test(personalData.primaryMobile)) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.mobileMustStartWith'));
      return;
    }
    if (personalData.secondaryMobile && personalData.secondaryMobile.length !== 10) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.secondaryMobileMustBe10Digits'));
      return;
    }
    if (personalData.secondaryMobile && !/^[6-9]/.test(personalData.secondaryMobile)) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.secondaryMobileMustStartWith'));
      return;
    }
    if (!personalData.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personalData.email)) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterValidEmail'));
      return;
    }
    if (!isEmailVerified) {
      Alert.alert(
        'Email Verification Required 📧',
        'Please verify your email address by tapping "Verify Email" before completing registration.',
        [
          { text: 'Verify Email Now', onPress: handleSendEmailOtp },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    if (!personalData.city) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterCity'));
      return;
    }
    if (personalData.pincode && personalData.pincode.length !== 6) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.pincodeMustBe6Digits'));
      return;
    }
    if (!personalData.aadharNumber) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterAadhar'));
      return;
    }
    if (personalData.aadharNumber.length !== 12) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.aadharMustBe12Digits'));
      return;
    }
    if (!personalData.panNumber) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterPan'));
      return;
    }
    if (!/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(personalData.panNumber)) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.invalidPanFormat'));
      return;
    }
    if (!personalData.password) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.enterPassword'));
      return;
    }
    if (personalData.password.length < 6) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.passwordTooShort'));
      return;
    }
    if (!confirmPassword.trim()) {
      Alert.alert(t('signupSinglePage.errorTitle'), 'Please confirm your password.');
      return;
    }
    if (personalData.password !== confirmPassword.trim()) {
      Alert.alert('Password Mismatch', 'Create Password and Confirm Password do not match. Please enter matching passwords.');
      return;
    }
    if (isAnyDocUploading) {
      Alert.alert(t('signupSinglePage.pleaseWaitTitle'), t('signupSinglePage.pleaseWaitBody'));
      return;
    }
    if (aadharFront.status !== 'uploaded' || !aadharFront.url) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.uploadAadharFront'));
      return;
    }
    if (aadharBack.status !== 'uploaded' || !aadharBack.url) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.uploadAadharBack'));
      return;
    }
    if (pan.status !== 'uploaded' || !pan.url) {
      Alert.alert(t('signupSinglePage.errorTitle'), t('signupSinglePage.uploadPan'));
      return;
    }

    submitInProgress.current = true;
    setLoading(true);

    try {
      const documentUrls = {
        aadharFrontUrl: aadharFront.url,
        aadharBackUrl: aadharBack.url,
        panUrl: pan.url,
      };
      const { signup, login: loginResp } = await signupAndLogin(personalData, documentUrls);

      if (signup.status === 'success') {
        const userData = {
          id: signup.user_id,
          fullName: personalData.fullName,
          primaryMobile: personalData.primaryMobile,
          secondaryMobile: personalData.secondaryMobile,
          password: personalData.password,
          address: personalData.address,
          aadharNumber: personalData.aadharNumber,
          organizationId: undefined,
          languages: [],
          documents: documentUrls,
        };
        await login(userData, loginResp.access_token);
        await SecureStore.deleteItemAsync(DRAFT_KEY);
        onSignupSuccess({ signup, login: loginResp, userData });
      }
    } catch (error: any) {
      if (error instanceof SignupSucceededLoginFailedError) {
        Alert.alert(t('signupSinglePage.accountCreatedTitle'), error.message, [
          { text: t('signupSinglePage.goToLogin'), onPress: () => router.replace('/login') },
        ]);
        return;
      }

      let errorMessage = t('signupSinglePage.signupFailedGeneric');
      const responseDetail = error.response?.data?.detail ?? error.response?.data?.message;
      if (responseDetail) {
        if (typeof responseDetail === 'string') {
          errorMessage = responseDetail;
        } else if (Array.isArray(responseDetail)) {
          errorMessage = responseDetail.map((e: any) => e.msg || e.message || String(e)).join(', ');
        } else {
          errorMessage = String(responseDetail);
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = t('signupSinglePage.requestTimeout');
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = t('signupSinglePage.networkError');
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = t('signupSinglePage.serverNotFound');
      } else if (error.message && typeof error.message === 'string' && !error.message.includes('status code') && !error.message.startsWith('Signup failed:')) {
        errorMessage = error.message;
      } else if (error.response?.status === 500) {
        errorMessage = t('signupSinglePage.serverError');
      }
      Alert.alert(
        t('signupSinglePage.signupFailedTitle'),
        errorMessage,
        [
          { text: 'OK', style: 'cancel' },
          {
            text: '💬 Chat with Attachment Team',
            onPress: () => setChatModalVisible(true),
          },
        ],
      );
    } finally {
      setLoading(false);
      submitInProgress.current = false;
    }
  };

  const renderDocCard = (
    label: string,
    docType: SignupDocType,
    state: DocState,
    setState: React.Dispatch<React.SetStateAction<DocState>>,
    isAadhaarFront = false,
  ) => {
    const isUploaded = state.status === 'uploaded' && !!(state.url || state.uri);
    const isUploading = state.status === 'uploading';
    const isError = state.status === 'error';
    const imageUri = state.uri || state.url;

    let statusText = 'Tap to select document photo';
    if (isUploading) statusText = 'Uploading image...';
    else if (isUploaded) statusText = 'Uploaded • Tap image preview to view';
    else if (isError) statusText = state.error || 'Upload failed. Tap to retry.';

    return (
      <View
        style={[
          styles.docCard,
          { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderColor: isDarkMode ? '#334155' : 'rgba(99, 102, 241, 0.2)' },
          isUploaded && styles.docCardUploaded,
          isError && styles.docCardError,
        ]}
      >
        <View style={styles.docLeft}>
          {isUploaded && imageUri ? (
            <TouchableOpacity
              onPress={() => setPreviewImage({ visible: true, title: label, uri: imageUri })}
              style={styles.thumbnailWrap}
              activeOpacity={0.8}
            >
              <Image source={{ uri: imageUri }} style={styles.docThumbnail} />
              <View style={styles.zoomBadge}>
                <Eye color="#FFFFFF" size={11} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => promptImageSource(docType, setState, isAadhaarFront, label)}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              {isUploading ? (
                <View style={[styles.docIcon, styles.docIconUploading]}>
                  <ActivityIndicator size="small" color="#6366F1" />
                </View>
              ) : isError ? (
                <View style={[styles.docIcon, styles.docIconError]}>
                  <AlertCircle color="#FFFFFF" size={18} />
                </View>
              ) : (
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.docIconGradient}
                >
                  <FileText color="#FFFFFF" size={18} />
                </LinearGradient>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.docTextWrap}
            onPress={() => {
              if (isUploaded && imageUri) {
                setPreviewImage({ visible: true, title: label, uri: imageUri });
              } else {
                promptImageSource(docType, setState, isAadhaarFront, label);
              }
            }}
            disabled={isUploading}
            activeOpacity={0.7}
          >
            <Text style={[styles.docTitle, { color: colors.text }]}>
              {label} <Text style={styles.requiredTag}>*</Text>
            </Text>
            <Text
              style={[
                styles.docStatus,
                { color: isUploaded ? '#10B981' : colors.textSecondary },
                isError && styles.docStatusError,
              ]}
              numberOfLines={2}
            >
              {statusText}
            </Text>
          </TouchableOpacity>
        </View>

        {isUploaded && imageUri ? (
          <View style={styles.docRightActions}>
            <TouchableOpacity
              onPress={() => setPreviewImage({ visible: true, title: label, uri: imageUri })}
              style={styles.viewDocBtn}
              activeOpacity={0.7}
            >
              <Eye color="#065F46" size={14} />
              <Text style={styles.viewDocText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => promptImageSource(docType, setState, isAadhaarFront, label)}
              style={styles.reuploadBtn}
              activeOpacity={0.7}
            >
              <RefreshCw color="#4F46E5" size={14} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => promptImageSource(docType, setState, isAadhaarFront, label)}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isError ? ['#EF4444', '#DC2626'] : ['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.uploadPillGradient}
            >
              <Upload color="#FFFFFF" size={13} />
              <Text style={styles.uploadPillText}>{isError ? 'Retry' : 'Upload'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.keyboardView}
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero Branding Header */}
        <View style={styles.heroBannerContainer}>
          <View style={styles.iconCircle}>
            <Car color="#6366F1" size={26} />
          </View>
          <Text style={styles.heroTitle}>{t('signupSinglePage.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('signupSinglePage.subtitle')}</Text>

          {/* Continue Chat with Attachment Team (Shown when active chat conversation exists) */}
          {chatMessages.length > 1 ? (
            <TouchableOpacity
              style={styles.chatSupportPillTouchable}
              onPress={() => setChatModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.chatSupportPillIcon}>
                <MessageSquare color="#FFFFFF" size={13} />
              </View>
              <Text style={styles.chatSupportPillText}>
                Continue chat with Attachment team
              </Text>
              <View style={styles.chatUnreadCountBadge}>
                <Text style={styles.chatUnreadCountText}>{chatMessages.length - 1}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Clear Draft Option if user has typed info */}
          {(fullName || primaryMobile || aadharNumber || panNumber) ? (
            <TouchableOpacity
              style={styles.clearDraftPill}
              onPress={handleClearDraft}
              activeOpacity={0.7}
            >
              <Trash2 color="#F87171" size={12} />
              <Text style={styles.clearDraftText}>Clear Saved Draft</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Main Glass Form Card */}
        <View style={[styles.formCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : 'rgba(99, 102, 241, 0.15)' }]}>
          {/* Section 1: Aadhaar Document & Instant Auto-fill */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionHeaderBadgeGradient}
            >
              <Sparkles color="#FFFFFF" size={14} />
            </LinearGradient>
            <Text style={[styles.sectionHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
              1. Aadhaar Card (Instant Auto-fill)
            </Text>
            <View style={[styles.sectionHeaderLine, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(99, 102, 241, 0.12)' }]} />
          </View>

          <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter-Regular', marginBottom: 10, marginTop: -2, lineHeight: 17 }}>
            Upload front & back photos (croppable). Your name, Aadhaar number, and address will be auto-filled below and remain 100% editable.
          </Text>

          {/* Aadhaar Front & Back Uploads */}
          <View style={{ marginBottom: 6 }}>
            {renderDocCard('Aadhaar Front Side', 'aadhar_front', aadharFront, setAadharFront, true)}
            {renderDocCard('Aadhaar Back Side', 'aadhar_back', aadharBack, setAadharBack)}
          </View>

          {/* Aadhaar Number - kept right under its own photos, not buried in
              the generic Personal Details section below */}
          <Text style={[styles.label, { color: colors.text }]}>
            Aadhaar Number <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <CreditCard color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={aadharNumber}
              onChangeText={(txt) => setAadharNumber(txt.replace(/\D/g, '').slice(0, 12))}
              keyboardType="numeric"
              maxLength={12}
              placeholder="12-digit Aadhaar number"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Section 2: Personal & Contact Details */}
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionHeaderBadgeGradient}
            >
              <User color="#FFFFFF" size={14} />
            </LinearGradient>
            <Text style={[styles.sectionHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
              2. Personal & Contact Details
            </Text>
            <View style={[styles.sectionHeaderLine, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(99, 102, 241, 0.12)' }]} />
          </View>

          {/* Full Name */}
          <Text style={[styles.label, { color: colors.text }]}>
            Full Name <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <User color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Primary Mobile */}
          <Text style={[styles.label, { color: colors.text }]}>
            Primary Mobile Number <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.phonePrefixBadge}>
              <LinearGradient
                colors={['#4F46E5', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.phoneIconGradient}
              >
                <Smartphone color="#FFFFFF" size={13} />
              </LinearGradient>
              <Text style={[styles.phonePrefixText, { color: colors.text }]}>+91</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={primaryMobile}
              onChangeText={(txt) => { const c = txt.replace(/\D/g, ''); if (c.length <= 10) setPrimaryMobile(c); }}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Secondary Mobile */}
          <Text style={[styles.label, { color: colors.text }]}>Secondary Mobile (Optional)</Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.phonePrefixBadge}>
              <LinearGradient
                colors={['#64748B', '#475569']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.phoneIconGradient}
              >
                <Phone color="#FFFFFF" size={13} />
              </LinearGradient>
              <Text style={[styles.phonePrefixText, { color: colors.text }]}>+91</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={secondaryMobile}
              onChangeText={(txt) => { const c = txt.replace(/\D/g, ''); if (c.length <= 10) setSecondaryMobile(c); }}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="Alternative mobile number"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Email */}
          <Text style={[styles.label, { color: colors.text }]}>
            Email Address <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <Mail color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={email}
              onChangeText={(txt) => {
                setEmail(txt);
                if (isEmailVerified) setIsEmailVerified(false);
                if (otpSent) setOtpSent(false);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="your.email@gmail.com"
              placeholderTextColor={colors.textSecondary}
              editable={!isEmailVerified}
            />
            {isEmailVerified ? (
              <View style={styles.verifiedBadge}>
                <CheckCircle2 color="#10B981" size={16} />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.verifyEmailBtn, otpSending && { opacity: 0.6 }]}
                onPress={handleSendEmailOtp}
                disabled={otpSending || !email.trim()}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.verifyEmailBtnGradient}
                >
                  {otpSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.verifyEmailBtnText}>{otpSent ? 'Resend' : 'Verify Email'}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* OTP Code Entry (Shown after tapping Verify Email) */}
          {otpSent && !isEmailVerified ? (
            <View style={[styles.otpCard, { backgroundColor: isDarkMode ? '#0F172A' : '#EEF2FF', borderColor: '#818CF8' }]}>
              <View style={styles.otpHeaderRow}>
                <Sparkles color="#4F46E5" size={16} />
                <Text style={[styles.otpHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
                  Enter 6-Digit Email Code
                </Text>
              </View>
              <Text style={[styles.otpSubtext, { color: colors.textSecondary }]}>
                Verification code sent to <Text style={{ fontFamily: 'Inter-Bold', color: colors.text }}>{email}</Text>
              </Text>
              <View style={styles.otpInputRow}>
                <TextInput
                  style={[styles.otpInput, { color: colors.text, backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}
                  value={otpCode}
                  onChangeText={(txt) => setOtpCode(txt.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="numeric"
                  maxLength={6}
                  placeholder="Enter OTP"
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity
                  style={styles.verifyCodeSubmitBtn}
                  onPress={handleVerifyEmailOtp}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.verifyCodeBtnGradient}
                  >
                    <CheckCircle2 color="#FFFFFF" size={15} />
                    <Text style={styles.verifyCodeBtnText}>Verify Code</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Section 3: Address & Location */}
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionHeaderBadgeGradient}
            >
              <MapPin color="#FFFFFF" size={14} />
            </LinearGradient>
            <Text style={[styles.sectionHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
              3. Address & Location
            </Text>
            <View style={[styles.sectionHeaderLine, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(99, 102, 241, 0.12)' }]} />
          </View>

          {/* Address */}
          <Text style={[styles.label, { color: colors.text }]}>Street Address (Optional)</Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <MapPin color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={address}
              onChangeText={setAddress}
              placeholder="House/Door No, Street name"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* City */}
          <Text style={[styles.label, { color: colors.text }]}>
            City <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <MapPin color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={city}
              onChangeText={setCity}
              placeholder="Your city (e.g. Chennai)"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Pincode */}
          <Text style={[styles.label, { color: colors.text }]}>Area Pincode (Optional)</Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <Hash color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={pincode}
              onChangeText={(txt) => { const c = txt.replace(/\D/g, ''); if (c.length <= 6) setPincode(c); }}
              keyboardType="numeric"
              maxLength={6}
              placeholder="6-digit pincode"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Section 4: PAN Card Verification */}
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionHeaderBadgeGradient}
            >
              <CreditCard color="#FFFFFF" size={14} />
            </LinearGradient>
            <Text style={[styles.sectionHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
              4. PAN Card Verification
            </Text>
            <View style={[styles.sectionHeaderLine, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(99, 102, 241, 0.12)' }]} />
          </View>

          {/* PAN Number */}
          <Text style={[styles.label, { color: colors.text }]}>
            PAN Number <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <Hash color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={panNumber}
              onChangeText={(txt) => setPanNumber(txt.toUpperCase())}
              autoCapitalize="characters"
              maxLength={10}
              placeholder="10-digit PAN (e.g. ABCDE1234F)"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* PAN Card Image Upload */}
          <View style={{ marginBottom: 6 }}>
            {renderDocCard('PAN Card Image', 'pan', pan, setPan)}
          </View>

          {/* Section 5: Password & Security */}
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionHeaderBadgeGradient}
            >
              <Lock color="#FFFFFF" size={14} />
            </LinearGradient>
            <Text style={[styles.sectionHeaderText, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>
              5. Create Account Password
            </Text>
            <View style={[styles.sectionHeaderLine, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(99, 102, 241, 0.12)' }]} />
          </View>

          {/* Create Password */}
          <Text style={[styles.label, { color: colors.text }]}>
            Create Password <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <Lock color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Create password (min 6 chars)"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} activeOpacity={0.7}>
              {showPassword ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <Text style={[styles.label, { color: colors.text }]}>
            Confirm Password <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View style={[
            styles.inputGroup,
            { backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA', borderColor: isDarkMode ? '#334155' : '#E2E8F0' },
            confirmPassword.length > 0 && password !== confirmPassword && { borderColor: '#EF4444' },
            confirmPassword.length > 0 && password === confirmPassword && { borderColor: '#10B981' },
          ]}>
            <LinearGradient
              colors={confirmPassword.length > 0 && password === confirmPassword ? ['#10B981', '#059669'] : ['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleBadgeGradient}
            >
              <Lock color="#FFFFFF" size={15} />
            </LinearGradient>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Re-enter password to confirm"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn} activeOpacity={0.7}>
              {showConfirmPassword ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && password !== confirmPassword ? (
            <Text style={{ color: '#EF4444', fontSize: 11.5, fontFamily: 'Inter-Medium', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
              ⚠️ Passwords do not match
            </Text>
          ) : null}
          {confirmPassword.length > 0 && password === confirmPassword ? (
            <Text style={{ color: '#10B981', fontSize: 11.5, fontFamily: 'Inter-Medium', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
              ✓ Passwords match!
            </Text>
          ) : null}

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.createButtonTouchable}
            onPress={handleCreateAccount}
            disabled={loading || isAnyDocUploading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.createButtonGradient,
                (loading || isAnyDocUploading) && styles.createButtonDisabled,
              ]}
            >
              {loading || isAnyDocUploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.createButtonText}>
                    {t('signupSinglePage.createAccount')}
                  </Text>
                  <View style={styles.createBtnIconCircle}>
                    <ArrowRight color="#4F46E5" size={16} />
                  </View>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Interactive Crop / Document Adjustment Modal */}
      <Modal
        visible={cropModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setCropModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.cropModalOverlay}>
          <View style={[styles.cropModalCard, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}>
            {/* Header */}
            <View style={styles.cropModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cropModalTitle, { color: colors.text }]}>Crop & Adjust Document</Text>
                <Text style={[styles.cropModalSubtitle, { color: colors.textSecondary }]}>
                  {cropModal.label} • Drag a corner to resize, drag inside to move
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCropModal((prev) => ({ ...prev, visible: false }))}
                style={styles.closeCropBtn}
                activeOpacity={0.7}
              >
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            {/* Image Crop Frame */}
            <View
              style={[styles.cropFrameContainer, { backgroundColor: '#000000' }]}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) setFrameLayout({ width, height });
              }}
            >
              {cropModal.rawUri ? (
                <View style={[styles.cropInnerImageWrap, { overflow: 'hidden' }]}>
                  <Image
                    source={{ uri: cropModal.rawUri }}
                    style={[
                      styles.cropImagePreview,
                      {
                        transform: [
                          { rotate: `${cropModal.rotation}deg` },
                          { scale: cropModal.zoom },
                        ],
                      },
                    ]}
                    resizeMode="contain"
                    // On web, an <img> is natively draggable - starting our
                    // crop-box drag gesture on top of it also kicked off the
                    // browser's own "drag the image" behavior at the same
                    // time, which visually disturbed everything nearby
                    // (looked like the Rotate/Zoom buttons were "dragging"
                    // too). The image itself never needs to be touchable -
                    // only the overlay below does - so making it fully
                    // pointer-transparent stops the browser from ever
                    // starting a native drag on it. Cast to `any`: neither
                    // prop is in this RN version's ImageProps typings even
                    // though react-native-web supports both. Found 2026-09-23.
                    {...({ pointerEvents: 'none', draggable: false } as any)}
                  />
                  {/* Dimmed area outside the crop box */}
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: cropBox.y, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                    <View style={{ position: 'absolute', left: 0, right: 0, top: cropBox.y + cropBox.height, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                    <View style={{ position: 'absolute', left: 0, top: cropBox.y, width: cropBox.x, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                    <View style={{ position: 'absolute', left: cropBox.x + cropBox.width, right: 0, top: cropBox.y, height: cropBox.height, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                  </View>

                  {/* Draggable / resizable crop box - purely visual, no
                      touch handlers of its own. ALL touch handling for the
                      whole crop interaction goes through the single
                      full-frame overlay below, which decides corner-resize
                      vs whole-box-move from where the touch actually
                      started - see cropPanResponder. */}
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

                  {/* Single touch-owning overlay for the whole crop box */}
                  <View
                    {...cropPanResponder.panHandlers}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ) : null}
            </View>

            {/* Controls Toolbar */}
            <View style={[styles.cropToolbar, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC' }]}>
              <TouchableOpacity
                style={styles.cropToolBtn}
                onPress={() => setCropModal((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }))}
                activeOpacity={0.7}
              >
                <RotateCw color={colors.primary} size={18} />
                <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Rotate</Text>
              </TouchableOpacity>

              <View style={styles.cropDivider} />

              <TouchableOpacity
                style={styles.cropToolBtn}
                onPress={() => setCropModal((prev) => ({ ...prev, zoom: Math.max(1, +(prev.zoom - 0.2).toFixed(1)) }))}
                disabled={cropModal.zoom <= 1}
                activeOpacity={0.7}
              >
                <ZoomOut color={cropModal.zoom <= 1 ? colors.textSecondary : colors.primary} size={18} />
                <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Zoom -</Text>
              </TouchableOpacity>

              <View style={styles.cropDivider} />

              <TouchableOpacity
                style={styles.cropToolBtn}
                onPress={() => setCropModal((prev) => ({ ...prev, zoom: Math.min(2.5, +(prev.zoom + 0.2).toFixed(1)) }))}
                disabled={cropModal.zoom >= 2.5}
                activeOpacity={0.7}
              >
                <ZoomIn color={cropModal.zoom >= 2.5 ? colors.textSecondary : colors.primary} size={18} />
                <Text style={[styles.cropToolBtnText, { color: colors.text }]}>Zoom +</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Actions */}
            <View style={styles.cropActionButtonsRow}>
              <TouchableOpacity
                style={styles.skipCropBtn}
                onPress={handleSkipCrop}
                disabled={cropModal.isProcessing}
                activeOpacity={0.7}
              >
                <Text style={[styles.skipCropBtnText, { color: colors.textSecondary }]}>Upload Original</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmCropBtn, cropModal.isProcessing && { opacity: 0.7 }]}
                onPress={handleConfirmCrop}
                disabled={cropModal.isProcessing}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmCropBtnGradient}
                >
                  {cropModal.isProcessing ? (
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

      {/* Full Screen / Popup Modal Image Preview */}
      <Modal
        visible={previewImage.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.previewModalCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
            <View style={styles.previewModalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.previewModalTitle, { color: colors.text }]}>{previewImage.title}</Text>
                <Text style={styles.previewModalSubtitle}>Uploaded Document Preview</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewImage((prev) => ({ ...prev, visible: false }))}
                style={styles.closePreviewBtn}
                activeOpacity={0.7}
              >
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewImageFrame}>
              {previewImage.uri ? (
                <Image
                  source={{ uri: previewImage.uri }}
                  style={styles.fullPreviewImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.closeModalBarBtn, { backgroundColor: colors.primary }]}
              onPress={() => setPreviewImage((prev) => ({ ...prev, visible: false }))}
              activeOpacity={0.8}
            >
              <Text style={styles.closeModalBarBtnText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Upload Document Source Picker Modal */}
      <Modal
        visible={uploadModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadModal((prev) => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setUploadModal((prev) => ({ ...prev, visible: false }))}
        >
          <View
            style={[styles.uploadPickerModalCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.uploadPickerHeader}>
              <View style={styles.uploadPickerIconBadge}>
                <Upload color="#FFFFFF" size={17} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadPickerTitle, { color: colors.text }]}>Upload Document</Text>
                <Text style={[styles.uploadPickerSubtitle, { color: colors.textSecondary }]}>
                  {uploadModal.label ? `Select photo for ${uploadModal.label}` : 'Choose an upload option'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setUploadModal((prev) => ({ ...prev, visible: false }))}
                style={styles.closePickerBtn}
                activeOpacity={0.7}
              >
                <X color={colors.textSecondary} size={18} />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerActionButtonsCol}>
              <TouchableOpacity
                style={[styles.pickerActionBtn, { backgroundColor: isDarkMode ? '#0F172A' : '#F1F5F9' }]}
                onPress={() => {
                  const { docType, setState, isAadhaarFront } = uploadModal;
                  setUploadModal((prev) => ({ ...prev, visible: false }));
                  if (setState) {
                    handlePickAndUpload(docType, setState, isAadhaarFront, 'camera');
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pickerActionIconWrap}
                >
                  <CameraIcon color="#FFFFFF" size={18} />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerActionTitle, { color: colors.text }]}>Take Photo</Text>
                  <Text style={[styles.pickerActionDesc, { color: colors.textSecondary }]}>Use device camera</Text>
                </View>
                <ArrowRight color={colors.textSecondary} size={16} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pickerActionBtn, { backgroundColor: isDarkMode ? '#0F172A' : '#F1F5F9' }]}
                onPress={() => {
                  const { docType, setState, isAadhaarFront } = uploadModal;
                  setUploadModal((prev) => ({ ...prev, visible: false }));
                  if (setState) {
                    handlePickAndUpload(docType, setState, isAadhaarFront, 'gallery');
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#0EA5E9', '#0284C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pickerActionIconWrap}
                >
                  <ImageIcon color="#FFFFFF" size={18} />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerActionTitle, { color: colors.text }]}>Choose from Gallery</Text>
                  <Text style={[styles.pickerActionDesc, { color: colors.textSecondary }]}>Select an existing image</Text>
                </View>
                <ArrowRight color={colors.textSecondary} size={16} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pickerCancelBtn, { borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
                onPress={() => setUploadModal((prev) => ({ ...prev, visible: false }))}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Attachment Support In-App Chat Modal */}
      <Modal
        visible={chatModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setChatModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.chatModalOverlay}
        >
          <View style={[styles.chatModalCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
            {/* Header */}
            <View style={styles.chatModalHeader}>
              <View style={styles.chatModalHeaderLeft}>
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatHeaderAvatar}
                >
                  <Headphones color="#FFFFFF" size={18} />
                </LinearGradient>
                <View>
                  <Text style={[styles.chatHeaderTitle, { color: colors.text }]}>Attachment Support Desk</Text>
                  <View style={styles.onlineRow}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online • Drop Cars Team</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setChatModalVisible(false)}
                style={styles.closePreviewBtn}
                activeOpacity={0.7}
              >
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            {/* Chat Messages */}
            <ScrollView
              ref={chatScrollViewRef}
              style={styles.chatMessagesArea}
              contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
              onContentSizeChange={() => chatScrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {chatMessages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.chatBubble,
                    msg.sender === 'USER' ? styles.chatBubbleUser : styles.chatBubbleAdmin,
                    msg.sender === 'USER' && { backgroundColor: '#4F46E5' },
                    msg.sender === 'ADMIN' && { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' },
                  ]}
                >
                  <Text
                    style={[
                      styles.chatBubbleText,
                      { color: msg.sender === 'USER' ? '#FFFFFF' : (isDarkMode ? '#F8FAFC' : '#1E293B') },
                    ]}
                  >
                    {msg.text}
                  </Text>
                  <Text
                    style={[
                      styles.chatTimestamp,
                      { color: msg.sender === 'USER' ? '#E0E7FF' : colors.textSecondary },
                    ]}
                  >
                    {msg.timestamp}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Quick Chips */}
            <View style={styles.quickChipsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                {[
                  '📄 Document Upload Help',
                  '📱 Phone Number Query',
                  '⏳ Verification Status',
                  '📞 Request Callback',
                ].map((chip, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.quickChipBtn, { backgroundColor: isDarkMode ? '#334155' : '#EEF2FF' }]}
                    onPress={() => handleSendChatMessage(chip)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickChipText, { color: isDarkMode ? '#E2E8F0' : '#4F46E5' }]}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Input Bar */}
            <View style={[styles.chatInputBar, { borderColor: colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#FAFAFA' }]}>
              <TextInput
                style={[styles.chatInput, { color: colors.text }]}
                value={chatInputText}
                onChangeText={setChatInputText}
                placeholder="Type a message to Attachment Team..."
                placeholderTextColor={colors.textSecondary}
                multiline
              />
              <TouchableOpacity
                onPress={() => handleSendChatMessage()}
                disabled={!chatInputText.trim()}
                style={[styles.chatSendBtn, !chatInputText.trim() && { opacity: 0.5 }]}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendGradient}
                >
                  <Send color="#FFFFFF" size={15} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  container: { flex: 1 },
  heroBannerContainer: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    color: '#E0E7FF',
    textAlign: 'center',
  },
  chatSupportPillTouchable: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 7,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  chatSupportPillIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSupportPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  chatUnreadCountBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatUnreadCountText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
  },
  clearDraftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  clearDraftText: {
    color: '#F87171',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },

  // Form Card
  formCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    marginTop: 6,
  },
  sectionHeaderBadgeGradient: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.2,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1.5,
    marginLeft: 6,
    borderRadius: 1,
  },
  requiredAsterisk: {
    color: '#EF4444',
    fontFamily: 'Inter-Bold',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
    marginLeft: 2,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  iconCircleBadgeGradient: {
    width: 32,
    height: 32,
    minWidth: 32,
    maxWidth: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginRight: 10,
  },
  phonePrefixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    borderRightWidth: 1.5,
    borderRightColor: '#E2E8F0',
    marginRight: 10,
  },
  phoneIconGradient: {
    width: 28,
    height: 28,
    minWidth: 28,
    maxWidth: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  phonePrefixText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: 'Inter-Medium',
  },
  eyeBtn: {
    padding: 6,
  },

  // Document cards
  docCard: {
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  docCardUploaded: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  docCardError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  docLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thumbnailWrap: {
    position: 'relative',
    marginRight: 10,
  },
  docThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#10B981',
    borderRadius: 6,
    padding: 3,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  docIconGradient: {
    width: 40,
    height: 40,
    minWidth: 40,
    maxWidth: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginRight: 10,
  },
  docIconUploading: {
    backgroundColor: '#EEF2FF',
  },
  docIconError: {
    backgroundColor: '#EF4444',
  },
  docTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  docTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
  },
  requiredTag: {
    color: '#EF4444',
    fontFamily: 'Inter-Bold',
  },
  docStatus: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  docStatusError: {
    color: '#EF4444',
  },
  docRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewDocText: {
    color: '#065F46',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  reuploadBtn: {
    backgroundColor: '#EEF2FF',
    padding: 7,
    borderRadius: 6,
  },
  uploadPillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },

  // Submit button
  createButtonTouchable: {
    marginTop: 18,
    borderRadius: 16,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  createButtonGradient: {
    borderRadius: 8,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  createBtnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  previewModalTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  previewModalSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#10B981',
    marginTop: 2,
  },
  closePreviewBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  previewImageFrame: {
    width: '100%',
    height: 320,
    backgroundColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  fullPreviewImage: {
    width: '100%',
    height: '100%',
  },
  closeModalBarBtn: {
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBarBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },

  // In-App Chat Modal Styling
  chatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  chatModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    height: 560,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  chatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.6)',
  },
  chatModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatHeaderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  onlineText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#10B981',
  },
  chatMessagesArea: {
    flex: 1,
    marginVertical: 8,
  },
  chatBubble: {
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 8,
    marginBottom: 4,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  chatBubbleAdmin: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  chatBubbleText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  chatTimestamp: {
    fontSize: 9.5,
    fontFamily: 'Inter-Medium',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  quickChipsWrapper: {
    marginVertical: 6,
  },
  quickChipBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickChipText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 2,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    maxHeight: 80,
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
  },
  chatSendBtn: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  sendGradient: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Email Verification & OTP Styling
  verifyEmailBtn: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  verifyEmailBtnGradient: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyEmailBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    color: '#065F46',
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
  },
  otpCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 14,
    marginTop: -4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  otpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  otpHeaderText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
  otpSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 10,
  },
  otpInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otpInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#818CF8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  verifyCodeSubmitBtn: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  verifyCodeBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
  },
  verifyCodeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  uploadPickerModalCard: {
    width: '92%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  uploadPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  uploadPickerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPickerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  uploadPickerSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  closePickerBtn: {
    padding: 6,
  },
  pickerActionButtonsCol: {
    gap: 10,
  },
  pickerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  pickerActionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerActionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  pickerActionDesc: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  pickerCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  pickerCancelText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },

  // Crop / Document Adjustment Modal
  cropModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cropModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  cropModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cropModalTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  cropModalSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  closeCropBtn: {
    padding: 6,
  },
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
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 6,
  },
  // Each corner's hit box is 32x32 (finger-sized) and positioned so it's
  // CENTERED exactly on the crop box's true corner point (e.g. TL's box
  // spans -16..+16 around (0,0)), independent of whether it's anchored via
  // top/left or bottom/right - avoids margin-vs-anchor sign ambiguity.
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
  cropCornerMark: {
    width: 18,
    height: 18,
    borderColor: '#818CF8',
  },
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cropGridLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cropToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  cropToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cropToolBtnText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
  },
  cropDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  cropActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skipCropBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipCropBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  confirmCropBtn: {
    flex: 1.2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  confirmCropBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
  },
  confirmCropBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
});
