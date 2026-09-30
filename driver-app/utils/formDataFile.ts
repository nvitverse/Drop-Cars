import { Platform } from 'react-native';

/**
 * Appends a picked image (or any local file) to a FormData object in a way
 * that actually works on BOTH native and web.
 *
 * Native: React Native's FormData polyfill recognizes a {uri, type, name}
 * object and resolves the local file at `uri` itself - this is the
 * standard, correct pattern here.
 *
 * Web: expo-image-picker returns a blob: (or data:) URI, and a browser's
 * real FormData.append() does NOT understand {uri, type, name} objects -
 * passing one silently coerces to the literal string "[object Object]"
 * instead of the file's bytes. Confirmed via direct test: the upload
 * request "succeeds" (no client-side error) but the server receives a
 * garbage string field instead of an image, so every image-upload flow
 * (car documents, driver documents, Aadhar, etc.) fails with a validation
 * error on web while working fine on native. Fixed by fetching the blob URI
 * to get a real Blob and appending that instead.
 */
export async function appendFileToFormData(
  formData: FormData,
  fieldName: string,
  uri: string,
  filename: string,
  mimeType: string
): Promise<void> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    formData.append(fieldName, blob, filename);
  } else {
    formData.append(fieldName, { uri, type: mimeType, name: filename } as any);
  }
}
