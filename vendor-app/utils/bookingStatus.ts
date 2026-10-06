// Single source of truth for the booking lifecycle label shown to users.
// Precedence matches the owner's spec exactly - most-final state wins:
// Completed > Started > Cancelled/Auto Cancelled/Removed > Driver Assigned > Accepted > Waiting for Accept.
export interface BookingStatusFields {
  trip_status?: string | null;
  assignment_status?: string | null;
  order_accept_status?: boolean | string | null;
  cancelled_by?: string | null;
  Driver_assigned?: boolean | null;
  Car_assigned?: boolean | null;
}

export function getBookingStatusLabel(order: BookingStatusFields): string {
  const tripStatus = (order.trip_status || '').toUpperCase();
  const assignmentStatus = (order.assignment_status || '').toUpperCase();
  const cancelledBy = (order.cancelled_by || '').toUpperCase();
  const wasAccepted =
    order.order_accept_status === true ||
    String(order.order_accept_status || '').toUpperCase() === 'ACCEPTED' ||
    ['ASSIGNED', 'DRIVING', 'COMPLETED'].includes(assignmentStatus);

  if (tripStatus === 'COMPLETED' || assignmentStatus === 'COMPLETED') return 'Completed';
  if (assignmentStatus === 'DRIVING') return 'Started';

  if (tripStatus === 'CANCELLED' || assignmentStatus === 'CANCELLED') {
    if (cancelledBy === 'CANCELLED_BY_VENDOR') return 'Cancelled';
    if (cancelledBy === 'AUTO_CANCELLED') {
      // Nobody ever accepted this booking before its deadline passed - this
      // is an expiry, not a cancellation, and should read that way to vendors.
      return wasAccepted ? 'Auto Cancelled' : 'Expired';
    }
    return 'Cancelled';
  }

  if (order.Driver_assigned && order.Car_assigned) return 'Driver Assigned';
  if (assignmentStatus === 'ASSIGNED') return 'Driver Assigned';
  if (wasAccepted) return 'Accepted';
  return 'Waiting for Accept';
}

// One colour per lifecycle label so the dashboard, list, upcoming and detail
// screens all show the same status the same way.
export function getBookingStatusColor(label: string): string {
  if (label === 'Expired') return '#9CA3AF';
  if (label === 'Cancelled' || label === 'Auto Cancelled') return '#EF4444';
  if (label === 'Completed') return '#3B82F6';
  if (label === 'Started') return '#6366F1';
  if (label === 'Driver Assigned') return '#10B981';
  if (label === 'Accepted') return '#0EA5E9';
  return '#F59E0B'; // Waiting for Accept
}
