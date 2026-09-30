export interface Vendor {
  id: string;
  vendor_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  gpay_number: string;
  wallet_balance: number;
  bank_balance: number;
  aadhar_number: string;
  aadhar_front_img?: string;
  aadhar_status?: string;
  address: string;
  city: string;
  pincode: string;
  account_status: string;
  created_at: string;
  documents?: {
    aadhar: {
      document_type: string;
      status: string;
      image_url?: string;
    };
  };
}

export interface VehicleOwner {
  id: string;
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  wallet_balance: number;
  aadhar_number: string;
  aadhar_front_img?: string;
  aadhar_status?: string;
  address: string;
  city: string;
  pincode: string;
  account_status: string;
  created_at: string;
  documents?: {
    aadhar: {
      document_type: string;
      status: string;
      image_url?: string;
    };
  };
}

export interface Car {
  id: string;
  vehicle_owner_id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  year_of_the_car: string;
  rc_front_img_url?: string;
  rc_front_status: string;
  rc_back_img_url?: string;
  rc_back_status: string;
  insurance_img_url?: string;
  insurance_status: string;
  fc_img_url?: string;
  fc_status: string;
  car_img_url?: string;
  car_img_status: string;
  car_status: string;
  created_at: string;
}

export interface Driver {
  id: string;
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  licence_number: string;
  licence_front_img?: string;
  licence_front_status: string;
  address: string;
  city: string;
  pincode: string;
  driver_status: string;
  created_at: string;
}

export interface TransferTransaction {
  id: string;
  vendor_id: string;
  requested_amount: number;
  wallet_balance_before: number;
  bank_balance_before: number;
  wallet_balance_after?: number;
  bank_balance_after?: number;
  status: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleOwnerDetails {
  vehicle_owner: VehicleOwner;
  cars: Car[];
  drivers: Driver[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'INVALID';
export type CarStatus = 'ONLINE' | 'DRIVING' | 'BLOCKED' | 'PROCESSING';
export type DriverStatus = 'ONLINE' | 'OFFLINE' | 'DRIVING' | 'BLOCKED' | 'PROCESSING';