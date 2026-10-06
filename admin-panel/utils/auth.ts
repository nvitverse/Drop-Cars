import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getCachedRole(): Promise<string> {
  const role = await AsyncStorage.getItem('admin_role');
  return role || 'Owner';
}

export async function getCachedPermissions(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem('admin_permissions');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function getCachedUsername(): Promise<string> {
  return (await AsyncStorage.getItem('admin_username')) || 'Admin';
}

export async function isOwner(): Promise<boolean> {
  const role = await getCachedRole();
  return role === 'Owner';
}

/**
 * Checks whether the current logged in user has a specific permission.
 * Owner has all permissions by default except owner-only specific actions.
 * Owner-only actions (like permanent delete, full alarm config) return false for non-owners.
 */
export async function can(permission: string): Promise<boolean> {
  const role = await getCachedRole();
  if (role === 'Owner') {
    return true;
  }

  // Owner-only permissions that can NEVER be granted to Staff
  if (
    permission === 'delete_booking' ||
    permission === 'permanent_delete' ||
    permission === 'manage_alarm' ||
    permission === 'manage_staff' ||
    permission === 'email_settings' ||
    permission === 'manage_email' ||
    permission === 'smtp_settings'
  ) {
    return false;
  }

  const permissions = await getCachedPermissions();
  if (!Array.isArray(permissions)) return false;

  // Booking operations staff get cancel_booking, edit_booking, assign_driver if 'bookings' permission is present
  if (permissions.includes(permission)) return true;
  if (permissions.includes('bookings') && (permission === 'cancel_booking' || permission === 'edit_booking' || permission === 'assign_driver')) {
    return true;
  }
  if (permissions.includes('accounts') && permission === 'manage_wallet') {
    return true;
  }
  if (permissions.includes('support') && (permission === 'chats' || permission === 'verify_documents')) {
    return true;
  }

  return false;
}

export function useAuthPermissions() {
  const [role, setRole] = useState<string>('Owner');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [username, setUsername] = useState<string>('Admin');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [r, p, u] = await Promise.all([
          getCachedRole(),
          getCachedPermissions(),
          getCachedUsername(),
        ]);
        if (mounted) {
          setRole(r);
          setPermissions(p);
          setUsername(u);
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const checkCan = (permission: string) => {
    if (role === 'Owner') return true;
    if (permission === 'delete_booking' || permission === 'permanent_delete' || permission === 'manage_alarm' || permission === 'manage_staff') {
      return false;
    }
    if (permissions.includes(permission)) return true;
    if (permissions.includes('bookings') && (permission === 'cancel_booking' || permission === 'edit_booking' || permission === 'assign_driver')) {
      return true;
    }
    if (permissions.includes('accounts') && permission === 'manage_wallet') {
      return true;
    }
    if (permissions.includes('support') && (permission === 'chats' || permission === 'verify_documents')) {
      return true;
    }
    return false;
  };

  return {
    role,
    permissions,
    username,
    isOwner: role === 'Owner',
    can: checkCan,
    loading,
  };
}
