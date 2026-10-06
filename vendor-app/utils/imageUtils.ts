import * as ImagePicker from 'expo-image-picker';
import { appendFileToFormData } from './formDataFile';

export interface ImageInfo {
  uri: string;
  type: string;
  name: string;
  size: number;
}

export const pickImage = async (): Promise<ImageInfo | null> => {
  try {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      throw new Error('Permission to access camera roll is required!');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, // freeform crop before upload - no fixed aspect ratio
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];

      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Image size must be less than 5MB');
      }

      if (!asset.type || asset.type !== 'image') {
        throw new Error('File must be an image');
      }

      return {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg', // fallback MIME type
        name: `aadhar_${Date.now()}.${(asset.uri.split('.').pop() || 'jpg')}`,
        size: asset.fileSize || 0,
      };
    }

    return null;
  } catch (error) {
    console.error('Error picking image:', error);
    throw error;
  }
};


export const validateImage = (imageInfo: ImageInfo): boolean => {
  // Check file size (5MB limit)
  if (imageInfo.size > 5 * 1024 * 1024) {
    throw new Error('Image size must be less than 5MB');
  }

  // Check file type
  if (!imageInfo.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  return true;
};

export const createImageFormData = async (imageInfo: ImageInfo): Promise<FormData> => {
  const formData = new FormData();

  // Uses appendFileToFormData so this actually uploads a real file on web
  // instead of the literal string "[object Object]" (see that function's
  // comment for why).
  await appendFileToFormData(formData, 'aadhar_image', imageInfo.uri, imageInfo.name, imageInfo.type);

  return formData;
};
