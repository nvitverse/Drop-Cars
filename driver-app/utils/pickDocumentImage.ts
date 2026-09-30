import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Always asks Camera vs Gallery, every single time - never remembers or
// defaults to one. No allowsEditing on purpose: the OS crop screen draws
// under the status/navigation bars on Android (edge-to-edge), so its crop
// frame was unreachable; DocumentCropModal is the crop step instead.
export async function pickDocumentImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const source = await new Promise<'camera' | 'gallery' | null>((resolve) => {
    Alert.alert(
      'Upload photo',
      'How do you want to add this photo?',
      [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose from Gallery', onPress: () => resolve('gallery') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
  if (!source) return null;

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take a photo.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    return res.canceled ? null : res.assets[0];
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
  return res.canceled ? null : res.assets[0];
}
