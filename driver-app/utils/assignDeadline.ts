// Single source of truth for "assign driver & car by ..." across Home / My Rides / Future rides.
//
// The backend decides the deadline (crud/order_assignments.compute_assignment_deadline): the poster's window counted
// from acceptance, but the driver must be on the booking at least 60 min BEFORE pickup, or within 15 min of accepting
// when pickup is closer than that - never after pickup. It is sent as `expires_at` (UTC, no zone suffix). Old
// assignments made before that rule carry their original expires_at, which is still what the server enforces.
export interface DeadlineRide {
  expires_at?: string | null;
  assignment_created_at?: string | null;
  created_at?: string | null;
  max_time_to_assign_order?: string | null;
  start_date_time?: string | null;
}

const asUtc = (s: string): Date => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');

export function getAssignmentDeadline(ride: DeadlineRide): Date | null {
  if (ride.expires_at) {
    const d = asUtc(String(ride.expires_at));
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback (server value missing): same rule computed here.
  if (!ride.assignment_created_at) return null;
  const accepted = asUtc(String(ride.assignment_created_at));
  let windowMs = 15 * 60000;
  if (ride.created_at && ride.max_time_to_assign_order) {
    const w = new Date(ride.max_time_to_assign_order).getTime() - new Date(ride.created_at).getTime();
    if (w > 0) windowMs = w;
  }
  let deadline = accepted.getTime() + windowMs;
  if (ride.start_date_time) {
    const pickup = asUtc(String(ride.start_date_time)).getTime();
    if (!isNaN(pickup)) {
      const target = pickup - 60 * 60000;
      deadline = target <= accepted.getTime() + 15 * 60000 ? accepted.getTime() + 15 * 60000 : Math.min(deadline, target);
      if (pickup > accepted.getTime()) deadline = Math.min(deadline, pickup);
    }
  }
  return new Date(deadline);
}

/** "12m 30s (by 8:47 am)" or `expiredText`. */
export function formatAssignmentRemaining(ride: DeadlineRide, expiredText: string): string {
  const end = getAssignmentDeadline(ride);
  if (!end) return expiredText;
  const remainingMs = end.getTime() - Date.now();
  if (remainingMs <= 0) return expiredText;
  const m = Math.floor(remainingMs / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  const clock = end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${m}m ${s}s (by ${clock})`;
}
