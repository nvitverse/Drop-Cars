import { useCallback, useState } from 'react';
import * as SecureStore from '@/utils/secureStore';

// Shown right after a car+driver assignment succeeds, to nudge the fleet
// owner toward logging in as that duty driver (or switching, if already
// logged in as them) so they can manage the trip from the driver side.
export interface DutyDriverSuggestion {
  driverId?: string | number;
  driverName: string;
  driverPhone: string;
  // True when the duty-driver session already active on this device
  // (driverAuthToken/driverAuthInfo) belongs to this same driver.
  isSameDriver: boolean;
}

interface AssignedDriverLike {
  id?: string | number;
  full_name?: string;
  primary_number?: string;
}

const last10Digits = (value: unknown): string => String(value || '').replace(/\D/g, '').slice(-10);

export function useDutyDriverSuggestion() {
  const [suggestion, setSuggestion] = useState<DutyDriverSuggestion | null>(null);

  const checkAfterAssignment = useCallback(async (driver: AssignedDriverLike) => {
    try {
      const phone = last10Digits(driver.primary_number);
      if (!phone) return; // No phone to log in with - nothing useful to suggest.

      let isSameDriver = false;
      const driverAuthToken = await SecureStore.getItemAsync('driverAuthToken');
      if (driverAuthToken) {
        const infoRaw = await SecureStore.getItemAsync('driverAuthInfo');
        if (infoRaw) {
          try {
            const info = JSON.parse(infoRaw);
            const loggedInPhone = last10Digits(info?.primaryNumber);
            isSameDriver = !!loggedInPhone && loggedInPhone === phone;
          } catch {
            // Malformed stored info - treat as "no active duty-driver session".
          }
        }
      }

      setSuggestion({
        driverId: driver.id,
        driverName: driver.full_name || 'the driver',
        driverPhone: phone,
        isSameDriver,
      });
    } catch {
      // Purely a nice-to-have suggestion - never let this break the
      // assignment success flow that already completed.
    }
  }, []);

  const dismiss = useCallback(() => setSuggestion(null), []);

  return { suggestion, checkAfterAssignment, dismiss };
}
