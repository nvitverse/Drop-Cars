export interface PhoneLockStatus {
  isUnlocked: boolean;
  displayPhone: string;
  lockReason?: string;
  unlockTime?: Date;
}

/**
 * Customer Phone Visibility & Lock Rules:
 * - Pickup > 7 Hours away: Unlocked 6 Hours before pickup time.
 * - Pickup <= 7 Hours away: Unlocked at 25% remaining time of the pickup window.
 */
export function getCustomerPhoneLockStatus(
  rawPhone: string,
  startDateTime: string | Date,
  createdAt?: string | Date
): PhoneLockStatus {
  if (!rawPhone || !rawPhone.trim()) {
    return { isUnlocked: true, displayPhone: '' };
  }

  if (!startDateTime) {
    return { isUnlocked: true, displayPhone: rawPhone };
  }

  const pickup = new Date(startDateTime);
  const now = new Date();

  // If pickup time has passed or is right now, unlock
  if (pickup.getTime() <= now.getTime()) {
    return { isUnlocked: true, displayPhone: rawPhone };
  }

  const created = createdAt ? new Date(createdAt) : now;

  const totalDurationMs = Math.max(pickup.getTime() - created.getTime(), 0);
  const totalHours = totalDurationMs / (1000 * 60 * 60);

  const remainingMs = Math.max(pickup.getTime() - now.getTime(), 0);

  let isUnlocked = false;
  let unlockTime: Date;

  if (totalHours > 7) {
    // > 7 Hours: Unlock 6 hours before pickup
    unlockTime = new Date(pickup.getTime() - 6 * 60 * 60 * 1000);
    isUnlocked = now.getTime() >= unlockTime.getTime();
  } else {
    // <= 7 Hours: Unlock when remaining time is <= 25% of total duration
    const thresholdMs = totalDurationMs * 0.25;
    unlockTime = new Date(pickup.getTime() - thresholdMs);
    isUnlocked = remainingMs <= thresholdMs;
  }

  if (isUnlocked) {
    return { isUnlocked: true, displayPhone: rawPhone };
  }

  // Mask number (e.g., "+91 7092XXXX59")
  const digits = rawPhone.replace(/\D/g, '');
  let masked = 'Locked';
  if (digits.length >= 10) {
    const prefix = rawPhone.startsWith('+') ? rawPhone.slice(0, 5) : rawPhone.slice(0, 4);
    const suffix = digits.slice(-2);
    masked = `${prefix}XXXXXX${suffix}`;
  }

  const formatUnlockTimeStr = unlockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    isUnlocked: false,
    displayPhone: masked,
    lockReason: `Unlocks at ${formatUnlockTimeStr}`,
    unlockTime,
  };
}
