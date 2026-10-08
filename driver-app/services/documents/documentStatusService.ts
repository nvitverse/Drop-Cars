import axiosInstance from '@/app/api/axiosInstance';

export interface DocumentStatus {
  document_type: string;
  status: 'PENDING' | 'INVALID' | 'VERIFIED' | 'NEEDS_REVIEW';
  image_url: string;
  updated_at: string | null;
  // licence / RC / insurance: re-upload opens once a document is within 15 days of expiring (or expired)
  expiry_date?: string | null;
  days_left?: number | null;
  // why a document is INVALID / waiting, in plain words (what the owner must fix)
  reason?: string | null;
  date_label?: string | null;
}

export interface DocumentStatusResponse {
  entity_id: string;
  entity_type: 'vehicle_owner' | 'car' | 'driver';
  documents: Record<string, DocumentStatus>;
}

export interface UpdateDocumentRequest {
  document_type: string;
  document_image: File;
}

// Fetch all document statuses
export const fetchDocumentStatuses = async (): Promise<DocumentStatusResponse[]> => {
  try {
    const response = await axiosInstance.get('/api/users/vehicle-owner/all-document-status');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch document statuses:', error);
    throw error;
  }
};

export interface VerificationSummary {
  ownerVerified: boolean;
  verifiedCarCount: number;
  totalCarCount: number;
  verifiedDriverCount: number;
  totalDriverCount: number;
}

// Same three gates the backend enforces on accept/assign (see backend's
// crud/verification.py) - kept in sync manually since there's no shared
// package between the API and this app. A document that was never
// uploaded is simply absent from `documents`, which correctly counts as
// "not verified" here (an owner/car/driver with zero documents on file
// must not appear verified).
const isVerified = (documents: Record<string, DocumentStatus>, keys: string[]): boolean =>
  keys.every((key) => documents[key]?.status === 'VERIFIED');

export interface DocumentAlertItem {
  id: string;
  entity_type: 'vehicle_owner' | 'car' | 'driver';
  entity_id: string;
  document_type: string;
  title: string;
  subtitle: string;
  status: 'EXPIRED' | 'EXPIRING_SOON' | 'PENDING' | 'INVALID';
  days_left?: number;
  target_route: string;
}

export function getDetailedDocumentAlerts(statuses: DocumentStatusResponse[], isEmailMissing: boolean = false): DocumentAlertItem[] {
  const alerts: DocumentAlertItem[] = [];
  const seenKeys = new Set<string>();

  if (isEmailMissing) {
    alerts.push({
      id: 'vehicle_owner_email_missing',
      entity_type: 'vehicle_owner',
      entity_id: 'owner',
      document_type: 'email',
      title: 'Email Address Verification',
      subtitle: 'Owner Profile · Email Address Missing',
      status: 'PENDING',
      target_route: '/add-email',
    });
    seenKeys.add('vehicle_owner_owner_email');
  }

  const docLabelMap: Record<string, string> = {
    aadhar: 'Aadhar Card (Front)',
    aadhar_back: 'Aadhar Card (Back)',
    pan: 'PAN Card',
    rc_front: 'RC Document (Front)',
    rc_back: 'RC Document (Back)',
    insurance: 'Vehicle Insurance',
    permit: 'Vehicle Permit',
    fc: 'Fitness Certificate (FC)',
    licence: 'Driving Licence (Front)',
    licence_back: 'Driving Licence (Back)',
  };

  const carEntries = statuses.filter((s) => s.entity_type === 'car');
  const driverEntries = statuses.filter((s) => s.entity_type === 'driver');

  statuses.forEach((entry) => {
    const { entity_id, entity_type, documents } = entry;
    const requiredKeys =
      entity_type === 'vehicle_owner'
        ? ['aadhar', 'aadhar_back', 'pan']
        : entity_type === 'car'
        ? ['rc_front', 'rc_back', 'insurance', 'permit']
        : ['licence', 'licence_back'];

    const targetRoute =
      entity_type === 'vehicle_owner'
        ? '/(tabs)/profile'
        : entity_type === 'car'
        ? '/my-cars'
        : '/my-drivers';

    let entityName = 'Owner Verification';
    if (entity_type === 'car') {
      const carIdx = carEntries.findIndex((c) => c.entity_id === entity_id);
      entityName = carEntries.length > 1 && carIdx >= 0 ? `Vehicle #${carIdx + 1}` : 'Vehicle Document';
    } else if (entity_type === 'driver') {
      const drvIdx = driverEntries.findIndex((d) => d.entity_id === entity_id);
      entityName = driverEntries.length > 1 && drvIdx >= 0 ? `Driver #${drvIdx + 1}` : 'Driver Document';
    }

    requiredKeys.forEach((key) => {
      const alertUniqueId = `${entity_type}_${entity_id}_${key}`;
      if (seenKeys.has(alertUniqueId)) return;
      seenKeys.add(alertUniqueId);

      const doc = documents[key];
      const docTitle = docLabelMap[key] || key.toUpperCase();

      // Only nag for documents the driver still has to DO something about:
      // never uploaded (no doc row) or rejected (INVALID). A document that
      // is uploaded and waiting on auto-verification / admin review
      // (PENDING, NEEDS_REVIEW) is OUR job to approve, not theirs - showing
      // it in the KYC popup every day was pure noise.
      if (!doc || doc.status === 'INVALID') {
        alerts.push({
          id: alertUniqueId,
          entity_type,
          entity_id,
          document_type: key,
          title: docTitle,
          subtitle: `${entityName} · Needs Verification`,
          status: doc?.status === 'INVALID' ? 'INVALID' : 'PENDING',
          target_route: targetRoute,
        });
      } else if (doc && (doc as any).expiry_date) {
        // Check if expired or expiring within 10 days
        const expiry = new Date((doc as any).expiry_date);
        const today = new Date();
        const diffMs = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          alerts.push({
            id: alertUniqueId,
            entity_type,
            entity_id,
            document_type: key,
            title: docTitle,
            subtitle: `${entityName} · Expired`,
            status: 'EXPIRED',
            days_left: 0,
            target_route: targetRoute,
          });
        } else if (diffDays <= 10) {
          alerts.push({
            id: alertUniqueId,
            entity_type,
            entity_id,
            document_type: key,
            title: docTitle,
            subtitle: `${entityName} · Expiring in ${diffDays} days`,
            status: 'EXPIRING_SOON',
            days_left: diffDays,
            target_route: targetRoute,
          });
        }
      }
    });
  });

  return alerts;
}

export function summarizeVerificationStatus(statuses: DocumentStatusResponse[]): VerificationSummary {
  const ownerEntry = statuses.find((s) => s.entity_type === 'vehicle_owner');
  const ownerVerified = ownerEntry ? isVerified(ownerEntry.documents, ['aadhar', 'aadhar_back', 'pan']) : false;

  const carEntries = statuses.filter((s) => s.entity_type === 'car');
  const verifiedCarCount = carEntries.filter((c) => isVerified(c.documents, ['rc_front', 'rc_back', 'insurance', 'permit'])).length;

  const driverEntries = statuses.filter((s) => s.entity_type === 'driver');
  const verifiedDriverCount = driverEntries.filter((d) => isVerified(d.documents, ['licence', 'licence_back'])).length;

  return {
    ownerVerified,
    verifiedCarCount,
    totalCarCount: carEntries.length,
    verifiedDriverCount,
    totalDriverCount: driverEntries.length,
  };
}

// Update driver document
export const updateDriverDocument = async (
  entityId: string, 
  documentType: string, 
  documentImage: File
): Promise<void> => {
  try {
    const formData = new FormData();
    formData.append('document_type', documentType);
    
    // Driver documents always use 'licence_image' field
    formData.append('licence_image', documentImage);

    // No manual Content-Type - axiosInstance's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    await axiosInstance.post(
      `/api/users/cardriver/${entityId}/update-document`,
      formData
    );
  } catch (error) {
    console.error('❌ Failed to update driver document:', error);
    throw error;
  }
};

// Update car document
export const updateCarDocument = async (
  entityId: string, 
  documentType: string, 
  documentImage: File
): Promise<void> => {
  try {
    const formData = new FormData();
    formData.append('document_type', documentType);
    
    // Map document types to their corresponding field names
    const fieldNameMap: Record<string, string> = {
      'rc_front': 'rc_front_img',
      'rc_back': 'rc_back_img', 
      'insurance': 'insurance_img',
      'fc': 'fc_img',
      'car_img': 'car_img'
    };
    
    const fieldName = fieldNameMap[documentType] || 'licence_image';
    formData.append(fieldName, documentImage);

    // No manual Content-Type - axiosInstance's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    await axiosInstance.post(
      `/api/users/cardetails/${entityId}/update-document`,
      formData
    );
  } catch (error) {
    console.error('❌ Failed to update car document:', error);
    throw error;
  }
};

// Update vehicle owner document (Aadhar / Aadhar Back / PAN)
export const updateVehicleOwnerDocument = async (
  documentType: string,
  documentImage: any
): Promise<void> => {
  try {
    const formData = new FormData();
    formData.append('document_type', documentType);

    if (typeof documentImage === 'string') {
      const filename = documentImage.split('/').pop() || `${documentType}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('file', {
        uri: documentImage,
        name: filename,
        type,
      } as any);
    } else {
      formData.append('file', documentImage);
    }

    await axiosInstance.post('/api/users/vehicle-owner/update-document', formData);
  } catch (error) {
    console.error(`❌ Failed to update vehicle owner document (${documentType}):`, error);
    throw error;
  }
};
